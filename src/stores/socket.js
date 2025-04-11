import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getSocket, connectSocket, disconnectSocket, lobbyApi, roomApi, voiceApi } from '../services/socket'
import { useUserStore } from './user'

/**
 * WebSocket连接状态管理
 */
export const useSocketStore = defineStore('socket', () => {
  // 状态
  const connected = ref(false)
  const connecting = ref(false)
  const error = ref(null)
  const connectionAttempts = ref(0)
  const maxConnectionAttempts = 3
  const listeners = ref({})
  const currentRoomId = ref(null)
  const isInLobby = ref(false)
  const voiceEnabled = ref(false)
  const isMuted = ref(false)

  // 获取用户store
  const userStore = useUserStore()

  // 计算属性
  const isConnected = computed(() => connected.value)
  const isInRoom = computed(() => Boolean(currentRoomId.value))

  // 方法
  // 初始化WebSocket连接
  const connect = async () => {
    if (connected.value || connecting.value) return true

    connecting.value = true
    error.value = null
    connectionAttempts.value = 0

    try {
      // 获取token并验证有效性
      const token = userStore.token
      if (!token) {
        throw new Error('未登录，无法建立WebSocket连接')
      }

      // 验证是否能获取用户信息，确保token有效
      const userData = userStore.userInfo
      if (!userData || !userData.id) {
        throw new Error('无法获取用户信息，token可能已过期')
      }

      // 等待连接完成
      await connectSocket(token, userData.avatar)

      // 验证连接状态
      const socket = getSocket()
      if (!socket || !socket.connected) {
        throw new Error('WebSocket连接失败')
      }

      connected.value = true
      setupEventListeners()
      return true
    } catch (err) {
      console.error('WebSocket连接失败:', err.message)
      error.value = err.message || 'WebSocket连接失败'
      connected.value = false

      // 如果未超过最大重试次数，自动重试
      if (connectionAttempts.value < maxConnectionAttempts) {
        connectionAttempts.value++
        console.log(`WebSocket连接失败，正在进行第 ${connectionAttempts.value} 次重试...`)
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 2000))
        return await connect()
      }

      // 清理任何可能的连接
      try {
        disconnectSocket()
      } catch (cleanupErr) {
        console.warn('清理WebSocket连接时出错:', cleanupErr)
      }

      return false
    } finally {
      connecting.value = false
    }
  }

  // 断开WebSocket连接
  const disconnect = () => {
    if (!connected.value) return

    // 移除所有监听器
    cleanupListeners()

    // 断开连接
    disconnectSocket()
    connected.value = false
    currentRoomId.value = null
    isInLobby.value = false
    voiceEnabled.value = false
    isMuted.value = false
  }

  // 重新连接
  const reconnect = async () => {
    disconnect()
    return await connect()
  }

  // 加入大厅
  const joinLobby = () => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法加入大厅'
      return false
    }

    try {
      lobbyApi.joinLobby()
      isInLobby.value = true
      return true
    } catch (err) {
      error.value = err.message || '加入大厅失败'
      return false
    }
  }

  // 离开大厅
  const leaveLobby = () => {
    if (!connected.value || !isInLobby.value) return true

    try {
      lobbyApi.leaveLobby()
      isInLobby.value = false
      return true
    } catch (err) {
      error.value = err.message || '离开大厅失败'
      return false
    }
  }

  // 加入房间
  const joinRoom = (roomId, userData = {}) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法加入房间'
      return false
    }

    try {
      console.log(`发送joinRoom事件，加入房间 ${roomId}`, userData)
      // 直接使用socket发送事件，而不是通过API
      const socket = getSocket()
      if (socket) {
        socket.emit('joinRoom', { roomId, ...userData })
        // 不立即设置currentRoomId，等待roomJoined事件
        return true
      } else {
        throw new Error('WebSocket实例不存在')
      }
    } catch (err) {
      error.value = err.message || '加入房间失败'
      return false
    }
  }

  // 加入观众席
  const joinAsSpectator = (roomId) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法加入观众席'
      return false
    }

    try {
      console.log(`发送joinAsSpectator事件，加入房间 ${roomId} 的观众席`)
      const socket = getSocket()
      if (socket) {
        socket.emit('joinAsSpectator', { roomId })
        return true
      } else {
        throw new Error('WebSocket实例不存在')
      }
    } catch (err) {
      error.value = err.message || '加入观众席失败'
      return false
    }
  }

  // 加入玩家列表
  const joinAsPlayer = (roomId, teamId = null) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法加入玩家列表'
      return false
    }

    try {
      console.log(`发送joinAsPlayer事件，加入房间 ${roomId} 的玩家列表`, teamId ? `队伍: ${teamId}` : '自动分配队伍')
      const socket = getSocket()
      if (socket) {
        socket.emit('joinAsPlayer', { roomId, teamId })
        return true
      } else {
        throw new Error('WebSocket实例不存在')
      }
    } catch (err) {
      error.value = err.message || '加入玩家列表失败'
      return false
    }
  }

  // 踢出玩家
  const kickPlayer = (roomId, userId) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法踢出玩家'
      return false
    }

    try {
      console.log(`发送kickPlayer事件，踢出房间 ${roomId} 的玩家 ${userId}`)
      const socket = getSocket()
      if (socket) {
        socket.emit('kickPlayer', { roomId, userId })
        return true
      } else {
        throw new Error('WebSocket实例不存在')
      }
    } catch (err) {
      error.value = err.message || '踢出玩家失败'
      return false
    }
  }

  // 离开房间
  const leaveRoom = () => {
    if (!connected.value || !currentRoomId.value) return true

    try {
      console.log(`发送leaveRoom事件，离开房间 ${currentRoomId.value}`)
      // 直接使用socket发送事件，而不是通过API
      const socket = getSocket()
      if (socket) {
        socket.emit('leaveRoom', { roomId: currentRoomId.value })
        // 不立即设置currentRoomId为null，等待roomLeft事件
        return true
      } else {
        throw new Error('WebSocket实例不存在')
      }
    } catch (err) {
      error.value = err.message || '离开房间失败'
      return false
    }
  }

  // 发送房间消息
  const sendRoomMessage = (content, type = 'text') => {
    if (!connected.value || !currentRoomId.value) {
      error.value = '未连接或未加入房间，无法发送消息'
      return false
    }

    try {
      roomApi.sendRoomMessage(currentRoomId.value, content, type)
      return true
    } catch (err) {
      error.value = err.message || '发送消息失败'
      return false
    }
  }

  // 开始语音通话
  const startVoice = () => {
    if (!connected.value || !currentRoomId.value) {
      error.value = '未连接或未加入房间，无法开始语音通话'
      return false
    }

    try {
      voiceApi.startVoice(currentRoomId.value)
      voiceEnabled.value = true
      return true
    } catch (err) {
      error.value = err.message || '开始语音通话失败'
      return false
    }
  }

  // 结束语音通话
  const endVoice = () => {
    if (!connected.value || !currentRoomId.value) {
      error.value = '未连接或未加入房间，无法结束语音通话'
      return false
    }

    try {
      voiceApi.endVoice(currentRoomId.value)
      voiceEnabled.value = false
      isMuted.value = false
      return true
    } catch (err) {
      error.value = err.message || '结束语音通话失败'
      return false
    }
  }

  // 设置静音状态
  const setMute = (muted) => {
    if (!connected.value || !currentRoomId.value || !voiceEnabled.value) {
      error.value = '未连接、未加入房间或未开启语音，无法设置静音'
      return false
    }

    try {
      voiceApi.setMute(currentRoomId.value, muted)
      isMuted.value = muted
      return true
    } catch (err) {
      error.value = err.message || '设置静音状态失败'
      return false
    }
  }

  // 设置事件监听器
  const setupEventListeners = () => {
    const socket = getSocket()
    if (!socket) return

    // 添加通用事件监听器，用于记录所有接收到的WebSocket事件
    socket.onAny((eventName, ...args) => {
      console.log(`[WebSocket事件] ${eventName}:`, args)
    })

    // 基础连接事件
    on('connect', () => {
      console.log('[WebSocket] 连接成功')
      connected.value = true
      error.value = null
    })

    on('disconnect', () => {
      console.log('[WebSocket] 连接断开')
      connected.value = false
      currentRoomId.value = null
      isInLobby.value = false
      voiceEnabled.value = false
      isMuted.value = false
    })

    on('error', (err) => {
      console.error('[WebSocket] 错误:', err)
      error.value = err.message || 'WebSocket错误'
    })

    // 大厅事件
    on('lobbyJoined', () => {
      console.log('[WebSocket] 加入大厅成功')
      isInLobby.value = true
    })

    on('lobbyLeft', () => {
      console.log('[WebSocket] 离开大厅')
      isInLobby.value = false
    })

    // 房间基础事件
    on('roomJoined', (response) => {
      console.log('[WebSocket] 加入房间成功:', response)
      if (response.status === 'success') {
        const roomData = response.data.room
        currentRoomId.value = roomData.id
        // 将事件分发给其他组件
        window.dispatchEvent(new CustomEvent('roomJoined', { detail: response }))
      } else {
        console.error('[WebSocket] 加入房间失败:', response.message)
        window.dispatchEvent(new CustomEvent('roomError', { detail: response }))
      }
    })

    on('roomLeft', (response) => {
      console.log('[WebSocket] 离开房间:', response)
      if (response.status === 'success') {
        currentRoomId.value = null
        voiceEnabled.value = false
        isMuted.value = false
        // 将事件分发给其他组件
        window.dispatchEvent(new CustomEvent('roomLeft', { detail: response }))
      }
    })

    // 角色变更事件
    on('roleChanged', (response) => {
      console.log('[WebSocket] 角色变更:', response)
      if (response.status === 'success') {
        // 将事件分发给其他组件
        window.dispatchEvent(new CustomEvent('roleChanged', { detail: response }))
      }
    })

    // 房间状态更新事件
    on('roomStatusUpdate', (data) => {
      console.log('[WebSocket] 房间状态更新:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('roomStatusUpdate', { detail: data }))
    })

    // 房间详情事件
    on('roomDetail', (response) => {
      console.log('[WebSocket] 收到房间详情:', response)
      if (response.status === 'success') {
        // 将事件分发给其他组件
        window.dispatchEvent(new CustomEvent('roomDetail', { detail: response }))
      } else {
        console.error('[WebSocket] 获取房间详情失败:', response.message)
        window.dispatchEvent(new CustomEvent('roomError', { detail: response }))
      }
    })

    // 用户加入/离开事件
    on('spectator.joined', (data) => {
      console.log('[WebSocket] 新观众加入:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('spectatorJoined', { detail: data }))
    })

    on('player.joined', (data) => {
      console.log('[WebSocket] 新玩家加入:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('playerJoined', { detail: data }))
    })

    on('spectator.left', (data) => {
      console.log('[WebSocket] 观众离开:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('spectatorLeft', { detail: data }))
    })

    on('player.left', (data) => {
      console.log('[WebSocket] 玩家离开:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('playerLeft', { detail: data }))
    })

    // 角色变更事件
    on('spectator.moveToPlayer', (data) => {
      console.log('[WebSocket] 观众加入玩家列表:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('spectatorMoveToPlayer', { detail: data }))
    })

    on('player.moveToSpectator', (data) => {
      console.log('[WebSocket] 玩家加入观众席:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('playerMoveToSpectator', { detail: data }))
    })

    // 游戏相关事件
    on('game.started', (data) => {
      console.log('[WebSocket] 游戏开始:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('gameStarted', { detail: data }))
    })

    on('playerStatusUpdate', (data) => {
      console.log('[WebSocket] 玩家状态更新:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('playerStatusUpdate', { detail: data }))
    })

    on('teamUpdate', (data) => {
      console.log('[WebSocket] 队伍状态更新:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('teamUpdate', { detail: data }))
    })

    // 聊天相关事件
    on('new_message', (message) => {
      console.log('[WebSocket] 收到新消息:', message)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('newMessage', { detail: message }))
    })

    // 语音相关事件
    on('voiceStateUpdate', (data) => {
      console.log('[WebSocket] 语音状态更新:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('voiceStateUpdate', { detail: data }))
    })

    on('voiceData', (data) => {
      // 不输出日志，避免刷屏
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('voiceData', { detail: data }))
    })

    // 错误事件
    on('error', (error) => {
      console.error('[WebSocket] 错误:', error)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('socketError', { detail: error }))
    })

    // 语音事件
    on('voiceStarted', () => {
      console.log('[WebSocket] 语音通话开始')
      voiceEnabled.value = true
    })

    on('voiceEnded', () => {
      console.log('[WebSocket] 语音通话结束')
      voiceEnabled.value = false
      isMuted.value = false
    })

    on('voiceMuted', (data) => {
      console.log('[WebSocket] 语音静音状态更新:', data)
      if (data.userId === userStore.userId) {
        isMuted.value = data.isMuted
      }
    })

    // 聊天事件
    on('lobbyMessage', (data) => {
      console.log('[WebSocket] 收到大厅消息:', data)
    })

    on('roomMessage', (data) => {
      console.log('[WebSocket] 收到房间消息:', data)
    })

    // 系统事件
    on('reconnect', (attemptNumber) => {
      console.log('[WebSocket] 重新连接成功，尝试次数:', attemptNumber)
    })

    on('reconnect_attempt', (attemptNumber) => {
      console.log('[WebSocket] 尝试重新连接，次数:', attemptNumber)
    })

    on('reconnect_error', (error) => {
      console.error('[WebSocket] 重新连接失败:', error)
    })

    on('reconnect_failed', () => {
      console.error('[WebSocket] 重新连接失败，已达到最大重试次数')
    })
  }

  // 注册事件监听
  const on = (event, callback) => {
    const socket = getSocket()
    if (!socket) return

    // 保存监听器引用，以便后续移除
    listeners.value[event] = callback
    socket.on(event, callback)
  }

  // 移除事件监听
  const off = (event) => {
    const socket = getSocket()
    if (!socket) return

    if (listeners.value[event]) {
      socket.off(event, listeners.value[event])
      delete listeners.value[event]
    }
  }

  // 清理所有监听器
  const cleanupListeners = () => {
    const socket = getSocket()
    if (!socket) return

    Object.keys(listeners.value).forEach(event => {
      socket.off(event, listeners.value[event])
    })

    listeners.value = {}
  }

  // 加入语音频道
  const joinVoiceChannel = (roomId, teamId = 0) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法加入语音频道'
      return false
    }

    try {
      console.log(`发送joinVoiceChannel事件，加入房间 ${roomId} 的语音频道`, teamId ? `队伍: ${teamId}` : '公共频道')
      const socket = getSocket()
      if (socket) {
        socket.emit('joinVoiceChannel', { roomId, teamId })
        return true
      } else {
        throw new Error('WebSocket实例不存在')
      }
    } catch (err) {
      error.value = err.message || '加入语音频道失败'
      return false
    }
  }

  // 获取房间详情
  const getRoomDetail = (roomId, callback) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法获取房间详情'
      if (callback) {
        callback({ status: 'error', message: error.value })
      }
      return false
    }

    try {
      console.log(`发送getRoomDetail事件，获取房间 ${roomId} 的详情`)
      const socket = getSocket()
      if (socket) {
        // 使用回调函数处理响应
        socket.emit('getRoomDetail', { roomId }, (response) => {
          console.log(`收到getRoomDetail响应:`, response)
          if (callback) {
            callback(response)
          }
        })
        return true
      } else {
        throw new Error('WebSocket实例不存在')
      }
    } catch (err) {
      error.value = err.message || '获取房间详情失败'
      if (callback) {
        callback({ status: 'error', message: error.value })
      }
      return false
    }
  }

  return {
    // 状态
    connected,
    connecting,
    error,
    connectionAttempts,
    maxConnectionAttempts,
    currentRoomId,
    isInLobby,
    voiceEnabled,
    isMuted,

    // 计算属性
    isConnected,
    isInRoom,

    // 方法
    connect,
    disconnect,
    reconnect,
    joinLobby,
    leaveLobby,
    joinRoom,
    leaveRoom,
    sendRoomMessage,
    startVoice,
    endVoice,
    setMute,
    joinAsSpectator,
    joinAsPlayer,
    kickPlayer,
    joinVoiceChannel,
    getRoomDetail
  }
})