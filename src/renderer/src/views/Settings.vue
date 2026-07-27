<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import axios from 'axios'
import { useConfigStore } from '../stores/config'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
  // 实时模型缩放变化:直接通知 App.vue 更新 modelScale ref,不经过 configStore
  // (Pinia setup store 中 ref 属性突变不一定触发 watch,改用 emit 保证可靠传播)
  'model-scale-change': [scale: number]
}>()

const configStore = useConfigStore()

// 基础窗口尺寸(与主进程 BASE_WINDOW_W/H 一致),仅用于 slider 显示像素值
const BASE_W = 360
const BASE_H = 480

// 表单数据
const formData = ref({
  meowToolUrl: 'http://localhost:4399',
  live2dModelPath: 'models/Mao/Mao.model3.json',
  agentId: '' as string,
  systemPrompt: '' as string
})

// 窗口尺寸缩放系数(独立于 formData,因为它需要实时反馈到主进程)
// slider 实时拖动 → 立即调用 IPC setSize,同时防抖保存到 config
const windowSizeScale = ref<number>(1.0)
// 模型尺寸缩放系数(实时反馈到 Live2DCanvas)
const modelScale = ref<number>(1.0)

// 可用模型列表(从 ~/.meow-vpet/models/ 扫描)
// 每项 { name, path, format },path 为相对 ~/.meow-vpet/ 的路径
const availableModels = ref<Array<{ name: string; path: string; format: 'cubism4' | 'cubism2' }>>([])

// 防抖保存 scale 的 timer
let windowScaleSaveTimer: number | null = null
let modelScaleSaveTimer: number | null = null

// 像素尺寸显示(用于 slider 旁边的 caption)
const windowPixelText = computed(() => {
  const w = Math.round(BASE_W * windowSizeScale.value)
  const h = Math.round(BASE_H * windowSizeScale.value)
  return `${w} × ${h}`
})
const modelScaleText = computed(() => {
  return `${Math.round(modelScale.value * 100)}%`
})

// agent 列表
const agents = ref<Array<{ id: string; name: string; enabled: boolean }>>([])
// skill 列表
const skills = ref<Array<{ id: string; name: string; enabled: boolean }>>([])
const loading = ref(false)
// toast 提示
const toast = ref<{ visible: boolean; text: string; type: 'success' | 'error' }>({
  visible: false,
  text: '',
  type: 'success'
})
let toastTimer: number | null = null

function showToast(text: string, type: 'success' | 'error' = 'success') {
  toast.value = { visible: true, text, type }
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value.visible = false
  }, 1800)
}

// 加载 agent 列表
async function loadAgents() {
  try {
    const res = await axios.get(`${formData.value.meowToolUrl}/v1/config/agents`)
    const data = res.data
    agents.value = (Array.isArray(data) ? data : Object.values(data))
      .filter((a: any) => a.enabled)
  } catch (err) {
    console.warn('加载 agent 列表失败:', err)
    agents.value = []
  }
}

// 加载 skill 列表
async function loadSkills() {
  try {
    const res = await axios.get(`${formData.value.meowToolUrl}/v1/config/skills`)
    const data = res.data
    skills.value = Array.isArray(data) ? data : Object.values(data)
  } catch (err) {
    console.warn('加载 skill 列表失败:', err)
    skills.value = []
  }
}

// 加载可用模型列表(从 ~/.meow-vpet/models/ 扫描)
// 主进程递归查找 *.model3.json 和 *.model.json
async function loadAvailableModels() {
  if (!window.app?.listModels) {
    availableModels.value = []
    return
  }
  try {
    availableModels.value = await window.app.listModels()
  } catch (err) {
    console.warn('加载模型列表失败:', err)
    availableModels.value = []
  }
}

// 切换 skill 启用状态
async function toggleSkill(skill: { id: string; name?: string; enabled: boolean }) {
  try {
    await axios.put(
      `${formData.value.meowToolUrl}/v1/config/skills/${skill.id}`,
      { enabled: skill.enabled }
    )
    showToast(`${skill.name || skill.id} 已${skill.enabled ? '启用' : '禁用'}`)
  } catch (err) {
    // 回滚
    skill.enabled = !skill.enabled
    showToast('更新失败', 'error')
  }
}

