<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as PIXI from 'pixi.js'
// 使用 index 入口同时支持 Cubism 2 和 Cubism 4 模型
// 需要在 index.html 中同时加载 live2d.min.js (Cubism 2) 和 live2dcubismcore.min.js (Cubism 4)
import { Live2DModel } from 'pixi-live2d-display'

// pixi-live2d-display 内部通过 window.PIXI 访问 Ticker 等模块,必须暴露到 window
// 官方 README 明确要求:expose PIXI to window so that this plugin is able to reference window.PIXI.Ticker
;(window as any).PIXI = PIXI

// 注册 PIXI Ticker,Live2D 模型需要它来驱动动画更新
// 使用 as any 规避 pixi-live2d-display 与 pixi.js 之间的 Ticker 类型声明不一致
Live2DModel.registerTicker(PIXI.Ticker as any)

const { Point } = PIXI

const props = defineProps<{
  // 模型路径:相对 ~/.meow-vpet/ 的路径,例如 "models/Mao/Mao.model3.json"
  // 通过 IPC models:resolve-url 解析为 file:// URL 后加载
  modelPath?: string
  // 模型尺寸缩放系数(基于 fitScale 的乘数,1.0 = 自适应铺满窗口 80%)
  // watch 此值变化即时重应用 scale,实现设置页实时调节
  modelScale?: number
}>()

const emit = defineEmits<{
  'model-loaded': [model: Live2DModel]
  'model-hit': [x: number, y: number]
  'pointer-move': [isHit: boolean]
  'drag-ended': []
}>()

// 长按进度条响应式状态(0~1,1 表示达到拖拽阈值)
// isPressing 控制圆环显隐:mousedown 命中模型到 startDrag 触发期间显示,
// mouseup 提前释放或 startDrag 触发后隐藏
const pressProgress = ref(0)
const isPressing = ref(false)

const containerRef = ref<HTMLDivElement>()
let app: PIXI.Application | null = null
let model: Live2DModel | null = null
let resizeObserver: ResizeObserver | null = null

// 拖拽状态:长按模型 3 秒后进入拖拽模式
// 纯时间判断,不判断移动像素 —— 3 秒内 mouseup 视为普通点击,3 秒后才进入拖拽
let isDragging = false
let pressTimer: number | null = null
let pressRafId = 0 // rAF 动画句柄,驱动长按进度条 0→1
let pressStartTime = 0 // 长按起始时间戳,用于计算进度
const LONG_PRESS_MS = 3000 // 长按阈值:3 秒,避免误触发

const MIN_SCALE = 0.05
const MAX_SCALE = 2.0
// 模型在窗口中占据的比例(宽度和高度都按 80% 计算)
const FIT_RATIO = 0.8

// 模型自适应缩放基准值:让模型在窗口内占据 FIT_RATIO 比例
// 实际 scale = fitScale * props.modelScale
// 由 applyModelScale() 在模型加载完成、窗口尺寸变化、props.modelScale 变化时调用
let fitScale = 1.0

// 根据模型原始尺寸和当前 PIXI 画布尺寸重算 fitScale
// 取宽高方向较小值,确保模型完整显示在窗口内
function recomputeFitScale() {
  if (!model || !app) return
  const modelWidth = (model as any).internalModel?.width || model.width
  const modelHeight = (model as any).internalModel?.height || model.height
  if (!modelWidth || !modelHeight) return
  const scaleX = (app.screen.width * FIT_RATIO) / modelWidth
  const scaleY = (app.screen.height * FIT_RATIO) / modelHeight
  fitScale = Math.min(scaleX, scaleY)
}

// 应用当前 modelScale:fitScale × props.modelScale,clamp 到 [MIN_SCALE, MAX_SCALE]
// 同步更新 model.scale 并保持模型居中(anchor 0.5,0.5 已设置,position 在屏幕中心)
function applyModelScale() {
  if (!model || !app) return
  const userScale = props.modelScale ?? 1.0
  const finalScale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, fitScale * userScale)
  )
  model.scale.set(finalScale)
  // 锚点 0.5 + 居中 position 已设,缩放围绕中心点,无需重新定位
}

