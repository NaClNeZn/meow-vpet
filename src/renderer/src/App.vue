<script setup lang="ts">
import { ref, onMounted, computed, watch, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import Live2DCanvas from './components/Live2DCanvas.vue'
import ChatPanel from './components/ChatPanel.vue'
import Settings from './views/Settings.vue'
import MotionsPanel from './views/MotionsPanel.vue'
import ExpressionsPanel from './views/ExpressionsPanel.vue'
import { useConfigStore } from './stores/config'
import { setBaseUrl } from './api/client'

const configStore = useConfigStore()

const status = ref('启动中...')
const modelLoaded = ref(false)
const backendStatus = ref<string>('starting')
const showChat = ref(false)
const showSettings = ref(false)
// 动作面板与表情面板:右键菜单触发显示,各自独立显示
const showMotions = ref(false)
const showExpressions = ref(false)
// 当前已加载的 Live2D 模型实例(shallowRef 避免 Vue 深度代理 PIXI 对象)
// 通过 prop 传给 MotionsPanel/ExpressionsPanel,面板调用 model.motion/expression 触发
const liveModel: ShallowRef<any> = shallowRef<any>(null)
// 从配置读取 agentId / systemPrompt / modelScale / modelPath
const agentId = ref<string | undefined>(undefined)
const systemPrompt = ref<string | undefined>(undefined)
// 模型缩放系数(基于 fitScale 的乘数),传给 Live2DCanvas
const modelScale = ref<number>(1.0)
// 模型路径:相对 ~/.meow-vpet/ 的路径,例如 "models/Mao/Mao.model3.json"
// 传给 Live2DCanvas,变化时由其内部 watch 触发重新加载模型
const modelPath = ref<string | undefined>(undefined)

const backendReady = computed(() => backendStatus.value === 'ready')

onMounted(async () => {
  if (window.app) {
    // Electron 环境:通过主进程 IPC 获取后端状态
    window.app.onBackendStatusChange((s: string) => {
      backendStatus.value = s
      updateStatus()
    })
    // 主动查询当前后端状态,补齐页面加载前错过的 IPC 事件
    const currentStatus = await window.app.getBackendStatus()
    backendStatus.value = currentStatus
    updateStatus()
    // 监听「打开设置」菜单事件(托盘/右键菜单触发)
    window.app.onOpenSettings(() => {
      showSettings.value = true
    })
    // 监听「打开动作面板」菜单事件
    window.app.onOpenMotions(() => {
      showMotions.value = true
    })
    // 监听「打开表情面板」菜单事件
    window.app.onOpenExpressions(() => {
      showExpressions.value = true
    })
  } else {
    // 浏览器环境(直接访问 dev server):主动探测后端健康检查
    backendStatus.value = 'waiting'
    updateStatus()
    try {
      const res = await fetch('http://localhost:4399/api')
      if (res.ok) {
        backendStatus.value = 'ready'
      } else {
        backendStatus.value = 'error'
      }
    } catch {
      backendStatus.value = 'error'
    }
    updateStatus()
  }
  // 加载持久化配置
  await configStore.loadFromBackend()
  if (configStore.config) {
    agentId.value = configStore.config.agentId
    systemPrompt.value = configStore.config.systemPrompt
    modelScale.value = configStore.config.modelScale ?? 1.0
    modelPath.value = configStore.config.live2dModelPath
    // 同步后端地址到 API 客户端
    setBaseUrl(configStore.config.meowToolUrl)
  } else if (!window.app) {
    // 浏览器环境没有配置时,使用默认地址
    setBaseUrl('http://localhost:4399')
  }
})

// 配置变化时同步 agentId / systemPrompt
watch(
  () => configStore.config?.agentId,
  (val) => {
    agentId.value = val
  }
)
watch(
  () => configStore.config?.systemPrompt,
  (val) => {
    systemPrompt.value = val
  }
)
// 配置变化时同步 modelPath(设置页切换模型后,Live2DCanvas watch 触发重新加载)
watch(
  () => configStore.config?.live2dModelPath,
  (val) => {
    modelPath.value = val
  }
)

// 设置页 slider 实时拖动时直接更新 modelScale ref(不经过 configStore,避免 Pinia ref
// 属性突变不触发 watch 的问题)→ 立即传给 Live2DCanvas prop → watch 触发 applyModelScale
function onModelScaleChange(scale: number) {
  modelScale.value = scale
}

function updateStatus() {
  const map: Record<string, string> = {
    starting: '正在启动后端...',
    waiting: '等待后端就绪...',
    ready: '就绪',
    timeout: '后端启动超时',
    error: '后端启动失败'
  }
  status.value = map[backendStatus.value] || backendStatus.value
}

function onModelLoaded(model: any) {
  modelLoaded.value = true
  liveModel.value = model
}

// 上一次 setIgnoreMouseEvents 的状态,用于去重避免冗余 IPC 调用
let lastIgnoreState: boolean | null = null
let ignoreInitialized = false
function onPointerMove(isHit: boolean) {
  // 策略:鼠标在窗口内时不穿透,让所有鼠标事件正常派发(避免穿透→不穿透切换吞 click)
  // 代价:透明区域会挡住桌面点击,但桌宠场景可接受(用户很少点击桌宠背后的桌面)
  if (window.app && !showChat.value && !showSettings.value) {
    // 首次调用时设为不穿透,之后不再切换
    if (!ignoreInitialized) {
      window.app.setIgnoreMouseEvents(false)
      lastIgnoreState = false
      ignoreInitialized = true
    }
  }
}

function toggleChat() {
  showChat.value = !showChat.value
}

// 设置面板保存后刷新 agentId / systemPrompt / modelScale / modelPath 和后端地址
function onSettingsSaved() {
  if (configStore.config) {
    agentId.value = configStore.config.agentId
    systemPrompt.value = configStore.config.systemPrompt
    modelScale.value = configStore.config.modelScale ?? 1.0
    modelPath.value = configStore.config.live2dModelPath
    setBaseUrl(configStore.config.meowToolUrl)
  }
}
</script>

<template>
  <div class="app">
    <Live2DCanvas
      :model-path="modelPath"
      :model-scale="modelScale"
      @model-loaded="onModelLoaded"
      @pointer-move="onPointerMove"
    />
    <div v-if="!modelLoaded" class="loading">{{ status }}</div>
    <button
      v-if="modelLoaded"
      class="toggle-chat-btn"
      @click="toggleChat"
    >
      {{ showChat ? '×' : '+' }}
    </button>
    <ChatPanel
      v-if="showChat && modelLoaded"
      :backend-ready="backendReady"
      :agent-id="agentId"
      :system-prompt="systemPrompt"
    />
    <Settings
      v-model:visible="showSettings"
      @saved="onSettingsSaved"
      @model-scale-change="onModelScaleChange"
    />
    <MotionsPanel
      v-model:visible="showMotions"
      :model="liveModel"
    />
    <ExpressionsPanel
      v-model:visible="showExpressions"
      :model="liveModel"
    />
  </div>
</template>

<style scoped>
.app {
  /* 100% 适配窗口尺寸:由主进程 BrowserWindow.setSize 控制
     不用 100vw/100vh(透明窗口下亚像素抖动),100% 解析父级整数像素稳定 */
  width: 100%;
  height: 100%;
  background: transparent;
  position: relative;
  font-family: system-ui, -apple-system, sans-serif;
  user-select: none;
  overflow: hidden;
}
.loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  font-size: 14px;
  color: #333;
}
.toggle-chat-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  /* 防止 drag 覆盖层激活时按钮被拖拽区域吞掉 */
  -webkit-app-region: no-drag;
}
.toggle-chat-btn:hover {
  background: rgba(255, 255, 255, 1);
}
/* ChatPanel 定位在右侧 */
.app :deep(.chat-panel) {
  position: absolute;
  top: 48px;
  right: 8px;
}
</style>