// 实时调整窗口尺寸:slider input 事件
// 1. 立即调用 IPC setSize → 主进程 win.setSize,窗口尺寸即时变化
// 2. 防抖 500ms 保存到 config(避免高频写文件)
function onWindowScaleInput() {
  if (window.app) {
    window.app.setWindowSize(windowSizeScale.value)
  }
  // 同步到 configStore 内存值(让 App.vue 的 watch 立即响应)
  if (configStore.config) {
    configStore.config.windowSizeScale = windowSizeScale.value
  }
  if (windowScaleSaveTimer) window.clearTimeout(windowScaleSaveTimer)
  windowScaleSaveTimer = window.setTimeout(() => {
    configStore.save({ windowSizeScale: windowSizeScale.value })
  }, 500)
}

// 实时调整模型尺寸:slider input 事件
// 直接 emit 给 App.vue 更新 modelScale ref → 传给 Live2DCanvas prop → watch 触发 applyModelScale
// 不走 configStore.config.modelScale 突变(Pinia ref 属性突变不保证触发 watch)
function onModelScaleInput() {
  emit('model-scale-change', modelScale.value)
  if (modelScaleSaveTimer) window.clearTimeout(modelScaleSaveTimer)
  modelScaleSaveTimer = window.setTimeout(() => {
    configStore.save({ modelScale: modelScale.value })
  }, 500)
}

// 保存配置(其余文本字段)
async function handleSave() {
  await configStore.save({
    meowToolUrl: formData.value.meowToolUrl,
    live2dModelPath: formData.value.live2dModelPath,
    agentId: formData.value.agentId || undefined,
    systemPrompt: formData.value.systemPrompt.trim() || undefined,
    // slider 已经在 onInput 时防抖保存过,这里再 save 一次兜底
    windowSizeScale: windowSizeScale.value,
    modelScale: modelScale.value
  })
  showToast('配置已保存')
  emit('saved')
  // 给 toast 一点展示时间再关闭
  window.setTimeout(() => {
    emit('update:visible', false)
  }, 400)
}

// 取消
function handleCancel() {
  emit('update:visible', false)
}

// 弹窗显示时加载数据
watch(
  () => props.visible,
  async (val) => {
    if (val) {
      // 从 store 同步当前配置到表单
      if (configStore.config) {
        formData.value.meowToolUrl = configStore.config.meowToolUrl
        formData.value.live2dModelPath = configStore.config.live2dModelPath
        formData.value.agentId = configStore.config.agentId || ''
        formData.value.systemPrompt = configStore.config.systemPrompt || ''
        windowSizeScale.value = configStore.config.windowSizeScale ?? 1.0
        modelScale.value = configStore.config.modelScale ?? 1.0
      }
      loading.value = true
      await Promise.all([loadAgents(), loadSkills(), loadAvailableModels()])
      loading.value = false
    }
  }
)

// 组件挂载时加载一次配置
onMounted(async () => {
  await configStore.loadFromBackend()
  if (configStore.config) {
    formData.value.meowToolUrl = configStore.config.meowToolUrl
    formData.value.live2dModelPath = configStore.config.live2dModelPath
    formData.value.agentId = configStore.config.agentId || ''
    formData.value.systemPrompt = configStore.config.systemPrompt || ''
    windowSizeScale.value = configStore.config.windowSizeScale ?? 1.0
    modelScale.value = configStore.config.modelScale ?? 1.0
  }
  // 预加载一次模型列表,首次打开设置时无需等待
  await loadAvailableModels()
})
</script>

