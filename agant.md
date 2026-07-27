# meow-vpet

`meow-vpet` 是基于 meow-tool 项目衍生出来的 Live2D 虚拟桌宠项目,使用 Electron + Node + TypeScript + Vue3 创建。

## meow-tool

项目代码在 `D:\code\NaCl\meow-tool` 或者 `F:\code\nacl\meow-tool`

---

## 1. 项目定位

meow-vpet = meow-tool 后端(LLM 路由 + Agent/Skill/MCP 编排)+ Live2D 桌宠前端(Electron + Vue3 + PixiJS)。

meow-tool 是一个多厂商 LLM 路由器,已实现 OpenAI/Anthropic 双协议 + Agent/Skill/MCP 编排 + SQLite 持久化 + SSE
流式。meow-vpet 复用 meow-tool 的后端能力,在其之上新增 Live2D 渲染 + Electron 桌面壳 + 聊天 UI。

与 meow-tool 的关系:meow-vpet 通过 HTTP/SSE 调用 meow-tool 的 `http://localhost:4399/v1/*` API,不改动 meow-tool
源码。两个项目代码相互独立,通过本地 HTTP 接口解耦。

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
│   │   - spawn meow-tool 子进程           │                            │
│   │   - 配置文件读写(zod 校验)          │                            │
│   │   - 模型管理(内置复制 + 列表扫描)    │                            │
│   │   - 自定义 protocol(meow-model://)  │                            │
│   └──────────────┬──────────────────────┘                            │
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

| 分类     | 技术 / 库              | 版本     | 说明                                |
|--------|---------------------|--------|-----------------------------------|
| 桌面壳    | Electron            | ^33    | 跨平台桌面应用容器                         |
| 桌面壳    | electron-vite       | 最新     | main/preload/renderer 三入口构建       |
| 桌面壳    | electron-builder    | 最新     | 打包成安装包                            |
| 主进程    | Node                | >=20   | 运行时                               |
| 主进程    | TypeScript          | ^5.7   | 类型系统                              |
| 主进程    | tsx                 | 最新     | 直接运行 TS(开发 meow-tool)             |
| 渲染进程   | Vue                 | ^3.4   | UI 框架                             |
| 渲染进程   | Vite                | 5      | 构建工具                              |
| 渲染进程   | TypeScript          | ^5.7   | 类型系统                              |
| 渲染进程   | Element Plus        | ^2.8   | UI 组件库                            |
| 渲染进程   | Tailwind            | ^3.4   | 原子化 CSS                           |
| 渲染进程   | axios               | ^1.7   | 普通 HTTP 请求                        |
| Live2D | pixi.js             | ^7     | WebGL 渲染引擎                        |
| Live2D | pixi-live2d-display | ^0.4   | Live2D 模型加载与控制(对应 PixiJS 7)       |
| Live2D | Live2D Cubism Core  | 官方 SDK | 通过 `<script>` 标签引入                |
| 校验     | zod                 | ^3.24  | 配置文件 schema 校验                    |
| 配置存储   | 文件系统                | -      | `~/.meow-vpet/config.json`,zod 校验 |

---

## 4. 目录结构

electron-vite 标准结构 + 自定义目录:

```
meow-vpet/
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 入口:创建 BrowserWindow + 托盘 + IPC
│   │   ├── meow-tool.ts       # spawn meow-tool 子进程 + 健康检查 + 优雅关闭
│   │   ├── config.ts          # 读写 ~/.meow-vpet/config.json(zod 校验 + 旧路径迁移)
│   │   ├── models.ts          # 模型管理:内置复制 + 列表扫描 + 路径解析
│   │   ├── protocol.ts        # 自定义 protocol meow-model:// 注册与处理
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

- 在 `index.html` 通过 `<script src="../resources/lib/live2dcubismcore.min.js"></script>` 引入官方核心库,必须在
  pixi-live2d-display 之前加载(全局 `Live2DCubismCore` 对象)。
- `Live2DCanvas.vue` 初始化 PIXI.Application,背景透明(`backgroundAlpha: 0`),通过 `Live2DModel.from(modelUrl)`
  加载模型;modelUrl 由主进程 IPC 解析为 `meow-model://local/...` URL(见 5.10)。
- 模型路径:配置文件存储相对路径(如 `models/Mao/Mao.model3.json`),渲染层通过 `window.app.resolveModelUrl()`
  IPC 转换为 `meow-model://local/models/Mao/Mao.model3.json` 后传给 `Live2DModel.from()`。
  子资源(纹理、moc3、motion 等)由 pixi-live2d-display 基于主 URL 自动解析,同样走 `meow-model://` scheme。
- 鼠标眼球跟随:监听 `mousemove`,调用 `model.focus(x, y)`,需将屏幕坐标转为模型坐标(pixi-live2d-display 内部已处理)。
- 点击触发动作:`model.tap(x, y)` 自动命中检测并触发内置 tap 动作;也可主动调用 `model.motion('tap')` 触发动作组,或
  `model.expression(name)` 切换表情。
- 滚轮缩放:监听 `wheel` 事件,调整 `model.scale.set(s)`,范围限制 0.05 ~ 2.0。
- 模型切换:`Live2DCanvas` watch `props.modelPath` 变化,先 `destroyCurrentModel()` 销毁旧模型,再 `loadModel(newPath)`
  加载新模型;用 `loadToken` 防止快速切换时并发加载导致 stage 残留多个模型。

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
- **为什么不动态切换穿透**:之前用 `model.containsPoint` 判断命中 + `setIgnoreMouseEvents(true, { forward: true })`
  动态切换,踩了几个深坑(详见踩坑速查表 #6 #7 #11 #12),最终放弃动态穿透。
- 关键陷阱:Windows 下 `transparent: true` 配合不当的 `backgroundColor` 会黑底,必须使用 `'#00000000'` 或省略该字段;
  `vibrancy` 在 Windows 下不要设置。

### 5.3 拖拽移动(长按 3 秒 + 主进程轮询)

**交互设计**:长按模型 3 秒才进入拖拽模式,避免误触发。长按期间显示 SVG 圆环进度条(3 秒填满一圈),给用户清晰反馈。

**纯时间判断,不判断移动像素**:

- mousedown 命中模型 → 启动 3 秒计时器 + rAF 进度动画
- 3 秒内 mouseup → 普通点击,清除计时器,不触发拖拽
- 3 秒后 → 进入拖拽模式,通知主进程开始轮询 cursor

**拖拽实现(主进程轮询,渲染层不处理 mousemove)**:

- 渲染进程 `startWindowDrag()` IPC → 主进程 `setInterval(16ms)` 轮询 `screen.getCursorScreenPoint()`
- 用绝对定位法:拖拽开始时一次性记录起点 cursor 和起点窗口位置,每帧用 `totalDx = cur.x - dragStartCursor.x` 计算总位移,
  `newX = dragStartWindow.x + totalDx`
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
    - `live2dModelPath`:Live2D 模型路径,**相对 `~/.meow-vpet/` 的相对路径**(默认 `models/Mao/Mao.model3.json`)
      旧版本使用 `/models/...` 绝对路径从 dev server 根加载,启动时通过 `migrateConfig()` 自动迁移为新格式
    - `agentId`:默认使用的 agent id
    - `systemPrompt`:系统提示词(每次发送消息时 prepend 到 messages 数组开头,留空则不注入)
    - `windowX` / `windowY`:窗口位置
    - `windowSizeScale`:窗口尺寸缩放系数(基于 360×480 的乘数,1.0 = 默认尺寸,范围 0.8~2.0)
    - `modelScale`:模型尺寸缩放系数(基于 fitScale 的乘数,1.0 = 自适应铺满窗口 80%,范围 0.3~2.0)
- zod 定义 schema 校验,启动时读取并校验,校验失败回退默认值。
- `migrateConfig()`:加载时若发现 `live2dModelPath` 以 `/models/` 开头(旧格式),去掉前导斜杠转为 `models/...`(新格式)。
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

### 5.8 设置面板(meow-tool 同款 UI)

**设计目标**:右键打开的设置页与 meow-tool web 控制台视觉完全一致,纯 HTML/CSS 实现,不依赖 Element Plus 组件。

**主题对齐 meow-tool 的关键点**:

- **主题色**:oklch 色彩空间的 shadcn 语义 token(`--background` / `--foreground` / `--card` / `--primary` / `--border` / `--ring` 等),纯黑白灰,无强调彩色。在 [src/renderer/src/main.ts](src/renderer/src/main.ts) 顶层注入 CSS 变量,所有组件通过 `var(--xxx)` 引用。
- **字体**:HarmonyOS Sans SC 优先,字号遵循 meow-tool 约定(标题 14px / 正文 13px / label 12px / 小标题 11px 大写 letter-spacing)。
- **圆角**:6px(base)/ 4px(small)/ 9999px(round),对齐 meow-tool `element-theme.scss` 中 `--el-border-radius-base`。
- **按钮**:复用 meow-tool `_buttons.scss` 的 `.btn / .btn-primary / .btn-ghost` 样式,带 active scale 0.97 反馈。
- **表单**:复用 `_forms.scss` 的 `.select` 风格(1px border + focus 3px ring + 6px radius),自带 chevron 下拉箭头。
- **Switch**:自绘 shadcn Switch(32×18,黑色 thumb 滑动),替代 `el-switch`。
- **Toast**:替代 `ElMessage`,顶部居中胶囊,1800ms 自动隐藏。
- **动画**:`modal-scale` 弹性进入 + `ease-spring` 弹簧曲线 + `backdrop-filter: blur(6px)` 遮罩。
- **滚动条**:6px 细瘦样式,与 meow-tool `style.css` 中的过渡变量一致。

**配置分区**(自上而下):
1. 服务连接:meow-tool 服务地址
2. Live2D:**模型下拉选择**(扫描 `~/.meow-vpet/models/` 自动列出所有 `*.model3.json` / `*.model.json`),
   选项显示模型名 + Cubism 版本(Cubism 4 / Cubism 2);默认 Agent 下拉(从 `/v1/config/agents` 拉取)
3. 显示:窗口大小 slider(0.8~2.0)、模型大小 slider(0.3~2.0),均为实时调节 + 500ms 防抖保存
4. 提示词:System Prompt 文本域(4 行,辅助说明每次发送消息时 prepend 到 messages 开头)
5. Skill 管理:从 meow-tool `/v1/config/skills` 拉取列表,Switch 切换启用状态

**模型列表加载**:弹窗 `visible` watch 时并发调用 `loadAgents() / loadSkills() / loadAvailableModels()`,
`loadAvailableModels()` 通过 IPC `models:list` 从主进程获取扫描结果。组件挂载时也预加载一次,首次打开设置无需等待。

**模型切换链路**:下拉选择 → `formData.live2dModelPath` 更新 → 保存按钮 → `configStore.save()` →
`App.vue` watch `config.live2dModelPath` → `modelPath` ref 更新 → 传 `Live2DCanvas` prop →
`watch(props.modelPath)` → `destroyCurrentModel() + loadModel(newPath)`。

### 5.9 窗口/模型大小实时调节

**目标**:设置页 slider 拖动时窗口尺寸和模型尺寸即时变化,关闭后持久化,下次启动自动读取。

**窗口大小 slider 实时反馈链路**:

```
slider @input →
  1. window.app.setWindowSize(scale) IPC → 主进程 win.setSize() 即时变窗口
  2. CSS 100% 跟随 → ResizeObserver → PIXI app.renderer.resize() + recomputeFitScale() + applyModelScale()
  3. 500ms 防抖 configStore.save({ windowSizeScale }) 持久化
```

**模型大小 slider 实时反馈链路**(emit 直通,不经 configStore):

```
slider @input →
  emit('model-scale-change', val) →
    App.vue onModelScaleChange → modelScale ref 更新 →
      :model-scale prop 传 Live2DCanvas →
        watch(props.modelScale) → applyModelScale() 即时 model.scale.set(fitScale × modelScale)
  500ms 防抖 configStore.save({ modelScale }) 持久化
```

**启动读取**:

- 主进程 `createWindow()` 启动时 `loadConfig().windowSizeScale` → `applyWindowScale()` 计算 `currentWindowW/H` → `new BrowserWindow({ width, height })`
- 渲染层 `App.vue` `onMounted` 读 `config.modelScale` → 传 Live2DCanvas prop → `recomputeFitScale` + `applyModelScale` 应用

**关键设计点**:

- **fitScale 与 modelScale 分离**:`fitScale` 是自适应基准(由窗口尺寸和模型原始尺寸算出),`modelScale` 是用户乘数。窗口变化时 fitScale 重算,模型变化时只重应用最终乘积 `fitScale × modelScale`,互不干扰。
- **emit 不走 store**:Pinia setup store 中 `ref<Config | null>(null)` 的属性突变(`configStore.config.modelScale = val`)不保证触发 `watch(() => configStore.config?.modelScale)` —— Vue 3 的 reactive 代理在某些代码路径下不会追踪深层属性变化。改用 emit 直接父子通信,绕过 store 响应式。
- **窗口最小 80%**:slider min=0.8,对应 288×384 px,既保证 Live2D 模型细节可辨识,又允许缩小到接近一半的桌面占用。三层 clamp(zod schema / applyWindowScale / slider min)保证不越界。

### 5.10 模型管理(内置复制 + 用户导入)

**目录结构**:
- 内置模型源(开发):`src/renderer/public/models/`,每个模型一个子目录(`Mao/`、`shizuku/`)
- 内置模型源(生产):`process.resourcesPath/models/`(electron-builder `extraResources` 配置)
- 用户模型目录:`~/.meow-vpet/models/`,与 `config.json` 同目录统一管理

**首次启动复制** (`ensureBuiltinModels()`):
- `app.whenReady()` 中调用,逐个内置模型子目录复制到 `~/.meow-vpet/models/`
- 复制策略:检查目标目录是否已存在且包含 `*.model3.json` / `*.model.json` 文件
    - 目标目录不存在 → 复制整个目录
    - 目标目录存在但无 model json(内容不全/损坏) → 重新复制整个目录
    - 目标目录存在且有 model json(用户已安装) → 跳过,保留用户修改
- 用户导入新模型:把模型文件夹放进 `~/.meow-vpet/models/`,重开设置页即可在下拉看到

**模型列表扫描** (`listAvailableModels()`):
- 递归扫描 `~/.meow-vpet/models/`,查找 `*.model3.json` (Cubism 4) 和 `*.model.json` (Cubism 2)
- 返回 `[{ name, path, format }]`,`path` 为相对 `~/.meow-vpet/` 的路径(正斜杠分隔)
- `name` 推导:用文件名去掉后缀(`Mao.model3.json` → `Mao`)
- 按名称排序,方便用户查找
- 通过 IPC `models:list` 暴露给渲染层,设置页下拉选择使用

**路径解析** (`resolveModelUrl(relPath)`):
- 配置中存储相对路径(如 `models/Mao/Mao.model3.json`)
- 渲染层加载前通过 IPC `models:resolve-url` 转换为 `meow-model://local/models/Mao/Mao.model3.json`
- 兼容旧配置:`/models/...` 开头自动去掉前导斜杠
- 兼容已是 URL 的输入:`meow-model://` / `file://` / `http(s)://` 直接返回

### 5.11 自定义 protocol `meow-model://`

**为什么不用 `file://`**:
- dev 模式下渲染页是 `http://localhost:xxxx`,XHR/fetch 访问 `file://` 会被 Chromium CORS 拦截
- pixi-live2d-display 内部用 XHR 加载模型 JSON 和所有子资源(moc3、纹理、motion 等)
- 自定义 protocol 配合 `corsEnabled: true`,Chromium 自动添加 CORS 头,允许跨域访问

**scheme 注册** (`registerModelScheme()`,app ready 之前调用):
- 通过 `protocol.registerSchemesAsPrivileged()` 注册为 privileged scheme
- 关键 privileges:`standard: true` / `secure: true` / `supportFetchAPI: true` / `corsEnabled: true` / `stream: true`

**protocol handler** (`registerModelProtocol()`,app ready 之后调用):
- 用 `protocol.handle()` 处理 `meow-model://local/<relPath>` 请求
- 从 `~/.meow-vpet/<relPath>` 读取文件返回,根据扩展名设置 Content-Type
- 路径穿越防护:`normalize` 后校验解析路径仍在 `~/.meow-vpet/` 下(Windows 路径大小写不敏感,统一转小写比较)

**URL 格式陷阱**:
- scheme 注册为 `standard: true` 时,Chromium 规范化 URL 会把空 host 后的第一段路径当作 host
- 即 `meow-model:///models/Mao/...` 被规范化为 `meow-model://models/Mao/...`,导致 pathname 丢失 `models` 段
- **解法**:用固定 host `local`,URL 形如 `meow-model://local/models/Mao/Mao.model3.json`
- handler 兼容处理:若 host 不是 `local`(被误解析),把 host 拼回 pathname 还原完整路径

---

## 6. 踩坑速查表

| #  | 坑                                                                               | 解法                                                                                                                                                                                                           |
|----|---------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | 透明窗口黑底                                                                          | `transparent: true` + `backgroundColor: '#00000000'`,Windows 还需 `vibrancy` 留空                                                                                                                                |
| 2  | Cubism Core 加载顺序                                                                | 必须在 pixi-live2d-display 之前通过 `<script>` 引入,放 index.html 顶部                                                                                                                                                   |
| 3  | pixi-live2d-display 与 PixiJS 版本不兼容                                              | pixi-live2d-display ^0.4 对应 PixiJS ^7;^0.3 对应 PixiJS ^6,不能用错                                                                                                                                                 |
| 4  | Electron 上下文隔离                                                                  | `contextIsolation: true` + `nodeIntegration: false`,通过 contextBridge 暴露 IPC                                                                                                                                  |
| 5  | Live2D 模型版权                                                                     | Cubism SDK 商用授权:年销售额 < 1000 万日元免费,超过需付费;模型本身版权另算                                                                                                                                                             |
| 6  | 点击穿透后无法接收 mousedown                                                             | 必须 `forward: true` 保留 mousemove,渲染进程用 mousemove 判断命中后 IPC 通知主进程取消穿透                                                                                                                                          |
| 7  | spawn meow-tool 失败                                                              | Windows 下 `meow` 是 .cmd shim,需 `shell: true`;或用 `npx meow-tool start`                                                                                                                                        |
| 8  | 渲染进程访问文件系统                                                                      | 走 IPC,不要开 `nodeIntegration`,通过 preload contextBridge 暴露受限 API                                                                                                                                                |
| 9  | Live2D 模型路径与加载                                                                 | 模型统一放在 `~/.meow-vpet/models/` 下,配置存相对路径 `models/Mao/Mao.model3.json`。渲染层通过 IPC `models:resolve-url` 转为 `meow-model://local/...` URL 加载,不用 `file://`(dev 模式下 CORS 拦截)。内置模型首次启动时由 `ensureBuiltinModels()` 复制到用户目录 |
| 10 | SSE 在 Electron 渲染进程                                                             | 标准 fetch ReadableStream 即可,不需要 EventSource(EventSource 不支持 POST)                                                                                                                                             |
| 11 | `setIgnoreMouseEvents(true, { forward: true })` 在窗口 setPosition 移动后 hit-test 损坏 | `forward: true` 让 mousemove 转发用于检测鼠标回到模型,但窗口被 `setPosition` 移动后 Chromium 的 hit-test 缓存会损坏,导致穿透→不穿透切换时吞掉第一次 click。**根本解法:不用 `forward: true`,改用主进程全局鼠标跟踪(`screen.getCursorScreenPoint`)检测位置;或直接永远不穿透**         |
| 12 | `model.containsPoint` 边缘像素抖动导致穿透状态疯狂切换                                          | 鼠标在模型边缘时 `containsPoint` 返回值不稳定(边界像素抖动),30fps 全局跟踪每帧都触发 `setIgnoreMouseEvents`,每秒几十次穿透切换,每次切换都吞 click。**解法:不用 `containsPoint` 做穿透判断,改为永远不穿透,或用带 debounce 的稳定判断**                                             |
| 13 | 拖拽后 +号按钮不断往右侧漂移                                                                 | 根因 1:`100vw/100vh` 在透明窗口 + DPI 缩放下有亚像素抖动,`right: 8px` 定位基准变化。解法:改用固定 `360px/480px`(与主进程窗口尺寸一致)。根因 2:拖拽中 `handleMouseMove` 每帧 emit `pointer-move` → `setIgnoreMouseEvents` IPC → Chromium 重组累积误差。解法:拖拽中不 emit |
| 14 | 拖拽满屏移动后 +号点不开                                                                   | 根因:`forward: true` 的 hit-test 损坏 + `containsPoint` 抖动导致穿透状态疯狂切换,每次切换吞 click。试过 reload、保护期、focus 重置都无效(因为问题在穿透状态本身)。**最终解法:永远不穿透,消除所有状态切换**                                                                   |
| 15 | 长按拖拽的 `endDrag` 误判                                                              | `startDrag` 是 `setTimeout` 回调,触发时必须把 `pressTimer` 置 null,否则 mouseup 时 `endDrag` 会因 `pressTimer !== null` 误判为"还在等待长按",直接 return 不触发 `stopWindowDrag`                                                          |
| 16 | `window.blur` 误触发拖拽结束                                                           | 满屏移动时窗口 setPosition 抖动会短暂失焦,`blur` 触发 `endDrag` 提前结束拖拽,导致状态混乱。解法:不监听 `window.blur`,只用 `document.mouseup` (capture: true)                                                                                     |
| 17 | 全局鼠标跟踪坐标换算                                                                      | `screen.getCursorScreenPoint()` 和 `win.getPosition()` 都是物理像素,`model.focus()` 期望 CSS 像素,必须除以 `display.scaleFactor`(DPI 缩放因子)                                                                                  |
| 18 | 拖拽方向反转/位移受限                                                                     | 用 `getPosition()` 增量累加会因 DPI 缩放、setPosition 抖动导致方向反转和漂移。解法:用绝对定位法(起点 + 总位移),全程不调用 `getPosition`                                                                                                              |
| 19 | `win.setSize()` 在 frameless + transparent + resizable:false 下只生效一次                                          | Electron 在 Windows 上的已知 bug,后续 setSize 调用被静默忽略。解法:保持 `resizable: true`,配合下方 #20 的 resize 事件兜底                                                                                                                                              |
| 20 | `resizable: true` 启用 Aero Snap,拖拽窗口到屏幕边缘自动 snap 为半屏,导致 `.app(100%)` 撑大、`right:8px` 的 +号按钮漂移     | 解法:`mainWindow.on('resize')` 事件监听器兜底回退 —— 只要窗口尺寸偏离 `currentWindowW/H` 就立即 `setSize` 回去,用户感知不到                                                                                                                                              |
| 21 | 模型大小 slider 调节不生效                                                                  | 根因:直接 mutate `configStore.config.modelScale = val` 不保证触发 `watch(() => configStore.config?.modelScale)` —— Pinia setup store 中 `ref<Config \| null>(null)` 的属性突变在某些路径下不被 Vue 3 reactive 追踪。解法:改用 emit 直接父子通信,`Settings.vue → emit('model-scale-change') → App.vue onModelScaleChange → modelScale ref → prop` |
| 22 | `file://` 加载模型报 NetworkError                                                       | dev 模式渲染页是 `http://localhost:xxxx`,XHR 访问 `file://` 被 CORS 拦截(pixi-live2d-display 内部用 XHR 加载模型和子资源)。**解法**:注册自定义 protocol `meow-model://`,`corsEnabled: true` 让 Chromium 自动加 CORS 头                                                  |
| 23 | 自定义 protocol URL `meow-model:///models/...` 加载 404                                | scheme 注册为 `standard: true` 时,Chromium 规范化 URL 会把空 host 后的第一段路径当作 host。即 `meow-model:///models/Mao/...` 被规范化为 `meow-model://models/Mao/...`,pathname 丢失 `models` 段,handler 解析路径变成 `~/.meow-vpet/Mao/...`。**解法**:用固定 host `local`,URL 形如 `meow-model://local/models/Mao/...`;handler 兼容处理 host 被误解析的情况 |
| 24 | 快速切换模型时 stage 残留多个模型                                                            | `Live2DModel.from()` 是异步的,连续切换模型时多个 from() 并发返回,后返回的模型也 addChild 到 stage。**解法**:`loadModel` 用 `loadToken` 机制,每次开始加载递增 token,加载完成后校验 token,不匹配则销毁新加载的模型直接返回 |

---

## 7. 参考开源项目

| 项目                                                                                         | 技术栈                     | 参考价值                        |
|--------------------------------------------------------------------------------------------|-------------------------|-----------------------------|
| [NyaDeskPet](https://github.com/)                                                          | Live2D + AI Agent 跨平台   | 同形态参考,二次开发文档已有              |
| [electron-vue-live2d](https://github.com/q-mona/electron-vue-live2d)                       | Electron + Vue + Live2D | 经典项目,Electron + Live2D 集成范式 |
| [live2d-kanban-desktop (WaifuProject)](https://studio.zerolite.cn/2022/07/02/waifuprojv2/) | Electron + Live2D + AI  | 看板娘 + AI 对话                 |
| [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)                      | PixiJS + Cubism Core    | Web 平台 Live2D 渲染标准库(必用)     |
| [Live2D Cubism SDK for Web](https://www.live2d.com/en/sdk/about/)                          | 官方核心                    | 免费 for 小企业                  |
| [Desktop-Pet-Godot](https://github.com/jihe520/Desktop-Pet-Godot)                          | Godot + LLM             | LLM 接入 + 桌宠交互逻辑             |

---

## 8. 开发流程

- `npm run dev`:启动开发模式。electron-vite 并行构建 main/preload/renderer 三个入口,然后启动 Electron 主进程加载渲染进程。
  启动时主进程会调用 `ensureBuiltinModels()` 把 `src/renderer/public/models/` 下的内置模型复制到 `~/.meow-vpet/models/`(已存在的跳过)。
- `npm run build`:打包。`copy-resources` 脚本先把 `src/renderer/public/{models,lib}` 复制到 `resources/`,
  electron-vite 构建产物 + electron-builder 生成安装包,`extraResources` 配置把 `resources/models` 打入安装包的 `models/` 目录。
  用户首次启动安装版时,`ensureBuiltinModels()` 从 `process.resourcesPath/models` 复制到 `~/.meow-vpet/models/`。
- meow-tool 启动方式二选一:
    - 独立启动:`cd D:\code\NaCl\meow-tool && npm start`,meow-vpet 健康检查通过后直接复用
    - 自动 spawn:不手动启动,meow-vpet 主进程按 5.4 节策略自动拉起 meow-tool 子进程
- 开发时建议 meow-tool 独立启动,便于查看后端日志和热重载;打包发布时由 meow-vpet 自动 spawn。
- 模型导入:用户把新模型文件夹放进 `~/.meow-vpet/models/`,重开设置页即可在模型下拉中看到并切换。
