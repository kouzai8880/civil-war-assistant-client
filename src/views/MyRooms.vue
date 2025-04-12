<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useRoomStore } from '../stores/room'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()
const roomStore = useRoomStore()

// 我的房间列表
const myRooms = ref([])
const historicalRooms = ref([])
const isLoading = ref(false)

// 标签页激活
const activeTab = ref('current')

// 检查登录状态
const isLoggedIn = computed(() => userStore.isLoggedIn)

// 常用的英雄头像列表，用于随机分配
const championIcons = [
  'Ahri', 'Annie', 'Ashe', 'Caitlyn', 'Darius',
  'Ezreal', 'Garen', 'Jinx', 'Lux', 'Malphite',
  'Nami', 'Syndra', 'Thresh', 'Yasuo', 'Zed'
]

// 生成英雄头像URL
const getChampionIcon = (index = 0) => {
  const champion = championIcons[index % championIcons.length]
  return `https://ddragon.leagueoflegends.com/cdn/13.12.1/img/champion/${champion}.png`
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
      minute: '2-digit'
    })
  } catch (error) {
    console.error('日期格式化错误:', error)
    return '未知时间'
  }
}

// 加载房间数据
onMounted(async () => {
  // 检查是否登录
  if (!isLoggedIn.value) {
    ElMessage.warning('请先登录')
    router.push('/login')
    return
  }

  loadMyRooms()
})

// 加载我的房间
const loadMyRooms = async () => {
  isLoading.value = true
  try {
    // 加载我创建的房间，API会根据当前用户token识别用户
    console.log('正在获取我的房间，当前用户ID:', userStore.userId)
    const rooms = await roomStore.fetchMyRooms()

    console.log('API返回的原始房间数据:', JSON.stringify(rooms))

    if (rooms && rooms.length > 0) {
      console.log(`获取到房间总数: ${rooms.length}, 当前用户ID: ${userStore.userId}`)

      // 分为我创建的房间和我加入的房间
      const myCreatedRooms = rooms.filter(room => room.creatorId === userStore.userId)
      const myJoinedRooms = rooms.filter(room => {
        // 检查用户是否在玩家列表中
        const isInPlayers = room.players && Array.isArray(room.players) &&
                           room.players.some(player => player.userId === userStore.userId)
        // 不是创建者但是在玩家列表中
        return room.creatorId !== userStore.userId && isInPlayers
      })

      console.log('我创建的房间数量:', myCreatedRooms.length)
      console.log('我加入的房间数量:', myJoinedRooms.length)

      // 合并我创建的和我加入的房间
      const allMyRooms = [...myCreatedRooms, ...myJoinedRooms]
      console.log('我的所有房间数量:', allMyRooms.length)

      // 按状态分类房间
      myRooms.value = allMyRooms.filter(room =>
        room.status === 'waiting' || room.status === 'picking' || room.status === 'gaming'
      )

      historicalRooms.value = allMyRooms.filter(room =>
        room.status === 'ended'
      )

      console.log('已加载房间：', myRooms.value.length, '个当前房间，', historicalRooms.value.length, '个历史房间')
    } else {
      console.log('没有找到任何房间')
      myRooms.value = []
      historicalRooms.value = []
    }
  } catch (error) {
    console.error('加载房间失败:', error)
    ElMessage.error('加载房间失败，请稍后重试')
    myRooms.value = []
    historicalRooms.value = []
  } finally {
    isLoading.value = false
  }
}

// 进入房间
const enterRoom = (roomId) => {
  // 查找房间信息
  const room = myRooms.value.find(r => r.id === roomId) ||
               historicalRooms.value.find(r => r.id === roomId);

  if (!room) {
    ElMessage.error('房间信息不存在');
    return;
  }

  // 检查用户是否已经在房间中（作为玩家或观众）
  const isAlreadyInRoom = room.players && room.players.some(player => player.userId === userStore.userId);
  const isSpectator = room.spectators && room.spectators.some(spectator => spectator.userId === userStore.userId);

  if (isAlreadyInRoom || isSpectator) {
    console.log('用户已在房间中，直接跳转到房间详情页');
    router.push(`/room/${roomId}`);
    return;
  }

  // 如果用户不在房间中，尝试加入房间
  try {
    // 调用API加入房间
    roomStore.joinRoom(roomId).then(success => {
      if (success) {
        router.push(`/room/${roomId}`);
      } else {
        ElMessage.error(roomStore.error || '加入房间失败');
      }
    });
  } catch (error) {
    console.error('加入房间失败:', error);
    ElMessage.error('加入房间失败，请稍后重试');
  }
}