<template>
  <Transition name="meow-modal">
    <div v-if="visible" class="settings-overlay meow-root" @click.self="handleCancel">
      <div class="settings-card">
        <!-- 头部 -->
        <header class="card-header">
          <div class="header-titles">
            <h2 class="card-title">设置</h2>
            <p class="card-subtitle">meow-vpet 偏好配置</p>
          </div>
          <button class="icon-btn" title="关闭" @click="handleCancel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </header>

        <!-- 主体 -->
        <div class="card-body">
          <section class="form-section">
            <div class="section-title">服务连接</div>
            <div class="form-row">
              <label class="form-label" for="meowToolUrl">meow-tool 服务地址</label>
              <input
                id="meowToolUrl"
                v-model="formData.meowToolUrl"
                class="input"
                type="text"
                placeholder="http://localhost:4399"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
          </section>

          <section class="form-section">
            <div class="section-title">Live2D</div>
            <div class="form-row">
              <label class="form-label" for="live2dModelPath">模型</label>
              <div class="select-wrapper">
                <select
                  id="live2dModelPath"
                  v-model="formData.live2dModelPath"
                  class="select"
                >
                  <option
                    v-for="m in availableModels"
                    :key="m.path"
                    :value="m.path"
                  >
                    {{ m.name }}（{{ m.format === 'cubism4' ? 'Cubism 4' : 'Cubism 2' }}）
                  </option>
                </select>
                <svg class="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </div>
              <p class="form-hint">模型文件夹放在 ~/.meow-vpet/models/ 下,放入新模型后请重开设置</p>
            </div>
            <div class="form-row">
              <label class="form-label" for="agentId">默认 Agent</label>
              <div class="select-wrapper">
                <select
                  id="agentId"
                  v-model="formData.agentId"
                  class="select"
                >
                  <option value="">不使用 Agent</option>
                  <option v-for="agent in agents" :key="agent.id" :value="agent.id">
                    {{ agent.name }}
                  </option>
                </select>
                <svg class="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="section-title">
              <span>显示</span>
              <span class="section-hint-inline">实时预览</span>
            </div>
            <div class="form-row">
              <div class="slider-row">
                <label class="form-label" for="windowSizeScale">窗口大小</label>
                <span class="slider-value">{{ windowPixelText }}</span>
              </div>
              <input
                id="windowSizeScale"
                v-model.number="windowSizeScale"
                class="slider"
                type="range"
                min="0.8"
                max="2.0"
                step="0.05"
                @input="onWindowScaleInput"
              />
              <p class="form-hint">拖动即时调整窗口尺寸,松开自动保存</p>
            </div>
            <div class="form-row">
              <div class="slider-row">
                <label class="form-label" for="modelScale">模型大小</label>
                <span class="slider-value">{{ modelScaleText }}</span>
              </div>
              <input
                id="modelScale"
                v-model.number="modelScale"
                class="slider"
                type="range"
                min="0.3"
                max="2.0"
                step="0.05"
                @input="onModelScaleInput"
              />
              <p class="form-hint">基于自适应尺寸的乘数,1.0 = 铺满窗口 80%</p>
            </div>
          </section>

          <section class="form-section">
            <div class="section-title">
              <span>提示词</span>
              <span class="section-hint-inline">System Prompt</span>
            </div>
            <div class="form-row">
              <textarea
                id="systemPrompt"
                v-model="formData.systemPrompt"
                class="textarea"
                placeholder="设置桌宠的角色、语气和行为约束(留空则不注入)"
                rows="4"
                spellcheck="false"
              />
              <p class="form-hint">每次对话会作为 system 消息发送给后端</p>
            </div>
          </section>

          <section class="form-section">
            <div class="section-title">
              <span>Skills</span>
              <span v-if="loading" class="loading-spinner-sm" />
            </div>
            <div class="skills-list">
              <label
                v-for="skill in skills"
                :key="skill.id"
                class="skill-item"
              >
                <span class="skill-name">{{ skill.name || skill.id }}</span>
                <button
                  type="button"
                  class="switch"
                  :class="{ on: skill.enabled }"
                  role="switch"
                  :aria-checked="skill.enabled"
                  @click="skill.enabled = !skill.enabled; toggleSkill(skill)"
                >
                  <span class="switch-thumb" />
                </button>
              </label>
              <div v-if="!loading && skills.length === 0" class="empty-tip">
                暂无 Skill
              </div>
            </div>
          </section>
        </div>

        <!-- 底部操作 -->
        <footer class="card-footer">
          <button class="btn btn-ghost" @click="handleCancel">取消</button>
          <button class="btn btn-primary" @click="handleSave">保存</button>
        </footer>
      </div>

      <!-- toast -->
      <Transition name="toast">
        <div v-if="toast.visible" class="toast" :class="toast.type">
          {{ toast.text }}
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: oklch(0 0 0 / 0.4);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

