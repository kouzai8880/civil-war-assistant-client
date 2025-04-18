<script setup>
import { ref, onMounted, computed, watch, nextTick, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useRoomStore } from '../stores/room'
import { useSocketStore } from '../stores/socket'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, MuteNotification } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const roomStore = useRoomStore()
const socketStore = useSocketStore()

// 房间ID
const roomId = computed(() => route.params.id)

// 房间详情
// const room = computed(() => roomStore.currentRoom)

// 处理嵌套的房间数据结构
const roomData = computed(() => {
  if (!roomStore.currentRoom) return null
  return roomStore.currentRoom.room ? roomStore.currentRoom.room : roomStore.currentRoom
})

// 玩家列表
const players = computed(() => {
  if (!roomData.value) return []
  return roomData.value.players || []
})

// 观众列表
const spectators = computed(() => {
  if (!roomData.value) return []
  return roomData.value.spectators || []
})

// 当前用户ID
const currentUserId = computed(() => userStore.userId)



// 用户是否是房主
const isCreator = computed(() => {
  if (!roomData.value || !currentUserId.value) return false

  return roomData.value.creatorId === currentUserId.value
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

// 根据消息类型过滤消息
const filteredMessages = computed(() => {
  console.log('消息数量:', (messages.value[activeChat.value] || []).length);
  // 如果不是公共聊天，或者选择了显示所有消息，直接返回全部消息
  if (activeChat.value !== 'public' || activeMessageType.value === 'all') {
    return messages.value[activeChat.value] || [];
  }

  // 如果选择了只显示系统消息
  if (activeMessageType.value === 'system') {
    return (messages.value[activeChat.value] || []).filter(msg =>
      msg.isSystem || msg.userId === 'system'
    );
  }

  // 如果选择了只显示普通消息
  if (activeMessageType.value === 'normal') {
    return (messages.value[activeChat.value] || []).filter(msg =>
      !msg.isSystem && msg.userId !== 'system'
    );
  }
  // 默认返回全部消息
  return messages.value[activeChat.value] || [];
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

// 当前选人阶段
const pickingPhase = ref({
  currentPick: 1,
  currentTeam: 1,
  pickPattern: [1, 2, 2, 2, 1] // 默认使用12221模式
})

// 加载状态
const isLoading = ref(false)

// 已移除选择角色弹窗
// const characterPickingVisible = ref(false)

// 选择边弹窗
const sideSelectorVisible = ref(false)



// 当前选择的边
const selectedSide = ref(null)

// 侧边栏状态
// 已移除 sidebarCollapsed

// 当前激活的聊天标签
const activeChat = ref('public')

// 当前激活的消息类型标签
const activeMessageType = ref('all') // 'all', 'normal', 'system'

// 聊天消息 - 从 Store 获取
const messages = computed(() => roomStore.messages)

// 聊天输入
const chatInput = ref('')



// 语音相关状态已移至 roomStore

// 常用的英雄头像列表，用于随机分配给玩家
const championIcons = [
  'Ahri', 'Annie', 'Ashe', 'Caitlyn', 'Darius',
  'Ezreal', 'Garen', 'Jinx', 'Lux', 'Malphite',
  'Nami', 'Syndra', 'Thresh', 'Yasuo', 'Zed',
  'Akali', 'Ekko', 'Fiora', 'Irelia', 'Jhin',
  'Kaisa', 'LeeSin', 'Lulu', 'MasterYi', 'Pyke',
  'Riven', 'Sett', 'Vayne', 'Yone', 'Yuumi'
]

// 生成英雄头像URL
const getChampionIcon = (index) => {
  const champion = championIcons[index % championIcons.length]
  return `https://ddragon.leagueoflegends.com/cdn/13.12.1/img/champion/${champion}.png`
}

// 已选择的玩家
const pickedCharacters = ref([])

// 待选玩家计算属性
const availablePlayers = computed(() => {
  if (!roomData.value || !players.value) return []

  // 获取队伍信息
  const teams = roomData.value.teams || []

  // 获取队长的用户ID
  const captainIds = teams.map(team => team.captainId?.id || team.captainId).filter(Boolean)

  // 获取已经被选择的玩家ID
  const pickedPlayerIds = pickedCharacters.value.map(char => char.characterId)

  console.log('计算待选玩家，队长IDs:', captainIds)
  console.log('计算待选玩家，已选择玩家IDs:', pickedPlayerIds)
  console.log('计算待选玩家，所有玩家:', players.value)

  // 从玩家列表中筛选出未被选择的非队长玩家
  const filteredPlayers = players.value
    .filter(player => {
      // 排除队长
      if (captainIds.includes(player.userId)) {
        console.log(`玩家 ${player.username} 是队长，排除`)
        return false
      }

      // 排除已经被选择的玩家
      if (pickedPlayerIds.includes(player.userId)) {
        console.log(`玩家 ${player.username} 已被选择，排除`)
        return false
      }

      // 排除已经分配到队伍的玩家
      if (player.teamId) {
        // 如果玩家已经分配到队伍，但不在pickedCharacters中，则添加到pickedCharacters
        if (!pickedPlayerIds.includes(player.userId)) {
          console.log(`玩家 ${player.username} 已分配到队伍 ${player.teamId}，但不在pickedCharacters中，添加到pickedCharacters`)
          pickedCharacters.value.push({
            characterId: player.userId,
            characterName: player.username,
            characterAvatar: player.avatar || getChampionIcon(players.value.indexOf(player)),
            teamId: player.teamId,
            pickOrder: pickedCharacters.value.length + 1
          })
        }
        console.log(`玩家 ${player.username} 已分配到队伍 ${player.teamId}，排除`)
        return false
      }

      console.log(`玩家 ${player.username} 可选择`)
      return true
    })
    .map(player => ({
      id: player.userId,
      name: player.username,
      avatar: player.avatar || getChampionIcon(players.value.indexOf(player))
    }))

  console.log('计算待选玩家结果:', filteredPlayers)
  return filteredPlayers
})

/**
 * 更新房间状态和相关数据
 * @param {string} phase - 要设置的房间阶段，可选值：'waiting'(等待中), 'picking'(选人阶段), 'side-picking'(选边阶段), 'gaming'(游戏中), 'waiting-game'(等待游戏开始)
 */
const updateRoomPhase = (phase) => {
  if (!roomData.value) {
    console.warn('无法更新房间状态：房间数据不存在')
    return
  }

  console.log(`更新房间状态为: ${phase}`)

  // 创建一个临时的房间对象
  const updatedRoom = {...roomData.value, status: phase}

  // 如果是选人阶段，设置两个队长
  if (phase === 'picking') {
    // 确保有两个队伍
    if (!updatedRoom.teams || updatedRoom.teams.length < 2) {
      updatedRoom.teams = [
        { id: 1, name: '一队', side: null },
        { id: 2, name: '二队', side: null }
      ]
    }

    // 确保players数组已初始化
    if (!updatedRoom.players) {
      updatedRoom.players = [];
    }

    // 分配队长
    let teamOneCaptainSet = false;
    let teamTwoCaptainSet = false;

    updatedRoom.players = updatedRoom.players.map(player => {
      if (player.teamId === 1 && !teamOneCaptainSet) {
        player.isCaptain = true;
        teamOneCaptainSet = true;
      } else if (player.teamId === 2 && !teamTwoCaptainSet) {
        player.isCaptain = true;
        teamTwoCaptainSet = true;
      } else {
        player.isCaptain = false;
      }
      return player;
    })

    // 确定使用的BP模式
    const mode = updatedRoom.pickMode || '12221';

    // 重置选人状态
    pickingPhase.value = {
      currentPick: 1,
      currentTeam: 1,
      pickPattern: mode === '12221' ? [1, 2, 2, 2, 1] : [1, 2, 2, 1, 1]
    }

    pickedCharacters.value = []
  } else if (phase === 'side-picking') {
    if (!updatedRoom.teams || updatedRoom.teams.length < 2) {
      updatedRoom.teams = [
        { id: 1, name: '一队', side: null },
        { id: 2, name: '二队', side: null }
      ]
    }

    // 确保players数组已初始化
    if (!updatedRoom.players) {
      updatedRoom.players = [];
    }

    // 如果没有选择玩家，则使用后端返回的队伍信息
    if (pickedCharacters.value.length === 0 && roomData.value?.teams) {
      // 遍历玩家列表，将已经分配到队伍的非队长玩家添加到已选择列表
      const teamPlayers = players.value.filter(p => p.teamId && !p.isCaptain);

      console.log('使用后端返回的队伍信息初始化已选择玩家列表:', teamPlayers);

      // 将已分配队伍的玩家添加到已选择列表
      teamPlayers.forEach((player, index) => {
        pickedCharacters.value.push({
          characterId: player.userId,
          characterName: player.username,
          characterAvatar: player.avatar || getChampionIcon(index),
          teamId: player.teamId,
          pickOrder: index + 1
        });
      });
    }
  } else if (phase === 'waiting-game') {
    // 确保队伍数组存在
    if (updatedRoom.teams && updatedRoom.teams.length >= 2) {
      updatedRoom.teams[0].side = selectedSide.value === 'red' ? 'red' : 'blue'
      updatedRoom.teams[1].side = selectedSide.value === 'red' ? 'blue' : 'red'
    }
  }

  // 更新到 roomStore
  roomStore.setCurrentRoom(updatedRoom)

  // 返回更新后的房间对象，便于链式调用
  return updatedRoom
}

// 选择玩家
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
  socketStore.captainSelectPlayer(
    roomId.value,
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

// 更新选择进度
const updatePickingProgress = () => {
  // 确定使用的BP模式
  const mode = roomData.value?.pickMode || '12221';

  // 根据模式设置选人模式
  if (mode === '12221') {
    pickingPhase.value.pickPattern = [1, 2, 2, 2, 1];
  } else {
    // 默认使用12211模式
    pickingPhase.value.pickPattern = [1, 2, 2, 1, 1];
  }

  const pattern = pickingPhase.value.pickPattern;
  const currentPick = pickingPhase.value.currentPick;

  // 检查是否已完成所有选择
  const totalPicks = getTotalPickCount();
  if (pickedCharacters.value.length >= totalPicks) {
    // 进入选边阶段
    console.log('所有玩家已选择完毕，进入选边阶段');
    // 这里可以添加调用后端 API 的代码，通知服务器进入选边阶段
    // 例如: await roomApi.updateRoomStatus(roomId.value, 'side-picking')

    // 更新房间状态为选边阶段
    updateRoomPhase('side-picking');
    return;
  }

  // 更新当前选择信息
  pickingPhase.value.currentPick++;

  // 确定下一个选择的队伍
  // 根据当前选择进度和选人模式确定下一个选择的队伍
  console.log('当前选人模式:', mode);
  console.log('当前选人进度:', currentPick);
  console.log('当前选人模式数组:', pattern);

  // 计算当前处于哪个阶段
  let totalPicked = 0;
  let phaseIndex = 0;

  // 遍历选人模式数组，找出当前处于哪个阶段
  for (let i = 0; i < pattern.length; i++) {
    totalPicked += pattern[i];
    // 如果当前选择数量小于累计选择数量，则当前处于该阶段
    if (currentPick < totalPicked) {
      phaseIndex = i;
      break;
    }
  }

  // 确定下一个选择的队伍
  if (phaseIndex < pattern.length) {
    // 如果是奇数阶段，则是一队选择，否则是二队选择
    pickingPhase.value.currentTeam = (phaseIndex % 2 === 0) ? 1 : 2;
    console.log(`当前处于第 ${phaseIndex + 1} 阶段，下一个选择的队伍是 ${pickingPhase.value.currentTeam} 队`);
  } else {
    // 如果超出了pattern的范围，服务器会自动选择
    // 这里模拟自动选择，默认选择最后一个队伍
    const remainingCount = totalPicks - pickedCharacters.value.length;
    if (remainingCount > 0) {
      // 使用上一个选择的队伍的对手队伍
      const nextTeam = pickingPhase.value.currentTeam === 1 ? 2 : 1;
      autoPickForTeam(nextTeam);
    } else {
      updateRoomPhase('side-picking');
      return;
    }
  }

}

// 获取总共需要选择的玩家数量
const getTotalPickCount = () => {
  // 获取队伍信息
  const teams = roomData.value?.teams || [];

  // 获取队长数量
  const captainCount = teams.length;

  // 总玩家数量
  const totalPlayerCount = roomData.value?.playerCount || 10;

  // 需要选择的玩家数量 = 总玩家数量 - 队长数量
  return totalPlayerCount - captainCount;
}

// 自动为队伍选择玩家
const autoPickForTeam = (teamId) => {
  // 使用计算属性获取可用玩家
  const availablePlayersList = availablePlayers.value;

  if (availablePlayersList.length > 0) {
    // 随机选择一个玩家
    const randomIndex = Math.floor(Math.random() * availablePlayersList.length);
    const selectedPlayer = availablePlayersList[randomIndex];

    // 添加到已选择列表
    pickedCharacters.value.push({
      characterId: selectedPlayer.id,
      characterName: selectedPlayer.name,
      characterAvatar: selectedPlayer.avatar,
      teamId: teamId,
      pickOrder: pickingPhase.value.currentPick
    });

    // 尝试在后端更新玩家的队伍ID
    try {
      // 这里可以添加调用后端 API 的代码
      console.log(`将玩家 ${selectedPlayer.name} 分配到队伍 ${teamId}`)
    } catch (error) {
      console.error('更新玩家队伍失败:', error)
    }

    // 继续更新选择进度
    updatePickingProgress();
  }
}

// 初始化已选择玩家列表
const initializePickedCharacters = () => {
  // 清空已选择列表
  pickedCharacters.value = []

  // 获取队伍信息
  const teams = roomData.value?.teams || []

  // 获取队长的用户ID
  const captainIds = teams.map(team => team.captainId?.id || team.captainId).filter(Boolean)

  console.log('初始化已选择玩家列表，队长IDs:', captainIds)
  console.log('初始化已选择玩家列表，所有玩家:', players.value)

  // 遍历玩家列表，将已经分配到队伍的非队长玩家添加到已选择列表
  const teamPlayers = players.value.filter(p => {
    // 必须有teamId属性
    if (!p.teamId) return false

    // 不能是队长
    if (captainIds.includes(p.userId)) return false

    return true
  })

  console.log('初始化已选择玩家列表，已分配队伍的非队长玩家:', teamPlayers)

  // 将已分配队伍的玩家添加到已选择列表
  teamPlayers.forEach((player, index) => {
    pickedCharacters.value.push({
      characterId: player.userId,
      characterName: player.username,
      characterAvatar: player.avatar || getChampionIcon(index),
      teamId: player.teamId,
      pickOrder: index + 1
    })
  })

  console.log('初始化已选择玩家列表完成，结果:', pickedCharacters.value)

  // 更新选人阶段状态
  updatePickingPhaseState()
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
  const mode = roomData.value?.pickMode || '12221';
  const pattern = mode === '12221' ? [1, 2, 2, 2, 1] : [1, 2, 2, 1, 1];

  // 计算已选择的玩家数量
  const pickedCount = pickedCharacters.value.length;

  // 计算当前处于哪个阶段
  let totalPicked = 0;
  let phaseIndex = 0;

  // 遍历选人模式数组，找出当前处于哪个阶段
  for (let i = 0; i < pattern.length; i++) {
    totalPicked += pattern[i];
    // 如果已选择数量小于累计选择数量，则当前处于该阶段
    if (pickedCount < totalPicked) {
      phaseIndex = i;
      break;
    }
  }

  // 确定当前选择的队伍
  const currentTeam = (phaseIndex % 2 === 0) ? 1 : 2;

  console.log(`根据已选择玩家数量(${pickedCount})计算，当前处于第 ${phaseIndex + 1} 阶段，当前选择队伍是 ${currentTeam} 队`);

  // 更新选人阶段状态
  pickingPhase.value.currentTeam = currentTeam;
  pickingPhase.value.currentPick = pickedCount + 1;
  pickingPhase.value.pickPattern = pattern;

  // 强制触发UI更新
  nextTick(() => {
    console.log('强制触发UI更新，当前选人队伍:', pickingPhase.value.currentTeam);
  });
}

// 使用room.js中的事件监听器管理函数



// 加载历史聊天记录
const loadChatHistory = (chatHistory, clearExisting = true) => {
  console.log(`加载历史聊天记录，${clearExisting ? '清空现有消息' : '保留现有消息'}`);

  if (chatHistory.length < 0) {
    return false;
  }

  if (!chatHistory || !Array.isArray(chatHistory)) {
    console.log('没有历史聊天记录或格式不正确');
    return false;
  }

  // 直接使用 roomStore 的 loadMessages 方法加载历史消息
  const success = roomStore.loadMessages(chatHistory, clearExisting);

  // 自动滚动到底部
  nextTick(() => {
    const chatBox = document.querySelector('.chat-messages');
    if (chatBox) {
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  });

  return success; // 返回是否添加了新消息
};

// 密码输入对话框相关状态
const passwordDialogVisible = ref(false)
const passwordInput = ref('')
const passwordError = ref('')
const isJoiningWithPassword = ref(false)

// 尝试加入需要密码的房间
const joinRoomWithPassword = async () => {
  if (!passwordInput.value) {
    passwordError.value = '请输入房间密码'
    return
  }

  isJoiningWithPassword.value = true
  passwordError.value = ''

  try {
    // 使用密码加入房间
    const success = await roomStore.joinRoom(roomId.value, passwordInput.value)

    if (success) {
      passwordDialogVisible.value = false
      passwordInput.value = ''
      // 不需要重新加载房间详情，依赖roomJoined事件获取最新数据
      console.log('密码验证成功，等待roomJoined事件获取最新数据')
    } else {
      passwordError.value = roomStore.error || '密码错误，请重试'
    }
  } catch (error) {
    console.error('加入房间失败:', error)
    passwordError.value = error.message || '加入房间失败，请重试'
  } finally {
    isJoiningWithPassword.value = false
  }
}

// 组件挂载时初始化
onMounted(async () => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    router.push('/login')
    return
  }


  if (!roomStore.previousRoute || roomStore.previousRoute === '')
    roomStore.previousRoute = '/rooms'

  isLoading.value = true

  try {

    // 确保WebSocket连接
    if (!socketStore.isConnected) {
      await socketStore.connect()
    }

    // 检查是否已有房间数据
    const hasRoomData = roomStore.roomData && roomStore.roomData.id === roomId.value

    if (hasRoomData) {
      console.log('已有房间数据，不需要重新获取')
      // 使用现有数据更新UI
      if (roomStore.roomData) {
        // room.value = roomStore.roomData

        // 检查是否有消息数据
        if (roomData.value.messages && roomData.value.messages.length > 0) {
          console.log(`使用缓存的 ${roomData.value.messages.length} 条消息更新聊天记录`);
          loadChatHistory(roomData.value.messages, true);
        }
        // } else {
        //   console.log('缓存的房间数据中没有消息，尝试重新获取');
        //   // 即使有缓存数据，也尝试获取最新消息
        //   refreshRoomDetail(false);
        // }
      }
    } else {
      // 直接发送joinRoom事件，依赖roomJoined事件获取最新数据
      console.log(`用户 ${userStore.username} 尝试加入房间 ${roomId.value}...`)

      // 尝试不带密码加入房间
      const success = await roomStore.joinRoom(roomId.value)

      if (!success) {
        // 如果失败，检查是否是因为需要密码
        if (roomStore.error && roomStore.error.includes('密码')) {
          // 显示密码输入对话框
          passwordDialogVisible.value = true
        } else {
          // 其他错误，显示错误并跳转
          ElMessage.error(roomStore.error || '加入房间失败')
          router.push('/rooms')
        }
      }
      // 成功加入房间后，会通过roomJoined事件获取最新数据
    }
  } catch (error) {
    console.error('加载房间失败:', error)
    ElMessage.error('加载房间失败，请稍后重试')
    router.push('/rooms')
  } finally {
    isLoading.value = false
  }
})


// 组件卸载时只清理语音资源，不清除事件监听器
onUnmounted(() => {
  console.log('组件卸载，不清除事件监听器，事件监听器只在WebSocket断开连接时才清除')

  // 清理语音资源
  if (roomStore.hasJoinedVoice) {
    roomStore.cleanupVoice()
  }
})

// 将用户添加到观众席
const addUserToSpectators = async () => {
  if (!roomData.value || !userStore.userId) return

  try {
    console.log(`用户 ${userStore.username} 尝试加入观众席, 房间ID: ${roomId.value}`)

    // 确保 WebSocket 已连接
    if (!socketStore.isConnected) {
      console.log('WebSocket未连接，尝试连接...')
      await socketStore.connect()
      if (!socketStore.isConnected) {
        throw new Error('WebSocket连接失败，无法加入观众席')
      }
    }

    // 直接使用WebSocket加入观众席
    const success = socketStore.joinAsSpectator(roomId.value)

    if (success) {
      console.log('成功发送加入观众席事件')
    } else {
      throw new Error('发送WebSocket事件失败')
    }
  } catch (error) {
    console.error('加入观众席失败:', error)
    ElMessage.error(error.message || '加入观众席失败，请稍后重试')
  }
}

// 加入队伍
const joinRoom = async () => {
  if (!roomData.value) return

  // 检查玩家数量是否已满
  if (roomData.value.players && roomData.value.players.length >= (roomData.value.playerCount || 10)) {
    ElMessage.warning('对局已满员')
    return
  }

  isLoading.value = true

  try {
    console.log(`用户 ${userStore.username} 尝试加入玩家列表, 房间ID: ${roomId.value}`)

    // 确保 WebSocket 已连接
    if (!socketStore.isConnected) {
      console.log('WebSocket未连接，尝试连接...')
      await socketStore.connect()
      if (!socketStore.isConnected) {
        throw new Error('WebSocket连接失败，无法加入玩家列表')
      }
    }

    // 直接使用WebSocket加入玩家列表
    const success = socketStore.joinAsPlayer(roomId.value)

    if (success) {
      console.log('成功发送加入玩家列表事件')
      // ElMessage.success('正在加入对局...')

      // 重新加载房间数据以获取最新状态
      //await refreshRoomDetail(false)

      // 不再显示第二次成功提示，因为事件处理中会显示
    } else {
      throw new Error('发送WebSocket事件失败')
    }
  } catch (error) {
    console.error('加入对局失败:', error)
    ElMessage.error(error.message || '加入对局失败，请稍后重试')
  } finally {
    isLoading.value = false
  }
}

// 开始游戏
const startGame = async () => {
  if (!roomData.value) {
    console.error('无法开始游戏：房间数据不存在')
    ElMessage.error('房间数据不存在')
    return
  }

  if (!isCreator.value) {
    console.error('无法开始游戏：不是房主')
    ElMessage.warning(`只有房主可以开始游戏（当前用户ID: ${userStore.userId}, 房主ID: ${roomData.value?.creatorId}）`)
    return
  }

  // 检查是否有足够的玩家
  if (!players.value || players.value.length !== 10) {
    console.error('无法开始游戏：玩家数量不足')
    ElMessage.warning('需要 10 名玩家才能开始游戏')
    return
  }

  try {
    console.log('开始游戏...')
    isLoading.value = true

    // 调用开始游戏 API
    const success = await roomStore.startGame()

    if (success) {
      console.log('游戏已开始，服务端返回的房间数据:', roomData.value)
      ElMessage.success('游戏已开始')
      // 重新加载房间数据以获取最新状态
      await refreshRoomDetail(false)
    } else {
      throw new Error(roomStore.error || '开始游戏失败')
    }
  } catch (error) {
    console.error('开始游戏失败', error)
    ElMessage.error(error.message || '开始游戏失败')
  } finally {
    isLoading.value = false
  }
}



// 选择红蓝方
const pickSide = (side) => {
  if (!roomData.value || !isCaptain.value || userTeamId.value !== 1) return

  selectedSide.value = side
  sideSelectorVisible.value = false

  // 使用WebSocket API选择红蓝方
  socketStore.captainSelectSide(
    roomId.value,
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

// 删除重复的startGame函数

// 离开房间
const leaveRoom = async () => {
  if (!roomData.value) {
    console.error('无法离开房间：房间数据不存在')
    router.push('/rooms')
    return
  }

  if (!userStore.userId) {
    console.error('无法离开房间：用户未登录')
    router.push('/login')
    return
  }

  console.log(`${userStore.username} 正在离开房间...`)
  isLoading.value = true

  try {
    // 清除玩家本地的 roomStore.currentRoom 缓存
    // 这样在下次进入房间时不会出现数据混淆
    console.log('清除本地房间缓存数据')
    roomStore.setCurrentRoom(null)

    // 调用socket存储的离开房间方法
    // 不需要处理回调，因为我们会在roomLeft事件中处理导航
    console.log(`发送leaveRoom请求，离开房间 ${roomId.value}`);
    socketStore.leaveRoom(roomId.value);

    // 显示加载中提示，等待roomLeft事件
    ElMessage.info('正在离开房间...');

    // 注意：不在这里清除事件监听器或跳转，而是在roomLeft事件中处理
    // roomStore.cleanupRoomEventListeners() 将在 handleRoomLeft 事件处理函数中调用
  } catch (error) {
    console.error('离开房间时出错:', error)
    ElMessage.error(error.message || '离开房间失败，请重试')

    // 即使出错，仍然尝试发送leaveRoom请求并清除缓存
    try {
      // 再次清除缓存，确保即使出错也能清除
      roomStore.setCurrentRoom(null)
      socketStore.leaveRoom(roomId.value);
    } catch (e) {
      console.error('重试离开房间失败:', e);

      // 如果二次尝试也失败，才手动跳转
      setTimeout(() => {
        const previousRoute = roomStore.previousRoute || '/rooms';
        console.log(`出错后手动跳转到上一个路由: ${previousRoute}`);
        router.push(previousRoute);
      }, 1000);
    }
  } finally {
    isLoading.value = false
  }
}

// 踢出玩家
const kickPlayer = async (targetUserId, targetUsername) => {
  if (!isCreator.value) {
    ElMessage.warning('只有房主才能踢出玩家')
    return
  }

  if (targetUserId === userStore.userId) {
    ElMessage.warning('不能踢出自己')
    return
  }

  try {
    // 显示确认对话框
    await ElMessageBox.confirm(
      `确定要将 ${targetUsername} 踢出房间吗？`,
      '踢出确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    // 确保 WebSocket 已连接
    if (!socketStore.isConnected) {
      console.log('WebSocket未连接，尝试连接...')
      await socketStore.connect()
      if (!socketStore.isConnected) {
        throw new Error('WebSocket连接失败，无法踢出玩家')
      }
    }

    // 直接使用WebSocket踢出玩家
    // 传递正确的参数：roomId, userId(当前用户ID), targetUserId(要踢出的用户ID)
    const success = socketStore.kickPlayer(roomId.value, userStore.userId, targetUserId)

    if (success) {
      console.log('成功发送踢出玩家事件')
      ElMessage.success(`正在踢出 ${targetUsername}...`)

      // 等待WebSocket事件处理
      await new Promise(resolve => setTimeout(resolve, 500))

      // 重新加载房间数据以获取最新状态
      await refreshRoomDetail(false)

      // 不再手动更新房间数据，等待WebSocket事件更新
    } else {
      throw new Error(roomStore.error || '踢出玩家失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('踢出玩家失败', error)
      ElMessage.error(error.message || '踢出玩家失败')
    }
  }
}

// 发送聊天消息
const sendMessage = () => {
  if (!chatInput.value.trim()) {
    return
  }

  if (!roomData.value) {
    console.error('无法发送消息：房间数据不存在')
    ElMessage.error('房间数据不存在')
    return
  }

  if (!userStore.userId) {
    console.error('无法发送消息：用户未登录')
    ElMessage.error('请先登录')
    return
  }

  // 确保消息对象已初始化
  if (!messages.value[activeChat.value]) {
    console.error(`聊天频道 ${activeChat.value} 不存在`)
    messages.value[activeChat.value] = []
  }

  try {
    // 确定频道和队伍ID
    let channel = 'public'
    let teamId = null

    if (activeChat.value === 'team1' || activeChat.value === 'team2') {
      channel = 'team'
      teamId = activeChat.value === 'team1' ? 1 : 2
    }

    // 构建消息对象
    const newMessage = {
      id: Date.now(),
      userId: userStore.userId,
      username: userStore.username || '玩家',
      content: chatInput.value.trim(),
      time: new Date(),
      avatar: userStore.avatar || ''
    }

    // 通过WebSocket发送消息
    console.log(`向 ${activeChat.value} 频道发送消息: ${newMessage.content}`)
    socketStore.sendRoomMessage(roomData.value.id, newMessage.content, 'text', channel, teamId, (response) => {
      if (response.status === 'success') {
        console.log('消息发送成功:', response.data.message)

        // 将消息添加到本地显示
        messages.value[activeChat.value].push({
          ...newMessage,
          id: response.data.message.id, // 使用服务器返回的ID
          time: new Date(response.data.message.createTime)
        })

        // 清空输入框
        chatInput.value = ''

        // 自动滚动到底部
        nextTick(() => {
          const chatBox = document.querySelector('.chat-messages')
          if (chatBox) {
            chatBox.scrollTop = chatBox.scrollHeight
          }
        })
      } else {
        console.error('发送消息失败:', response.message)
        ElMessage.error(response.message || '发送消息失败')
      }
    })
  } catch (error) {
    console.error('发送消息失败', error)
    ElMessage.error('发送消息失败')
  }
}

// 切换语音状态
const toggleVoice = async () => {
  if (!roomData.value || !roomData.value.id) {
    console.error('无法切换语音状态：房间数据不存在')
    return
  }

  try {
    // 如果已经加入语音，则离开
    if (roomStore.hasJoinedVoice) {
      roomStore.leaveVoiceChannel()
    } else {
      // 否则加入语音
      // 初始化语音通信
      await roomStore.initVoiceCommunication()

      // 根据当前状态决定加入哪个语音房间
      let channel = 'public'
      if (roomData.value.status !== 'waiting' && roomStore.userTeamId) {
        channel = roomStore.userTeamId === 1 ? 'team1' : 'team2'
      }

      // 加入语音房间
      roomStore.joinVoiceChannel(channel)
    }
  } catch (error) {
    console.error('切换语音状态失败:', error)
    ElMessage.error('切换语音状态失败')
  }
}

// 切换静音状态
const toggleMute = () => {
  if (!roomData.value || !roomData.value.id || !roomStore.hasJoinedVoice) {
    console.error('无法切换静音状态：未加入语音房间')
    return
  }

  // 切换静音状态
  roomStore.toggleMute()
}

// 切换侧边栏状态 - 已移除
// const toggleSidebar = () => {
//   sidebarCollapsed.value = !sidebarCollapsed.value
// }

// 切换聊天频道
const switchChatChannel = (channel) => {
  activeChat.value = channel
}

// 切换语音频道
const switchVoiceChannel = (channel) => {
  if (!roomData.value || !roomData.value.id) {
    console.error('无法切换语音频道：房间数据不存在')
    return
  }

  // 如果当前未加入语音，先加入语音
  if (!roomStore.hasJoinedVoice) {
    toggleVoice()
    return
  }

  // 切换语音频道
  roomStore.switchVoiceChannel(channel)
}

// 房间状态文本
const statusText = (status) => {
  switch (status) {
    case 'waiting': return '等待中'
    case 'picking': return '选人中'
    case 'side-picking': return '选边中'
    case 'waiting-game': return '等待开始'
    case 'gaming': return '游戏中'
    case 'ended': return '已结束'
    default: return '未知'
  }
}

// 房间状态标签样式
const statusClass = (status) => {
  switch (status) {
    case 'waiting': return 'status-waiting'
    case 'picking': case 'side-picking': return 'status-picking'
    case 'waiting-game': return 'status-waiting-game'
    case 'gaming': return 'status-gaming'
    case 'ended': return 'status-ended'
    default: return ''
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


// 删除不再需要的canStartPicking计算属性

// 已移除选择角色按钮的计算属性
// const showPickCharacterButton = computed(() => {
//   if (!roomData.value || roomData.value.status !== 'picking' || !isCaptain.value) return false
//   return pickingPhase.value.currentTeam === userTeamId.value
// })

// 是否显示选择红蓝方按钮
const showPickSideButton = computed(() => {
  if (!roomData.value || roomData.value.status !== 'side-picking' || !isCaptain.value) return false
  return userTeamId.value === 1
})

// 是否显示开始游戏按钮
const showStartGameButton = computed(() => {
  if (!roomData.value || !isCreator.value) return false
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

// 监听用户队伍变化，自动切换到对应队伍的语音
watch(userTeamId, (newTeamId) => {
  if (newTeamId && roomData.value && roomData.value.status !== 'waiting') {
    // 切换到对应队伍的语音频道
    const channel = newTeamId === 1 ? 'team1' : 'team2'
    if (roomStore.hasJoinedVoice) {
      roomStore.switchVoiceChannel(channel)
    }
  }
})

// 监听房间状态变化
watch(() => roomData.value?.status, (newStatus) => {
  if (newStatus === 'waiting') {
    // 房间状态为等待中，切换到公共语音
    if (roomStore.hasJoinedVoice) {
      roomStore.switchVoiceChannel('public')
    }
  } else if (userTeamId.value) {
    // 房间状态变为选人阶段或之后，且用户已经有队伍
    const channel = userTeamId.value === 1 ? 'team1' : 'team2'
    if (roomStore.hasJoinedVoice) {
      roomStore.switchVoiceChannel(channel)
    }
  }

  // 如果状态是选人阶段，初始化已选择玩家列表
  if (newStatus === 'picking') {
    initializePickedCharacters()
  }
})



// 监听玩家列表变化
watch(() => players.value, (newPlayers, oldPlayers) => {
  if (!newPlayers || !oldPlayers) return

  // 检查是否有玩家的teamId变化
  const hasTeamIdChanged = newPlayers.some((newPlayer, index) => {
    const oldPlayer = oldPlayers[index]
    return oldPlayer && newPlayer.userId === oldPlayer.userId && newPlayer.teamId !== oldPlayer.teamId
  })

  // 如果有玩家的teamId变化，重新初始化已选择玩家列表
  if (hasTeamIdChanged && roomData.value?.status === 'picking') {
    console.log('检测到玩家teamId变化，重新初始化已选择玩家列表')
    initializePickedCharacters()
  } else if (roomData.value?.status === 'picking') {
    // 即使没有teamId变化，也更新选人阶段状态
    // 这是为了处理服务器返回的玩家数据中teamId已经更新，但是选人界面没有更新的情况
    console.log('检测到玩家列表变化，更新选人阶段状态')
    updatePickingPhaseState()
  }
}, { deep: true })

// 监听路由参数变化，当房间ID变化时重新加载
watch(() => route.params.id, (newId, oldId) => {
  if (newId !== oldId) {
    refreshRoomDetail(false)
  }
})

// 刷新房间详情
// autoJoin参数控制是否自动加入房间，默认为false避免循环调用
const refreshRoomDetail = async (autoJoin = false) => {
  //打印堆栈
  // console.log('调用堆栈:', new Error().stack);
  if (!roomId.value) {
    console.error('无法加载房间：没有房间ID')
    ElMessage.error('无法加载房间：没有房间ID')
    router.push('/rooms')
    return
  }

  isLoading.value = true

  try {
    // 确保 WebSocket 已连接
    if (!socketStore.isConnected) {
      console.log('WebSocket未连接，尝试连接...')
      await socketStore.connect()
      if (!socketStore.isConnected) {
        throw new Error('WebSocket连接失败，无法获取房间详情')
      }
    }

    // 使用Promise包装WebSocket回调
    const result = await new Promise((resolve, reject) => {
      // 使用WebSocket获取房间详情
      const success = socketStore.getRoomDetail(roomId.value, (response) => {
        if (response.status === 'success') {

          // 处理房间数据
          const respRoomData = response.data

          console.log('收到getRoomDetail响应:', response);

          // 加载消息到聊天记录
          loadChatHistory(respRoomData.messages, true);

          // 更新当前房间数据
          roomStore.setCurrentRoom(respRoomData.room)
          // room.value = respRoomData;

          resolve(roomData)
        } else {
          console.error('获取房间详情失败:', response.message)
          reject(new Error(response.message || '获取房间详情失败'))
        }
      })

      if (!success) {
        reject(new Error('发送WebSocket事件失败'))
      }
    })

    if (!result) {
      console.error('房间不存在或无法加载房间数据')
      ElMessage.error('无法加载房间详情，可能不存在或已关闭')
      // 延迟导航，给用户看到错误消息的时间
      setTimeout(() => {
        router.push('/rooms')
      }, 1500);
      return;
    }

    // 再次检查房间数据是否存在
    if (!roomData.value) {
      console.error('房间数据不存在，可能是设置失败')
      ElMessage.error('无法加载房间详情，请刷新页面重试')
      return;
    }

    // 检查用户是否已经在房间中
    const isAlreadyInRoom = roomStore.isUserInRoom(roomData.value)

    // 只有当autoJoin为true时才发送joinRoom请求
    if (autoJoin) {
      console.log(`发送joinRoom请求，确保获取最新数据，房间ID: ${roomId.value}`)
      const success = await roomStore.joinRoom(roomId.value)

      if (!success) {
        // 如果用户不在房间中且加入失败，显示错误
        if (!isAlreadyInRoom) {
          ElMessage.error(roomStore.error || '加入房间失败')
          setTimeout(() => {
            router.push('/rooms')
          }, 1500);
          return;
        } else {
          // 如果用户已在房间中但重新加入失败，只显示警告但不跳转
          console.warn('重新加入房间失败，但用户已在房间中，继续使用当前数据')
          ElMessage.warning('更新房间数据失败，可能会看不到最新消息')
        }
      }
    }

    // 使用isUserInRoom函数的结果来决定是否显示提示
    if (currentUserId.value && !isAlreadyInRoom) {
      console.log('用户不在房间中，显示加入提示')
      // 显示一个提示
      ElMessage.info('您当前不在房间中，可以点击加入按钮加入房间')
    }

    // 如果房间状态为游戏中，但没有队伍信息，初始化队伍信息
    if (roomData.value.status === 'in_progress' && (!roomData.value.teams || roomData.value.teams.length === 0)) {
      // 初始化队伍数据
      initializeTeamsData()
    }

  } catch (error) {
    console.error('加载房间失败', error);
    ElMessage.error(roomStore.error || '加载房间详情失败，请稍后重试')

    // 如果房间加载失败，返回到房间列表
    setTimeout(() => {
      router.push('/rooms')
    }, 1500);
  } finally {
    // 立即关闭加载状态，不再添加人为延迟
    isLoading.value = false
  }
}


</script>

<template>
  <div class="room-detail-container">
    <el-skeleton :loading="isLoading" animated :count="1" :throttle="500">
      <template #default>
        <template v-if="roomData">
          <!-- 房间头部信息 -->
          <div class="room-header">
            <div class="room-title">
              <h1>{{ roomData.name }}</h1>
              <div :class="['room-status', statusClass(roomData.status)]">
                {{ statusText(roomData.status) }}
              </div>
            </div>

            <div class="room-info-bar">
              <div class="room-info-item">
                <div class="info-label">玩家数量:</div>
                <div class="info-content">
                  <el-icon><User /></el-icon>
                  <span>{{ players.length }}/{{ roomData.playerCount || 10 }}</span>
                </div>
              </div>

              <div class="room-info-item">
                <div class="info-label">游戏模式:</div>
                <div class="info-content">
                  <el-icon><Monitor /></el-icon>
                  <span>{{ roomData.gameType || 'LOL' }}</span>
                </div>
              </div>

              <div class="room-info-item">
                <div class="info-label">BP模式:</div>
                <div class="info-content">{{ roomData.pickMode || '队长BP(12211)' }}</div>
              </div>

              <div class="room-info-item">
                <div class="info-label">创建时间:</div>
                <div class="info-content">
                  <el-icon><Clock /></el-icon>
                  <span>{{ formatDateTime(roomData.createTime) }}</span>
                </div>
              </div>
            </div>

            <div class="room-description" v-if="roomData.description">
              <h3>房间描述</h3>
              <p>{{ roomData.description }}</p>
            </div>

            <!-- 测试导航按钮
            <div class="test-buttons">
              <h4>测试导航按钮</h4>
              <div class="test-button-group">
                <el-button size="small" @click="updateRoomPhase('waiting')">等待阶段</el-button>
                <el-button size="small" @click="updateRoomPhase('picking')">选人阶段</el-button>
                <el-button size="small" @click="updateRoomPhase('side-picking')">选边阶段</el-button>
                <el-button size="small" @click="updateRoomPhase('waiting-game')">等待游戏</el-button>
                <el-button size="small" @click="updateRoomPhase('gaming')">游戏中</el-button>
              </div>
            </div> -->

            <!-- 队长提示 -->
            <div class="captain-prompt" v-if="captainActionText">
              <el-alert
                :title="captainActionText"
                type="warning"
                :closable="false"
                show-icon
              />
            </div>

            <!-- 房间操作按钮 -->
            <div class="room-actions">
              <!-- 房主可以开始游戏，当玩家数量等于10时 -->
              <el-button
                v-if="isCreator && roomData.status === 'waiting' && players.length === 10"
                type="primary"
                @click="startGame"
                class="action-btn"
              >
                开始游戏
              </el-button>

              <!-- 已移除队长选择角色按钮 -->

              <!-- 一队队长选择红蓝方按钮 -->
              <el-button
                v-if="showPickSideButton"
                type="warning"
                @click="sideSelectorVisible = true"
                class="action-btn"
              >
                选择红蓝方
              </el-button>

              <!-- 房主可以开始游戏 -->
              <el-button
                v-if="showStartGameButton"
                type="success"
                @click="startGame"
                class="action-btn"
              >
                开始游戏
              </el-button>

              <!-- 离开房间按钮 -->
              <el-button type="danger" @click="leaveRoom" class="action-btn">
                离开房间
              </el-button>
            </div>
          </div>

          <div class="main-content">
            <!-- 侧边栏(观众和语音) -->
            <div class="sidebar">

              <!-- 观众席移到顶部 -->
              <div class="spectators-sidebar">
                <div class="card-header">
                  <h2 class="section-title">观众席 ({{ roomData.spectators.length || 0 }})</h2>

                  <div class="header-buttons">
                    <!-- 如果当前用户在玩家列表中，显示加入观众席按钮 -->
                    <el-button
                      v-if="!isSpectator && roomData.status === 'waiting'"
                      type="primary"
                      size="small"
                      class="join-spectator-btn"
                      @click="addUserToSpectators"
                    >
                      观看模式
                    </el-button>
                  </div>
                </div>

                <div class="spectators-sidebar-list">
                  <div v-for="(spectator, index) in spectators" :key="spectator.userId" class="spectator-sidebar-item">
                    <img :src="spectator.avatar || getChampionIcon(index + 15)" alt="观众头像" class="spectator-avatar">
                    <span class="spectator-name">{{ spectator.username }}</span>
                    <!-- 添加踢出按钮 -->
                    <el-button
                      v-if="isCreator && spectator.userId !== userStore.userId"
                      type="danger"
                      size="small"
                      @click="kickPlayer(spectator.userId, spectator.username)"
                      :icon="Delete"
                    >
                      踢出
                    </el-button>
                  </div>

                  <div v-if="spectators.length === 0" class="empty-spectators-sidebar">
                    暂无观众
                  </div>
                </div>
              </div>

              <!-- 语音区域 -->
              <div class="voice-container">
                <div class="card-header">
                  <h2 class="section-title">
                    {{ roomStore.currentVoiceChannel === 'public' ? '公共语音' :
                       roomStore.currentVoiceChannel === 'team1' ? '一队语音' : '二队语音' }}
                  </h2>
                  <div class="voice-controls">
                    <button
                      class="btn-mic"
                      :class="{
                        'active': roomStore.hasJoinedVoice,
                        'muted': roomStore.isMuted
                      }"
                      @click="toggleMute"
                    >
                      <i class="el-icon">
                        <component :is="roomStore.isMuted ? 'MuteNotification' : 'Mic'"></component>
                      </i>
                    </button>
                  </div>
                </div>

                <!-- 选人阶段以后的状态显示队伍语音选择 -->
                <div v-if="roomData.status !== 'waiting'" class="team-voice-tabs">
                  <div
                    class="team-voice-tab"
                    :class="{'active': roomStore.currentVoiceChannel === 'public'}"
                    @click="switchVoiceChannel('public')"
                  >
                    公共语音
                  </div>
                  <div
                    v-if="userTeamId === 1 || isCreator"
                    class="team-voice-tab"
                    :class="{'active': roomStore.currentVoiceChannel === 'team1'}"
                    @click="switchVoiceChannel('team1')"
                  >
                    一队语音
                  </div>
                  <div
                    v-if="userTeamId === 2 || isCreator"
                    class="team-voice-tab"
                    :class="{'active': roomStore.currentVoiceChannel === 'team2'}"
                    @click="switchVoiceChannel('team2')"
                  >
                    二队语音
                  </div>
                </div>

                <div class="voice-participants">
                  <!-- 当前用户 -->
                  <div class="voice-participant" :class="{'speaking': roomStore.hasJoinedVoice}">
                    <img :src="userStore.avatar || getChampionIcon(8)" alt="您的头像" class="voice-avatar">
                    <span class="participant-name">{{ userStore.username }} (您)</span>
                    <div class="voice-indicator"></div>
                    <i v-if="roomStore.isMuted" class="el-icon voice-muted-icon">
                      <MuteNotification />
                    </i>
                  </div>

                  <!-- 其他语音参与者 -->
                  <div
                    v-for="user in roomStore.currentVoiceUsers"
                    :key="user.userId"
                    class="voice-participant speaking"
                  >
                    <img :src="user.avatar || getChampionIcon(10)" :alt="user.username" class="voice-avatar">
                    <span class="participant-name">{{ user.username }}</span>
                    <div class="voice-indicator"></div>
                    <i v-if="user.isMuted" class="el-icon voice-muted-icon">
                      <MuteNotification />
                    </i>
                  </div>
                </div>

                <button
                  class="btn join-voice-btn"
                  :class="roomStore.hasJoinedVoice ? 'btn-danger' : 'btn-primary'"
                  @click="toggleVoice"
                >
                  {{ roomStore.hasJoinedVoice ? '退出语音' : '加入语音' }}
                </button>
              </div>
            </div>

            <!-- 主要内容区域 -->
            <div class="content-area">
              <!-- 分割成两个部分：主体内容和聊天区域 -->
              <div class="content-main-wrapper">
                <!-- 根据房间状态显示不同的内容 -->
                <div class="content-main">
                  <template v-if="roomData && roomData.status === 'waiting'">
                    <!-- 房间主体 - 等待中状态 -->
                    <div class="room-body">
                      <!-- 等待中状态的玩家列表 -->
                      <div class="section-card players-container" v-if="roomData.status === 'waiting'">
                        <div class="card-header">
                          <h2 class="section-title">玩家列表 ({{ players.length || 0 }}/10)</h2>

                          <div class="header-buttons">
                            <!-- 如果当前用户是观众且队伍未满，显示加入队伍按钮 -->
                            <el-button
                              v-if="isSpectator && roomData.status === 'waiting' && !isTeamFull"
                              type="success"
                              size="small"
                              class="join-team-btn"
                              @click="joinRoom"
                            >
                              加入队伍
                            </el-button>
                          </div>
                        </div>

                        <div class="player-grid">
                          <!-- 显示已加入的玩家 -->
                          <div
                            v-for="(player, index) in players"
                            :key="player.userId"
                            class="player-card"
                          >
                            <img :src="player.avatar || getChampionIcon(index + 9)" alt="玩家头像" class="player-avatar">

                            <div class="player-info">
                              <div class="player-name">
                                {{ player.username }}
                                <span v-if="player.userId === roomData.creatorId" class="player-badge creator">房主</span>
                              </div>
                            </div>

                            <!-- 添加踢出按钮 -->
                            <el-button
                              v-if="isCreator && player.userId !== userStore.userId"
                              type="danger"
                              size="small"
                              class="kick-button"
                              @click="kickPlayer(player.userId, player.username)"
                              :icon="Delete"
                            >
                              踢出
                            </el-button>
                          </div>

                          <!-- 空位 -->
                          <div
                            v-for="n in (10 - players.length)"
                            :key="`empty-slot-${n}`"
                            class="empty-slot"
                          >
                            <div class="empty-avatar"></div>
                            <div>等待加入...</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 选人阶段 -->
                  <template v-else-if="roomData && roomData.status === 'picking'">
                    <div class="room-body picking-phase">
                      <div class="section-card picking-container">
                        <div class="card-header">
                          <h2 class="section-title">队员选择</h2>
                          <div class="pick-status">
                            当前回合: {{ pickingPhase.currentPick }}/{{ getTotalPickCount() }}
                            ({{ pickingPhase.currentTeam === 1 ? '一队选择' : '二队选择' }})
                          </div>
                        </div>

                        <div class="pick-content-container">
                          <!-- 队伍区域 -->
                          <div class="teams-container">
                            <div class="team-group">
                              <!-- 一队 -->
                              <div class="team-red-section" :class="{'active-team': pickingPhase.currentTeam === 1}">
                                <div class="team-info">
                                  <h3 class="team-name">一队</h3>
                                  <span v-if="pickingPhase.currentTeam === 1" class="current-pick-status">正在选人</span>
                                </div>

                                <div class="team-players-grid">
                                  <!-- 队长位置 -->
                                  <div
                                    v-for="player in players.filter(p => p.teamId === 1 && p.isCaptain)"
                                    :key="player.userId"
                                    class="team-captain"
                                  >
                                    <div class="captain-badge">队长</div>
                                    <img :src="player.avatar || getChampionIcon(index + 10)" alt="队长头像" class="captain-avatar">
                                    <div class="captain-name">{{ player.username }}</div>
                                  </div>

                                  <!-- 队员位置（已选择的玩家） -->
                                  <div
                                    v-for="char in pickedCharacters.filter(c => c.teamId === 1)"
                                    :key="char.characterId"
                                    class="picked-player"
                                  >
                                    <div class="pick-order">{{ char.pickOrder }}</div>
                                    <img :src="char.characterAvatar" :alt="char.characterName" class="picked-avatar">
                                    <div class="picked-name">{{ char.characterName }}</div>
                                  </div>

                                  <!-- 空位 -->
                                  <div
                                    v-for="n in (5 - players.filter(p => p.teamId === 1 && p.isCaptain).length - pickedCharacters.filter(c => c.teamId === 1).length)"
                                    :key="`empty-pick-1-${n}`"
                                    class="empty-pick"
                                  >
                                    <div class="empty-player"></div>
                                    <div>等待选择</div>
                                  </div>
                                </div>
                              </div>

                              <!-- 二队 -->
                              <div class="team-blue-section" :class="{'active-team': pickingPhase.currentTeam === 2}">
                                <div class="team-info">
                                  <h3 class="team-name">二队</h3>
                                  <span v-if="pickingPhase.currentTeam === 2" class="current-pick-status">正在选人</span>
                                </div>

                                <div class="team-players-grid">
                                  <!-- 队长位置 -->
                                  <div
                                    v-for="player in players.filter(p => p.teamId === 2 && p.isCaptain)"
                                    :key="player.userId"
                                    class="team-captain"
                                  >
                                    <div class="captain-badge">队长</div>
                                    <img :src="player.avatar || getChampionIcon(index + 10)" alt="队长头像" class="captain-avatar">
                                    <div class="captain-name">{{ player.username }}</div>
                                  </div>

                                  <!-- 队员位置（已选择的玩家） -->
                                  <div
                                    v-for="char in pickedCharacters.filter(c => c.teamId === 2)"
                                    :key="char.characterId"
                                    class="picked-player"
                                  >
                                    <div class="pick-order">{{ char.pickOrder }}</div>
                                    <img :src="char.characterAvatar" :alt="char.characterName" class="picked-avatar">
                                    <div class="picked-name">{{ char.characterName }}</div>
                                  </div>

                                  <!-- 空位 -->
                                  <div
                                    v-for="n in (5 - players.filter(p => p.teamId === 2 && p.isCaptain).length - pickedCharacters.filter(c => c.teamId === 2).length)"
                                    :key="`empty-pick-2-${n}`"
                                    class="empty-pick"
                                  >
                                    <div class="empty-player"></div>
                                    <div>等待选择</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <!-- 公共玩家池 -->
                          <div class="common-players-pool">
                            <div class="pool-header">
                              <h3>待选玩家</h3>
                            </div>
                            <div class="pool-players">
                              <div
                                v-for="player in availablePlayers"
                                :key="player.id"
                                class="pool-player"
                                :class="{'selectable': pickingPhase.currentTeam === userTeamId && isCaptain}"
                                @click="isCaptain && pickingPhase.currentTeam === userTeamId && pickPlayer(player)"
                              >
                                <img :src="player.avatar" :alt="player.name" class="pool-player-avatar">
                                <div class="pool-player-name">{{ player.name }}</div>
                                <div v-if="pickingPhase.currentTeam === userTeamId && isCaptain" class="pick-button">选择</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- 提示信息 -->
                        <div v-if="isCaptain && pickingPhase.currentTeam === userTeamId" class="pick-message">
                          请选择一名玩家加入您的队伍
                        </div>
                        <div v-else-if="isCaptain" class="pick-message">
                          请等待对方队长进行选择
                        </div>
                        <div v-else class="pick-message">
                          队长正在为队伍选择玩家，请耐心等待
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 选边阶段 -->
                  <template v-else-if="roomData.status === 'side-picking'">
                    <div class="room-body side-picking-phase">
                      <div class="section-card side-picking-container">
                        <div class="card-header">
                          <h2 class="section-title">选择红蓝方</h2>
                          <div class="pick-status">
                            选人阶段已完成
                          </div>
                        </div>

                        <div class="side-picking-content">
                          <div class="side-picking-message">
                            <div class="alert-message">
                              由一队队长选择红蓝方
                            </div>

                            <div v-if="isCaptain && userTeamId === 1" class="side-selection">
                              <button
                                class="side-btn red-side"
                                @click="pickSide('red')"
                              >
                                <div class="side-icon">🔴</div>
                                <div>选择红方</div>
                              </button>
                              <button
                                class="side-btn blue-side"
                                @click="pickSide('blue')"
                              >
                                <div class="side-icon">🔵</div>
                                <div>选择蓝方</div>
                              </button>
                            </div>

                            <div v-else class="waiting-for-side-pick">
                              <p>等待一队队长选择红蓝方...</p>
                            </div>
                          </div>

                          <!-- 双方阵容展示 -->
                          <div class="teams-composition">
                            <!-- 一队已选择的角色 -->
                            <div class="team-composition team-red">
                              <h3>一队阵容 <span class="team-count">{{ pickedCharacters.filter(c => c.teamId === 1).length }}/5</span></h3>
                              <div class="team-characters">
                                <div
                                  v-for="char in pickedCharacters.filter(c => c.teamId === 1)"
                                  :key="char.characterId"
                                  class="team-character"
                                >
                                  <div class="pick-order">{{ char.pickOrder }}</div>
                                  <img :src="char.characterAvatar" :alt="char.characterName" class="character-avatar">
                                  <div class="character-name">{{ char.characterName }}</div>
                                </div>

                                <!-- 空位 -->
                                <div
                                  v-for="n in (5 - pickedCharacters.filter(c => c.teamId === 1).length)"
                                  :key="`empty-team1-${n}`"
                                  class="empty-character"
                                >
                                  <div class="empty-avatar"></div>
                                  <div class="empty-name">等待选择</div>
                                </div>
                              </div>
                            </div>

                            <!-- 二队已选择的角色 -->
                            <div class="team-composition team-blue">
                              <h3>二队阵容 <span class="team-count">{{ pickedCharacters.filter(c => c.teamId === 2).length }}/5</span></h3>
                              <div class="team-characters">
                                <div
                                  v-for="char in pickedCharacters.filter(c => c.teamId === 2)"
                                  :key="char.characterId"
                                  class="team-character"
                                >
                                  <div class="pick-order">{{ char.pickOrder }}</div>
                                  <img :src="char.characterAvatar" :alt="char.characterName" class="character-avatar">
                                  <div class="character-name">{{ char.characterName }}</div>
                                </div>

                                <!-- 空位 -->
                                <div
                                  v-for="n in (5 - pickedCharacters.filter(c => c.teamId === 2).length)"
                                  :key="`empty-team2-${n}`"
                                  class="empty-character"
                                >
                                  <div class="empty-avatar"></div>
                                  <div class="empty-name">等待选择</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 等待游戏开始界面 -->
                  <template v-else-if="roomData.status === 'waiting-game'">
                    <div class="room-body waiting-game-phase">
                      <div class="section-card waiting-game-container">
                        <div class="card-header">
                          <h2 class="section-title">等待游戏开始</h2>
                        </div>

                        <div class="waiting-game-content">
                          <div class="waiting-game-message">
                            <p>
                              一队已选择 {{ roomData.teams && roomData.teams[0]?.side === 'red' ? '红方' : '蓝方' }}，
                              二队将使用 {{ roomData.teams && roomData.teams[0]?.side === 'red' ? '蓝方' : '红方' }}
                            </p>
                            <p>所有玩家请在游戏客户端中建立自定义房间，按照分配加入对应队伍</p>

                            <div v-if="isCreator" class="start-game-section">
                              <p>请在确认所有玩家已准备就绪后开始游戏</p>
                              <el-button
                                type="success"
                                @click="startGame"
                                class="start-game-btn"
                                :disabled="players.length !== 10"
                              >
                                开始游戏
                              </el-button>
                              <p v-if="players.length !== 10" class="warning-text">需要 10 名玩家才能开始游戏，当前 {{ players.length }} 名玩家</p>
                            </div>

                            <div v-else class="waiting-for-game-start">
                              <p>等待房主开始游戏...</p>
                            </div>
                          </div>

                          <!-- 双方阵容展示 -->
                          <div class="teams-composition">
                            <!-- 一队已选择的角色 -->
                            <div class="team-composition" :class="roomData.teams && roomData.teams[0]?.side === 'red' ? 'side-red' : 'side-blue'">
                              <h3>
                                一队阵容
                                <span class="side-label">
                                  {{ roomData.teams && roomData.teams[0]?.side === 'red' ? '红方' : '蓝方' }}
                                </span>
                              </h3>
                              <div class="team-characters">
                                <div
                                  v-for="char in pickedCharacters.filter(c => c.teamId === 1)"
                                  :key="char.characterId"
                                  class="team-character"
                                >
                                  <img :src="char.characterAvatar" :alt="char.characterName" class="character-avatar">
                                  <div class="character-name">{{ char.characterName }}</div>
                                </div>
                              </div>
                            </div>

                            <!-- 二队已选择的角色 -->
                            <div class="team-composition" :class="roomData.teams && roomData.teams[0]?.side === 'red' ? 'side-blue' : 'side-red'">
                              <h3>
                                二队阵容
                                <span class="side-label">
                                  {{ roomData.teams && roomData.teams[0]?.side === 'red' ? '蓝方' : '红方' }}
                                </span>
                              </h3>
                              <div class="team-characters">
                                <div
                                  v-for="char in pickedCharacters.filter(c => c.teamId === 2)"
                                  :key="char.characterId"
                                  class="team-character"
                                >
                                  <img :src="char.characterAvatar" :alt="char.characterName" class="character-avatar">
                                  <div class="character-name">{{ char.characterName }}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 游戏中界面 -->
                  <template v-else-if="roomData.status === 'gaming'">
                    <div class="room-body gaming-phase">
                      <div class="section-card gaming-container">
                        <div class="card-header">
                          <h2 class="section-title">游戏进行中</h2>
                        </div>

                        <div class="gaming-content">
                          <div class="gaming-message">
                            <p>游戏已开始，对局数据将在游戏结束后更新</p>
                            <div class="game-timer">
                              <div class="timer-label">游戏时长：</div>
                              <div class="timer">25:30</div>
                            </div>
                          </div>

                          <!-- 双方阵容展示 -->
                          <div class="teams-composition">
                            <!-- 一队已选择的角色 -->
                            <div class="team-composition" :class="roomData.teams && roomData.teams[0]?.side === 'red' ? 'side-red' : 'side-blue'">
                              <h3>
                                一队阵容
                                <span class="side-label">
                                  {{ roomData.teams && roomData.teams[0]?.side === 'red' ? '红方' : '蓝方' }}
                                </span>
                              </h3>
                              <div class="team-characters">
                                <div
                                  v-for="char in pickedCharacters.filter(c => c.teamId === 1)"
                                  :key="char.characterId"
                                  class="team-character"
                                >
                                  <img :src="char.characterAvatar" :alt="char.characterName" class="character-avatar">
                                  <div class="character-name">{{ char.characterName }}</div>
                                </div>
                              </div>
                            </div>

                            <!-- 二队已选择的角色 -->
                            <div class="team-composition" :class="roomData.teams && roomData.teams[0]?.side === 'red' ? 'side-blue' : 'side-red'">
                              <h3>
                                二队阵容
                                <span class="side-label">
                                  {{ roomData.teams && roomData.teams[0]?.side === 'red' ? '蓝方' : '红方' }}
                                </span>
                              </h3>
                              <div class="team-characters">
                                <div
                                  v-for="char in pickedCharacters.filter(c => c.teamId === 2)"
                                  :key="char.characterId"
                                  class="team-character"
                                >
                                  <img :src="char.characterAvatar" :alt="char.characterName" class="character-avatar">
                                  <div class="character-name">{{ char.characterName }}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- 始终显示的聊天区域 -->
                <div class="chat-wrapper">
                  <div class="section-card chat-container-main">
                    <div class="card-header">
                      <h2 class="section-title">聊天室</h2>
                    </div>

                    <div class="chat-tabs">
                      <!-- 聊天频道选择 -->
                      <div
                        class="chat-tab"
                        :class="{'active': activeChat === 'public'}"
                        @click="switchChatChannel('public')"
                      >
                        公共聊天
                      </div>
                      <div
                        v-if="roomData.status !== 'waiting' && userTeamId === 1"
                        class="chat-tab"
                        :class="{'active': activeChat === 'team1'}"
                        @click="switchChatChannel('team1')"
                      >
                        一队聊天
                      </div>
                      <div
                        v-if="roomData.status !== 'waiting' && userTeamId === 2"
                        class="chat-tab"
                        :class="{'active': activeChat === 'team2'}"
                        @click="switchChatChannel('team2')"
                      >
                        二队聊天
                      </div>
                    </div>

                    <!-- 消息类型选择（仅在公共聊天中显示） -->
                    <div v-if="activeChat === 'public'" class="message-type-tabs">
                      <div
                        class="message-type-tab"
                        :class="{'active': activeMessageType === 'all'}"
                        @click="activeMessageType = 'all'"
                      >
                        全部
                      </div>
                      <div
                        class="message-type-tab"
                        :class="{'active': activeMessageType === 'normal'}"
                        @click="activeMessageType = 'normal'"
                      >
                        普通消息
                      </div>
                      <div
                        class="message-type-tab"
                        :class="{'active': activeMessageType === 'system'}"
                        @click="activeMessageType = 'system'"
                      >
                        系统消息
                      </div>
                    </div>

                    <div class="chat-messages">
                      <div
                        v-for="msg in filteredMessages"
                        :key="msg.id"
                        :class="['message', {'system-message': msg.isSystem || msg.userId === 'system'}]"
                      >
                        <template v-if="msg.userId !== 'system'">
                          <img :src="msg.avatar || getChampionIcon(20)" alt="头像" class="message-avatar">
                          <div class="message-content">
                            <div class="message-author">
                              {{ msg.username }}
                              <span class="message-time">{{ msg.time ? new Date(msg.time).toLocaleTimeString() : '未知时间' }}</span>
                            </div>
                            <p>{{ msg.content }}</p>
                          </div>
                        </template>
                        <template v-else>
                          <div class="message-content">
                            {{ msg.content }}
                          </div>
                        </template>
                      </div>
                    </div>

                    <!-- 语音通信控制按钮已移至语音区域组件 -->

                    <!-- 聊天输入框部分 -->
                    <div class="chat-input">
                      <input
                        v-model="chatInput"
                        placeholder="输入聊天信息..."
                        maxlength="100"
                        @keyup.enter="sendMessage"
                      />
                      <div class="chat-actions">
                        <button class="btn-emoji">😊</button>
                        <button class="btn-send" @click="sendMessage">发送</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 已移除选择角色弹窗 -->

          <!-- 选择红蓝方弹窗 -->
          <el-dialog
            v-model="sideSelectorVisible"
            title="选择红蓝方"
            width="600px"
            :close-on-click-modal="false"
            :close-on-press-escape="false"
            :show-close="false"
          >
            <div class="side-selection-dialog">
              <div class="side-options">
                <div class="side-option red" @click="pickSide('red')">
                  <div class="side-icon">🔴</div>
                  <h3>红方</h3>
                  <p>选择红方作为您的队伍方</p>
                </div>

                <div class="side-option blue" @click="pickSide('blue')">
                  <div class="side-icon">🔵</div>
                  <h3>蓝方</h3>
                  <p>选择蓝方作为您的队伍方</p>
                </div>
              </div>
            </div>
          </el-dialog>
        </template>

        <el-empty
          v-else-if="!isLoading"
          description="房间不存在或已被删除"
          :image-size="200"
        >
          <el-button type="primary" @click="router.push('/rooms')">返回房间列表</el-button>
        </el-empty>
      </template>
    </el-skeleton>

    <!-- 密码输入对话框 -->
    <el-dialog
      v-model="passwordDialogVisible"
      title="请输入房间密码"
      width="30%"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
    >
      <el-form @submit.prevent="joinRoomWithPassword">
        <el-form-item :error="passwordError">
          <el-input
            v-model="passwordInput"
            placeholder="请输入房间密码"
            show-password
            @keyup.enter="joinRoomWithPassword"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="router.push('/rooms')">取消</el-button>
          <el-button type="primary" @click="joinRoomWithPassword" :loading="isJoiningWithPassword">
            确认
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>

</template>

<style>
@import '../assets/css/room-detail.css';
</style>