import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { roomApi } from '../services/api'
import { useUserStore } from './user'
import { useSocketStore } from './socket'

/**
 * 房间管理Store
 * 处理房间列表和房间详情的状态管理
 */
export const useRoomStore = defineStore('room', () => {
  // 状态
  const rooms = ref([])
  const currentRoom = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const pagination = ref({
    total: 0,
    current: 1,
    pageSize: 12
  })

  // 用户store
  const userStore = useUserStore()

  // 计算属性
  const isInRoom = computed(() => Boolean(currentRoom.value))
  const isRoomOwner = computed(() => {
    if (!currentRoom.value || !userStore.userId) return false
    return currentRoom.value.creatorId === userStore.userId
  })

  // 检查用户是否在房间中（作为玩家或观众）
  const isUserInRoom = (room) => {
    if (!room || !userStore.userId) return false

    console.log('检查用户是否在房间中:', room)

    // 处理嵌套的房间数据结构
    const roomData = room.room ? room.room : room

    // 检查玩家列表
    let isPlayer = false
    if (roomData.players && Array.isArray(roomData.players)) {
      isPlayer = roomData.players.some(player => player.userId === userStore.userId)
    }

    // 检查观众列表
    let isSpectator = false
    if (roomData.spectators && Array.isArray(roomData.spectators)) {
      isSpectator = roomData.spectators.some(spectator => spectator.userId === userStore.userId)
    }

    console.log('用户是否在房间中:', isPlayer || isSpectator, '玩家:', isPlayer, '观众:', isSpectator)

    return isPlayer || isSpectator
  }

  // 添加一个方法来设置当前房间
  const setCurrentRoom = (roomData) => {
    if (!roomData) {
      console.log('清除当前房间数据')
      currentRoom.value = null
      return
    }

    console.log('设置当前房间数据:', roomData)

    // 如果是响应对象，提取实际的房间数据
    if (roomData.status === 'success' && roomData.data) {
      currentRoom.value = roomData.data
    }
    // 如果是直接的房间数据
    else {
      currentRoom.value = roomData
    }

    // 确保关键属性总是有值，防止前端报错
    if (currentRoom.value) {
      currentRoom.value.players = currentRoom.value.players || []
      currentRoom.value.teams = currentRoom.value.teams || []
      currentRoom.value.spectators = currentRoom.value.spectators || []
      currentRoom.value.messages = currentRoom.value.messages || []
    }

    console.log('当前房间数据已更新:', currentRoom.value)
  }

  // 监听房间相关事件
  // 监听加入房间成功事件
  window.addEventListener('roomJoined', (event) => {
    console.log('收到roomJoined事件:', event.detail)
    if (event.detail && event.detail.status === 'success') {
      const roomData = event.detail.data.room
      setCurrentRoom(roomData)
    }
  })

  // 监听房间详情事件
  window.addEventListener('roomDetail', (event) => {
    console.log('收到roomDetail事件:', event.detail)
    if (event.detail && event.detail.status === 'success') {
      const roomData = event.detail.data
      setCurrentRoom(roomData)
      loading.value = false
      error.value = null
    }
  })

  // 监听角色变更事件
  window.addEventListener('roleChanged', (event) => {
    console.log('收到roleChanged事件:', event.detail)
    if (event.detail && event.detail.status === 'success') {
      // 只提取需要的room属性
      const { room } = event.detail.data
      setCurrentRoom(room)
    }
  })

  // 监听房间状态更新事件
  window.addEventListener('roomStatusUpdate', (event) => {
    console.log('收到roomStatusUpdate事件:', event.detail)
    if (event.detail && event.detail.roomId && currentRoom.value) {
      if (event.detail.roomId === currentRoom.value.id) {
        // 更新房间状态
        currentRoom.value.status = event.detail.status
        // 重新获取房间详情
        fetchRoomDetail(event.detail.roomId)
      }
    }
  })

  // 监听新观众加入事件
  window.addEventListener('spectatorJoined', (event) => {
    console.log('收到spectatorJoined事件:', event.detail)
    if (event.detail && currentRoom.value) {
      // 确保观众列表存在
      if (!currentRoom.value.spectators) {
        currentRoom.value.spectators = []
      }
      // 添加新观众
      currentRoom.value.spectators.push(event.detail)
    }
  })

  // 监听新玩家加入事件
  window.addEventListener('playerJoined', (event) => {
    console.log('收到playerJoined事件:', event.detail)
    if (event.detail && currentRoom.value) {
      // 确保玩家列表存在
      if (!currentRoom.value.players) {
        currentRoom.value.players = []
      }
      // 添加新玩家
      currentRoom.value.players.push(event.detail)
    }
  })

  // 监听观众离开事件
  window.addEventListener('spectatorLeft', (event) => {
    console.log('收到spectatorLeft事件:', event.detail)
    if (event.detail && event.detail.userId && currentRoom.value && currentRoom.value.spectators) {
      // 从观众列表中移除该用户
      currentRoom.value.spectators = currentRoom.value.spectators.filter(
        spectator => spectator.userId !== event.detail.userId
      )
    }
  })

  // 监听玩家离开事件
  window.addEventListener('playerLeft', (event) => {
    console.log('收到playerLeft事件:', event.detail)
    if (event.detail && event.detail.userId && currentRoom.value && currentRoom.value.players) {
      // 从玩家列表中移除该用户
      currentRoom.value.players = currentRoom.value.players.filter(
        player => player.userId !== event.detail.userId
      )
    }
  })

  // 监听观众加入玩家列表事件
  window.addEventListener('spectatorMoveToPlayer', (event) => {
    console.log('收到spectatorMoveToPlayer事件:', event.detail)
    if (event.detail && event.detail.userId && currentRoom.value) {
      // 从观众列表中移除该用户
      if (currentRoom.value.spectators) {
        currentRoom.value.spectators = currentRoom.value.spectators.filter(
          spectator => spectator.userId !== event.detail.userId
        )
      }
      // 添加到玩家列表
      if (!currentRoom.value.players) {
        currentRoom.value.players = []
      }
      currentRoom.value.players.push(event.detail)
    }
  })

  // 监听玩家加入观众席事件
  window.addEventListener('playerMoveToSpectator', (event) => {
    console.log('收到playerMoveToSpectator事件:', event.detail)
    if (event.detail && event.detail.userId && currentRoom.value) {
      // 从玩家列表中移除该用户
      if (currentRoom.value.players) {
        currentRoom.value.players = currentRoom.value.players.filter(
          player => player.userId !== event.detail.userId
        )
      }
      // 添加到观众列表
      if (!currentRoom.value.spectators) {
        currentRoom.value.spectators = []
      }
      currentRoom.value.spectators.push(event.detail)
    }
  })

  // 监听游戏开始事件
  window.addEventListener('gameStarted', (event) => {
    console.log('收到gameStarted事件:', event.detail)
    if (event.detail && currentRoom.value) {
      // 更新房间状态
      currentRoom.value.status = 'gaming'
      // 更新队伍和玩家信息
      if (event.detail.teams) {
        currentRoom.value.teams = event.detail.teams
      }
      if (event.detail.players) {
        currentRoom.value.players = event.detail.players
      }
      if (event.detail.nextTeamPick) {
        currentRoom.value.nextTeamPick = event.detail.nextTeamPick
      }
    }
  })

  // 监听玩家状态更新事件
  window.addEventListener('playerStatusUpdate', (event) => {
    console.log('收到playerStatusUpdate事件:', event.detail)
    if (event.detail && event.detail.userId && currentRoom.value && currentRoom.value.players) {
      // 更新玩家状态
      const player = currentRoom.value.players.find(p => p.userId === event.detail.userId)
      if (player) {
        player.status = event.detail.status
        if (event.detail.teamId) {
          player.teamId = event.detail.teamId
        }
      }
    }
  })

  // 监听队伍状态更新事件
  window.addEventListener('teamUpdate', (event) => {
    console.log('收到teamUpdate事件:', event.detail)
    if (event.detail && event.detail.teamId && currentRoom.value && currentRoom.value.teams) {
      // 更新队伍状态
      const team = currentRoom.value.teams.find(t => t.id === event.detail.teamId)
      if (team) {
        if (event.detail.captainId) {
          team.captainId = event.detail.captainId
        }
        if (event.detail.players) {
          team.players = event.detail.players
        }
        if (event.detail.side) {
          team.side = event.detail.side
        }
      }
    }
  })

  // 监听新消息事件 - 只更新房间数据中的消息列表，不处理显示
  // 消息的显示由RoomDetail.vue中的handleNewMessage处理
  window.addEventListener('newMessage', (event) => {
    console.log('收到newMessage事件（在room.js中）:', event.detail)
    if (event.detail && currentRoom.value) {
      // 确保消息列表存在
      if (!currentRoom.value.messages) {
        currentRoom.value.messages = []
      }

      // 检查消息是否已存在，避免重复添加
      const messageExists = currentRoom.value.messages.some(msg => msg.id === event.detail.id)
      if (!messageExists) {
        // 添加新消息
        currentRoom.value.messages.push(event.detail)
      }
    }
  })

  // 方法
  // 获取房间列表
  const fetchRooms = async (params = {}) => {
    loading.value = true
    error.value = null

    try {
      const response = await roomApi.getRoomList(params)

      if (response.status === 'success') {
        // 修正：API返回的是 {data: {rooms: []}} 结构
        const roomsData = response.data?.rooms || response.data || []
        rooms.value = roomsData

        // 更新分页信息
        if (response.meta) {
          pagination.value.total = response.meta.total || roomsData.length
          pagination.value.current = response.meta.page || 1
          pagination.value.pageSize = response.meta.limit || 20
        } else {
          pagination.value.total = roomsData.length
        }

        console.log('获取房间列表成功，数量:', roomsData.length, roomsData)
        return roomsData
      } else {
        throw new Error(response.message || '获取房间列表失败')
      }
    } catch (err) {
      console.error('获取房间列表失败:', err)
      error.value = err.message || '获取房间列表失败，请稍后重试'
      return []
    } finally {
      loading.value = false
    }
  }

  // 获取我的房间列表
  const fetchMyRooms = async (params = {}) => {
    loading.value = true
    error.value = null

    try {
      // 使用当前登录用户的token
      const response = await roomApi.getUserRooms(params)

      if (response.status === 'success') {
        // 修正：获取正确的房间数据结构
        const userRooms = response.data?.rooms || response.data || []

        console.log('获取我的房间成功，数量:', userRooms.length, userRooms)

        // 获取我加入的房间（不是我创建的）
        try {
          // 获取所有房间列表
          const allRoomsResponse = await roomApi.getRoomList({})
          if (allRoomsResponse.status === 'success') {
            const allRooms = allRoomsResponse.data?.rooms || allRoomsResponse.data || []

            // 找出我加入的房间（我在玩家列表中但不是创建者）
            const joinedRooms = allRooms.filter(room => {
              // 检查用户是否在玩家列表中
              const isInPlayers = room.players && Array.isArray(room.players) &&
                                 room.players.some(player => player.userId === userStore.userId)
              // 不是创建者但是在玩家列表中
              return room.creatorId !== userStore.userId && isInPlayers
            })

            console.log('我加入的房间数量:', joinedRooms.length)

            // 合并我创建的和我加入的房间
            const combinedRooms = [...userRooms, ...joinedRooms]

            // 去除重复的房间
            const uniqueRooms = Array.from(new Map(combinedRooms.map(room => [room.id, room])).values())
            console.log('我的所有房间数量（去重后）:', uniqueRooms.length)

            return uniqueRooms
          }
        } catch (joinedRoomsError) {
          console.error('获取我加入的房间失败:', joinedRoomsError)
          // 如果获取加入的房间失败，仍然返回我创建的房间
        }

        return userRooms
      } else {
        throw new Error(response.message || '获取我的房间失败')
      }
    } catch (err) {
      console.error('获取我的房间失败:', err)
      error.value = err.message || '获取我的房间失败，请稍后重试'
      return []
    } finally {
      loading.value = false
    }
  }

  // 创建房间
  const createRoom = async (roomData) => {
    if (!userStore.isLoggedIn) {
      error.value = '请先登录'
      return null
    }

    loading.value = true
    error.value = null

    try {
      console.log('准备创建房间，数据:', roomData)

      // 确保必要字段存在
      const apiRoomData = {
        name: roomData.name,
        gameType: roomData.gameType || 'LOL',
        playerCount: roomData.playerCount || 10,
        pickMode: roomData.pickMode || 'random',
        description: roomData.description || '',
        password: roomData.password || ''
      }

      const response = await roomApi.createRoom(apiRoomData)

      if (response.status === 'success' && response.data) {
        console.log('房间创建成功, 服务器返回:', response.data)

        // 创建成功后自动设置为当前房间
        const roomInfo = response.data.room || response.data
        currentRoom.value = roomInfo

        // 添加到房间列表
        if (rooms.value && rooms.value.length > 0) {
          rooms.value = [roomInfo, ...rooms.value]
        }

        return roomInfo
      } else {
        throw new Error(response.message || '创建房间失败')
      }
    } catch (err) {
      console.error('创建房间失败:', err)
      error.value = err.message || '创建房间失败，请稍后重试'
      return null
    } finally {
      loading.value = false
    }
  }

  // 获取房间详情
  const fetchRoomDetail = async (roomId) => {
    if (!roomId) {
      console.error('无法获取房间详情：缺少房间ID')
      error.value = '缺少房间ID'
      currentRoom.value = null
      return null
    }

    loading.value = true
    error.value = null

    try {
      console.log(`正在获取房间 ${roomId} 的详情`)

      // 确保 WebSocket 已连接
      const socketStore = useSocketStore()
      if (!socketStore.isConnected) {
        console.log('WebSocket未连接，尝试连接...')
        await socketStore.connect()
        if (!socketStore.isConnected) {
          throw new Error('WebSocket连接失败，无法获取房间详情')
        }
      }

      // 使用Promise包装WebSocket回调
      return new Promise((resolve, reject) => {
        // 使用WebSocket获取房间详情
        const success = socketStore.getRoomDetail(roomId, (response) => {
          if (response.status === 'success') {
            console.log('成功获取房间详情:', response.data)

            // 处理房间数据
            const roomData = response.data

            // 确保关键属性总是有值，防止前端报错
            roomData.players = roomData.players || []
            roomData.teams = roomData.teams || []
            roomData.spectators = roomData.spectators || []
            roomData.messages = roomData.messages || []

            // 更新当前房间数据
            currentRoom.value = roomData

            // 完成加载
            loading.value = false

            resolve(roomData)
          } else {
            console.error('获取房间详情失败:', response.message)
            error.value = response.message || '获取房间详情失败'
            loading.value = false
            reject(new Error(error.value))
          }
        })

        if (!success) {
          error.value = '发送WebSocket事件失败'
          loading.value = false
          reject(new Error(error.value))
        }
      })
    } catch (err) {
      console.error('获取房间详情失败:', err)
      error.value = err.message || '获取房间详情失败，请稍后重试'
      // 出错时清空当前房间数据，避免使用旧数据
      currentRoom.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  // 加入房间
  const joinRoom = async (roomId, password = null) => {
    if (!userStore.isLoggedIn) {
      error.value = '请先登录'
      return false
    }

    loading.value = true
    error.value = null

    try {
      console.log(`用户 ${userStore.username} (${userStore.userId}) 尝试加入房间 ${roomId}`)

      // 确保 WebSocket 已连接
      const socketStore = useSocketStore()
      if (!socketStore.isConnected) {
        console.log('WebSocket未连接，尝试连接...')
        await socketStore.connect()
        if (!socketStore.isConnected) {
          throw new Error('WebSocket连接失败，无法加入房间')
        }
      }

      // 直接使用密码参数
      console.log('使用WebSocket加入房间:', roomId, password ? '带密码' : '无密码')

      // 使用WebSocket加入房间
      const success = socketStore.joinRoom(roomId, password)
      if (!success) {
        throw new Error('发送WebSocket事件失败')
      }

      // 等待一下，给WebSocket事件处理时间
      await new Promise(resolve => setTimeout(resolve, 500))

      // 不再重新获取房间详情，减少API调用
      // 房间详情页会自动加载最新数据

      return true
    } catch (err) {
      console.error('加入房间失败:', err)
      error.value = err.message || '加入房间失败，请稍后重试'
      return false
    } finally {
      loading.value = false
    }
  }

  // 离开房间
  const leaveRoom = async () => {
    if (!currentRoom.value || !userStore.isLoggedIn) return false

    loading.value = true
    error.value = null

    try {
      console.log(`用户 ${userStore.username} 尝试离开房间 ${currentRoom.value.id}`)

      // 确保 WebSocket 已连接
      const socketStore = useSocketStore()
      if (!socketStore.isConnected) {
        console.log('WebSocket未连接，尝试连接...')
        await socketStore.connect()
        if (!socketStore.isConnected) {
          throw new Error('WebSocket连接失败，无法离开房间')
        }
      }

      // 使用WebSocket离开房间
      const success = socketStore.leaveRoom()
      if (!success) {
        throw new Error('发送WebSocket事件失败')
      }

      // 等待一下，给WebSocket事件处理时间
      await new Promise(resolve => setTimeout(resolve, 500))

      // 清除当前房间数据
      currentRoom.value = null
      return true
    } catch (err) {
      console.error('离开房间失败:', err)
      error.value = err.message || '离开房间失败，请稍后重试'
      return false
    } finally {
      loading.value = false
    }
  }

  // 踢出玩家
  const kickPlayer = async (targetUserId) => {
    if (!currentRoom.value || !userStore.isLoggedIn) return false

    // 检查当前用户是否是房主
    if (!isRoomOwner.value) {
      error.value = '只有房主才能踢出玩家'
      return false
    }

    // 不能踢出自己
    if (targetUserId === userStore.userId) {
      error.value = '不能踢出自己'
      return false
    }

    loading.value = true
    error.value = null

    try {
      console.log(`用户 ${userStore.username} 尝试踢出玩家 ${targetUserId}`)

      // 确保 WebSocket 已连接
      const socketStore = useSocketStore()
      if (!socketStore.isConnected) {
        console.log('WebSocket未连接，尝试连接...')
        await socketStore.connect()
        if (!socketStore.isConnected) {
          throw new Error('WebSocket连接失败，无法踢出玩家')
        }
      }

      // 使用WebSocket踢出玩家
      const success = socketStore.kickPlayer(currentRoom.value.id, targetUserId)
      if (!success) {
        throw new Error('发送WebSocket事件失败')
      }

      // 等待一下，给WebSocket事件处理时间
      await new Promise(resolve => setTimeout(resolve, 500))

      // 不再手动更新房间数据，等待WebSocket事件更新
      return true
    } catch (err) {
      console.error('踢出玩家失败:', err)
      error.value = err.message || '踢出玩家失败，请稍后重试'
      return false
    } finally {
      loading.value = false
    }
  }

  // 开始游戏
  const startGame = async () => {
    if (!currentRoom.value || !isRoomOwner.value) {
      error.value = !isRoomOwner.value ? '只有房主才能开始游戏' : '没有加入房间'
      return false
    }

    loading.value = true
    error.value = null

    try {
      console.log(`调用开始游戏 API，房间ID: ${currentRoom.value.id}`)
      const response = await roomApi.startGame(currentRoom.value.id)

      if (response.status === 'success') {
        console.log('开始游戏成功，响应:', response)
        // 更新房间状态
        if (response.data) {
          // 如果服务器返回了新的房间数据，直接使用
          currentRoom.value = response.data
        } else {
          // 否则只更新状态
          currentRoom.value = {
            ...currentRoom.value,
            status: 'gaming'
          }
        }
        return true
      } else {
        throw new Error(response.message || '开始游戏失败')
      }
    } catch (err) {
      console.error('开始游戏失败:', err)
      error.value = err.message || '开始游戏失败，请稍后重试'
      return false
    } finally {
      loading.value = false
    }
  }

  // 更新房间设置
  const updateRoomSettings = async (settings) => {
    if (!currentRoom.value || !isRoomOwner.value) {
      error.value = !isRoomOwner.value ? '只有房主才能更改设置' : '没有加入房间'
      return false
    }

    loading.value = true
    error.value = null

    try {
      const response = await roomApi.updateRoomSettings(currentRoom.value.id, settings)

      if (response.status === 'success') {
        // 更新房间信息
        currentRoom.value = {
          ...currentRoom.value,
          ...response.data
        }
        return true
      } else {
        throw new Error(response.message || '更新房间设置失败')
      }
    } catch (err) {
      console.error('更新房间设置失败:', err)
      error.value = err.message || '更新房间设置失败，请稍后重试'
      return false
    } finally {
      loading.value = false
    }
  }

  // 从观众席加入玩家列表
  const joinAsPlayer = async (roomId) => {
    if (!userStore.isLoggedIn) {
      error.value = '请先登录'
      return false
    }

    if (!roomId) {
      error.value = '房间ID不能为空'
      return false
    }

    loading.value = true
    error.value = null

    try {
      console.log(`用户 ${userStore.username} 尝试从观众席加入玩家列表, 房间ID: ${roomId}`)

      // 确保 WebSocket 已连接
      const socketStore = useSocketStore()
      if (!socketStore.isConnected) {
        console.log('WebSocket未连接，尝试连接...')
        await socketStore.connect()
        if (!socketStore.isConnected) {
          throw new Error('WebSocket连接失败，无法加入玩家列表')
        }
      }

      // 使用WebSocket加入玩家列表
      const success = socketStore.joinAsPlayer(roomId)
      if (!success) {
        throw new Error('发送WebSocket事件失败')
      }

      // 等待一下，给WebSocket事件处理时间
      await new Promise(resolve => setTimeout(resolve, 500))

      // 不再手动更新房间数据，等待WebSocket事件更新
      return true
    } catch (err) {
      console.error('加入玩家列表失败:', err)
      error.value = err.message || '加入玩家列表失败，请稍后重试'
      return false
    } finally {
      loading.value = false
    }
  }

  // 从玩家列表进入观众席
  const joinAsSpectator = async (roomId) => {
    if (!userStore.isLoggedIn) {
      error.value = '请先登录'
      return false
    }

    if (!roomId) {
      error.value = '房间ID不能为空'
      return false
    }

    loading.value = true
    error.value = null

    try {
      console.log(`用户 ${userStore.username} 尝试从玩家列表进入观众席, 房间ID: ${roomId}`)

      // 确保 WebSocket 已连接
      const socketStore = useSocketStore()
      if (!socketStore.isConnected) {
        console.log('WebSocket未连接，尝试连接...')
        await socketStore.connect()
        if (!socketStore.isConnected) {
          throw new Error('WebSocket连接失败，无法进入观众席')
        }
      }

      // 使用WebSocket进入观众席
      const success = socketStore.joinAsSpectator(roomId)
      if (!success) {
        throw new Error('发送WebSocket事件失败')
      }

      // 等待一下，给WebSocket事件处理时间
      await new Promise(resolve => setTimeout(resolve, 500))

      // 不再手动更新房间数据，等待WebSocket事件更新
      return true
    } catch (err) {
      console.error('进入观众席失败:', err)
      error.value = err.message || '进入观众席失败，请稍后重试'
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    // 状态
    rooms,
    currentRoom,
    loading,
    error,
    pagination,

    // 计算属性
    isInRoom,
    isRoomOwner,

    // 方法
    fetchRooms,
    fetchMyRooms,
    createRoom,
    fetchRoomDetail,
    joinRoom,
    leaveRoom,
    kickPlayer,
    startGame,
    updateRoomSettings,
    joinAsPlayer,
    joinAsSpectator,
    isUserInRoom,
    setCurrentRoom
  }
})