// 监听 props.modelScale 变化:设置页 slider 实时调节时立即重应用 scale
watch(
  () => props.modelScale,
  () => {
    applyModelScale()
  }
)

// 销毁当前已加载的模型(切换模型前调用)
// 保留 PIXI app、resizeObserver、事件监听器,只重置 model
function destroyCurrentModel() {
  if (model) {
    try {
      model.destroy()
    } catch (err) {
      console.warn('[Live2DCanvas] 销毁旧模型失败:', err)
    }
    model = null
  }
}

// 模型加载任务 token:每次开始加载递增,加载完成后校验 token
// 若 token 不匹配说明期间又触发了新的加载,本次结果作废,直接销毁
// 防止快速切换模型时多个 Live2DModel.from() 并发返回导致 stage 上残留多个模型
let loadToken = 0

// 加载 Live2D 模型
// 1. 通过 IPC 将相对路径解析为 file:// URL
// 2. Live2DModel.from() 加载模型
// 3. 居中 + 自适应缩放 + 启用点击交互
// 切换模型时先 destroyCurrentModel() 再调用此函数
async function loadModel(relPath: string): Promise<void> {
  if (!app) return
  // 本次加载的 token,加载完成后校验
  const myToken = ++loadToken
  // 通过主进程解析路径为 file:// URL
  // 兼容旧配置(/models/... 开头)和相对路径
  let modelUrl = relPath
  if (window.app?.resolveModelUrl) {
    try {
      modelUrl = await window.app.resolveModelUrl(relPath)
    } catch (err) {
      console.warn('[Live2DCanvas] 解析模型路径失败,使用原值:', err)
    }
  }
  if (!modelUrl) {
    console.error('[Live2DCanvas] 模型路径为空,无法加载')
    return
  }

  try {
    const newModel = await Live2DModel.from(modelUrl)
    // 加载期间又触发了新的加载任务,本次结果作废
    if (myToken !== loadToken || !app) {
      try {
        newModel?.destroy()
      } catch {
        /* ignore */
      }
      return
    }
    model = newModel
    // Live2DModel 类型与 pixi.js DisplayObject 存在轻微不兼容,使用 as any 规避
    app.stage.addChild(model as any)

    // 居中 + 自适应缩放:让模型占据窗口的 FIT_RATIO 比例
    // 实际 scale = fitScale × props.modelScale(用户调节系数)
    model.anchor.set(0.5, 0.5)
    model.x = app.screen.width / 2
    model.y = app.screen.height / 2
    recomputeFitScale()
    applyModelScale()

    // 点击交互:启用 autoInteract,让 pointertap 事件正常触发 hit 回调
    // 但不使用其默认的随机动作播放 —— 改为按 HitArea 选 motion group 播放
    ;(model as any).autoInteract = true
    model.on('hit', (hitAreas: string[]) => {
      if (hitAreas.length > 0) {
        emit('model-hit', 0, 0)
        // 按 HitArea 名字匹配 motion group 并播放
        // 约定:HitArea 名(Head/Body)对应 motion group 名(常见命名 flickHead/tapBody)
        // 先尝试大小写不敏感匹配 group 名,匹配不到则退回按部位名直查 group
        playMotionByHitArea(hitAreas[0])
      }
    })

    // 按命中部位触发对应动作
    // pixi-live2d-display 不强制 HitArea 名与 motion group 名一致,
    // 业界惯例:Head 部位对应 flickHead 组,Body 部位对应 tapBody 组
    // 这里用大小写不敏感包含匹配,兼容 Mao(Head/Body)、shizuku 无 HitArea 等情况
    function playMotionByHitArea(hitAreaName: string): void {
      if (!model) return
      const definitions = (model as any).internalModel?.motionManager?.definitions
      if (!definitions || typeof definitions !== 'object') return
      const groups = Object.keys(definitions).filter(g => Array.isArray(definitions[g]) && definitions[g].length > 0)
      if (groups.length === 0) return
      const target = hitAreaName.toLowerCase()
      // 1. 优先匹配包含部位名的 group(flickHead 含 head → Head 命中 flickHead)
      const matched = groups.find(g => g.toLowerCase().includes(target))
      // 2. 兜底:命中部位本身就是一个 motion group 名(部分模型 HitArea 和 group 同名)
      const group = matched || groups.find(g => g.toLowerCase() === target)
      if (group) {
        const idx = Math.floor(Math.random() * definitions[group].length)
        try {
          ;(model as any).motion(group, idx)
        } catch (err) {
          console.warn('[Live2DCanvas] 触发动作失败:', err)
        }
      } else {
        // 3. 都匹配不到:从 Idle 组兜底,避免点击无反应
        const fallback = groups.find(g => g.toLowerCase().includes('idle')) || groups[0]
        const idx = Math.floor(Math.random() * definitions[fallback].length)
        try {
          ;(model as any).motion(fallback, idx)
        } catch {
          /* ignore */
        }
      }
    }

    emit('model-loaded', model)
  } catch (err) {
    console.error('[Live2DCanvas] Live2D 模型加载失败:', err, 'url=', modelUrl)
  }
}

