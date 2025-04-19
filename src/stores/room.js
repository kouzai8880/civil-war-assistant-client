import { defineStore } from 'pinia'
import { ref, computed, nextTick } from 'vue'
import { roomApi } from '../services/api'
import { useUserStore } from './user'
import { useSocketStore } from './socket'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'

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
  const isLeavingRoom = ref(false) // 标记用户是否正在离开房间
  const pagination = ref({
    total: 0,
    current: 1,
    pageSize: 12
  })

  // 事件监听器状态管理
  const eventListenersActive = ref(false)
  const eventHandlers = ref({}) // 存储事件处理函数的引用
  const router = useRouter()

  // 记录进入房间前的路由
  const previousRoute = ref(null)

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

  // 语音通信相关状态
  const hasJoinedVoice = ref(false)
  const isMuted = ref(false)
  const voiceInstance = ref(null)
  const currentVoiceChannel = ref('none') // 'none', 'public', 'team1', 'team2'
  const micVolume = ref(1.0) // 麦克风音量，默认为1.0
  const speakerVolume = ref(1.0) // 扬声器音量，默认为1.0

  // 语音房间用户列表已移至currentRoom.voiceChannels

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
    if (!currentRoom.value) return { id: null, players: [], spectators: [], teams: [], messages: [] }
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

  // 当前语音房间的用户列表
  const currentVoiceUsers = computed(() => {
    if (!roomData.value || !roomData.value.voiceChannels) return []

    // 如果用户没有加入语音，默认显示公共频道的用户
    const channel = currentVoiceChannel.value === 'none' ? 'public' : currentVoiceChannel.value

    // 直接使用currentRoom.voiceChannels作为数据来源
    return roomData.value.voiceChannels[channel] || []
  })

  // 各队伍的语音参与者 (兼容旧版代码)
  const teamVoiceParticipants = computed(() => {
    return currentVoiceUsers.value
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

  // 切换语音房间
  const switchVoiceChannel = (channel) => {
    // 如果已经在该房间，不需要切换
    if (currentVoiceChannel.value === channel) return

    // 如果已经在其他语音房间，先离开
    if (currentVoiceChannel.value !== 'none') {
      leaveVoiceChannel()
    }

    // 加入新的语音房间
    if (channel !== 'none') {
      joinVoiceChannel(channel)
    }
  }

  // 切换语音队伍 (兼容旧版代码)
  const switchVoiceTeam = (teamId) => {
    // 将队伍 ID 转换为语音房间名称
    let channel = 'public'
    if (teamId === 1) channel = 'team1'
    else if (teamId === 2) channel = 'team2'

    // 调用新的切换语音房间方法
    switchVoiceChannel(channel)
  }

  // 加入语音房间
  const joinVoiceChannel = (channel) => {
    console.log('[语音加入] 开始加入语音房间...')
    console.log(`[语音加入] 目标频道: ${channel}`)
    console.log('[语音加入] 当前语音状态:', hasJoinedVoice.value ? '已加入' : '未加入')
    console.log('[语音加入] 当前语音频道:', currentVoiceChannel.value)

    if (!roomData.value || !roomData.value.id) {
      console.error('[语音加入] 无法加入语音房间：房间数据不存在')
      return false
    }

    const socketStore = useSocketStore()
    if (!socketStore.isConnected) {
      console.error('[语音加入] 无法加入语音房间：WebSocket 未连接')
      return false
    }

    try {
      // 发送加入语音房间的请求
      console.log(`[语音加入] 发送joinVoiceChannel事件，房间ID: ${roomData.value.id}, 频道: ${channel}`)
      socketStore.getSocket().emit('joinVoiceChannel', {
        roomId: roomData.value.id,
        channel: channel
      })
      console.log('[语音加入] joinVoiceChannel事件已发送')

      // 更新状态
      hasJoinedVoice.value = true
      currentVoiceChannel.value = channel
      console.log(`[语音加入] 本地语音状态已更新为已加入，频道: ${channel}`)

      console.log('[语音加入] 加入语音房间完成')
      return true
    } catch (error) {
      console.error('[语音加入] 加入语音房间失败:', error)
      return false
    }
  }

  // 离开语音房间
  const leaveVoiceChannel = () => {
    console.log('[语音离开] 开始离开语音房间...')
    console.log('[语音离开] 当前语音状态:', hasJoinedVoice.value ? '已加入' : '未加入')
    console.log('[语音离开] 当前语音频道:', currentVoiceChannel.value)

    if (!roomData.value || !roomData.value.id) {
      console.error('[语音离开] 无法离开语音房间：房间数据不存在')
      return
    }

    if (currentVoiceChannel.value === 'none') {
      console.log('[语音离开] 当前未加入任何语音频道，无需离开')
      return
    }

    const socketStore = useSocketStore()
    if (!socketStore.isConnected) {
      console.error('[语音离开] 无法离开语音房间：WebSocket 未连接')
      return
    }

    try {
      // 发送离开语音房间的请求
      console.log(`[语音离开] 发送leaveVoiceChannel事件，房间ID: ${roomData.value.id}`)
      socketStore.getSocket().emit('leaveVoiceChannel', {
        roomId: roomData.value.id
      })
      console.log('[语音离开] leaveVoiceChannel事件已发送')

      // 更新状态
      hasJoinedVoice.value = false
      currentVoiceChannel.value = 'none'
      console.log('[语音离开] 本地语音状态已更新为未加入')

      // 清理语音资源
      if (voiceInstance.value) {
        console.log('[语音离开] 清理语音实例资源...')
        voiceInstance.value.dispose()
        voiceInstance.value = null
        console.log('[语音离开] 语音实例资源已清理')
      } else {
        console.log('[语音离开] 没有语音实例需要清理')
      }

      console.log('[语音离开] 离开语音房间完成')
      return true
    } catch (error) {
      console.error('[语音离开] 离开语音房间失败:', error)
      return false
    }
  }

  // 切换静音状态
  const toggleMute = () => {
    console.log('[语音静音] 开始切换静音状态...')
    console.log('[语音静音] 当前静音状态:', isMuted.value ? '已静音' : '未静音')
    console.log('[语音静音] 当前语音频道:', currentVoiceChannel.value)

    if (!roomData.value || !roomData.value.id) {
      console.error('[语音静音] 无法切换静音状态：房间数据不存在')
      return false
    }

    if (currentVoiceChannel.value === 'none') {
      console.error('[语音静音] 无法切换静音状态：未加入语音频道')
      return false
    }

    try {
      // 切换静音状态
      isMuted.value = !isMuted.value
      console.log(`[语音静音] 静音状态已切换为: ${isMuted.value ? '已静音' : '未静音'}`)

      // 如果有语音实例，更新实例的静音状态
      if (voiceInstance.value) {
        console.log(`[语音静音] 更新语音实例的静音状态为: ${isMuted.value ? '已静音' : '未静音'}`)
        voiceInstance.value.setMuted(isMuted.value)
      } else {
        console.warn('[语音静音] 语音实例不存在，无法更新实例的静音状态')
      }

      // 发送静音状态更新的请求
      const socketStore = useSocketStore()
      if (socketStore.isConnected) {
        console.log(`[语音静音] 发送voiceMute事件，房间ID: ${roomData.value.id}, 静音状态: ${isMuted.value}`)
        socketStore.getSocket().emit('voiceMute', {
          roomId: roomData.value.id,
          isMuted: isMuted.value
        })
        console.log('[语音静音] voiceMute事件已发送')
      } else {
        console.error('[语音静音] WebSocket未连接，无法发送静音状态更新')
      }

      console.log('[语音静音] 切换静音状态完成')
      return true
    } catch (error) {
      console.error('[语音静音] 切换静音状态失败:', error)
      return false
    }
  }

  // 设置麦克风音量
  const setMicVolume = (volume) => {
    console.log('[语音音量] 开始设置麦克风音量...')
    console.log('[语音音量] 当前麦克风音量:', micVolume.value)
    console.log('[语音音量] 新麦克风音量:', volume)

    if (!roomData.value || !roomData.value.id) {
      console.error('[语音音量] 无法设置麦克风音量：房间数据不存在')
      return false
    }

    if (currentVoiceChannel.value === 'none') {
      console.error('[语音音量] 无法设置麦克风音量：未加入语音频道')
      return false
    }

    try {
      // 设置麦克风音量
      micVolume.value = Math.max(0, Math.min(1, volume))
      console.log(`[语音音量] 麦克风音量已设置为: ${micVolume.value}`)

      // 如果有语音实例，更新实例的麦克风音量
      if (voiceInstance.value) {
        console.log(`[语音音量] 更新语音实例的麦克风音量为: ${micVolume.value}`)
        voiceInstance.value.setMicVolume(micVolume.value)
      } else {
        console.warn('[语音音量] 语音实例不存在，无法更新实例的麦克风音量')
      }

      console.log('[语音音量] 设置麦克风音量完成')
      return true
    } catch (error) {
      console.error('[语音音量] 设置麦克风音量失败:', error)
      return false
    }
  }

  // 设置扬声器音量
  const setSpeakerVolume = (volume) => {
    console.log('[语音音量] 开始设置扬声器音量...')
    console.log('[语音音量] 当前扬声器音量:', speakerVolume.value)
    console.log('[语音音量] 新扬声器音量:', volume)

    if (!roomData.value || !roomData.value.id) {
      console.error('[语音音量] 无法设置扬声器音量：房间数据不存在')
      return false
    }

    if (currentVoiceChannel.value === 'none') {
      console.error('[语音音量] 无法设置扬声器音量：未加入语音频道')
      return false
    }

    try {
      // 设置扬声器音量
      speakerVolume.value = Math.max(0, Math.min(1, volume))
      console.log(`[语音音量] 扬声器音量已设置为: ${speakerVolume.value}`)

      // 如果有语音实例，更新实例的扬声器音量
      if (voiceInstance.value) {
        console.log(`[语音音量] 更新语音实例的扬声器音量为: ${speakerVolume.value}`)
        voiceInstance.value.setSpeakerVolume(speakerVolume.value)
      } else {
        console.warn('[语音音量] 语音实例不存在，无法更新实例的扬声器音量')
      }

      console.log('[语音音量] 设置扬声器音量完成')
      return true
    } catch (error) {
      console.error('[语音音量] 设置扬声器音量失败:', error)
      return false
    }
  }

  // 更新语音房间用户列表
  const updateVoiceChannelUsers = (channel, users) => {
    if (!channel || !Array.isArray(users) || !currentRoom.value) return

    // 确保语音频道数据存在
    if (!currentRoom.value.voiceChannels) {
      currentRoom.value.voiceChannels = {
        public: [],
        team1: [],
        team2: []
      }
    }

    // 处理每个用户，确保包含必要的信息
    const processedUsers = users.map(user => {
      // 如果用户已经有完整信息，直接使用
      if (user.username) {
        return user
      }

      // 否则尝试从玩家列表或观众列表中查找用户信息
      let username = user.username
      let avatar = user.avatar

      if (!username && roomData.value) {
        // 从玩家列表中查找
        const player = players.value.find(p => p.userId === user.userId)
        if (player) {
          username = player.username
          avatar = player.avatar
        } else {
          // 从观众列表中查找
          const spectator = spectators.value.find(s => s.userId === user.userId)
          if (spectator) {
            username = spectator.username
            avatar = spectator.avatar
          }
        }
      }

      // 返回包含完整信息的用户对象
      return {
        ...user,
        username: username || '未知用户',
        avatar: avatar || ''
      }
    })

    // 更新指定语音房间的用户列表
    currentRoom.value.voiceChannels[channel] = processedUsers
    console.log(`更新${channel}语音频道用户列表:`, processedUsers)
  }

  // 添加用户到语音房间
  const addUserToVoiceChannel = (data) => {
    if (!data || !data.userId || !data.channel || !currentRoom.value) return

    // 确保语音频道数据存在
    if (!currentRoom.value.voiceChannels) {
      currentRoom.value.voiceChannels = {
        public: [],
        team1: [],
        team2: []
      }
    }

    // 确保该房间存在
    if (!currentRoom.value.voiceChannels[data.channel]) {
      currentRoom.value.voiceChannels[data.channel] = []
    }

    // 检查用户是否已存在
    const userExists = currentRoom.value.voiceChannels[data.channel].some(u => u.userId === data.userId)
    if (!userExists) {
      // 查找用户的详细信息
      let username = data.username
      let avatar = data.avatar

      // 如果没有提供用户名，尝试从玩家列表或观众列表中查找
      if (!username && roomData.value) {
        // 从玩家列表中查找
        const player = players.value.find(p => p.userId === data.userId)
        if (player) {
          username = player.username
          avatar = player.avatar
        } else {
          // 从观众列表中查找
          const spectator = spectators.value.find(s => s.userId === data.userId)
          if (spectator) {
            username = spectator.username
            avatar = spectator.avatar
          }
        }
      }

      // 添加用户
      currentRoom.value.voiceChannels[data.channel].push({
        userId: data.userId,
        username: username || '未知用户',
        avatar: avatar || '',
        teamId: data.teamId,
        role: data.role,
        isMuted: data.isMuted || false
      })

      console.log(`添加用户到${data.channel}语音频道:`, currentRoom.value.voiceChannels[data.channel])
    }
  }

  // 从语音房间移除用户
  const removeUserFromVoiceChannel = (data) => {
    if (!data || !data.userId || !data.previousChannel || !currentRoom.value) return

    // 确保语音频道数据存在
    if (!currentRoom.value.voiceChannels) {
      currentRoom.value.voiceChannels = {
        public: [],
        team1: [],
        team2: []
      }
      return
    }

    // 确保该房间存在
    if (!currentRoom.value.voiceChannels[data.previousChannel]) return

    // 移除用户
    currentRoom.value.voiceChannels[data.previousChannel] = currentRoom.value.voiceChannels[data.previousChannel].filter(
      u => u.userId !== data.userId
    )
  }

  // 更新用户的静音状态
  const updateUserMuteStatus = (userId, isMuted, channel) => {
    if (!userId || !channel || !currentRoom.value) return

    // 确保语音频道数据存在
    if (!currentRoom.value.voiceChannels) {
      currentRoom.value.voiceChannels = {
        public: [],
        team1: [],
        team2: []
      }
      return
    }

    // 确保该房间存在
    if (!currentRoom.value.voiceChannels[channel]) return

    // 更新用户的静音状态
    const user = currentRoom.value.voiceChannels[channel].find(u => u.userId === userId)
    if (user) {
      user.isMuted = isMuted
    }
  }

  // 初始化语音通信
  const initVoiceCommunication = async () => {
    console.log('[语音初始化] 开始初始化语音通信...')

    try {
      // 引入 VoiceChat 类
      console.log('[语音初始化] 加载 VoiceChat 类...')
      const VoiceChat = (await import('../utils/voiceChat')).default
      console.log('[语音初始化] VoiceChat 类加载成功')

      // 创建语音实例
      if (!voiceInstance.value && roomData.value && roomData.value.id) {
        console.log('[语音初始化] 获取 Socket 实例...')
        const socketStore = useSocketStore()
        const socket = socketStore.getSocket()

        if (socket) {
          console.log('[语音初始化] 创建 VoiceChat 实例...')
          voiceInstance.value = new VoiceChat(socket, roomData.value.id)
          console.log('[语音初始化] 调用 VoiceChat.initialize()...')
          const success = await voiceInstance.value.initialize()
          console.log(`[语音初始化] VoiceChat 初始化${success ? '成功' : '失败'}`)
          return success
        } else {
          console.error('[语音初始化] 无法获取 Socket 实例')
          return false
        }
      } else {
        if (voiceInstance.value) {
          console.log('[语音初始化] 语音实例已存在，无需重新初始化')
          return true
        } else {
          console.error('[语音初始化] 房间数据不存在或无效')
          return false
        }
      }
    } catch (error) {
      console.error('[语音初始化] 初始化语音通信失败:', error)
      return false
    }
  }

  // 清理语音资源
  const cleanupVoice = () => {
    if (voiceInstance.value) {
      voiceInstance.value.dispose()
      voiceInstance.value = null
    }

    hasJoinedVoice.value = false
    isMuted.value = false
    currentVoiceChannel.value = 'none'
  }

  // 消息管理方法
  // 添加消息
  const addMessage = (message) => {
    if (!message) return

    // 确保消息列表已初始化
    if (!messages.value) {
      messages.value = {
        public: [],
        team1: [],
        team2: []
      }
    }

    // 判断消息类型和频道
    let channel = 'public'
    if (message.channel === 'team' && message.teamId) {
      channel = `team${message.teamId}`
    }

    // 确保该频道存在
    if (!messages.value[channel]) {
      messages.value[channel] = []
    }

    // 检查消息是否已存在，避免重复添加
    const messageExists = messages.value[channel].some(msg => msg.id === message.id)
    if (messageExists) {
      console.log(`消息 ${message.id} 已存在，不重复添加`)
      return
    }

    // 构建消息对象
    let formattedMessage

    // 如果是系统消息，使用简化的格式
    if (message.type === 'system') {
      formattedMessage = {
        id: message.id || Date.now().toString(),
        userId: 'system',
        username: '系统',
        avatar: '',
        content: message.content,
        time: message.createTime ? new Date(message.createTime) : new Date(),
        isSystem: true,
        teamId: message.teamId,
        channel: channel
      }
    } else {
      // 普通用户消息
      formattedMessage = {
        id: message.id || Date.now().toString(),
        userId: message.userId,
        username: message.username || '未知用户',
        avatar: message.avatar || '',
        content: message.content,
        time: message.createTime ? new Date(message.createTime) : new Date(),
        isSystem: false,
        teamId: message.teamId,
        channel: channel
      }
    }

    // 如果是队伍消息，需要检查权限
    if (channel.startsWith('team')) {
      const teamId = parseInt(channel.replace('team', ''))
      const isUserTeam = teamId === userTeamId.value

      // 如果是当前用户的队伍消息或者用户是观众但消息标记为可见
      if (isUserTeam || (isSpectator.value && message.isTeamMessage)) {
        messages.value[channel].push(formattedMessage)
        console.log(`添加队伍${teamId}消息:`, formattedMessage)
      }
    } else {
      // 公共消息直接添加
      messages.value[channel].push(formattedMessage)
    }

    // 确保当前房间的消息列表也包含这条消息
    if (currentRoom.value) {
      if (!currentRoom.value.messages) {
        currentRoom.value.messages = []
      }

      // 检查消息是否已存在
      const messageExistsInRoom = currentRoom.value.messages.some(msg => msg.id === message.id)
      if (!messageExistsInRoom) {
        currentRoom.value.messages.push(message)
      }
    }

    // 强制触发响应式更新
    messages.value = { ...messages.value }

    // 自动滚动到底部
    nextTick(() => {
      // 尝试获取当前活动频道的聊天消息容器
      const chatBox = document.querySelector('.chat-messages')
      if (chatBox) {
        chatBox.scrollTop = chatBox.scrollHeight
      }
    })
  }

  // 加载历史消息
  const loadMessages = (chatHistory, clearExisting = true) => {
    console.log(`加载历史聊天记录，${clearExisting ? '清空现有消息' : '保留现有消息'}`)

    if (!chatHistory || !Array.isArray(chatHistory)) {
      console.log('没有历史聊天记录或格式不正确')
      return false
    }

    if (chatHistory.length === 0) {
      console.log('历史聊天记录为空')
      // 即使没有消息，也确保消息容器已初始化
      if (!messages.value) {
        messages.value = {
          public: [],
          team1: [],
          team2: []
        }
      }
      return false
    }

    try {
      console.log(`开始处理 ${chatHistory.length} 条历史消息`)

      // 确保所有聊天频道都已初始化
      if (!messages.value) {
        messages.value = {
          public: [],
          team1: [],
          team2: []
        }
      }

      // 如果需要清空现有消息
      if (clearExisting) {
        Object.keys(messages.value).forEach(channel => {
          messages.value[channel] = []
        })
        console.log('已清空现有消息')
      }

      // 创建消息ID集合，用于检查重复消息
      const existingMessageIds = {}
      Object.keys(messages.value).forEach(channel => {
        existingMessageIds[channel] = new Set(
          messages.value[channel].map(msg => msg.id)
        )
      })

      // 处理每条历史消息
      let addedCount = 0
      let skippedCount = 0

      chatHistory.forEach((message, index) => {
        // 验证消息格式
        if (!message || typeof message !== 'object') {
          console.warn(`跳过无效消息 #${index}:`, message)
          skippedCount++
          return
        }

        if (!message.content) {
          console.warn(`跳过没有内容的消息 #${index}:`, message)
          skippedCount++
          return
        }

        // 添加消息
        addMessage(message)
        addedCount++
      })

      // 按时间排序消息
      Object.keys(messages.value).forEach(channel => {
        if (messages.value[channel].length > 0) {
          messages.value[channel].sort((a, b) => a.time - b.time)
        }
      })

      console.log(`历史聊天记录加载完成: 添加 ${addedCount} 条，跳过 ${skippedCount} 条`)

      // 强制触发响应式更新
      messages.value = { ...messages.value }

      // 自动滚动到底部
      if (addedCount > 0) {
        nextTick(() => {
          // 尝试获取当前活动频道的聊天消息容器
          const chatBox = document.querySelector('.chat-messages')
          if (chatBox) {
            chatBox.scrollTop = chatBox.scrollHeight
          }
        })
      }

      return addedCount > 0 // 返回是否添加了新消息
    } catch (error) {
      console.error('加载历史聊天记录时出错:', error)
      return false
    }
  }

  // 清空消息
  const clearMessages = (channel) => {
    if (!messages.value) return

    if (channel) {
      // 清空指定频道的消息
      if (messages.value[channel]) {
        messages.value[channel] = []
        console.log(`清空${channel}消息`)
      }
    } else {
      // 清空所有频道的消息
      Object.keys(messages.value).forEach(ch => {
        messages.value[ch] = []
      })
      console.log('清空所有消息')
    }

    // 强制触发响应式更新
    messages.value = { ...messages.value }
  }

  // 切换语音状态
  const toggleVoice = () => {
    console.log('[语音切换] 当前语音状态:', hasJoinedVoice.value ? '已加入' : '未加入')

    // 切换语音状态
    hasJoinedVoice.value = !hasJoinedVoice.value

    console.log('[语音切换] 新语音状态:', hasJoinedVoice.value ? '已加入' : '未加入')
    console.log('[语音切换] 当前语音频道:', currentVoiceChannel.value)
    console.log('[语音切换] 语音实例状态:', voiceInstance.value ? '存在' : '不存在')

    return hasJoinedVoice.value
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

    // 确保语音频道数据存在
    if (currentRoom.value && !currentRoom.value.voiceChannels) {
      currentRoom.value.voiceChannels = {
        public: [],
        team1: [],
        team2: []
      }
    }

    // // 确保关键属性总是有值，防止前端报错
    // if (currentRoom.value) {
    //   // 处理嵌套的房间数据结构
    //   if (currentRoom.value.room) {
    //     // 将房间的关键属性复制到顶层，确保一致性
    //     currentRoom.value.creatorId = currentRoom.value.room.creatorId
    //     currentRoom.value.creatorName = currentRoom.value.room.creatorName
    //     currentRoom.value.creatorAvatar = currentRoom.value.room.creatorAvatar
    //     currentRoom.value.name = currentRoom.value.room.name
    //     currentRoom.value.id = currentRoom.value.room.id
    //     currentRoom.value.status = currentRoom.value.room.status
    //   }

    //   currentRoom.value.players = currentRoom.value.players || []
    //   currentRoom.value.teams = currentRoom.value.teams || []
    //   currentRoom.value.spectators = currentRoom.value.spectators || []
    //   currentRoom.value.messages = currentRoom.value.messages || []
    // }
  }

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
        setCurrentRoom(roomInfo)
        // 添加到房间列表
        if (rooms.value && rooms.value.length > 0) {
          rooms.value = [roomInfo, ...rooms.value]
        }

        // 重要：使用Socket.IO连接到房间
        const socketStore = useSocketStore()
        if (!socketStore.isConnected) {
          console.log('WebSocket未连接，尝试连接...')
          await socketStore.connect()
          if (!socketStore.isConnected) {
            console.error('WebSocket连接失败，但仍然继续处理')
          }
        }

        // 使用Socket.IO加入房间
        console.log(`使用Socket.IO加入房间: ${roomInfo.id}`)
        socketStore.joinRoom(roomInfo.id)

        // 添加延迟确保模态框关闭后再导航
        router.push({
          path: `/room/${roomInfo.id}`,
          replace: false
        })

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
      // 记录当前路由路径，作为离开房间后的返回路径
      if (router && router.currentRoute && router.currentRoute.value) {
        const currentPath = router.currentRoute.value.path
        // 如果当前路径不是房间详情页，才记录
        if (!currentPath.startsWith('/room/')) {
          console.log(`记录当前路径作为返回路径: ${currentPath}`)
          previousRoute.value = currentPath
        } else {
          console.log('当前已经在房间详情页，不记录返回路径')
        }
      }

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
      // await new Promise(resolve => setTimeout(resolve, 100))

      // 不再重新获取房间详情，减少API调用
      // 房间详情页会自动加载最新数据

      return true
    } catch (error) {
      console.error('加入房间失败:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  // 离开房间
  const leaveRoom = async (roomId) => {
    if (!roomId) return false

    loading.value = true
    error.value = null

    try {
      // 调用Socket.io离开房间
      const socketStore = useSocketStore()
      return new Promise((resolve) => {
        socketStore.leaveRoom(roomId, (response) => {
          if (response.status === 'success') {
            // 清除房间数据
            roomData.value = null
            resolve(true)
          } else {
            console.error('离开房间失败:', response.message)
            error.value = response.message || '离开房间失败'
            resolve(false)
          }
        })
      })
    } catch (error) {
      console.error('离开房间时出错:', error)
      error.value = error.message || '离开房间失败'
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

  // 处理房间列表更新事件
  const handleRoomListUpdated = async (event) => {
    console.log('收到roomListUpdated事件:', event.detail)
    try {
      if (!event.detail) {
        console.error('roomListUpdated事件数据为空')
        return
      }

      const { action, roomId, timestamp } = event.detail
      console.log(`房间列表更新，动作: ${action}, 房间ID: ${roomId}, 时间戳: ${timestamp}`)

      // 根据更新动作执行不同操作
      switch (action) {
        case 'create':
        case 'update':
          // 新房间创建或房间信息更新，刷新房间列表
          await throttledFetchRooms()
          break
        case 'delete':
          // 房间被删除，从本地列表中移除
          removeRoomFromList(roomId)
          break
        default:
          // 未知动作，刷新整个列表
          await throttledFetchRooms()
      }
    } catch (error) {
      console.error('处理roomListUpdated事件时出错:', error)
    }
  }

  // 使用节流函数限制请求频率
  let fetchTimeout = null
  const throttledFetchRooms = async () => {
    if (fetchTimeout) {
      clearTimeout(fetchTimeout)
    }

    return new Promise((resolve) => {
      fetchTimeout = setTimeout(async () => {
        try {
          const result = await fetchRooms()
          fetchTimeout = null
          resolve(result)
        } catch (error) {
          console.error('获取房间列表失败:', error)
          fetchTimeout = null
          resolve([])
        }
      }, 500) // 500ms内只执行一次
    })
  }

  // 从本地列表中移除房间
  const removeRoomFromList = (roomId) => {
    if (!roomId || !rooms.value) return

    // 从房间列表中移除指定房间
    rooms.value = rooms.value.filter(room => room.id !== roomId)
    console.log(`从本地列表中移除房间 ${roomId}`)
  }

  // 设置房间事件监听器
  const setupRoomEventListeners = () => {
    // 如果事件监听器已经激活，则不重复添加
    const socketStore = useSocketStore()
    if (eventListenersActive.value) {
      console.log('事件监听器已经激活，不重复添加')
      return
    }

    console.log('添加房间事件监听器')

    // 添加房间事件监听器
    window.addEventListener('roomJoined', handleRoomJoined)
    window.addEventListener('roomLeft', handleRoomLeft)
    window.addEventListener('roleChanged', handleRoleChanged)
    window.addEventListener('roomStatusUpdate', handleRoomStatusUpdate)
    window.addEventListener('spectatorJoined', handleSpectatorJoined)
    window.addEventListener('playerJoined', handlePlayerJoined)
    window.addEventListener('spectatorLeft', handleSpectatorLeft)
    window.addEventListener('playerLeft', handlePlayerLeft)
    window.addEventListener('spectatorMoveToPlayer', handleSpectatorMoveToPlayer)
    window.addEventListener('playerMoveToSpectator', handlePlayerMoveToSpectator)
    window.addEventListener('gameStarted', handleGameStarted)
    window.addEventListener('teamUpdate', handleTeamUpdate)
    window.addEventListener('newMessage', handleNewMessage)
    window.addEventListener('socketError', handleSocketError)
    window.addEventListener('socketReconnected', handleSocketReconnected)
    window.addEventListener('roomListUpdated', handleRoomListUpdated)

    // 添加语音通信相关的事件监听器
    window.addEventListener('voiceChannelJoined', handleVoiceChannelJoined)
    window.addEventListener('voiceChannelLeft', handleVoiceChannelLeft)
    window.addEventListener('voiceChannelUsers', handleVoiceChannelUsers)
    window.addEventListener('userJoinedVoiceChannel', handleUserJoinedVoiceChannel)
    window.addEventListener('userLeftVoiceChannel', handleUserLeftVoiceChannel)
    window.addEventListener('voiceMuteUpdate', handleVoiceMuteUpdate)
    window.addEventListener('voiceData', handleVoiceData)

    // 添加选人选边相关的事件监听器
    window.addEventListener('playerSelected', handlePlayerSelectedEvent)
    window.addEventListener('teamSelectedSide', handleTeamSelectedSideEvent)

    // 注册服务器事件到全局事件
    const socket = socketStore.getSocket()
    if (socket) {
      socket.on('player.selected', (data) => {
        console.log('[WebSocket事件] player.selected:', data)
        window.dispatchEvent(new CustomEvent('playerSelected', { detail: data }))
      })

      socket.on('team.selected_side', (data) => {
        console.log('[WebSocket事件] team.selected_side:', data)
        window.dispatchEvent(new CustomEvent('teamSelectedSide', { detail: data }))
      })
    } else {
      console.error('无法获取Socket实例，无法注册选人选边事件')
    }

    // 设置事件监听器状态为激活
    eventListenersActive.value = true

    // 检查是否有缓存的roomJoined事件
    const cachedRoomJoinedEvent = socketStore.getCachedEvent('roomJoined')
    if (cachedRoomJoinedEvent) {
      console.log('发现缓存的roomJoined事件，立即处理')
      handleRoomJoined({ detail: cachedRoomJoinedEvent })
      // 清除缓存的事件，避免重复处理
      socketStore.clearCachedEvent('roomJoined')
    }

    console.log('已添加房间事件监听器')
  }

  // 清除房间事件监听器
  const cleanupRoomEventListeners = () => {
    // 如果事件监听器未激活，则不需要清除
    if (!eventListenersActive.value) {
      console.log('事件监听器未激活，不需要清除')
      return
    }

    console.log('清除房间事件监听器')

    // 移除所有事件监听器
    window.removeEventListener('roomJoined', handleRoomJoined)
    window.removeEventListener('roomLeft', handleRoomLeft)
    window.removeEventListener('roleChanged', handleRoleChanged)
    window.removeEventListener('roomStatusUpdate', handleRoomStatusUpdate)
    window.removeEventListener('spectatorJoined', handleSpectatorJoined)
    window.removeEventListener('playerJoined', handlePlayerJoined)
    window.removeEventListener('spectatorLeft', handleSpectatorLeft)
    window.removeEventListener('playerLeft', handlePlayerLeft)
    window.removeEventListener('spectatorMoveToPlayer', handleSpectatorMoveToPlayer)
    window.removeEventListener('playerMoveToSpectator', handlePlayerMoveToSpectator)
    window.removeEventListener('gameStarted', handleGameStarted)
    window.removeEventListener('teamUpdate', handleTeamUpdate)
    window.removeEventListener('newMessage', handleNewMessage)
    window.removeEventListener('socketError', handleSocketError)
    window.removeEventListener('socketReconnected', handleSocketReconnected)
    window.removeEventListener('roomListUpdated', handleRoomListUpdated)

    // 移除语音通信相关的事件监听器
    window.removeEventListener('voiceChannelJoined', handleVoiceChannelJoined)
    window.removeEventListener('voiceChannelLeft', handleVoiceChannelLeft)
    window.removeEventListener('voiceChannelUsers', handleVoiceChannelUsers)
    window.removeEventListener('userJoinedVoiceChannel', handleUserJoinedVoiceChannel)
    window.removeEventListener('userLeftVoiceChannel', handleUserLeftVoiceChannel)
    window.removeEventListener('voiceMuteUpdate', handleVoiceMuteUpdate)
    window.removeEventListener('voiceData', handleVoiceData)

    // 移除选人选边相关的事件监听器
    window.removeEventListener('playerSelected', handlePlayerSelectedEvent)
    window.removeEventListener('teamSelectedSide', handleTeamSelectedSideEvent)

    // 移除Socket.io事件监听器
    const socketStore = useSocketStore()
    const socket = socketStore.getSocket()
    if (socket) {
      // 移除所有事件监听器
      socket.off('player.selected')
      socket.off('team.selected_side')
      socket.off('new_message')
      socket.off('roomJoined')
      socket.off('roleChanged')
      socket.off('roomStatusUpdate')
      socket.off('spectatorJoined')
      socket.off('playerJoined')
      socket.off('spectatorLeft')
      socket.off('playerLeft')
      socket.off('spectatorMoveToPlayer')
      socket.off('playerMoveToSpectator')
      socket.off('gameStarted')
      socket.off('playerStatusUpdate')
      socket.off('teamUpdate')
      socket.off('socketError')
      socket.off('socketReconnected')
      console.log('Socket.io 事件监听器已移除')
    }

    // 设置事件监听器状态为非激活
    eventListenersActive.value = false

    console.log('已清除房间事件监听器')
  }

  // 处理roomJoined事件
  const handleRoomJoined = (event) => {
    console.log('收到roomJoined事件:', event.detail)
    try {
      if (!event.detail) {
        console.error('roomJoined事件数据为空')
        return
      }

      if (event.detail.status !== 'success') {
        console.error('事件状态不是成功:', event.detail.status, event.detail.message)
        return
      }

      // 更新房间数据
      if (event.detail.data?.room) {
        console.log('使用roomJoined事件中的房间数据更新本地房间数据')
        setCurrentRoom(event.detail.data.room)

        // 获取房间ID
        const roomId = event.detail.data.room.id

        // 如果有语音频道数据，确保已经更新到currentRoom中
        if (event.detail.data.voiceChannels && currentRoom.value) {
          console.log('从 roomJoined 事件中更新语音频道数据:', event.detail.data.voiceChannels)
          currentRoom.value.voiceChannels = event.detail.data.voiceChannels
        }

        // 导航到房间详情页
        console.log(`成功加入房间，导航到房间详情页: /room/${roomId}`)

        // 检查当前路径是否已经是房间详情页
        const currentPath = router.currentRoute.value.path
        const targetPath = `/room/${roomId}`

        if (currentPath !== targetPath) {
          // 使用setTimeout确保导航发生在事件处理完成后
            router.push(targetPath)
        } else {
          console.log('已经在房间详情页，不需要导航')
        }
      } else {
        console.warn('roomJoined事件中没有房间数据')
      }

      // 加载聊天历史
      if (event.detail.data?.room.messages) {
        loadMessages(event.detail.data.room.messages, true)
      }
    } catch (error) {
      console.error('处理roomJoined事件时出错:', error)
    }
  }

  // 处理roomLeft事件
  const handleRoomLeft = (event) => {
    console.log('收到roomLeft事件:', event.detail)
    try {
      if (!event.detail) {
        console.error('roomLeft事件数据为空')
        return
      }

      if (event.detail.status !== 'success') {
        console.error('事件状态不是成功:', event.detail.status, event.detail.message)
        return
      }

      console.log('当前用户离开房间，准备跳转')

      // 设置正在离开房间状态，避免显示“房间不存在”提示
      isLeavingRoom.value = true

      // 清除玩家本地的 roomStore.currentRoom 缓存
      console.log('清除本地房间缓存数据')
      setCurrentRoom(null)

      // 不再在离开房间时清除事件监听器
      // 只在断开WebSocket连接时才清除事件监听器
      console.log('离开房间时保留事件监听器，以便接收其他房间的事件')

      // 跳转到上一个路由
      const prevRoute = previousRoute.value || '/rooms'
      console.log(`离开房间后跳转到上一个路由: ${prevRoute}`)

      // 使用setTimeout确保跳转发生
      router.push(prevRoute)
      // 跳转完成后重置离开房间状态
      isLeavingRoom.value = false

      ElMessage.success('成功离开房间')
    } catch (error) {
      console.error('处理roomLeft事件时出错:', error)

      // 即使出错，也尝试清除缓存
      setCurrentRoom(null)
      isLeavingRoom.value = false // 重置离开房间状态
    }
  }

  // 处理roleChanged事件
  const handleRoleChanged = (event) => {
    console.log('收到roleChanged事件:', event.detail)
    if (event.detail && event.detail.status === 'success') {
      // 如果是当前用户角色变更，不显示提示，因为在操作函数中已经显示了
      const changedUserId = event.detail.data?.userId
      if (changedUserId !== userStore.userId) {
        ElMessage.success(event.detail.message || '角色已变更')
      }

      // 直接使用事件返回的房间数据更新房间状态
      if (event.detail.data?.room) {
        setCurrentRoom(event.detail.data.room)
      }
    }
  }

  // 处理roomStatusUpdate事件
  const handleRoomStatusUpdate = (event) => {
    console.log('收到roomStatusUpdate事件:', event.detail)
    if (event.detail && event.detail.roomId && currentRoom.value) {
      if (event.detail.roomId === currentRoom.value.id) {
        // 更新房间状态
        currentRoom.value.status = event.detail.status
        // 重新获取房间详情
        fetchRoomDetail(event.detail.roomId)
      }
    }
  }

  // 处理spectatorJoined事件
  const handleSpectatorJoined = (event) => {
    console.log('收到spectatorJoined事件:', event.detail)
    if (event.detail && currentRoom.value) {
      // 确保观众列表存在
      if (!currentRoom.value.spectators) {
        currentRoom.value.spectators = []
      }
      // 添加新观众
      currentRoom.value.spectators.push(event.detail)
    }
  }

  // 处理playerJoined事件
  const handlePlayerJoined = (event) => {
    console.log('收到playerJoined事件:', event.detail)
    if (event.detail && currentRoom.value) {
      // 确保玩家列表存在
      if (!currentRoom.value.players) {
        currentRoom.value.players = []
      }
      // 添加新玩家
      currentRoom.value.players.push(event.detail)
    }
  }

  // 处理spectatorLeft事件
  const handleSpectatorLeft = (event) => {
    console.log('收到spectatorLeft事件:', event.detail)
    if (event.detail && event.detail.userId && currentRoom.value && currentRoom.value.spectators) {
      // 从观众列表中移除该用户
      currentRoom.value.spectators = currentRoom.value.spectators.filter(
        spectator => spectator.userId !== event.detail.userId
      )
    }
  }

  // 处理playerLeft事件
  const handlePlayerLeft = (event) => {
    console.log('收到playerLeft事件:', event.detail)
    if (event.detail && event.detail.userId && currentRoom.value && currentRoom.value.players) {
      // 从玩家列表中移除该用户
      currentRoom.value.players = currentRoom.value.players.filter(
        player => player.userId !== event.detail.userId
      )
    }
  }

  // 处理spectatorMoveToPlayer事件
  const handleSpectatorMoveToPlayer = (event) => {
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
  }

  // 处理playerMoveToSpectator事件
  const handlePlayerMoveToSpectator = (event) => {
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
  }

  // 处理gameStarted事件
  const handleGameStarted = (event) => {
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
  }

  // 处理teamUpdate事件
  const handleTeamUpdate = (event) => {
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
  }

  // 处理newMessage事件
  const handleNewMessage = (event) => {
    console.log('收到newMessage事件（在room.js中）:', event.detail)
    if (event.detail) {
      // 添加新消息到消息列表
      addMessage(event.detail)
    }
  }

  // 处理socketError事件
  const handleSocketError = (event) => {
    console.error('收到socketError事件:', event.detail)
    if (event.detail && event.detail.message) {
      ElMessage.error(event.detail.message)

      // 根据错误代码执行不同操作
      if (event.detail.code === 3001) { // 房间不存在
        router.push('/rooms')
      } else if (event.detail.code === 3003) { // 用户不在房间中
        fetchRoomDetail(currentRoom.value?.id)
      } else if (event.detail.code === 3004 || (event.detail.message && event.detail.message.includes('密码'))) { // 密码错误
        // 这里不处理密码错误，由组件处理
      } else if (event.detail.code === 3005) { // 玩家列表已满
        ElMessage.warning('玩家列表已满，无法加入')
      }
    }
  }

  // 处理socketReconnected事件
  const handleSocketReconnected = (event) => {
    console.log('收到socketReconnected事件:', event.detail)
    if (event.detail && event.detail.roomId) {
      // 在WebSocket重连后，刷新房间数据
      console.log(`WebSocket重连后刷新房间数据，房间ID: ${event.detail.roomId}`)

      // 刷新房间数据，但不自动加入房间
      fetchRoomDetail(event.detail.roomId)
    }
  }

  // 处理语音通信相关事件
  const handleVoiceChannelJoined = (event) => {
    console.log('[语音事件] 收到voiceChannelJoined事件:', event.detail)
    if (event.detail && event.detail.status === 'success') {
      // 更新当前语音房间
      const channel = event.detail.data?.channel
      if (channel) {
        ElMessage.success(`成功加入${channel === 'public' ? '公共' : (channel === 'team1' ? '一队' : '二队')}语音房间`)

        // 将用户添加到语音频道中
        if (event.detail.data) {
          // 检查是否是自己的事件
          const isCurrentUser = event.detail.data.userId === userStore.userId;
          console.log(`[语音事件] 用户ID: ${event.detail.data.userId}, 当前用户ID: ${userStore.userId}, 是否是自己: ${isCurrentUser}`)

          if (isCurrentUser) {
            console.log(`[语音事件] 用户 ${event.detail.data.userId} 已在 ${channel} 频道中，不重复添加`)
            return;
          }

          // 处理用户数据，确保包含必要的信息
          const userData = {
            userId: event.detail.data.userId,
            username: event.detail.data.username,
            channel: event.detail.data.channel,
            teamId: event.detail.data.teamId,
            role: event.detail.data.role
          }

          // 添加用户到语音频道
          console.log(`[语音事件] 添加用户 ${userData.userId} 到 ${channel} 频道`)
          addUserToVoiceChannel(userData)

          // 强制触发UI更新
          if (currentRoom.value && currentRoom.value.voiceChannels) {
            currentRoom.value.voiceChannels = { ...currentRoom.value.voiceChannels }
          }
        }
      }
    }
  }

  const handleVoiceChannelLeft = (event) => {
    console.log('收到voiceChannelLeft事件:', event.detail)
    if (event.detail && event.detail.status === 'success') {
      // 将用户从语音频道中移除
      if (event.detail.data) {
        // 处理用户数据，确保包含必要的信息
        const userData = {
          userId: event.detail.data.userId,
          previousChannel: event.detail.data.previousChannel || event.detail.data.channel
        }

        // 从语音频道移除用户
        removeUserFromVoiceChannel(userData)

        // 强制触发UI更新
        if (currentRoom.value && currentRoom.value.voiceChannels) {
          currentRoom.value.voiceChannels = { ...currentRoom.value.voiceChannels }
        }

        // 显示提示消息
        const channel = userData.previousChannel
        if (channel) {
          ElMessage.info(`用户 ${event.detail.data.username || event.detail.data.userId} 离开了${channel === 'public' ? '公共' : (channel === 'team1' ? '一队' : '二队')}语音房间`)
        }
      }
    }
  }

  const handleVoiceChannelUsers = (event) => {
    console.log('[语音事件] 收到voiceChannelUsers事件:', event.detail)
    if (event.detail && event.detail.channel && Array.isArray(event.detail.users)) {
      // 在更新语音频道用户列表前打印详细日志
      console.log(`[语音事件] 处理${event.detail.channel}语音频道用户列表，共${event.detail.users.length}个用户`)

      // 检查当前频道中的用户
      const currentUsers = currentRoom.value &&
                         currentRoom.value.voiceChannels &&
                         currentRoom.value.voiceChannels[event.detail.channel] ?
                         currentRoom.value.voiceChannels[event.detail.channel] : [];

      console.log(`[语音事件] 当前频道中已有 ${currentUsers.length} 个用户`);

      // 如果当前频道用户列表和新列表相同，不需要更新
      if (currentUsers.length === event.detail.users.length) {
        const allUsersExist = event.detail.users.every(newUser =>
          currentUsers.some(existingUser => existingUser.userId === newUser.userId)
        );

        if (allUsersExist) {
          console.log(`[语音事件] 频道用户列表无变化，不需要更新`);
          return;
        }
      }

      // 处理用户数据，确保包含必要的信息
      const processedUsers = event.detail.users.map(user => {
        // 如果用户已经有完整信息，直接使用
        if (user.username && user.avatar) {
          return user
        }

        // 否则尝试从玩家列表或观众列表中查找用户信息
        let username = user.username
        let avatar = user.avatar

        if (!username && roomData.value) {
          // 从玩家列表中查找
          const player = players.value.find(p => p.userId === user.userId)
          if (player) {
            username = player.username
            avatar = player.avatar
          } else {
            // 从观众列表中查找
            const spectator = spectators.value.find(s => s.userId === user.userId)
            if (spectator) {
              username = spectator.username
              avatar = spectator.avatar
            }
          }
        }

        // 返回包含完整信息的用户对象
        return {
          ...user,
          username: username || '未知用户',
          avatar: avatar || ''
        }
      })

      // 更新语音频道用户列表
      console.log(`[语音事件] 更新 ${event.detail.channel} 频道用户列表，共 ${processedUsers.length} 个用户`);
      updateVoiceChannelUsers(event.detail.channel, processedUsers)

      // 如果当前正在该频道，强制更新UI
      if (currentVoiceChannel.value === event.detail.channel) {
        console.log('[语音事件] 当前正在该频道，强制更新UI')
        // 使用触发响应式更新
        if (currentRoom.value && currentRoom.value.voiceChannels) {
          currentRoom.value.voiceChannels = { ...currentRoom.value.voiceChannels }
        }
      }
    }
  }

  const handleUserJoinedVoiceChannel = (event) => {
    console.log('[语音事件] 收到userJoinedVoiceChannel事件:', event.detail)
    if (event.detail) {
      // 在添加用户到语音频道前打印详细日志
      console.log(`[语音事件] 用户 ${event.detail.userId} 加入了 ${event.detail.channel} 语音频道`)

      // 检查是否是自己的事件
      const isCurrentUser = event.detail.userId === userStore.userId;
      console.log(`[语音事件] 用户ID: ${event.detail.userId}, 当前用户ID: ${userStore.userId}, 是否是自己: ${isCurrentUser}`)

      // 检查该用户是否已在语音频道中
      const userAlreadyInChannel = currentRoom.value &&
                                 currentRoom.value.voiceChannels &&
                                 currentRoom.value.voiceChannels[event.detail.channel] &&
                                 currentRoom.value.voiceChannels[event.detail.channel].some(u => u.userId === event.detail.userId);

      console.log(`[语音事件] 用户是否已在频道中: ${userAlreadyInChannel}`)

      // 如果用户已在频道中，不重复添加
      if (userAlreadyInChannel) {
        console.log(`[语音事件] 用户 ${event.detail.userId} 已在 ${event.detail.channel} 频道中，不重复添加`)
        return;
      }

      // 处理用户数据，确保包含必要的信息
      let userData = { ...event.detail }

      // 如果用户数据不完整，尝试从玩家列表或观众列表中查找
      if (!userData.username && roomData.value) {
        // 从玩家列表中查找
        const player = players.value.find(p => p.userId === userData.userId)
        if (player) {
          userData.username = player.username
          userData.avatar = player.avatar
        } else {
          // 从观众列表中查找
          const spectator = spectators.value.find(s => s.userId === userData.userId)
          if (spectator) {
            userData.username = spectator.username
            userData.avatar = spectator.avatar
          }
        }
      }

      // 添加用户到语音频道
      console.log(`[语音事件] 添加用户 ${userData.userId} 到 ${userData.channel} 频道`)
      addUserToVoiceChannel(userData)

      // 如果当前正在该频道，强制更新UI
      if (currentVoiceChannel.value === userData.channel) {
        console.log('[语音事件] 当前正在该频道，强制更新UI')
        // 使用触发响应式更新
        if (currentRoom.value && currentRoom.value.voiceChannels) {
          currentRoom.value.voiceChannels = { ...currentRoom.value.voiceChannels }
        }
      }
    }
  }

  const handleUserLeftVoiceChannel = (event) => {
    console.log('收到userLeftVoiceChannel事件:', event.detail)
    if (event.detail) {
      // 在移除用户前打印详细日志
      console.log(`用户 ${event.detail.userId} 离开了 ${event.detail.previousChannel} 语音频道`)

      // 移除用户
      removeUserFromVoiceChannel(event.detail)

      // 如果当前正在该频道，强制更新UI
      if (currentVoiceChannel.value === event.detail.previousChannel) {
        console.log('当前正在该频道，强制更新UI')
        // 使用触发响应式更新
        if (currentRoom.value && currentRoom.value.voiceChannels) {
          currentRoom.value.voiceChannels = { ...currentRoom.value.voiceChannels }
        }
      }
    }
  }

  const handleVoiceMuteUpdate = (event) => {
    console.log('收到voiceMuteUpdate事件:', event.detail)
    if (event.detail && event.detail.userId) {
      // 在更新用户静音状态前打印详细日志
      console.log(`用户 ${event.detail.userId} 在 ${event.detail.channel} 频道的静音状态更新为 ${event.detail.isMuted ? '静音' : '非静音'}`)

      // 更新用户静音状态
      updateUserMuteStatus(event.detail.userId, event.detail.isMuted, event.detail.channel)

      // 如果当前正在该频道，强制更新UI
      if (currentVoiceChannel.value === event.detail.channel) {
        console.log('当前正在该频道，强制更新UI')
        // 使用触发响应式更新
        if (currentRoom.value && currentRoom.value.voiceChannels) {
          currentRoom.value.voiceChannels = { ...currentRoom.value.voiceChannels }
        }
      }
    }
  }

  const handleVoiceData = (event) => {
    // 不输出所有语音数据日志，避免刷屏
    if (event.detail && voiceInstance.value) {
      // 每秒只输出一次日志
      const now = Date.now();
      if (!handleVoiceData.lastLogTime || now - handleVoiceData.lastLogTime > 5000) {
        console.log(`[语音事件] 收到语音数据，来自用户: ${event.detail.from}, 数据大小: ${event.detail.data?.byteLength || 0} 字节`);
        handleVoiceData.lastLogTime = now;

        // 输出当前语音状态
        console.log(`[语音状态] 当前语音频道: ${currentVoiceChannel.value}, 是否静音: ${isMuted.value}`);
      }

      // 处理语音数据
      voiceInstance.value.handleVoiceData(event.detail);
    }
  }

  // 处理选人选边相关事件
  const handlePlayerSelectedEvent = (event) => {
    console.log('收到playerSelected事件:', event.detail)
    if (event.detail && event.detail.status === 'success') {
      const { teamId, playerId, playerName, playerAvatar } = event.detail.data

      // 添加到已选择列表
      pickedCharacters.value.push({
        characterId: playerId,
        characterName: playerName,
        characterAvatar: playerAvatar,
        teamId: teamId,
        pickOrder: pickedCharacters.value.length + 1
      })

      // 更新选人进度
      pickingPhase.value.currentPick = pickedCharacters.value.length + 1
      pickingPhase.value.currentTeam = teamId === 1 ? 2 : 1 // 切换队伍

      // 更新房间数据
      if (event.detail.data.room) {
        setCurrentRoom(event.detail.data.room)
      }

      // 显示提示
      ElMessage.success(`${teamId}队选择了 ${playerName}`)
    }
  }

  const handleTeamSelectedSideEvent = (event) => {
    console.log('收到teamSelectedSide事件:', event.detail)
    if (event.detail && event.detail.status === 'success') {
      const { teamId, side } = event.detail.data

      // 更新队伍选边信息
      if (currentRoom.value && currentRoom.value.teams) {
        const team = currentRoom.value.teams.find(t => t.id === teamId)
        if (team) {
          team.side = side
        }

        // 设置另一个队伍的边
        const otherTeam = currentRoom.value.teams.find(t => t.id !== teamId)
        if (otherTeam) {
          otherTeam.side = side === 'red' ? 'blue' : 'red'
        }
      }

      // 更新房间状态
      if (event.detail.data.room) {
        setCurrentRoom(event.detail.data.room)
      }

      // 显示提示
      ElMessage.success(`${teamId}队选择了${side === 'red' ? '红' : '蓝'}方`)
    }
  }

  // 检查事件监听器状态
  const areEventListenersActive = () => {
    return eventListenersActive.value
  }

  return {
    // 状态 - 房间列表相关
    rooms,
    currentRoom,
    loading,
    error,
    isLeavingRoom,
    pagination,
    previousRoute,

    // 事件监听器相关
    setupRoomEventListeners,
    cleanupRoomEventListeners,
    areEventListenersActive,

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
    leaveRoom,
    updateRoomSettings,
    joinAsPlayer,
    joinAsSpectator,
    throttledFetchRooms,
    removeRoomFromList,
    handleRoomListUpdated,
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
    formatChatMessage,
    formatDateTime,
    teamColor,

    // 消息管理方法
    addMessage,
    loadMessages,
    clearMessages,

    // 语音通信相关状态
    isMuted,
    currentVoiceChannel,
    currentVoiceUsers,
    micVolume,
    speakerVolume,

    // 语音通信相关方法
    switchVoiceChannel,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    setMicVolume,
    setSpeakerVolume,
    updateVoiceChannelUsers,
    addUserToVoiceChannel,
    removeUserFromVoiceChannel,
    updateUserMuteStatus,
    initVoiceCommunication,
    cleanupVoice
  }
})