/* ===== 卡片容器(对齐 meow-tool popover/card 风格)===== */
.settings-card {
  width: 100%;
  max-width: 340px;
  max-height: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  background: oklch(var(--card));
  color: oklch(var(--card-foreground));
  border: 1px solid oklch(var(--border));
  border-radius: 10px;
  box-shadow:
    0 10px 30px oklch(0 0 0 / 0.18),
    0 2px 8px oklch(0 0 0 / 0.08);
  overflow: hidden;
  font-family: inherit;
}

/* ===== 头部 ===== */
.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid oklch(var(--border));
  background: oklch(var(--card));
}
.header-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: oklch(var(--foreground));
  letter-spacing: -0.01em;
}
.card-subtitle {
  margin: 0;
  font-size: 11px;
  color: oklch(var(--muted-foreground));
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: oklch(var(--muted-foreground));
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-smooth),
    color var(--duration-fast) var(--ease-smooth);
}
.icon-btn:hover {
  background: oklch(var(--accent));
  color: oklch(var(--foreground));
}
.icon-btn:active {
  transform: scale(0.94);
}

/* ===== 主体 ===== */
.card-body {
  padding: 14px 16px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.form-section {
  margin-bottom: 16px;
}
.form-section:last-child {
  margin-bottom: 0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: oklch(var(--muted-foreground));
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid oklch(var(--border));
}
.section-hint-inline {
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.02em;
  text-transform: none;
  color: oklch(var(--muted-foreground) / 0.7);
  margin-left: auto;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
}
.form-row:last-child {
  margin-bottom: 0;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: oklch(var(--foreground));
}
.form-hint {
  margin: 2px 0 0;
  font-size: 11px;
  color: oklch(var(--muted-foreground));
}

/* ===== 输入框(meow-tool select 风格)===== */
.input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  font-size: 13px;
  font-family: inherit;
  background: oklch(var(--background));
  color: oklch(var(--foreground));
  border: 1px solid oklch(var(--border));
  border-radius: 6px;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-smooth),
    box-shadow var(--duration-fast) var(--ease-smooth);
}
.input::placeholder {
  color: oklch(var(--muted-foreground));
}
.input:focus {
  border-color: oklch(var(--ring));
  box-shadow: 0 0 0 3px oklch(var(--ring) / 0.12);
}

/* ===== 多行文本框(同 input 风格 + 可调高度)===== */
.textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  font-size: 13px;
  line-height: 1.5;
  font-family: inherit;
  background: oklch(var(--background));
  color: oklch(var(--foreground));
  border: 1px solid oklch(var(--border));
  border-radius: 6px;
  outline: none;
  resize: vertical;
  min-height: 64px;
  max-height: 160px;
  transition: border-color var(--duration-fast) var(--ease-smooth),
    box-shadow var(--duration-fast) var(--ease-smooth);
}
.textarea::placeholder {
  color: oklch(var(--muted-foreground));
}
.textarea:focus {
  border-color: oklch(var(--ring));
  box-shadow: 0 0 0 3px oklch(var(--ring) / 0.12);
}

/* ===== Slider(meow-tool input 风格 range 控件)===== */
.slider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.slider-value {
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: oklch(var(--foreground));
  background: oklch(var(--secondary));
  padding: 2px 8px;
  border-radius: 4px;
  min-width: 56px;
  text-align: center;
}
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: oklch(var(--border));
  border-radius: 9999px;
  outline: none;
  cursor: pointer;
  margin: 4px 0 0;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: oklch(var(--primary));
  border: 2px solid oklch(var(--background));
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.2);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-spring),
    box-shadow var(--duration-fast) var(--ease-smooth);
}
.slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 0 0 5px oklch(var(--ring) / 0.15);
}
.slider::-webkit-slider-thumb:active {
  transform: scale(1.05);
  box-shadow: 0 0 0 7px oklch(var(--ring) / 0.2);
}
.slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: oklch(var(--primary));
  border: 2px solid oklch(var(--background));
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.2);
  cursor: pointer;
}