// 监听 props.modelPath 变化:切换模型时销毁旧模型后加载新模型
// 设置页选择不同模型 → configStore.save → App.vue watch → 传新 prop → 此处触发
watch(
  () => props.modelPath,
  async (newPath, oldPath) => {
    if (!newPath || newPath === oldPath) return
    if (!app) return
    destroyCurrentModel()
    await loadModel(newPath)
  }
)

// 判断屏幕坐标是否命中模型(用于拖拽前确认按在模型上)
function isPointOnModel(clientX: number, clientY: number): boolean {
  if (!model) return false
  try {
    const point = new Point(
      clientX - (app?.stage.position.x || 0),
      clientY - (app?.stage.position.y || 0)
    )
    return model.containsPoint(point)
  } catch {
    return false
  }
}

// 开始拖拽:通知主进程开始轮询 cursor 移动窗口
// 用绝对定位法(起点 + 总位移),全程不调用 getPosition,避免方向反转
function startDrag() {
  console.log('[startDrag] called, setting isDragging=true')
  isDragging = true
  // 计时器已触发,置 null 让 endDrag 能正确识别"真正拖拽过"(情况 2),
  // 否则 mouseup 时 endDrag 会因 pressTimer !== null 误判为"还在等待长按"(情况 1),
  // 直接 return 不触发 stopWindowDrag 和 drag-ended
  pressTimer = null
  // 拖拽时关闭眼球跟随,避免模型头部转动干扰
  if (model) model.focus(0, 0)
  // 通知主进程开始拖拽轮询
  window.app?.startWindowDrag()
  // 通知 App 当前正在拖拽(暂停点击穿透切换)
  emit('pointer-move', true)
  // 隐藏长按进度圆环(已进入拖拽状态,无需再提示)
  isPressing.value = false
  pressProgress.value = 0
  console.log('[startDrag] done, isDragging=', isDragging)
}

// 结束拖拽:通知主进程停止轮询
// 区分两种情况:
// 1. 还在长按等待阶段(pressTimer 未触发,3 秒内 mouseup):普通点击,只清除计时器,
//    不触发拖拽结束逻辑,不 emit drag-ended —— 否则会强制 setIgnoreMouseEvents(false)
//    干扰后续 click 事件(表现为 +号点不开)
// 2. 真正拖拽过(isDragging=true):停止拖拽,emit drag-ended 同步穿透状态
function endDrag(event?: Event) {
  console.log('[endDrag]', { isDragging, hasTimer: pressTimer !== null, type: event?.type })
  // 情况 1:还在等待长按,普通点击 —— 只清除计时器和动画
  if (pressTimer !== null) {
    clearTimeout(pressTimer)
    pressTimer = null
    cancelAnimationFrame(pressRafId)
    pressRafId = 0
    isPressing.value = false
    pressProgress.value = 0
    return
  }
  // 情况 2:真正拖拽过
  if (isDragging) {
    window.app?.stopWindowDrag()
    isDragging = false
    // 通知 App 拖拽结束,强制重置穿透状态:
    // 透明窗口下 setIgnoreMouseEvents 状态变化后,Chromium 需要一次同步才能正确
    // 接收后续 click,否则第一次点击会被吞掉。
    emit('drag-ended')
  }
}

