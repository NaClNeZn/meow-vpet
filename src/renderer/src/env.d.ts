/// <reference types="vite/client" />

interface MeowVpetConfig {
  meowToolUrl: string
  live2dModelPath: string
  agentId?: string
  systemPrompt?: string
  windowX?: number
  windowY?: number
  windowSizeScale: number
  modelScale: number
}

declare interface Window {
  app: {
    getAppInfo: () => Promise<any>
    setIgnoreMouseEvents: (ignore: boolean) => Promise<void>
    startWindowDrag: () => Promise<void>
    stopWindowDrag: () => Promise<void>
    startMouseTracking: () => Promise<void>
    stopMouseTracking: () => Promise<void>
    onGlobalMousePosition: (callback: (pos: { x: number; y: number }) => void) => void
    onBackendStatusChange: (callback: (status: string) => void) => void
    getBackendStatus: () => Promise<string>
    getConfig: () => Promise<MeowVpetConfig>
    saveConfig: (config: Partial<MeowVpetConfig>) => Promise<MeowVpetConfig>
    onOpenSettings: (callback: () => void) => void
    // 实时调整窗口尺寸:scale 为 0.5-2.0 的乘数,基于 360x480
    setWindowSize: (scale: number) => Promise<void>
  }
}
