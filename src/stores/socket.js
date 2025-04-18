import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getSocket as getSocketService, connectSocket, disconnectSocket, lobbyApi, roomApi, voiceApi } from '../services/socket'
import { useUserStore } from './user'
import { useRoomStore } from './room'

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

  // 事件监听器状态
  const eventListenersActive = ref(false)

  // 事件缓存，用于存储事件数据，以便在监听器添加后可以获取之前的事件
  const eventCache = ref({})

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

      // 确保room.js中的事件监听器也被设置
      const roomStore = useRoomStore()
      if (roomStore && typeof roomStore.setupRoomEventListeners === 'function') {
        console.log('在WebSocket连接成功后设置房间事件监听器')
        roomStore.setupRoomEventListeners()
      } else {
        console.log('无法获取roomStore或setupRoomEventListeners函数不存在')
      }

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

    // 清除room.js中的事件监听器
    const roomStore = useRoomStore()
    if (roomStore && typeof roomStore.cleanupRoomEventListeners === 'function') {
      console.log('在断开WebSocket连接时清除房间事件监听器')
      roomStore.cleanupRoomEventListeners()
    }

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
  const joinRoom = (roomId, password = null) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法加入房间'
      return false
    }

    try {
      // 准备加入房间的数据
      const joinData = { roomId }

      // 如果提供了密码，添加到请求数据中
      if (password) {
        joinData.password = password
      }

      // 添加强制加入标志，即使玩家已经在房间中，也触发roomJoined事件
      // 这样可以确保玩家重新连接后能获取最新的聊天记录和房间数据
      joinData.forceJoin = true

      // 直接使用socket发送事件，而不是通过API
      const socket = getSocket()
      if (socket) {
        console.log('发送joinRoom事件，确保事件监听器已经添加')
        // 添加回调函数，处理房间已满的情况
        socket.emit('joinRoom', joinData, (response) => {
          console.log('joinRoom响应:', response)

          // 如果加入房间失败，并且原因是房间已满，则自动尝试加入观战席
          if (response.status === 'error' &&
              (response.message.includes('已满') || response.message.includes('full'))) {
            joinAsSpectator(roomId)
          }
      })

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
  const kickPlayer = (roomId, userId, targetUserId) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法踢出玩家'
      return false
    }

    try {
      console.log(`发送kickPlayer事件，用户 ${userId} 踢出房间 ${roomId} 的玩家 ${targetUserId}`)
      const socket = getSocket()
      if (socket) {
        socket.emit('kickPlayer', { roomId, userId, targetUserId })
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
  const leaveRoom = (roomId, callback) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法离开房间'
      if (callback) callback({ status: 'error', message: error.value })
      return false
    }

    // 如果没有提供roomId，使用当前房间ID
    const targetRoomId = roomId || currentRoomId.value
    if (!targetRoomId) {
      if (callback) callback({ status: 'error', message: '房间ID不存在' })
      return false
    }

    try {
      console.log(`发送leaveRoom事件，离开房间 ${targetRoomId}`)
      // 直接使用socket发送事件，而不是通过API
      const socket = getSocket()
      if (socket) {
        socket.emit('leaveRoom', { roomId: targetRoomId }, (response) => {
          console.log('leaveRoom响应:', response)
          if (response.status === 'success') {
            currentRoomId.value = null
          }
          if (callback) callback(response)
        })
        return true
      } else {
        if (callback) callback({ status: 'error', message: 'Socket未连接' })
        return false
      }
    } catch (error) {
      console.error('离开房间失败:', error)
      if (callback) callback({ status: 'error', message: error.message || '离开房间失败' })
      return false
    }
  }

  // 发送房间消息
  const sendRoomMessage = (roomId, content, type = 'text', channel = 'public', teamId = null, callback) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法发送消息'
      if (callback) callback({ status: 'error', message: error.value })
      return false
    }

    try {
      roomApi.sendRoomMessage(roomId, content, type, channel, teamId, (response) => {
        console.log('发送消息响应:', response)
        if (callback) callback(response)
      })
      return true
    } catch (err) {
      error.value = err.message || '发送消息失败'
      if (callback) callback({ status: 'error', message: error.value })
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

      // 清除room.js中的事件监听器
      const roomStore = useRoomStore()
      if (roomStore && typeof roomStore.cleanupRoomEventListeners === 'function') {
        console.log('[WebSocket] 在连接断开时清除房间事件监听器')
        roomStore.cleanupRoomEventListeners()
      }

      // 设置事件监听器状态为非激活
      setEventListenersActive(false)
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
      console.log('[WebSocket] 收到roomJoined事件:', response)
      if (response.status === 'success') {
        const roomData = response.data.room
        currentRoomId.value = roomData.id
        // 将事件分发给其他组件
        try {
          // 使用新的事件监听器状态管理机制
          console.log('[WebSocket] 事件监听器状态:', eventListenersActive.value ? '激活' : '非激活')

          // 确保事件监听器处于激活状态
          if (!eventListenersActive.value) {
            console.log('[WebSocket] 事件监听器未激活，正在激活...')
            setEventListenersActive(true)
          }

          // 确保room.js中的事件监听器也被设置
          const roomStore = useRoomStore()
          if (roomStore && typeof roomStore.setupRoomEventListeners === 'function') {
            console.log('[WebSocket] 在roomJoined事件中确保房间事件监听器已设置')
            roomStore.setupRoomEventListeners()
          }

          // 将事件缓存到全局状态
          eventCache.value.roomJoined = response

          // 分发事件
          console.log('[WebSocket] 分发roomJoined事件')
          window.dispatchEvent(new CustomEvent('roomJoined', { detail: response }))
          console.log('[WebSocket] roomJoined事件分发成功')
        } catch (error) {
          console.error('[WebSocket] 分发roomJoined事件失败:', error)
        }
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
    on('voiceChannelJoined', (response) => {
      console.log('[WebSocket] 加入语音房间成功:', response)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('voiceChannelJoined', { detail: response }))
    })

    on('voiceChannelLeft', (response) => {
      console.log('[WebSocket] 离开语音房间成功:', response)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('voiceChannelLeft', { detail: response }))
    })

    on('voiceChannelUsers', (data) => {
      console.log('[WebSocket] 语音房间用户列表:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('voiceChannelUsers', { detail: data }))
    })

    on('userJoinedVoiceChannel', (data) => {
      console.log('[WebSocket] 用户加入语音房间:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('userJoinedVoiceChannel', { detail: data }))
    })

    on('userLeftVoiceChannel', (data) => {
      console.log('[WebSocket] 用户离开语音房间:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('userLeftVoiceChannel', { detail: data }))
    })

    on('voiceMuteUpdate', (data) => {
      console.log('[WebSocket] 语音静音状态更新:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('voiceMuteUpdate', { detail: data }))
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
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('roomMessage', { detail: data }))
    })

    // 注意: 已删除重复的new_message事件监听器

    // 系统事件
    on('reconnect', (attemptNumber) => {
      console.log('[WebSocket] 重新连接成功，尝试次数:', attemptNumber)

      // 如果之前在房间中，重新加入房间
      if (currentRoomId.value) {
        console.log(`[WebSocket] 重连后自动重新加入房间: ${currentRoomId.value}`)
        // 使用当前房间ID重新加入
        joinRoom(currentRoomId.value)

        // 分发重连事件，通知其他组件
        window.dispatchEvent(new CustomEvent('socketReconnected', {
          detail: { roomId: currentRoomId.value }
        }))
      }
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

    // 房间列表更新事件
    on('roomListUpdated', (data) => {
      console.log('[WebSocket] 房间列表更新:', data)
      // 将事件分发给其他组件
      window.dispatchEvent(new CustomEvent('roomListUpdated', { detail: data }))
    })
  }

  // 注册事件监听
  const on = (event, callback) => {
    const socket = getSocketService()
    if (!socket) return

    // 保存监听器引用，以便后续移除
    listeners.value[event] = callback
    socket.on(event, callback)
  }

  // 移除事件监听
  const off = (event) => {
    const socket = getSocketService()
    if (!socket) return

    if (listeners.value[event]) {
      socket.off(event, listeners.value[event])
      delete listeners.value[event]
    }
  }

  // 清理所有监听器
  const cleanupListeners = () => {
    const socket = getSocketService()
    if (!socket) return

    Object.keys(listeners.value).forEach(event => {
      socket.off(event, listeners.value[event])
    })

    listeners.value = {}
  }

  // 获取事件监听器状态
  const areEventListenersActive = () => {
    return eventListenersActive.value
  }

  // 设置事件监听器状态
  const setEventListenersActive = (active) => {
    console.log(`设置事件监听器状态为: ${active ? '激活' : '非激活'}`)
    eventListenersActive.value = active
  }

  // 获取缓存的事件数据
  const getCachedEvent = (eventName) => {
    return eventCache.value[eventName]
  }

  // 清除缓存的事件数据
  const clearCachedEvent = (eventName) => {
    if (eventCache.value[eventName]) {
      delete eventCache.value[eventName]
      return true
    }
    return false
  }

  // 获取Socket实例
  const getSocket = () => {
    return getSocketService()
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

    //打印堆栈
    console.log('调用堆栈:', new Error().stack);

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

  // 队长选择玩家
  const captainSelectPlayer = (roomId, teamId, playerId, callback) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法选择玩家'
      return false
    }

    try {
      console.log(`发送captain.selectPlayer事件，队长选择玩家，房间ID: ${roomId}, 队伍ID: ${teamId}, 玩家ID: ${playerId}`)
      const socket = getSocket()
      if (socket) {
        socket.emit('captain.selectPlayer', { roomId, teamId, playerId }, callback)
        return true
      } else {
        throw new Error('WebSocket实例不存在')
      }
    } catch (err) {
      error.value = err.message || '选择玩家失败'
      return false
    }
  }

  // 队长选择红蓝方
  const captainSelectSide = (roomId, teamId, side, callback) => {
    if (!connected.value) {
      error.value = 'WebSocket未连接，无法选择红蓝方'
      return false
    }

    try {
      console.log(`发送captain.selectSide事件，队长选择红蓝方，房间ID: ${roomId}, 队伍ID: ${teamId}, 阵营: ${side}`)
      const socket = getSocket()
      if (socket) {
        socket.emit('captain.selectSide', { roomId, teamId, side }, callback)
        return true
      } else {
        throw new Error('WebSocket实例不存在')
      }
    } catch (err) {
      error.value = err.message || '选择红蓝方失败'
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
    getRoomDetail,
    captainSelectPlayer,
    captainSelectSide,
    on,
    off,
    cleanupListeners,
    areEventListenersActive,
    setEventListenersActive,
    getCachedEvent,
    clearCachedEvent,
    getSocket
  }
})