// 鼠标移动:判断是否命中模型/按钮(用于点击穿透)
// 注意:不用 model.containsPoint —— 边缘像素抖动会导致 isHit 反复 true/false,
// 进而触发穿透状态疯狂切换(每秒几十次 setIgnoreMouseEvents),每次切换都吞 click。
// 改用稳定的窗口边界判断:鼠标在窗口内就不穿透,在窗口外才穿透。
function handleMouseMove(event: MouseEvent) {
  if (!model) return
  if (isDragging) return
  // 检测是否在右上角按钮区域(保持按钮可点击,不被穿透)
  const btnSize = 32
  const btnMargin = 8
  const onButton =
    event.clientX >= window.innerWidth - btnSize - btnMargin &&
    event.clientX <= window.innerWidth &&
    event.clientY >= 0 &&
    event.clientY <= btnSize + btnMargin
  // 鼠标在窗口内就保持不穿透(onButton 或任意位置都算命中)
  // 这样不会出现穿透状态疯狂切换,click 不被吞
  emit('pointer-move', true)
}

// 全局鼠标跟踪回调:主进程推送窗口内 CSS 像素坐标(可能为负或超出窗口范围)
// 用于让桌宠在鼠标移出 app 窗口外时也能跟随鼠标方向看
function handleGlobalMouse(pos: { x: number; y: number }) {
  if (!model) return
  // 拖拽中不更新,避免干扰拖拽体验
  if (isDragging) return
  // 眼球跟随
  model.focus(pos.x, pos.y)
}

// 滚轮缩放:直接改 modelScale prop(通过 emit 或 store 更新)
// 当前实现为本地直接修改 scale,不影响 props.modelScale。
// 设计选择:滚轮作为"临时浏览"操作,不持久化;设置页 slider 才是持久化途径
function handleWheel(event: WheelEvent) {
  if (!model) return
  event.preventDefault()
  const delta = event.deltaY > 0 ? -0.02 : 0.02
  const currentScale = model.scale.x
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, currentScale + delta))
  model.scale.set(newScale)
}

