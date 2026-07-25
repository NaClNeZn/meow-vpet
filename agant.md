# meow-vpet

`meow-vpet` 是基于 meow-tool 项目衍生出来的 Live2D 虚拟桌宠项目,使用 Electron + Node + TypeScript + Vue3 创建。

## meow-tool
项目代码在 `D:\code\NaCl\meow-tool`

---

## 1. 项目定位

meow-vpet = meow-tool 后端(LLM 路由 + Agent/Skill/MCP 编排)+ Live2D 桌宠前端(Electron + Vue3 + PixiJS)。

meow-tool 是一个多厂商 LLM 路由器,已实现 OpenAI/Anthropic 双协议 + Agent/Skill/MCP 编排 + SQLite 持久化 + SSE 流式。meow-vpet 复用 meow-tool 的后端能力,在其之上新增 Live2D 渲染 + Electron 桌面壳 + 聊天 UI。

与 meow-tool 的关系:meow-vpet 通过 HTTP/SSE 调用 meow-tool 的 `http://localhost:4399/v1/*` API,不改动 meow-tool 源码。两个项目代码相互独立,通过本地 HTTP 接口解耦。

---

## 2. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        meow-vpet(Electron 应用)                     │
│                                                                     │
│  ┌─────────────────────────────────────┐                            │
│  │   Electron 主进程(Node + TS)        │                            │
│  │   - BrowserWindow 创建与管理         │                            │
│  │   - 托盘(Tray)+ 右键菜单            │                            │
│  │   - IPC handler 集中注册             │                            │
│  │   - spawn meow-tool 子进程           │                            │
│  │   - 配置文件读写(zod 校验)          │                            │
│  └──────────────┬──────────────────────┘                            │
│                 │ IPC(contextBridge)                                │
│                 ▼                                                   │
│  ┌─────────────────────────────────────┐                            │
│  │   Electron 渲染进程(Vue3 + TS)      │                            │
│  │   - Live2D Canvas(PixiJS)           │                            │
│  │   - 聊天 UI(流式消息)               │                            │
│  │   - 设置面板(模型/服务地址/agent)    │                            │
│  │   - axios/fetch 调 meow-tool         │                            │
│  └──────────────┬──────────────────────┘                            │
│                 │ HTTP / SSE                                         │
└─────────────────┼───────────────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│           meow-tool 后端(已有,Hono + SQLite)                       │
│           http://localhost:4399                                      │
│   - POST /v1/chat/completions   (OpenAI 协议,SSE 流式)              │
│   - POST /v1/messages           (Anthropic 协议,SSE 流式)           │
│   - GET  /v1/config/*           (模型/agent/skill 配置)             │
│   - POST /v1/sessions           (会话管理)                          │
│   - GET  /api                   (健康检查)                          │
│   - POST /v1/shutdown           (优雅关闭)                          │
└─────────────────────────────────────────────────────────────────────┘
```

通信方式说明:
- 主进程 ↔ 渲染进程:Electron IPC(contextBridge + ipcRenderer/ipcMain)
- 渲染进程 ↔ meow-tool:HTTP(普通请求)+ SSE(流式聊天,基于 fetch ReadableStream)

---

## 3. 技术栈

| 分类 | 技术 / 库 | 版本 | 说明 |
|---|---|---|---|
| 桌面壳 | Electron | ^33 | 跨平台桌面应用容器 |
| 桌面壳 | electron-vite | 最新 | main/preload/renderer 三入口构建 |
| 桌面壳 | electron-builder | 最新 | 打包成安装包 |
| 主进程 | Node | >=20 | 运行时 |
| 主进程 | TypeScript | ^5.7 | 类型系统 |
| 主进程 | tsx | 最新 | 直接运行 TS(开发 meow-tool) |
| 渲染进程 | Vue | ^3.4 | UI 框架 |
| 渲染进程 | Vite | 5 | 构建工具 |
| 渲染进程 | TypeScript | ^5.7 | 类型系统 |
| 渲染进程 | Element Plus | ^2.8 | UI 组件库 |
| 渲染进程 | Tailwind | ^3.4 | 原子化 CSS |
| 渲染进程 | axios | ^1.7 | 普通 HTTP 请求 |
| Live2D | pixi.js | ^7 | WebGL 渲染引擎 |
| Live2D | pixi-live2d-display | ^0.4 | Live2D 模型加载与控制(对应 PixiJS 7) |
| Live2D | Live2D Cubism Core | 官方 SDK | 通过 `<script>` 标签引入 |
| 校验 | zod | ^3.24 | 配置文件 schema 校验 |
| 配置存储 | 文件系统 | - | `~/.meow-vpet/config.json`,zod 校验 |

---

## 4. 目录结构

electron-vite 标准结构 + 自定义目录:

```
meow-vpet/
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 入口:创建 BrowserWindow + 托盘 + IPC
│   │   ├── meow-tool.ts       # spawn meow-tool 子进程 + 健康检查 + 优雅关闭
│   │   ├── config.ts          # 读写 ~/.meow-vpet/config.json(zod 校验)
│   │   ├── tray.ts            # 托盘图标 + 右键菜单
│   │   └── ipc.ts             # IPC handler 集中注册
│   ├── preload/
│   │   └── index.ts           # contextBridge 暴露 IPC API
│   └── renderer/
│       ├── index.html         # 引入 live2dcubismcore.min.js
│       └── src/
│           ├── main.ts        # Vue 入口
│           ├── App.vue        # 顶层布局
│           ├── api/
│           │   └── client.ts  # 封装 meow-tool API(SSE 流式 + 普通)
│           ├── components/
│           │   ├── Live2DCanvas.vue   # PixiJS + pixi-live2d-display 渲染
│           │   └── ChatPanel.vue      # 聊天 UI(输入 + 流式消息)
│           ├── views/
│           │   └── Settings.vue       # 设置面板(模型/服务地址/agent/skill)
│           └── stores/
│               └── config.ts  # Pinia 配置 store
├── resources/
│   ├── lib/
│   │   └── live2dcubismcore.min.js  # Live2D 官方核心库
│   ├── models/                # Live2D 模型目录(每个模型一个子目录)
│   └── tray/
│       └── icon.png           # 托盘图标
├── electron.vite.config.ts    # main/preload/renderer 三入口构建配置
├── package.json
├── tsconfig.json              # 根配置(references 指向 node/web)
├── tsconfig.node.json         # 主进程 + preload
├── tsconfig.web.json          # 渲染进程
└── .gitignore
```

---

## 5. 关键实现细节

### 5.1 Live2D 渲染

- 在 `index.html` 通过 `<script src="../resources/lib/live2dcubismcore.min.js"></script>` 引入官方核心库,必须在 pixi-live2d-display 之前加载(全局 `Live2DCubismCore` 对象)。
- `Live2DCanvas.vue` 初始化 PIXI.Application,背景透明(`backgroundAlpha: 0`),通过 `Live2DModel.from(modelPath)` 加载模型;modelPath 指向 `.model3.json` 文件。
- 鼠标眼球跟随:监听 `mousemove`,调用 `model.focus(x, y)`,需将屏幕坐标转为模型坐标(pixi-live2d-display 内部已处理)。
- 点击触发动作:`model.tap(x, y)` 自动命中检测并触发内置 tap 动作;也可主动调用 `model.motion('tap')` 触发动作组,或 `model.expression(name)` 切换表情。
- 滚轮缩放:监听 `wheel` 事件,调整 `model.scale.set(s)`,范围限制 0.5 ~ 3,避免过大或过小。

### 5.2 透明窗口 + 点击穿透

- BrowserWindow 关键配置:
  - `transparent: true`(窗口透明)
  - `frame: false`(无边框)
  - `alwaysOnTop: true`(置顶)
  - `skipTaskbar: true`(不在任务栏显示)
  - `resizable: false`(禁止调整大小)
  - `backgroundColor: '#00000000'`(完全透明背景)
- **当前策略:永远不穿透**。窗口始终 `setIgnoreMouseEvents(false)`,所有鼠标事件正常派发到渲染进程。
  - 这样 +号按钮始终可点击,不会出现"拖拽后 +号点不开"的问题。
  - 代价:窗口矩形区域(360×480)的透明部分会挡住桌面点击。桌宠场景下可接受(用户很少需要点击桌宠背后的桌面)。
  - 如需恢复桌面点击,可加右键菜单"穿透模式"开关,或用带 debounce 的精确 hit-test(只在鼠标稳定停在模型上才不穿透)。
- **为什么不动态切换穿透**:之前用 `model.containsPoint` 判断命中 + `setIgnoreMouseEvents(true, { forward: true })` 动态切换,踩了几个深坑(详见踩坑速查表 #6 #7 #11 #12),最终放弃动态穿透。
- 关键陷阱:Windows 下 `transparent: true` 配合不当的 `backgroundColor` 会黑底,必须使用 `'#00000000'` 或省略该字段;`vibrancy` 在 Windows 下不要设置。

### 5.3 拖拽移动(长按 3 秒 + 主进程轮询)

**交互设计**:长按模型 3 秒才进入拖拽模式,避免误触发。长按期间显示 SVG 圆环进度条(3 秒填满一圈),给用户清晰反馈。

**纯时间判断,不判断移动像素**:
- mousedown 命中模型 → 启动 3 秒计时器 + rAF 进度动画
- 3 秒内 mouseup → 普通点击,清除计时器,不触发拖拽
- 3 秒后 → 进入拖拽模式,通知主进程开始轮询 cursor

**拖拽实现(主进程轮询,渲染层不处理 mousemove)**:
- 渲染进程 `startWindowDrag()` IPC → 主进程 `setInterval(16ms)` 轮询 `screen.getCursorScreenPoint()`
- 用绝对定位法:拖拽开始时一次性记录起点 cursor 和起点窗口位置,每帧用 `totalDx = cur.x - dragStartCursor.x` 计算总位移,`newX = dragStartWindow.x + totalDx`
- 不用 `getPosition()` 增量累加(会因 DPI 缩放、setPosition 抖动导致方向反转和漂移)
- 边界 clamp 到 `workArea`,防止窗口移出屏幕
- **位置去重**:记录上一帧 setPosition 的位置,相同时跳过 `setPosition`(边界停留时避免无意义 move 事件触发重绘)
- mouseup → `stopWindowDrag()` IPC → 主进程 `clearInterval` + 保存最终位置

**长按圆环**:
- SVG 两个 circle:背景圆环(淡白)+ 进度圆环(蓝色)
- `stroke-dasharray=213.6`(周长 2πr,r=34),`stroke-dashoffset` 从 213.6→0 表示进度 0→1
- `transform="rotate(-90 40 40)"` 让起点在 12 点钟方向
- `pointer-events: none` 不干扰鼠标事件

**拖拽中暂停全局鼠标跟踪**(见 5.7):减少主进程负担,避免与拖拽循环交错闪烁。

### 5.4 meow-tool 集成

主进程在启动时 spawn meow-tool 子进程,优先级递减(任一可用即可):

1. `meow start`(全局安装的 meow-tool CLI)
2. `npx meow-tool start`(临时拉取执行)
3. `node --import tsx D:\code\NaCl\meow-tool\src\bin\meow.ts dev`(本地开发模式,直接跑 TS 源码)

健康检查:`GET http://localhost:4399/api`,500ms 间隔轮询,最多 60 次(总超时 30s)。健康检查通过后才创建渲染窗口,避免渲染进程访问不到后端。

优雅关闭流程:
1. `POST http://localhost:4399/v1/shutdown` 通知 meow-tool 主动退出
2. 等待 500ms 让其完成收尾
3. 若仍在运行,强制 kill 子进程

进程隔离:meow-tool 子进程独立运行,主进程退出不依赖其退出码;主进程退出时主动触发上述关闭流程即可。

### 5.5 SSE 流式聊天

- 用 `fetch` + `ReadableStream` 替代 axios。axios 在浏览器端不支持原生流,无法正确处理 SSE。
- 请求体示例:
  ```json
  {
    "model": "normal",
    "messages": [...],
    "stream": true,
    "session_id": "xxx",
    "agent_id": "xxx"
  }
  ```
  `model` 可填 `"normal"`(走默认路由)或具体 agent 配置的模型名。
- 解析流程:
  1. `response.body.getReader()` 读取流
  2. 按 `\n` 分行
  3. 去除 `data: ` 前缀
  4. 遇到 `[DONE]` 结束
  5. `JSON.parse` 提取 `choices[0].delta.content` 增量拼接到 UI
- session 管理:首次对话先 `POST /v1/sessions` 创建会话,缓存返回的 `session_id`,后续请求都携带该 id 以保持上下文。

### 5.6 配置持久化

- 配置文件路径:`~/.meow-vpet/config.json`(独立于 meow-tool 的 `~/.meowtool/` 目录,互不干扰)。
- 核心字段:
  - `meowToolUrl`:meow-tool 服务地址(默认 `http://localhost:4399`)
  - `live2dModelPath`:Live2D 模型路径
  - `agentId`:默认使用的 agent id
  - `windowX` / `windowY`:窗口位置
  - `windowScale`:Live2D 模型缩放
- zod 定义 schema 校验,启动时读取并校验,校验失败回退默认值。
- 窗口 move/resize 事件节流保存(500ms 防抖),避免频繁写盘。

### 5.7 全局鼠标跟踪(眼球跟随)

**目的**:让桌宠在鼠标移出 app 窗口外时也能跟随鼠标方向看。浏览器层 `mousemove` 只在鼠标进入窗口时触发,无法捕获窗口外位置。

**实现**:
- 主进程 `setInterval(33ms)` (30fps) 轮询 `screen.getCursorScreenPoint()` 获取屏幕级物理像素坐标
- 转换为窗口内 CSS 坐标:`cssX = (cursor.x - winPos.x) / scaleFactor`
  - `screen.getCursorScreenPoint()` 和 `win.getPosition()` 都是物理像素
  - `model.focus()` 期望 CSS 像素,必须除以 `display.scaleFactor`(DPI 缩放因子)
- 通过 IPC `mouse:global` 事件推送到渲染进程
- 渲染进程 `handleGlobalMouse(pos)` 直接调用 `model.focus(pos.x, pos.y)`
- 坐标可能为负或超出窗口范围(鼠标在窗口外),Live2D 会自然处理为"看向那个方向"

**性能**:30fps 足够流畅,CPU 开销很低。拖拽中暂停跟踪(避免与拖拽循环交错闪烁,减少主进程负担)。

---

## 6. 踩坑速查表

| # | 坑 | 解法 |
|---|---|---|
| 1 | 透明窗口黑底 | `transparent: true` + `backgroundColor: '#00000000'`,Windows 还需 `vibrancy` 留空 |
| 2 | Cubism Core 加载顺序 | 必须在 pixi-live2d-display 之前通过 `<script>` 引入,放 index.html 顶部 |
| 3 | pixi-live2d-display 与 PixiJS 版本不兼容 | pixi-live2d-display ^0.4 对应 PixiJS ^7;^0.3 对应 PixiJS ^6,不能用错 |
| 4 | Electron 上下文隔离 | `contextIsolation: true` + `nodeIntegration: false`,通过 contextBridge 暴露 IPC |
| 5 | Live2D 模型版权 | Cubism SDK 商用授权:年销售额 < 1000 万日元免费,超过需付费;模型本身版权另算 |
| 6 | 点击穿透后无法接收 mousedown | 必须 `forward: true` 保留 mousemove,渲染进程用 mousemove 判断命中后 IPC 通知主进程取消穿透 |
| 7 | spawn meow-tool 失败 | Windows 下 `meow` 是 .cmd shim,需 `shell: true`;或用 `npx meow-tool start` |
| 8 | 渲染进程访问文件系统 | 走 IPC,不要开 `nodeIntegration`,通过 preload contextBridge 暴露受限 API |
| 9 | Live2D 模型路径 | 开发模式用相对路径 `resources/models/xxx`;打包后用 `process.resourcesPath` |
| 10 | SSE 在 Electron 渲染进程 | 标准 fetch ReadableStream 即可,不需要 EventSource(EventSource 不支持 POST) |
| 11 | `setIgnoreMouseEvents(true, { forward: true })` 在窗口 setPosition 移动后 hit-test 损坏 | `forward: true` 让 mousemove 转发用于检测鼠标回到模型,但窗口被 `setPosition` 移动后 Chromium 的 hit-test 缓存会损坏,导致穿透→不穿透切换时吞掉第一次 click。**根本解法:不用 `forward: true`,改用主进程全局鼠标跟踪(`screen.getCursorScreenPoint`)检测位置;或直接永远不穿透** |
| 12 | `model.containsPoint` 边缘像素抖动导致穿透状态疯狂切换 | 鼠标在模型边缘时 `containsPoint` 返回值不稳定(边界像素抖动),30fps 全局跟踪每帧都触发 `setIgnoreMouseEvents`,每秒几十次穿透切换,每次切换都吞 click。**解法:不用 `containsPoint` 做穿透判断,改为永远不穿透,或用带 debounce 的稳定判断** |
| 13 | 拖拽后 +号按钮不断往右侧漂移 | 根因 1:`100vw/100vh` 在透明窗口 + DPI 缩放下有亚像素抖动,`right: 8px` 定位基准变化。解法:改用固定 `360px/480px`(与主进程窗口尺寸一致)。根因 2:拖拽中 `handleMouseMove` 每帧 emit `pointer-move` → `setIgnoreMouseEvents` IPC → Chromium 重组累积误差。解法:拖拽中不 emit |
| 14 | 拖拽满屏移动后 +号点不开 | 根因:`forward: true` 的 hit-test 损坏 + `containsPoint` 抖动导致穿透状态疯狂切换,每次切换吞 click。试过 reload、保护期、focus 重置都无效(因为问题在穿透状态本身)。**最终解法:永远不穿透,消除所有状态切换** |
| 15 | 长按拖拽的 `endDrag` 误判 | `startDrag` 是 `setTimeout` 回调,触发时必须把 `pressTimer` 置 null,否则 mouseup 时 `endDrag` 会因 `pressTimer !== null` 误判为"还在等待长按",直接 return 不触发 `stopWindowDrag` |
| 16 | `window.blur` 误触发拖拽结束 | 满屏移动时窗口 setPosition 抖动会短暂失焦,`blur` 触发 `endDrag` 提前结束拖拽,导致状态混乱。解法:不监听 `window.blur`,只用 `document.mouseup` (capture: true) |
| 17 | 全局鼠标跟踪坐标换算 | `screen.getCursorScreenPoint()` 和 `win.getPosition()` 都是物理像素,`model.focus()` 期望 CSS 像素,必须除以 `display.scaleFactor`(DPI 缩放因子) |
| 18 | 拖拽方向反转/位移受限 | 用 `getPosition()` 增量累加会因 DPI 缩放、setPosition 抖动导致方向反转和漂移。解法:用绝对定位法(起点 + 总位移),全程不调用 `getPosition` |

---

## 7. 参考开源项目

| 项目 | 技术栈 | 参考价值 |
|---|---|---|
| [NyaDeskPet](https://github.com/) | Live2D + AI Agent 跨平台 | 同形态参考,二次开发文档已有 |
| [electron-vue-live2d](https://github.com/q-mona/electron-vue-live2d) | Electron + Vue + Live2D | 经典项目,Electron + Live2D 集成范式 |
| [live2d-kanban-desktop (WaifuProject)](https://studio.zerolite.cn/2022/07/02/waifuprojv2/) | Electron + Live2D + AI | 看板娘 + AI 对话 |
| [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | PixiJS + Cubism Core | Web 平台 Live2D 渲染标准库(必用) |
| [Live2D Cubism SDK for Web](https://www.live2d.com/en/sdk/about/) | 官方核心 | 免费 for 小企业 |
| [Desktop-Pet-Godot](https://github.com/jihe520/Desktop-Pet-Godot) | Godot + LLM | LLM 接入 + 桌宠交互逻辑 |

---

## 8. 开发流程

- `npm run dev`:启动开发模式。electron-vite 并行构建 main/preload/renderer 三个入口,然后启动 Electron 主进程加载渲染进程。
- `npm run build`:打包。electron-vite 构建产物 + electron-builder 生成平台安装包(Windows 下为 nsis 安装包或 portable)。
- meow-tool 启动方式二选一:
  - 独立启动:`cd D:\code\NaCl\meow-tool && npm start`,meow-vpet 健康检查通过后直接复用
  - 自动 spawn:不手动启动,meow-vpet 主进程按 5.4 节策略自动拉起 meow-tool 子进程
- 开发时建议 meow-tool 独立启动,便于查看后端日志和热重载;打包发布时由 meow-vpet 自动 spawn。
