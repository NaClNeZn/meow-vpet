<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  // Live2DModel 实例(由 App.vue 通过 prop 传入,直接调用其 motion 方法)
  model: any
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

// 当前选中的 motion group(Idle/TapBody 等)和组内 index
const selectedGroup = ref<string>('')
const selectedIndex = ref<number>(0)

// 从模型读取所有 motion groups(返回 [{group, count}])
// pixi-live2d-display 的 internalModel.motionManager.definitions 是 { [group]: Motion[] }
const motionGroups = computed<Array<{ group: string; count: number }>>(() => {
  const m = props.model
  if (!m) return []
  const definitions = m.internalModel?.motionManager?.definitions
  if (!definitions || typeof definitions !== 'object') return []
  return Object.keys(definitions).map(group => ({
    group,
    count: Array.isArray(definitions[group]) ? definitions[group].length : 0
  })).filter(g => g.count > 0)
})

// 当前选中 group 下的 motion 列表
// 每个 motion 取 Name 字段,无则用 File 文件名(去掉 .motion3.json/.motion.json 后缀)
const motionList = computed<Array<{ index: number; name: string }>>(() => {
  const m = props.model
  if (!m || !selectedGroup.value) return []
  const definitions = m.internalModel?.motionManager?.definitions
  const list = definitions?.[selectedGroup.value]
  if (!Array.isArray(list)) return []
  return list.map((motion: any, idx: number) => {
    let name = motion?.Name || motion?.name
    if (!name && motion?.File) {
      // 从 "motions/mtn_01.motion3.json" 提取 "mtn_01"
      const file = String(motion.File).split('/').pop() || ''
      name = file.replace(/\.motion3?\.json$/i, '')
    }
    return { index: idx, name: name || `Motion ${idx + 1}` }
  })
})

// 切换 group 时重置 index
watch(selectedGroup, () => {
  selectedIndex.value = 0
})

// 面板打开时:自动选中第一个 group(若未选过)
watch(
  () => props.visible,
  (v) => {
    if (v && motionGroups.value.length > 0 && !selectedGroup.value) {
      selectedGroup.value = motionGroups.value[0].group
    }
  }
)

function handleCancel() {
  emit('update:visible', false)
}

function handlePlay() {
  const m = props.model
  if (!m || !selectedGroup.value) return
  try {
    // model.motion(group, index):触发指定组的第 index 个动作
    m.motion(selectedGroup.value, selectedIndex.value)
    emit('update:visible', false)
  } catch (err) {
    console.warn('[MotionsPanel] 触发动作失败:', err)
  }
}
</script>

<template>
  <Transition name="meow-modal">
    <div v-if="visible" class="panel-overlay meow-root" @click.self="handleCancel">
      <div class="panel-card">
        <header class="card-header">
          <div class="header-titles">
            <h2 class="card-title">动作</h2>
            <p class="card-subtitle">选择并播放模型动作</p>
          </div>
          <button class="icon-btn" title="关闭" @click="handleCancel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </header>

        <div class="card-body">
          <div v-if="!model" class="empty-tip">模型未加载</div>
          <div v-else-if="motionGroups.length === 0" class="empty-tip">
            当前模型未定义动作
          </div>
          <template v-else>
            <div class="form-section">
              <div class="section-title">分组</div>
              <div class="form-row">
                <div class="select-wrapper">
                  <select v-model="selectedGroup" class="select">
                    <option
                      v-for="g in motionGroups"
                      :key="g.group"
                      :value="g.group"
                    >
                      {{ g.group }}（{{ g.count }}）
                    </option>
                  </select>
                  <svg class="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>
              </div>
            </div>

            <div class="form-section">
              <div class="section-title">动作</div>
              <div class="form-row">
                <div class="select-wrapper">
                  <select v-model.number="selectedIndex" class="select">
                    <option
                      v-for="m in motionList"
                      :key="m.index"
                      :value="m.index"
                    >
                      {{ m.name }}
                    </option>
                  </select>
                  <svg class="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>
                <p class="form-hint">点击「播放」立即触发所选动作</p>
              </div>
            </div>
          </template>
        </div>

        <footer v-if="model && motionGroups.length > 0" class="card-footer">
          <button class="btn btn-ghost" @click="handleCancel">取消</button>
          <button class="btn btn-primary" @click="handlePlay">播放</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.panel-overlay {
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

.panel-card {
  width: 100%;
  max-width: 320px;
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

.form-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-hint {
  margin: 2px 0 0;
  font-size: 11px;
  color: oklch(var(--muted-foreground));
}

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

.empty-tip {
  font-size: 12px;
  color: oklch(var(--muted-foreground));
  text-align: center;
  padding: 12px 8px;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid oklch(var(--border));
  background: oklch(var(--card));
}

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
.meow-modal-enter-active .panel-card,
.meow-modal-leave-active .panel-card {
  transition: transform var(--duration-normal) var(--ease-spring),
    opacity var(--duration-normal) var(--ease-spring);
}
.meow-modal-enter-from .panel-card {
  opacity: 0;
  transform: scale(0.94) translateY(8px);
}
.meow-modal-leave-to .panel-card {
  opacity: 0;
  transform: scale(0.98) translateY(4px);
}
</style>
