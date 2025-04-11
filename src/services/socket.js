import io from 'socket.io-client'

// WebSocket实例
let socket = null

// WebSocket服务器地址
const SOCKET_URL = 'http://localhost:3000'

/**
 * 连接WebSocket
 * @param {string} token - 用户认证token
 * @param {string} avatar - 用户头像URL
 * @returns {Promise} 连接结果Promise
 */
export const connectSocket = (token, avatar = '') => {
  return new Promise((resolve, reject) => {
    try {
      // 验证token是否有效
      if (!token) {
        console.error('WebSocket连接错误: 未提供token')
        reject(new Error('未提供有效token，无法建立WebSocket连接'))
        return
      }

      // 如果已连接，则断开重连
      if (socket && socket.connected) {
        socket.disconnect()
      }

      // 连接WebSocket服务器
      console.log('正在连接WebSocket服务器...')

      // 简化连接参数，避免URL过长
      const options = {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
        transports: ['websocket', 'polling'],  // 允许降级到轮询
        extraHeaders: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }

      // 如果有头像且不是base64格式，才添加到query参数
      if (avatar && !avatar.startsWith('data:')) {
        options.query = { avatar }
      }

      socket = io(SOCKET_URL, options)

      // 连接成功
      socket.on('connect', () => {
        console.log('WebSocket连接成功，SocketID:', socket.id)
        resolve(socket)
      })

      // 连接错误
      socket.on('connect_error', (error) => {
        console.error('WebSocket连接错误:', error)
        // 确保在连接错误时清理socket实例
        if (socket) {
          socket.disconnect()
          socket = null
        }
        reject(new Error('WebSocket连接错误: ' + (error.message || '')))

        // 如果错误与认证相关，在控制台打印明确信息
        if (error.message && error.message.includes('认证失败')) {
          console.error('WebSocket认证错误: 请检查token是否有效')
        }
      })

      // 连接超时
      socket.on('connect_timeout', () => {
        console.error('WebSocket连接超时')
        reject(new Error('WebSocket连接超时'))
      })
    } catch (error) {
      console.error('连接WebSocket时发生错误:', error)
      reject(error)
    }
  })
}

/**
 * 断开WebSocket连接
 */
export const disconnectSocket = () => {
  if (socket) {
    console.log('正在断开WebSocket连接...')
    socket.disconnect()
    socket = null
  }
}

/**
 * 获取当前WebSocket实例
 * @returns {Object|null} Socket.io实例
 */
export const getSocket = () => socket

// 大厅相关方法
export const lobbyApi = {
  // 加入大厅
  joinLobby: () => {
    if (!socket?.connected) {
      console.error('WebSocket未连接，无法加入大厅')
      return
    }
    console.log('加入大厅')
    socket.emit('joinLobby')
  },

  // 离开大厅
  leaveLobby: () => {
    if (!socket?.connected) {
      console.error('WebSocket未连接，无法离开大厅')
      return
    }
    console.log('离开大厅')
    socket.emit('leaveLobby')
  },

  // 发送大厅消息
  sendLobbyMessage: (content, type = 'text') => {
    if (!socket?.connected) {
      console.error('WebSocket未连接，无法发送大厅消息')
      return
    }
    console.log('发送大厅消息:', { content, type })
    socket.emit('lobbyMessage', { content, type })
  },

  // 获取聊天历史
  getLobbyHistory: (before, limit) => {
    if (!socket?.connected) {
      console.error('WebSocket未连接，无法获取聊天历史')
      return
    }
    console.log('获取大厅聊天历史:', { before, limit })
    socket.emit('getLobbyHistory', { before, limit })
  }
}

// 房间相关方法
export const roomApi = {
  // 加入房间
  joinRoom: (roomId) => {
    if (!socket?.connected) {
      console.error('WebSocket未连接，无法加入房间')
      return
    }
    console.log('通过WebSocket加入房间:', roomId)
    socket.emit('joinRoom', { roomId })
  },

  // 离开房间
  leaveRoom: (roomId) => {
    if (!socket?.connected) {
      console.error('WebSocket未连接，无法离开房间')
      return
    }
    console.log('通过WebSocket离开房间:', roomId)
    socket.emit('leaveRoom', { roomId })
  },

  // 发送房间消息
  sendRoomMessage: (roomId, content, type = 'text') => {
    if (!socket?.connected) {
      console.error('WebSocket未连接，无法发送房间消息')
      return
    }
    console.log('发送房间消息:', { roomId, content, type })
    socket.emit('roomMessage', { roomId, content, type })
  }
}

// 语音相关方法
export const voiceApi = {
  // 开始语音通话
  startVoice: (roomId) => {
    if (!socket?.connected) {
      console.error('WebSocket未连接，无法开始语音通话')
      return
    }
    console.log('开始语音通话:', roomId)
    socket.emit('voiceStart', { roomId })
  },

  // 结束语音通话
  endVoice: (roomId) => {
    if (!socket?.connected) {
      console.error('WebSocket未连接，无法结束语音通话')
      return
    }
    console.log('结束语音通话:', roomId)
    socket.emit('voiceEnd', { roomId })
  },

  // 静音控制
  setMute: (roomId, isMuted) => {
    if (!socket?.connected) {
      console.error('WebSocket未连接，无法更新静音状态')
      return
    }
    console.log('更新静音状态:', { roomId, isMuted })
    socket.emit('voiceMute', { roomId, isMuted })
  }
}

export default {
  connectSocket,
  disconnectSocket,
  getSocket,
  lobbyApi,
  roomApi,
  voiceApi,
  sendRoomMessage: roomApi.sendRoomMessage
}