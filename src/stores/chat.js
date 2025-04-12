import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { chatApi } from '../services/api'
import { sendLobbyMessage, sendRoomMessage, getLobbyHistory, on, getSocket } from '../services/socket'

/**
 * 聊天状态管理
 * 处理聊天消息、聊天频道和语音聊天
 */
export const useChatStore = defineStore('chat', () => {
  // 状态
  const messages = ref([])
  const activeChannel = ref('public')  // 'public', 'team-1', 'team-2'
  const unreadCount = ref({
    public: 0,
    'team-1': 0,
    'team-2': 0
  })
  const isVoiceEnabled = ref(false)
  const isMuted = ref(false)
  const isLoading = ref(false)
  const error = ref(null)
  const currentRoomId = ref(null)

  // 计算属性
  const filteredMessages = computed(() => {
    return messages.value.filter(msg => msg.channel === activeChannel.value)
  })

  // 方法
  // 发送消息 - 大厅
  const sendLobbyMsg = async (content, type = 'text') => {
    isLoading.value = true
    error.value = null
    
    try {
      // 通过WebSocket发送消息
      sendLobbyMessage(content, type)
      
      // 也通过API发送以确保消息被保存
      await chatApi.sendLobbyMessage({ content, type })
      
      // 本地添加消息，给用户立即反馈
      const message = {
        id: Date.now().toString(),
        content,
        type,
        timestamp: Date.now(),
        isSending: false
      }
      
      messages.value.push(message)
      return message
    } catch (err) {
      error.value = err.message || '发送消息失败'
      return null
    } finally {
      isLoading.value = false
    }
  }

  // 发送消息 - 房间
  const sendRoomMsg = async (content, type = 'text') => {
    isLoading.value = true
    error.value = null
    
    try {
      // 获取当前房间ID
      const roomId = currentRoomId.value
      if (!roomId) {
        throw new Error('未加入房间，无法发送消息')
      }
      
      // 通过 WebSocket 发送消息
      console.log('通过 WebSocket 发送房间消息:', { roomId, content, type })
      sendRoomMessage(roomId, content, type)
      
      // 本地添加消息，给用户立即反馈
      const message = {
        id: Date.now().toString(),
        roomId,
        content,
        channel: activeChannel.value,
        type,
        time: new Date().toISOString(),
        isSending: false
      }
      
      messages.value.push(message)
      return message
    } catch (err) {
      error.value = err.message || '发送消息失败'
      return null
    } finally {
      isLoading.value = false
    }
  }

  // 接收消息
  const receiveMessage = (message) => {
    // 处理重复消息
    const isDuplicate = messages.value.some(m => m.id === message.id)
    if (isDuplicate) return
    
    messages.value.push(message)
    
    // 如果接收的消息不是当前活动频道，增加未读计数
    if (message.channel !== activeChannel.value) {
      unreadCount.value[message.channel]++
    }
    
    return message
  }

  // 切换频道
  const switchChannel = (channel) => {
    activeChannel.value = channel
    unreadCount.value[channel] = 0 // 切换后重置未读计数
  }

  // 切换语音状态
  const toggleVoice = () => {
    isVoiceEnabled.value = !isVoiceEnabled.value
    return isVoiceEnabled.value
  }

  // 切换静音状态
  const toggleMute = () => {
    isMuted.value = !isMuted.value
    return isMuted.value
  }

  // 加载大厅历史消息
  const loadLobbyHistory = async (before = null, limit = 50) => {
    isLoading.value = true
    error.value = null
    
    try {
      // 优先使用WebSocket获取历史
      const history = await getLobbyHistory(before, limit)
      
      // 如果WebSocket获取失败，使用API
      if (!history) {
        const response = await chatApi.getLobbyChat({ before, limit })
        
        if (response.status === 'success') {
          messages.value = response.data.messages
          return response.data.messages
        } else {
          throw new Error(response.message || '获取聊天历史失败')
        }
      }
      
      // 处理从WebSocket获取的历史
      messages.value = history.messages || []
      return messages.value
    } catch (err) {
      error.value = err.message || '加载历史消息失败'
      return []
    } finally {
      isLoading.value = false
    }
  }

  // 加载房间历史消息
  const loadRoomHistory = async (roomId, channel = 'public', before = null, limit = 50) => {
    isLoading.value = true
    error.value = null
    
    try {
      const params = { channel, before, limit }
      if (channel.startsWith('team-')) {
        params.teamId = parseInt(channel.replace('team-', ''))
      }
      
      const response = await chatApi.getRoomMessages(roomId, params)
      
      if (response.status === 'success') {
        messages.value = response.data.messages
        return response.data.messages
      } else {
        throw new Error(response.message || '获取聊天历史失败')
      }
    } catch (err) {
      error.value = err.message || '加载历史消息失败'
      return []
    } finally {
      isLoading.value = false
    }
  }

  // 清空消息
  const clearMessages = () => {
    messages.value = []
    unreadCount.value = {
      public: 0,
      'team-1': 0,
      'team-2': 0
    }
  }

  // 设置聊天监听器
  const setupChatListeners = () => {
    // 监听大厅新消息
    on('lobbyMessage', (data) => {
      console.log('[WebSocket] 收到大厅消息:', data)
      receiveMessage({
        id: data.id,
        userId: data.userId,
        username: data.username,
        avatar: data.avatar,
        content: data.content,
        type: data.type,
        channel: 'public',
        timestamp: data.timestamp
      })
    })
    
    // 监听房间新消息
    on('roomMessage', (data) => {
      console.log('[WebSocket] 收到房间消息:', data)
      receiveMessage({
        id: data.id,
        roomId: data.roomId,
        userId: data.userId,
        username: data.username,
        avatar: data.avatar,
        content: data.content,
        type: data.type,
        channel: data.teamId ? `team-${data.teamId}` : 'public',
        time: data.time
      })
    })
    
    // 监听房间加入事件
    on('roomJoined', (data) => {
      currentRoomId.value = data.roomId
    })
    
    // 监听房间离开事件
    on('roomLeft', () => {
      console.log('[WebSocket] 离开房间')
      currentRoomId.value = null
    })
    
    // 监听语音状态更新
    on('voiceStateUpdate', (data) => {
      console.log('[WebSocket] 语音状态更新:', data)
      // 这里可以添加语音状态更新的处理逻辑
    })
    
    // 监听静音状态更新
    on('voiceMuteUpdate', (data) => {
      console.log('[WebSocket] 静音状态更新:', data)
      // 这里可以添加静音状态更新的处理逻辑
    })
  }

  return {
    // 状态
    messages,
    activeChannel,
    unreadCount,
    isVoiceEnabled,
    isMuted,
    isLoading,
    error,
    currentRoomId,
    
    // 计算属性
    filteredMessages,
    
    // 方法
    sendLobbyMsg,
    sendRoomMsg,
    receiveMessage,
    switchChannel,
    toggleVoice,
    toggleMute,
    loadLobbyHistory,
    loadRoomHistory,
    clearMessages,
    setupChatListeners
  }
}) 