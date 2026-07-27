import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface MeowVpetConfig {
  meowToolUrl: string
  live2dModelPath: string
  agentId?: string
  systemPrompt?: string
  windowX?: number
  windowY?: number
  windowScale: number
}

export const useConfigStore = defineStore('config', () => {
  const config = ref<MeowVpetConfig | null>(null)

  const isReady = computed(() => config.value !== null)

  // 从主进程加载配置
  async function loadFromBackend() {
    if (!window.app) return
    config.value = await window.app.getConfig()
  }

  // 保存配置(部分更新)
  async function save(partial: Partial<MeowVpetConfig>) {
    if (!window.app) return
    config.value = await window.app.saveConfig(partial)
  }

  // 快捷设置 agentId
  async function setAgentId(id?: string) {
    await save({ agentId: id })
  }

  return {
    config,
    isReady,
    loadFromBackend,
    save,
    setAgentId
  }
})
