import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// 全局样式:消除 html/body 默认 margin 和滚动条,
// 让窗口内容严格限制在窗口尺寸内(透明窗口不应出现滚动条)
// 注意:必须用固定 px 而非 100vw/100vh。透明窗口在 DPI 缩放下 100vw 会有亚像素
// 抖动,导致 position:absolute + right:8px 的按钮基准变化,产生视觉漂移。
// 360x480 与主进程 WINDOW_W/WINDOW_H 保持一致
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
`
document.head.appendChild(style)

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