// 创建新房间
const createRoom = () => {
  router.push('/rooms?action=create')
}

// 删除房间确认
const confirmDeleteRoom = (room) => {
  ElMessageBox.confirm(
    '确定要删除该房间吗？此操作不可恢复。',
    '删除确认',
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    deleteRoom(room.id)
  }).catch(() => {})
}

// 删除房间
const deleteRoom = async (roomId) => {
  try {
    // 模拟API调用，删除房间
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 从列表中移除
    historicalRooms.value = historicalRooms.value.filter(room => room.id !== roomId)

    ElMessage.success('房间已删除')
  } catch (error) {
    ElMessage.error('删除房间失败')
  }
}

// 房间状态文本
const statusText = (status) => {
  switch (status) {
    case 'waiting': return '等待中'
    case 'picking': return '选人中'
    case 'gaming': return '游戏中'
    case 'ended': return '已结束'
    default: return '未知'
  }
}

// 房间状态标签样式
const statusClass = (status) => {
  switch (status) {
    case 'waiting': return 'status-waiting'
    case 'picking': return 'status-waiting'
    case 'gaming': return 'status-gaming'
    case 'ended': return 'status-completed'
    default: return ''
  }
}

// 查看房间详情
const viewRoomDetail = (roomId) => {
  router.push(`/match-history/${roomId}`)
}
</script>

<template>
  <div class="container">
    <div class="page-header">
      <h1>我的房间</h1>
      <button class="btn btn-primary" @click="createRoom">创建新房间</button>
    </div>

    <div class="tabs">
      <div
        :class="['tab', activeTab === 'current' ? 'active' : '']"
        @click="activeTab = 'current'"
      >
        当前房间
      </div>
      <div
        :class="['tab', activeTab === 'history' ? 'active' : '']"
        @click="activeTab = 'history'"
      >
        历史房间
      </div>
    </div>

    <!-- 当前房间列表 -->
    <div v-if="activeTab === 'current'" class="tab-content active">
      <div v-if="myRooms.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">您还没有创建或加入任何房间</div>
        <div class="empty-subtext">您可以创建新房间或在房间列表中加入其他玩家的房间</div>
        <button class="btn btn-primary" @click="createRoom">创建房间</button>
      </div>

      <div v-else class="room-grid">
        <div v-for="room in myRooms" :key="room.id" class="room-card">
          <div class="room-header">
            <h3 class="room-title">{{ room.name }}</h3>
            <div class="room-status-container">
              <span :class="['room-status', statusClass(room.status)]">{{ statusText(room.status) }}</span>
              <span :class="['room-role', room.creatorId === userStore.userId ? 'role-creator' : 'role-player']">
                {{ room.creatorId === userStore.userId ? '我的房间' : '已加入' }}
              </span>
            </div>
          </div>
          <div class="room-info">
            <span>创建于: {{ new Date(room.createTime).toLocaleString() }}</span>
            <span>玩家: {{ (room.players?.length || 0) }}/{{ room.playerCount }}</span>
          </div>
          <div class="room-details">
            <div class="room-detail-item">
              <span class="detail-label">游戏模式:</span>
              <span>{{ room.gameType || 'LOL' }}</span>
            </div>
            <div class="room-detail-item">
              <span class="detail-label">房间状态:</span>
              <span>{{ room.isPublic ? '公开' : '私密' }}</span>
            </div>
          </div>
          <div class="room-players">
            <img
              v-for="(player, index) in (room.players || []).slice(0, 6)"
              :key="index"
              :src="player.avatar || getChampionIcon(index)"
              :alt="player.name"
              class="player-avatar"
            >
            <span v-if="room.players && room.players.length > 6" class="more-players">+{{ room.players.length - 6 }}</span>
          </div>
          <div class="room-footer">
            <a href="javascript:void(0)" class="btn btn-primary" @click="enterRoom(room.id)">进入房间</a>
          </div>
        </div>
      </div>
    </div>

    <!-- 历史房间列表 -->
    <div v-if="activeTab === 'history'" class="tab-content active">
      <div v-if="historicalRooms.length === 0" class="empty-state">
        <div class="empty-icon">📜</div>
        <div class="empty-text">您还没有历史房间记录</div>
        <div class="empty-subtext">当您创建或加入的房间完成游戏后，将会显示在这里</div>
        <button class="btn btn-primary" @click="createRoom">创建房间</button>
      </div>

      <div v-else class="room-grid">
        <div v-for="room in historicalRooms" :key="room.id" class="room-card">
          <div class="room-header">
            <h3 class="room-title">{{ room.name }}</h3>
            <div class="room-status-container">
              <span class="room-status status-completed">已完成</span>
              <span :class="['room-role', room.creatorId === userStore.userId ? 'role-creator' : 'role-player']">
                {{ room.creatorId === userStore.userId ? '我的房间' : '已加入' }}
              </span>
            </div>
          </div>
          <div :class="['match-result', room.result === 'win' ? 'win' : 'lose']">
            <div class="result-indicator"></div>
            <div class="result-text">{{ room.result === 'win' ? '胜利' : '失败' }}</div>
          </div>
          <div class="room-info">
            <span>创建于: {{ new Date(room.createTime).toLocaleString() }}</span>
            <span>持续时间: {{ room.duration || '未知' }}分钟</span>
          </div>
          <div class="room-details">
            <div class="room-detail-item">
              <span class="detail-label">游戏模式:</span>
              <span>{{ room.gameType || 'LOL' }}</span>
            </div>
            <div class="room-detail-item">
              <span class="detail-label">我的位置:</span>
              <span>{{ room.myTeam || '未知' }}</span>
            </div>
          </div>
          <div class="room-players">
            <img
              v-for="(player, index) in (room.players || []).slice(0, 5)"
              :key="index"
              :src="player.avatar || getChampionIcon(index)"
              :alt="player.name"
              class="player-avatar"
            >
            <span v-if="room.players && room.players.length > 5" class="more-players">+{{ room.players.length - 5 }}</span>
          </div>
          <div class="room-footer">
            <button class="btn-icon" title="查看战绩">🔍</button>
            <button class="btn-icon" title="查看数据">📊</button>
            <a href="javascript:void(0)" class="btn btn-outline" @click="viewRoomDetail(room.id)">查看详情</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.page-header h1 {
  margin: 0;
  font-size: 2rem;
  font-weight: bold;
}

.tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 2rem;
}

.tab {
  padding: 1rem 2rem;
  cursor: pointer;
  color: #8b8fa3;
  border-bottom: 2px solid transparent;
  transition: all 0.3s;
}

.tab.active {
  color: #53a8ff;
  border-bottom: 2px solid #53a8ff;
}

.tab-content {
  display: block;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 0;
  text-align: center;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  color: #8b8fa3;
}

.empty-text {
  font-size: 1.2rem;
  color: #8b8fa3;
  margin-bottom: 0.5rem;
}

.empty-subtext {
  font-size: 0.9rem;
  color: #a0a4b8;
  margin-bottom: 1.5rem;
  text-align: center;
  max-width: 80%;
}

.room-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
}

.room-card {
  background-color: #191a23;
  border-radius: 8px;
  padding: 1.5rem;
  border: 1px solid #292a37;
  transition: all 0.3s;
}

.room-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  border-color: #53a8ff;
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.room-title {
  font-size: 1.2rem;
  font-weight: bold;
  margin: 0;
}

.room-status-container {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.room-status {
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
}

.room-role {
  padding: 0.15rem 0.4rem;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: bold;
}

.role-creator {
  background-color: #8e44ad;
  color: white;
}

.role-player {
  background-color: #27ae60;
  color: white;
}

.status-waiting {
  background-color: #fda92c;
  color: #fff;
}

.status-gaming {
  background-color: #00cfa1;
  color: #fff;
}

.status-completed {
  background-color: #8b8fa3;
  color: #fff;
}

.match-result {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.result-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.win .result-indicator {
  background-color: #00cfa1;
}

.lose .result-indicator {
  background-color: #f56c6c;
}

.result-text {
  font-size: 0.9rem;
}

.win .result-text {
  color: #00cfa1;
}

.lose .result-text {
  color: #f56c6c;
}

.room-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
  color: #8b8fa3;
}

.room-details {
  margin-bottom: 1rem;
}

.room-detail-item {
  display: flex;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.detail-label {
  width: 80px;
  color: #8b8fa3;
}

.room-players {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  align-items: center;
}

.player-avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  object-fit: cover;
}

.more-players {
  font-size: 0.85rem;
  color: #8b8fa3;
}

.room-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
}

.btn-primary {
  background-color: #53a8ff;
  color: white;
}

.btn-outline {
  background: transparent;
  border: 1px solid #53a8ff;
  color: #53a8ff;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.btn-icon {
  background: none;
  border: none;
  color: #8b8fa3;
  font-size: 1.2rem;
  cursor: pointer;
  transition: color 0.3s;
}

.btn-icon:hover {
  color: #ffffff;
}

.status-picking {
  background-color: #fda92c;
  color: #fff;
}
</style>