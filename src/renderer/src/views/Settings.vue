<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import axios from 'axios'
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElSwitch,
  ElButton,
  ElMessage
} from 'element-plus'
import { useConfigStore } from '../stores/config'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

const configStore = useConfigStore()

// 表单数据
const formData = ref({
  meowToolUrl: 'http://localhost:4399',
  live2dModelPath: '/models/shizuku/shizuku.model.json',
  agentId: '' as string
})

// agent 列表
const agents = ref<Array<{ id: string; name: string; enabled: boolean }>>([])
// skill 列表
const skills = ref<Array<{ id: string; name: string; enabled: boolean }>>([])
const loading = ref(false)

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

// 切换 skill 启用状态
async function toggleSkill(skill: { id: string; name?: string; enabled: boolean }) {
  try {
    await axios.put(
      `${formData.value.meowToolUrl}/v1/config/skills/${skill.id}`,
      { enabled: skill.enabled }
    )
    ElMessage.success(`${skill.name || skill.id} 已${skill.enabled ? '启用' : '禁用'}`)
  } catch (err) {
    // 回滚
    skill.enabled = !skill.enabled
    ElMessage.error('更新失败')
  }
}

// 保存配置
async function handleSave() {
  await configStore.save({
    meowToolUrl: formData.value.meowToolUrl,
    live2dModelPath: formData.value.live2dModelPath,
    agentId: formData.value.agentId || undefined
  })
  ElMessage.success('配置已保存')
  emit('saved')
  emit('update:visible', false)
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
      }
      loading.value = true
      await Promise.all([loadAgents(), loadSkills()])
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
  }
})
</script>

<template>
  <div v-if="visible" class="settings-overlay" @click.self="handleCancel">
    <div class="settings-card">
      <h2>设置</h2>
      <el-form label-position="top" :model="formData">
        <el-form-item label="meow-tool 服务地址">
          <el-input v-model="formData.meowToolUrl" placeholder="http://localhost:4399" />
        </el-form-item>
        <el-form-item label="Live2D 模型路径">
          <el-input v-model="formData.live2dModelPath" placeholder="/models/shizuku/shizuku.model.json" />
        </el-form-item>
        <el-form-item label="Agent">
          <el-select v-model="formData.agentId" placeholder="不使用 Agent" clearable>
            <el-option
              v-for="agent in agents"
              :key="agent.id"
              :label="agent.name"
              :value="agent.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Skills">
          <div class="skills-list">
            <div v-for="skill in skills" :key="skill.id" class="skill-item">
              <span>{{ skill.name }}</span>
              <el-switch v-model="skill.enabled" @change="toggleSkill(skill)" />
            </div>
            <div v-if="skills.length === 0" class="empty-tip">暂无 Skill</div>
          </div>
        </el-form-item>
      </el-form>
      <div class="actions">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.settings-card {
  width: 360px;
  max-height: 80vh;
  overflow-y: auto;
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  font-family: system-ui, -apple-system, sans-serif;
}
h2 {
  margin: 0 0 16px;
  font-size: 18px;
  color: #333;
}
.skills-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.skill-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.empty-tip {
  color: #999;
  font-size: 13px;
  text-align: center;
  padding: 8px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
