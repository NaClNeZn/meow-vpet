<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { createSession, streamChat, type ChatMessage } from '../api/client'

const props = defineProps<{
  backendReady: boolean
  agentId?: string
  systemPrompt?: string
}>()

interface UIMessage {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const messages = ref<UIMessage[]>([])
const input = ref('')
const isStreaming = ref(false)
const sessionId = ref<string | null>(null)
const error = ref<string | null>(null)
const messagesContainer = ref<HTMLDivElement>()

// 自动滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(messages, scrollToBottom, { deep: true })

// 发送消息
async function send() {
  const text = input.value.trim()
  if (!text || !props.backendReady || isStreaming.value) return

  error.value = null
  input.value = ''

  // 加入用户消息
  messages.value.push({ role: 'user', content: text })
  scrollToBottom()

  // 首次对话创建 session
  if (!sessionId.value) {
    try {
      const result = await createSession()
      sessionId.value = result.id
    } catch (err) {
      error.value = `创建会话失败: ${(err as Error).message}`
      return
    }
  }

  // 加入空的 assistant 消息(流式填充)
  // 注意:必须通过 messages.value[idx] 访问代理对象来修改,
  // 直接修改 push 进去的原始对象不会触发 Vue 响应式更新
  messages.value.push({ role: 'assistant', content: '', streaming: true })
  const assistantIdx = messages.value.length - 1
  isStreaming.value = true
  scrollToBottom()

  // 构造发送给后端的 messages(只发 user/assistant,不含 streaming 标记)
  // 若配置了 systemPrompt,在数组开头 prepend 一条 system 消息
  const chatMessages: ChatMessage[] = []
  const sysPrompt = props.systemPrompt?.trim()
  if (sysPrompt) {
    chatMessages.push({ role: 'system', content: sysPrompt })
  }
  for (const m of messages.value) {
    if (m.content.length > 0) {
      chatMessages.push({ role: m.role, content: m.content })
    }
  }

  await streamChat({
    messages: chatMessages,
    sessionId: sessionId.value || undefined,
    agentId: props.agentId,
    onDelta: (delta) => {
      // 通过代理对象修改,确保触发响应式更新
      messages.value[assistantIdx].content += delta
    },
    onDone: () => {
      messages.value[assistantIdx].streaming = false
      isStreaming.value = false
    },
    onError: (err) => {
      messages.value[assistantIdx].streaming = false
      isStreaming.value = false
      error.value = err.message
      // 如果 assistant 消息为空,移除
      if (!messages.value[assistantIdx].content) {
        messages.value.splice(assistantIdx, 1)
      }
    }
  })
}

// 重试最后一条用户消息
function retry() {
  // 找到最后一条 user 消息
  const lastUserIdx = messages.value.map((m) => m.role).lastIndexOf('user')
  if (lastUserIdx < 0) return
  const lastUserMsg = messages.value[lastUserIdx]
  // 移除该消息及之后的所有消息
  messages.value.splice(lastUserIdx)
  input.value = lastUserMsg.content
  send()
}

// 输入框按键处理
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    send()
  }
}
</script>

<template>
  <div class="chat-panel">
    <div ref="messagesContainer" class="messages">
      <div v-if="messages.length === 0" class="empty">
        {{ backendReady ? '输入消息开始对话' : '正在连接后端...' }}
      </div>
      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        class="message"
        :class="msg.role"
      >
        <div class="bubble">
          {{ msg.content }}
          <span v-if="msg.streaming" class="cursor">|</span>
        </div>
      </div>
    </div>
    <div v-if="error" class="error">
      {{ error }}
      <button class="retry-btn" @click="retry">重试</button>
    </div>
    <div class="input-area">
      <textarea
        v-model="input"
        :placeholder="backendReady ? '输入消息... (Enter 发送, Shift+Enter 换行)' : '等待后端就绪...'"
        :disabled="!backendReady || isStreaming"
        @keydown="onKeydown"
        rows="2"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  width: 280px;
  height: 400px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  overflow: hidden;
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.empty {
  color: #999;
  text-align: center;
  margin-top: 20px;
  font-size: 13px;
}
.message {
  display: flex;
}
.message.user {
  justify-content: flex-end;
}
.message.assistant {
  justify-content: flex-start;
}
.bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}
.message.user .bubble {
  background: #007aff;
  color: white;
  border-bottom-right-radius: 4px;
}
.message.assistant .bubble {
  background: #e9e9eb;
  color: #333;
  border-bottom-left-radius: 4px;
}
.cursor {
  display: inline-block;
  animation: blink 1s infinite;
  margin-left: 2px;
}
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.error {
  padding: 8px 12px;
  background: #fff3f3;
  color: #d33;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.retry-btn {
  background: #d33;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}
.retry-btn:hover {
  background: #b22;
}
.input-area {
  padding: 8px;
  border-top: 1px solid #eee;
}
textarea {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 8px;
  font-family: inherit;
  font-size: 14px;
  resize: none;
  outline: none;
  box-sizing: border-box;
}
textarea:focus {
  border-color: #007aff;
}
textarea:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}
</style>