onMounted(async () => {
  if (!containerRef.value) return

  const { clientWidth, clientHeight } = containerRef.value

  // 初始化 PIXI Application(v7 构造函数直接初始化,不需要 init())
  app = new PIXI.Application({
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    width: clientWidth,
    height: clientHeight
  })
  // v7 中画布通过 app.view 获取(ICanvas 类型,需要转换为 HTMLCanvasElement 挂载到 DOM)
  containerRef.value.appendChild(app.view as unknown as HTMLCanvasElement)

  // 监听容器大小变化,调整画布尺寸 + 重算 fitScale 并应用
  // 窗口尺寸变化(主进程 setSize → CSS 100% 跟随)时触发,模型需重新自适应
  const resize = () => {
    if (!app || !containerRef.value) return
    const { width, height } = containerRef.value.getBoundingClientRect()
    app.renderer.resize(width, height)
    // 窗口尺寸变了,fitScale 需要重算并应用
    if (model) {
      recomputeFitScale()
      applyModelScale()
      // 保持模型居中
      model.x = app.screen.width / 2
      model.y = app.screen.height / 2
    }
  }
  resize()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(containerRef.value)

  // 加载 Live2D 模型(从 props.modelPath 读取,通过 IPC 解析为 file:// URL)
  if (props.modelPath) {
    await loadModel(props.modelPath)
  }

  // 注册全局事件
  window.addEventListener('mousemove', handleMouseMove)
  containerRef.value.addEventListener('wheel', handleWheel, { passive: false })

  // 启动全局鼠标跟踪:让桌宠在鼠标移出 app 窗口外时也能跟随方向看
  // 主进程会以 30fps 轮询 cursor 并通过 IPC 推送 CSS 像素坐标
  if (window.app) {
    window.app.onGlobalMousePosition(handleGlobalMouse)
    window.app.startMouseTracking()
  }

  // 长按模型拖拽窗口:
  // mousedown 命中模型 → 启动 3 秒计时器 + rAF 进度动画 → 到时通知主进程开始拖拽
  // mouseup → 清理计时器/动画/停止拖拽(若未到 3 秒则取消,视为普通点击)
  // 实际鼠标移动由主进程 setInterval 轮询 screen.getCursorScreenPoint 完成,
  // 渲染层不再处理 mousemove 拖拽逻辑(避免 screenX/Y 不可靠)
  window.addEventListener('mousedown', (event: MouseEvent) => {
    if (!model) return
    if (!isPointOnModel(event.clientX, event.clientY)) return
    // 显示长按进度圆环
    isPressing.value = true
    pressProgress.value = 0
    pressStartTime = performance.now()
    // rAF 动画:每帧根据已过时间更新进度,到 1 时由 setTimeout 兜底触发 startDrag
    const tick = () => {
      const elapsed = performance.now() - pressStartTime
      const progress = Math.min(1, elapsed / LONG_PRESS_MS)
      pressProgress.value = progress
      if (progress < 1) {
        pressRafId = requestAnimationFrame(tick)
      }
    }
    pressRafId = requestAnimationFrame(tick)
    // 兜底计时器:3 秒到时触发 startDrag(rAF 优先用于平滑动画)
    pressTimer = window.setTimeout(() => {
      startDrag()
    }, LONG_PRESS_MS)
  })
  // 用 capture: true 在 document 上监听 mouseup,确保即使鼠标移出窗口或
  // 在透明区域释放也能收到事件(透明窗口下 window.mouseup 可能丢失)
  document.addEventListener('mouseup', endDrag, { capture: true })
  // 注意:不监听 window.blur 来停止拖拽。满屏移动时窗口可能因 setPosition 抖动
  // 短暂失焦,blur 触发 endDrag 会提前结束拖拽并 emit drag-ended,导致保护期
  // 状态混乱(后续真正 mouseup 时 isDragging 已是 false,不再 emit drag-ended,
  // 保护期失效,+号 click 被穿透切换吞掉)。只用 mouseup 更可靠。
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', endDrag, { capture: true } as EventListenerOptions)
  if (pressTimer !== null) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
  if (pressRafId) {
    cancelAnimationFrame(pressRafId)
    pressRafId = 0
  }
  if (containerRef.value) {
    containerRef.value.removeEventListener('wheel', handleWheel)
  }
  // 停止全局鼠标跟踪,释放主进程轮询定时器
  if (window.app) {
    window.app.stopMouseTracking()
  }
  resizeObserver?.disconnect()
  destroyCurrentModel()
  app?.destroy(true)
  app = null
})
</script>

<template>
  <div ref="containerRef" class="live2d-canvas">
    <!-- 长按进度圆环:固定 px 尺寸,定位在窗口几何中心(与模型中心重合)
         用 SVG stroke-dashoffset 绘制进度,3 秒填充一圈 -->
    <svg
      v-if="isPressing"
      class="press-ring"
      width="80"
      height="80"
      viewBox="0 0 80 80"
    >
      <!-- 背景圆环(淡色) -->
      <circle
        class="press-ring-bg"
        cx="40"
        cy="40"
        r="34"
        fill="none"
        stroke-width="4"
      />
      <!-- 进度圆环:周长 = 2πr ≈ 213.6,dashoffset 从 213.6→0 表示进度 0→1 -->
      <circle
        class="press-ring-fg"
        cx="40"
        cy="40"
        r="34"
        fill="none"
        stroke-width="4"
        stroke-linecap="round"
        :stroke-dasharray="213.6"
        :stroke-dashoffset="213.6 * (1 - pressProgress)"
        transform="rotate(-90 40 40)"
      />
    </svg>
  </div>
</template>

<style scoped>
.live2d-canvas {
  width: 100%;
  height: 100%;
  position: relative;
}
.live2d-canvas :deep(canvas) {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
}
/* 长按进度圆环:定位在容器中心(模型中心),pointer-events:none 不干扰鼠标事件 */
.press-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 50;
  /* 半透明阴影增强在 Live2D 模型上的可见性 */
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.4));
}
.press-ring-bg {
  stroke: rgba(255, 255, 255, 0.3);
}
.press-ring-fg {
  stroke: rgba(120, 180, 255, 0.95);
  /* stroke-dashoffset 变化加 transition 让动画更平滑(rAF 已驱动,这里补间) */
  transition: stroke-dashoffset 0.05s linear;
}
</style>