/* ===== 下拉选择 ===== */
.select-wrapper {
  position: relative;
}
.select {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 28px 7px 10px;
  font-size: 13px;
  font-family: inherit;
  background: oklch(var(--background));
  color: oklch(var(--foreground));
  border: 1px solid oklch(var(--border));
  border-radius: 6px;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: border-color var(--duration-fast) var(--ease-smooth),
    box-shadow var(--duration-fast) var(--ease-smooth);
}
.select:focus {
  border-color: oklch(var(--ring));
  box-shadow: 0 0 0 3px oklch(var(--ring) / 0.12);
}
.select-chevron {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: oklch(var(--muted-foreground));
  pointer-events: none;
}

/* ===== Skills 列表 ===== */
.skills-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.skill-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 6px;
  background: oklch(var(--secondary));
  transition: background var(--duration-fast) var(--ease-smooth);
}
.skill-item:hover {
  background: oklch(var(--accent));
}
.skill-name {
  font-size: 13px;
  color: oklch(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-tip {
  font-size: 12px;
  color: oklch(var(--muted-foreground));
  text-align: center;
  padding: 12px 8px;
}

/* ===== 自定义开关(对齐 shadcn Switch)===== */
.switch {
  position: relative;
  width: 32px;
  height: 18px;
  border-radius: 9999px;
  border: none;
  background: oklch(var(--input));
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: background var(--duration-fast) var(--ease-smooth);
}
.switch.on {
  background: oklch(var(--primary));
}
.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: oklch(var(--background));
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.2);
  transition: transform var(--duration-fast) var(--ease-smooth);
}
.switch.on .switch-thumb {
  transform: translateX(14px);
  background: oklch(var(--primary-foreground));
}

/* ===== 底部操作 ===== */
.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid oklch(var(--border));
  background: oklch(var(--card));
}

/* ===== 按钮(meow-tool btn 样式)===== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-smooth),
    border-color var(--duration-fast) var(--ease-smooth),
    color var(--duration-fast) var(--ease-smooth),
    opacity var(--duration-fast) var(--ease-smooth),
    box-shadow var(--duration-fast) var(--ease-smooth),
    transform var(--duration-fast) var(--ease-smooth);
}
.btn:active {
  transform: scale(0.97);
}
.btn-primary {
  background: oklch(var(--primary));
  color: oklch(var(--primary-foreground));
}
.btn-primary:hover {
  opacity: 0.9;
  box-shadow: 0 2px 8px oklch(0 0 0 / 0.12);
}
.btn-ghost {
  background: transparent;
  border-color: oklch(var(--border));
  color: oklch(var(--foreground));
}
.btn-ghost:hover {
  background: oklch(var(--accent));
  border-color: oklch(var(--ring));
}

/* ===== 小型加载圈 ===== */
.loading-spinner-sm {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid oklch(var(--border));
  border-top-color: oklch(var(--primary));
  border-radius: 50%;
  animation: meow-spin 0.6s linear infinite;
}
@keyframes meow-spin {
  to { transform: rotate(360deg); }
}

/* ===== Toast 提示 ===== */
.toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 500;
  color: oklch(var(--primary-foreground));
  background: oklch(var(--primary));
  border-radius: 6px;
  box-shadow: 0 4px 12px oklch(0 0 0 / 0.15);
  z-index: 1100;
  pointer-events: none;
}
.toast.error {
  background: oklch(var(--destructive));
  color: white;
}

/* ===== 过渡动画(对齐 meow-tool modal-scale)===== */
.meow-modal-enter-active {
  transition: opacity var(--duration-normal) var(--ease-smooth);
}
.meow-modal-leave-active {
  transition: opacity var(--duration-fast) var(--ease-smooth);
}
.meow-modal-enter-from,
.meow-modal-leave-to {
  opacity: 0;
}
.meow-modal-enter-active .settings-card,
.meow-modal-leave-active .settings-card {
  transition: transform var(--duration-normal) var(--ease-spring),
    opacity var(--duration-normal) var(--ease-spring);
}
.meow-modal-enter-from .settings-card {
  opacity: 0;
  transform: scale(0.94) translateY(8px);
}
.meow-modal-leave-to .settings-card {
  opacity: 0;
  transform: scale(0.98) translateY(4px);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--duration-fast) var(--ease-smooth),
    transform var(--duration-fast) var(--ease-spring);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
}
</style>
