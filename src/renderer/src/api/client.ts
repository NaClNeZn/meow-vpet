// meow-tool API 客户端封装

let baseUrl = 'http://localhost:4399'

// 设置后端服务地址
export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/$/, '')
}

// 获取当前后端服务地址
export function getBaseUrl(): string {
  return baseUrl
}

// 聊天消息类型
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// 流式聊天参数
export interface StreamChatParams {
  messages: ChatMessage[]
  sessionId?: string
  agentId?: string
  model?: string
  signal?: AbortSignal
  onDelta: (text: string) => void
  onDone: () => void
  onError: (err: Error) => void
}

// 创建会话
export async function createSession(title?: string): Promise<{ id: string }> {
  console.log('[meow-vpet] POST /v1/sessions')
  const response = await fetch(`${baseUrl}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(title ? { title } : {})
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`创建会话失败: ${response.status} ${response.statusText} ${text}`)
  }
  const data = await response.json()
  console.log('[meow-vpet] session created:', data.id)
  return { id: data.id }
}

// 流式聊天(OpenAI 兼容协议)
export async function streamChat(params: StreamChatParams): Promise<void> {
  const {
    messages,
    sessionId,
    agentId,
    model = 'normal',
    signal,
    onDelta,
    onDone,
    onError
  } = params

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true
  }
  if (sessionId) body.session_id = sessionId
  // agent_id 存在时 meow-tool 会自动启用编排,无需单独传 meow_tools
  if (agentId) body.agent_id = agentId

  try {
    console.log('[meow-vpet] POST /v1/chat/completions', { ...body, messages: `[${(body.messages as any[]).length} msgs]` })
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`聊天请求失败: ${response.status} ${text}`)
    }

    console.log('[meow-vpet] response ok, starting stream read')

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法获取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let chunkIndex = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log('[meow-vpet] stream done, total chunks:', chunkIndex)
        break
      }

      const chunk = decoder.decode(value, { stream: true })
      chunkIndex++
      if (chunkIndex <= 3) {
        console.log(`[meow-vpet] chunk #${chunkIndex}:`, JSON.stringify(chunk))
      }

      buffer += chunk
      const lines = buffer.split('\n')
      // 保留最后一行(可能不完整)
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        // SSE 数据行以 "data: " 开头,其他行(如 event:/id:/空行)跳过
        if (!trimmed.startsWith('data:')) continue

        // 兼容 "data:" 和 "data: " 两种前缀
        const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5)
        if (data === '[DONE]') {
          console.log('[meow-vpet] received [DONE]')
          onDone()
          return
        }

        try {
          const parsed = JSON.parse(data)
          // OpenAI 标准:choices[0].delta.content
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            onDelta(delta)
          }
        } catch {
          // 忽略无法解析的行(可能是 keepalive 注释或非 JSON 数据)
          console.warn('[meow-vpet] unparseable SSE line:', trimmed)
        }
      }
    }

    console.log('[meow-vpet] stream loop ended, calling onDone')
    onDone()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      onDone()
      return
    }
    onError(err as Error)
  }
}

// 列出 agent 配置(供设置面板使用)
export async function listAgents(): Promise<Array<{ id: string; name: string; enabled: boolean }>> {
  const response = await fetch(`${baseUrl}/v1/config/agents`)
  if (!response.ok) return []
  const data = await response.json()
  if (Array.isArray(data)) return data
  return Object.values(data)
}

// 列出 skill 配置(供设置面板使用)
export async function listSkills(): Promise<Array<{ id: string; name: string; enabled: boolean }>> {
  const response = await fetch(`${baseUrl}/v1/config/skills`)
  if (!response.ok) return []
  const data = await response.json()
  if (Array.isArray(data)) return data
  return Object.values(data)
}
