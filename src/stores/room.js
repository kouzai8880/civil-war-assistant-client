import { defineStore } from 'pinia'
import { ref, computed, nextTick } from 'vue'
import { roomApi } from '../services/api'
import { useUserStore } from './user'
import { useSocketStore } from './socket'
import { ElMessage } from 'element-plus'

/**
 * 房间管理Store
 * 处理房间列表、房间详情和房间内操作的状态管理
 */
export const useRoomStore = defineStore('room', () => {
  // 状态 - 房间列表相关
  const rooms = ref([])
  const currentRoom = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const pagination = ref({
    total: 0,
    current: 1,
    pageSize: 12
  })

  // 引入其他store
  const userStore = useUserStore()

  // 状态 - 房间详情相关
  // 当前选择的角色
  const selectedCharacter = ref(null)

  // 当前选择的边
  const selectedSide = ref(null)

  // 侧边栏状态
  const sidebarCollapsed = ref(false)

  // 当前激活的聊天标签
  const activeChat = ref('public')

  // 聊天消息
  const messages = ref({
    public: [
      { id: 1, userId: 'system', username: '系统', content: '欢迎来到房间，请准备就绪', time: new Date() }
    ],
    team1: [],
    team2: []
  })

  // 聊天输入
  const chatInput = ref('')

  // 队伍设置对话框
  const teamSettingVisible = ref(false)

  // 是否已加入语音
  const hasJoinedVoice = ref(false)

  // 当前选人阶段
  const pickingPhase = ref({
    currentPick: 1,
    currentTeam: 1,
    pickPattern: [1, 2, 2, 2, 1] // 默认使用12221模式
  })

  // 已选择的玩家
  const pickedCharacters = ref([])

  // 加载状态
  const isLoading = ref(false)

  // 选择边弹窗
  const sideSelectorVisible = ref(false)

  // 密码输入对话框相关状态
  const passwordDialogVisible = ref(false)
  const passwordInput = ref('')
  const passwordError = ref('')
  const isJoiningWithPassword = ref(false)

  // 当前活跃的语音队伍
  const activeVoiceTeam = ref(0) // 0表示公共，1表示一队，2表示二队

  // 常用的英雄头像列表，用于随机分配给玩家
  const championIcons = [
    'Ahri', 'Annie', 'Ashe', 'Caitlyn', 'Darius',
    'Ezreal', 'Garen', 'Jinx', 'Lux', 'Malphite',
    'Nami', 'Syndra', 'Thresh', 'Yasuo', 'Zed',
    'Akali', 'Ekko', 'Fiora', 'Irelia', 'Jhin',
    'Kaisa', 'LeeSin', 'Lulu', 'MasterYi', 'Pyke',
    'Riven', 'Sett', 'Vayne', 'Yone', 'Yuumi'
  ]

  // 计算属性 - 房间列表相关
  const isInRoom = computed(() => Boolean(currentRoom.value))
  const isRoomOwner = computed(() => {
    if (!currentRoom.value || !userStore.userId) return false

    // 处理嵌套的房间数据结构
    const roomData = currentRoom.value.room ? currentRoom.value.room : currentRoom.value

    // 输出调试信息
    console.log('计算isRoomOwner - 当前用户ID:', userStore.userId)
    console.log('计算isRoomOwner - 房间创建者ID:', roomData.creatorId)
    console.log('计算isRoomOwner - 房间数据:', roomData)

    return roomData.creatorId === userStore.userId
  })

  // 计算属性 - 房间详情相关
  // 房间数据
  const roomData = computed(() => {
    if (!currentRoom.value) return null
    return currentRoom.value.room ? currentRoom.value.room : currentRoom.value
  })

  // 玩家列表
  const players = computed(() => {
    if (!roomData.value) return []

    // 确保每个玩家都有 itemId 属性
    return (roomData.value.players || []).map((player, index) => {
      // 如果玩家没有 itemId，添加一个默认值
      if (!player.itemId) {
        return {
          ...player,
          itemId: player.championId || player.userId || `player-${index}`
        }
      }
      return player
    })
  })

  // 观众列表
  const spectators = computed(() => {
    if (!roomData.value) return []
    return roomData.value.spectators || []
  })

  // 当前用户ID
  const currentUserId = computed(() => userStore.userId)

  // 用户是否已准备
  const isReady = computed(() => {
    if (!roomData.value || !currentUserId.value) return false

    // 如果没有玩家列表，返回false
    if (!players.value || !Array.isArray(players.value)) return false

    const currentPlayer = players.value.find(p => p.userId === currentUserId.value)
    return currentPlayer && currentPlayer.status === 'ready'
  })

  // 用户是否是队长
  const isCaptain = computed(() => {
    if (!roomData.value || !currentUserId.value) return false

    // 如果没有玩家列表，返回false
    if (!players.value || !Array.isArray(players.value)) return false

    const currentPlayer = players.value.find(p => p.userId === currentUserId.value)
    return currentPlayer && currentPlayer.isCaptain
  })

  // 用户所在队伍ID
  const userTeamId = computed(() => {
    if (!roomData.value || !currentUserId.value) return null

    // 如果没有玩家列表，返回null
    if (!players.value || !Array.isArray(players.value)) return null

    const currentPlayer = players.value.find(p => p.userId === currentUserId.value)
    return currentPlayer ? currentPlayer.teamId : null
  })

  // 用户是否在观众席
  const isSpectator = computed(() => {
    if (!roomData.value || !currentUserId.value) return true

    // 如果没有玩家列表，默认为观众
    if (!players.value || !Array.isArray(players.value)) return true

    // 检查用户是否在玩家列表中
    return !players.value.some(p => p.userId === currentUserId.value)
  })

  // 队伍是否已满
  const isTeamFull = computed(() => {
    if (!roomData.value) return true

    // 如果没有玩家列表，返回true
    if (!players.value || !Array.isArray(players.value)) return true

    return players.value.length >= roomData.value.playerCount
  })

  // 待选玩家计算属性
  const availablePlayers = computed(() => {
    if (!roomData.value || !players.value) return []

    // 获取队伍信息
    const teams = roomData.value.teams || []

    // 获取队长的用户ID
    const captainIds = teams.map(team => team.captainId?.id || team.captainId).filter(Boolean)

    // 获取已经被选择的玩家ID
    const pickedPlayerIds = pickedCharacters.value.map(char => char.characterId)

    // 从玩家列表中筛选出未被选择的非队长玩家
    const filteredPlayers = players.value
      .filter(player => {
        // 排除队长
        if (captainIds.includes(player.userId)) {
          return false
        }

        // 排除已经被选择的玩家
        if (pickedPlayerIds.includes(player.userId)) {
          return false
        }

        // 排除已经分配到队伍的玩家
        if (player.teamId) {
          // 如果玩家已经分配到队伍，但不在pickedCharacters中，则添加到pickedCharacters
          if (!pickedPlayerIds.includes(player.userId)) {
            pickedCharacters.value.push({
              characterId: player.userId,
              characterName: player.username,
              characterAvatar: player.avatar || getChampionIcon(players.value.indexOf(player)),
              teamId: player.teamId,
              pickOrder: pickedCharacters.value.length + 1
            })
          }
          return false
        }

        return true
      })
      .map(player => ({
        id: player.userId,
        name: player.username,
        avatar: player.avatar || getChampionIcon(players.value.indexOf(player)),
        itemId: player.itemId // 添加 itemId 属性
      }))

    return filteredPlayers
  })

  // 是否显示选择红蓝方按钮
  const showPickSideButton = computed(() => {
    if (!roomData.value || roomData.value.status !== 'side-picking' || !isCaptain.value) return false
    return userTeamId.value === 1
  })

  // 是否显示开始游戏按钮
  const showStartGameButton = computed(() => {
    if (!roomData.value || !isRoomOwner.value) return false
    // 在waiting-game状态下始终显示按钮，但可能会禁用
    return roomData.value.status === 'waiting-game'
  })

  // 指示队长是否需要行动的提示文本
  const captainActionText = computed(() => {
    if (!roomData.value) return ''

    if (roomData.value.status === 'picking') {
      if (isCaptain.value && pickingPhase.value.currentTeam === userTeamId.value) {
        return '轮到您选择角色'
      } else if (isCaptain.value) {
        return '等待对方队长选择'
      }
    } else if (roomData.value.status === 'side-picking') {
      if (isCaptain.value && userTeamId.value === 1) {
        return '请选择红方或蓝方'
      }
    }

    return ''
  })

  // 各队伍的语音参与者
  const teamVoiceParticipants = computed(() => {
    if (!roomData.value || !hasJoinedVoice.value) return []

    // 根据当前选择的队伍语音频道过滤玩家
    if (activeVoiceTeam.value === 0 || roomData.value.status === 'waiting') {
      return roomData.value.players.filter(p => p.userId !== currentUserId.value && p.hasJoinedVoice)
    } else {
      return roomData.value.players.filter(p =>
        p.userId !== currentUserId.value &&
        p.hasJoinedVoice &&
        p.teamId === activeVoiceTeam.value
      )
    }
  })

  // 函数 - 房间详情相关
  // 生成英雄头像 URL
  const getChampionIcon = (index) => {
    const champion = championIcons[index % championIcons.length]
    return `https://ddragon.leagueoflegends.com/cdn/13.12.1/img/champion/${champion}.png`
  }

  // 初始化已选择玩家列表
  const initializePickedCharacters = () => {
    // 清空已选择列表
    pickedCharacters.value = []

    if (!roomData.value) return

    // 获取队伍信息
    const teams = roomData.value.teams || []

    // 获取队长的用户ID
    const captainIds = teams.map(team => team.captainId?.id || team.captainId).filter(Boolean)

    // 已经分配到队伍的非队长玩家
    const teamPlayers = players.value.filter(p => {
      // 必须有teamId属性
      if (!p.teamId) return false
      // 不能是队长
      if (captainIds.includes(p.userId)) return false
      return true
    })

    // 添加到已选择列表
    teamPlayers.forEach((player, index) => {
      pickedCharacters.value.push({
        characterId: player.userId,
        characterName: player.username,
        characterAvatar: player.avatar || getChampionIcon(players.value.indexOf(player)),
        teamId: player.teamId,
        pickOrder: index + 1
      })
    })
  }

  // 更新选人阶段状态
  const updatePickingPhaseState = () => {
    if (!roomData.value || roomData.value.status !== 'picking') return

    // 如果服务器返回了选人阶段数据，使用服务器的数据
    if (roomData.value.pickPhase) {
      console.log('使用服务器返回的选人阶段数据:', roomData.value.pickPhase)
      pickingPhase.value = { ...roomData.value.pickPhase }
      return
    }

    // 如果没有服务器数据，根据已选择的玩家数量计算当前选人阶段
    const mode = roomData.value?.pickMode || '12221'
    const pattern = mode === '12221' ? [1, 2, 2, 2, 1] : [1, 2, 2, 1, 1]

    // 计算已选择的玩家数量
    const pickedCount = pickedCharacters.value.length

    // 计算当前处于哪个阶段
    let totalPicked = 0
    let phaseIndex = 0

    // 遍历选人模式数组，找出当前处于哪个阶段
    for (let i = 0; i < pattern.length; i++) {
      totalPicked += pattern[i]
      // 如果已选择数量小于累计选择数量，则当前处于该阶段
      if (pickedCount < totalPicked) {
        phaseIndex = i
        break
      }
    }

    // 确定当前选择的队伍
    const currentTeam = (phaseIndex % 2 === 0) ? 1 : 2

    console.log(`根据已选择玩家数量(${pickedCount})计算，当前处于第 ${phaseIndex + 1} 阶段，当前选择队伍是 ${currentTeam} 队`)

    // 更新选人阶段状态
    pickingPhase.value.currentTeam = currentTeam
    pickingPhase.value.currentPick = pickedCount + 1
    pickingPhase.value.pickPattern = pattern

    // 强制触发UI更新
    nextTick(() => {
      console.log('强制触发UI更新，当前选人队伍:', pickingPhase.value.currentTeam)
    })
  }

  // 获取总选人回合数
  const getTotalPickCount = () => {
    if (!pickingPhase.value || !pickingPhase.value.pickPattern) return 0

    // 计算所有选人回合的总和
    let total = 0
    for (let i = 0; i < pickingPhase.value.pickPattern.length; i++) {
      total += pickingPhase.value.pickPattern[i]
    }
    return total
  }

  // 队长选择玩家
  const pickPlayer = (player) => {
    if (!roomData.value || !isCaptain.value) {
      console.log('不是队长或房间数据不存在，无法选择玩家')
      return
    }

    // 检查当前是否轮到该队长选择
    console.log('当前选人队伍:', pickingPhase.value.currentTeam, '用户队伍:', userTeamId.value)
    if (pickingPhase.value.currentTeam !== userTeamId.value) {
      ElMessage.warning('不是您的选择回合')
      return
    }

    // 检查玩家是否已经被选择
    if (pickedCharacters.value.some(c => c.characterId === player.id)) {
      ElMessage.warning('该玩家已被选择')
      return
    }

    console.log('选择玩家:', player)

    // 使用WebSocket API选择玩家
    const socketStore = useSocketStore()
    socketStore.captainSelectPlayer(
      roomData.value.id,
      userTeamId.value,
      player.id,
      (response) => {
        if (response.status === 'success') {
          console.log('选择玩家成功:', response)
          // 服务器会广播 player.selected 事件，所有客户端都会收到
          // 所以这里不需要手动更新UI
        } else {
          console.error('选择玩家失败:', response.message)
          ElMessage.error(response.message || '选择玩家失败')
        }
      }
    )
  }

  // 队长选择红蓝方
  const pickSide = (side) => {
    if (!roomData.value || !isCaptain.value || userTeamId.value !== 1) return

    selectedSide.value = side
    sideSelectorVisible.value = false

    // 使用WebSocket API选择红蓝方
    const socketStore = useSocketStore()
    socketStore.captainSelectSide(
      roomData.value.id,
      userTeamId.value,
      side,
      (response) => {
        if (response.status === 'success') {
          console.log('选择红蓝方成功:', response)
          // 服务器会广播 team.selected_side 事件，所有客户端都会收到
          // 所以这里不需要手动更新UI
        } else {
          console.error('选择红蓝方失败:', response.message)
          ElMessage.error(response.message || '选择红蓝方失败')
          // 如果失败，重新显示选择弹窗
          sideSelectorVisible.value = true
        }
      }
    )
  }

  // 切换侧边栏状态
  const toggleSidebar = () => {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  // 切换聊天频道
  const switchChatChannel = (channel) => {
    activeChat.value = channel
  }

  // 切换语音队伍
  const switchVoiceTeam = (teamId) => {
    activeVoiceTeam.value = teamId

    if (hasJoinedVoice.value) {
      // 如果已经加入语音，则先退出
      hasJoinedVoice.value = false
      addSystemMessage(`${userStore.username} 离开了语音聊天`)

      // 然后重新加入新的队伍语音
      setTimeout(() => {
        hasJoinedVoice.value = true
        if (teamId === 0) {
          addSystemMessage(`${userStore.username} 加入了公共语音聊天`)
        } else {
          addSystemMessage(`${userStore.username} 加入了${teamId === 1 ? '一' : '二'}队语音聊天`)
        }
      }, 500)
    }
  }

  // 切换语音状态
  const toggleVoice = () => {
    hasJoinedVoice.value = !hasJoinedVoice.value

    // 添加系统消息
    if (hasJoinedVoice.value) {
      if (roomData.value.status === 'waiting') {
        addSystemMessage(`${userStore.username} 加入了语音聊天`)
      } else {
        addSystemMessage(`${userStore.username} 加入了${activeVoiceTeam.value === 1 ? '一' : '二'}队语音聊天`)
      }
    } else {
      addSystemMessage(`${userStore.username} 离开了语音聊天`)
    }
  }

  // 添加系统消息
  const addSystemMessage = (content) => {
    if (!content || typeof content !== 'string') {
      console.error('无法添加系统消息：内容无效', content)
      return
    }

    try {
      // 创建系统消息对象
      const systemMessage = {
        id: Date.now().toString(),
        userId: 'system',
        username: '系统',
        content: content,
        avatar: '', // 系统消息没有头像
        type: 'system',
        channel: 'public',
        createTime: new Date().toISOString()
      }

      // 使用辅助函数格式化消息
      const formattedMessage = formatChatMessage(systemMessage)

      // 确保所有聊天频道都已初始化
      if (!messages.value) {
        messages.value = {
          public: [],
          team1: [],
          team2: []
        }
      }

      // 将消息添加到公共频道
      messages.value.public.push(formattedMessage)

      // 滚动到最新消息
      nextTick(() => {
        const chatContainer = document.querySelector('.chat-messages')
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight
        }
      })
    } catch (error) {
      console.error('添加系统消息失败:', error)
    }
  }

  // 格式化日期时间
  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '未知时间'

    try {
      // 尝试创建日期对象
      const date = new Date(dateTimeStr)

      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        console.warn('无效的日期格式:', dateTimeStr)
        return '未知时间'
      }

      // 格式化日期
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    } catch (error) {
      console.error('日期格式化错误:', error)
      return '未知时间'
    }
  }

  // 队伍颜色
  const teamColor = (teamId) => {
    if (!teamId) return ''
    switch (teamId) {
      case 1: return 'team-red'
      case 2: return 'team-blue'
      default: return ''
    }
  }

  // 格式化聊天消息
  const formatChatMessage = (message) => {
    if (!message) return null

    // 如果消息已经格式化，直接返回
    if (message.formattedTime) return message

    // 格式化时间
    const timestamp = message.createTime || message.time || new Date().toISOString()
    const formattedTime = formatDateTime(timestamp)

    // 根据消息类型设置样式
    let messageClass = ''
    if (message.userId === 'system') {
      messageClass = 'system-message'
    } else if (message.userId === userStore.userId) {
      messageClass = 'my-message'
    } else {
      messageClass = 'other-message'
    }

    // 根据队伍设置颜色
    let teamClass = ''
    if (message.teamId) {
      teamClass = teamColor(message.teamId)
    }

    // 返回格式化后的消息
    return {
      ...message,
      formattedTime,
      messageClass,
      teamClass
    }
  }

  // 检查用户是否在房间中（作为玩家或观众）
  const isUserInRoom = (room) => {
    if (!room || !userStore.userId) return false

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

    return isPlayer || isSpectator
  }

  // 添加一个方法来设置当前房间
  const setCurrentRoom = (roomData) => {
    if (!roomData) {
      console.log('清除当前房间数据')
      currentRoom.value = null
      return
    }

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
      // 处理嵌套的房间数据结构
      if (currentRoom.value.room) {
        // 将房间的关键属性复制到顶层，确保一致性
        currentRoom.value.creatorId = currentRoom.value.room.creatorId
        currentRoom.value.creatorName = currentRoom.value.room.creatorName
        currentRoom.value.creatorAvatar = currentRoom.value.room.creatorAvatar
        currentRoom.value.name = currentRoom.value.room.name
        currentRoom.value.id = currentRoom.value.room.id
        currentRoom.value.status = currentRoom.value.room.status
      }

      currentRoom.value.players = currentRoom.value.players || []
      currentRoom.value.teams = currentRoom.value.teams || []
      currentRoom.value.spectators = currentRoom.value.spectators || []
      currentRoom.value.messages = currentRoom.value.messages || []
    }
  }

  // 监听房间相关事件
  // 监听加入房间成功事件
  window.addEventListener('roomJoined', (event) => {
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

      // 确保 WebSocket 已连接
      const socketStore = useSocketStore()
      if (!socketStore.isConnected) {
        console.log('WebSocket未连接，尝试连接...')
        await socketStore.connect()
        if (!socketStore.isConnected) {
          throw new Error('WebSocket连接失败，无法加入房间')
        }
      }
      // 使用WebSocket加入房间
      const success = socketStore.joinRoom(roomId, password)
      if (!success) {
        throw new Error('发送WebSocket事件失败')
      }

      // 等待一下，给WebSocket事件处理时间
      await new Promise(resolve => setTimeout(resolve, 500))

      // 如果加入房间失败，并且是因为房间已满，则尝试加入观战席
      // 注意：这里不需要额外的代码，因为我们已经在socketStore.joinRoom中处理了这种情况
      // 如果房间已满，它会自动尝试加入观战席

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

  // kickPlayer 函数已移动到 roomDetail.js 中

  // startGame 函数已移动到 roomDetail.js 中

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
    // 状态 - 房间列表相关
    rooms,
    currentRoom,
    loading,
    error,
    pagination,

    // 状态 - 房间详情相关
    selectedCharacter,
    selectedSide,
    sidebarCollapsed,
    activeChat,
    messages,
    chatInput,
    teamSettingVisible,
    hasJoinedVoice,
    pickingPhase,
    pickedCharacters,
    isLoading,
    sideSelectorVisible,
    passwordDialogVisible,
    passwordInput,
    passwordError,
    isJoiningWithPassword,
    activeVoiceTeam,

    // 计算属性 - 房间列表相关
    isInRoom,
    isRoomOwner,

    // 计算属性 - 房间详情相关
    roomData,
    players,
    spectators,
    currentUserId,
    isReady,
    isCaptain,
    userTeamId,
    isSpectator,
    isTeamFull,
    availablePlayers,
    showPickSideButton,
    showStartGameButton,
    captainActionText,
    teamVoiceParticipants,

    // 方法 - 房间列表相关
    fetchRooms,
    fetchMyRooms,
    createRoom,
    fetchRoomDetail,
    joinRoom,
    updateRoomSettings,
    joinAsPlayer,
    joinAsSpectator,
    isUserInRoom,
    setCurrentRoom,

    // 方法 - 房间详情相关
    getChampionIcon,
    initializePickedCharacters,
    updatePickingPhaseState,
    getTotalPickCount,
    pickPlayer,
    pickSide,
    toggleSidebar,
    switchChatChannel,
    switchVoiceTeam,
    toggleVoice,
    addSystemMessage,
    formatChatMessage,
    formatDateTime,
    teamColor
  }
})