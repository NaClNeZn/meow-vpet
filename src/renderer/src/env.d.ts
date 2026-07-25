/// <reference types="vite/client" />

interface MeowVpetConfig {
  meowToolUrl: string
  live2dModelPath: string
  agentId?: string
  windowX?: number
  windowY?: number
  windowScale: number
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
  }
}
