import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// 全局样式:消除 html/body 默认 margin 和滚动条,
// 让窗口内容严格限制在窗口尺寸内(透明窗口不应出现滚动条)
// 注意:必须用固定 px 而非 100vw/100vh。透明窗口在 DPI 缩放下 100vw 会有亚像素
// 抖动,导致 position:absolute + right:8px 的按钮基准变化,产生视觉漂移。
// 360x480 与主进程 WINDOW_W/WINDOW_H 保持一致
//
// 同时注入 meow-tool 同款 shadcn 主题变量(oklch 色彩空间)+ Element Plus 主题覆盖,
// 让 Settings 等面板视觉与 meow-tool web 控制台保持一致。
const style = document.createElement('style')
style.textContent = `
  html, body {
    margin: 0;
    padding: 0;
    width: 360px;
    height: 480px;
    overflow: hidden;
    background: transparent;
  }
  #app {
    width: 360px;
    height: 480px;
    overflow: hidden;
  }

  /* ===== meow-tool 主题变量(shadcn 风格,oklch 色彩空间)===== */
  :root {
    --background: 1 0 0;
    --foreground: 0.145 0 0;
    --card: 1 0 0;
    --card-foreground: 0.145 0 0;
    --popover: 1 0 0;
    --popover-foreground: 0.145 0 0;
    --primary: 0.205 0 0;
    --primary-foreground: 0.985 0 0;
    --secondary: 0.97 0 0;
    --secondary-foreground: 0.205 0 0;
    --muted: 0.97 0 0;
    --muted-foreground: 0.556 0 0;
    --accent: 0.97 0 0;
    --accent-foreground: 0.205 0 0;
    --destructive: 0.577 0.245 27.325;
    --border: 0.922 0 0;
    --input: 0.922 0 0;
    --ring: 0.708 0 0;

    --duration-fast: 0.15s;
    --duration-normal: 0.25s;
    --duration-slow: 0.4s;
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);

    color-scheme: light;
  }

  /* ===== meow-tool 全局基础样式 ===== */
  .meow-root {
    font-family: 'HarmonyOS Sans SC', 'HarmonyOS Sans', -apple-system, BlinkMacSystemFont,
      'Segoe UI', 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif,
      'Apple Color Emoji', 'Segoe UI Emoji';
    line-height: 1.5;
    font-weight: 400;
    color: oklch(var(--foreground));
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    font-synthesis: none;
  }

  .meow-root ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .meow-root ::-webkit-scrollbar-track {
    background: transparent;
  }
  .meow-root ::-webkit-scrollbar-thumb {
    background: oklch(var(--border));
    border-radius: 3px;
  }
  .meow-root ::-webkit-scrollbar-thumb:hover {
    background: oklch(var(--muted-foreground));
  }
`
document.head.appendChild(style)

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
