<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useRoomStore } from '../stores/room'
import { useSocketStore } from '../stores/socket'
import { ElMessage, ElMessageBox } from 'element-plus'
import CreateRoomModal from '../components/CreateRoomModal.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const roomStore = useRoomStore()

// 房间列表
const rooms = ref([])
const isLoading = ref(false)

// 分页信息
const pagination = ref({
  current: 1,
  pageSize: 10,
  total: 0
})

// 搜索和筛选
const searchForm = ref({
  keyword: '',
  status: '',
  playerCount: '',
  gameType: ''
})

// 创建房间对话框
const showCreateRoomModal = ref(false)

// 密码输入对话框
const showPasswordDialog = ref(false)
const passwordInput = ref('')
const currentRoom = ref(null)

// 房间状态选项
const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'waiting', label: '等待中' },
  { value: 'picking', label: '选人中' },
  { value: 'gaming', label: '游戏中' },
]

// 游戏类型选项
const gameTypeOptions = [
  { value: '', label: '全部游戏' },
  { value: 'LOL', label: '英雄联盟' },
  { value: 'PUBG', label: '绝地求生' },
  { value: 'CSGO', label: 'CS2' },
]

// 人数选项
const playerCountOptions = [
  { value: '', label: '全部人数' },
  { value: '10', label: '10人' },
  { value: '6', label: '6人' },
  { value: '4', label: '4人' },
]

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

// 是否显示创建对话框
onMounted(() => {
  if (route.query.action === 'create') {
    showCreateRoomModal.value = true
  }
  loadRooms()
})

// 加载房间列表
const loadRooms = async () => {
  isLoading.value = true
  try {
    const result = await roomStore.fetchRooms()
    rooms.value = result || []
    console.log('获取房间列表成功，数量:', rooms.value.length)
    pagination.value.total = result?.length || 0 // 这里假设接口返回的是该筛选条件下的所有房间
  } catch (error) {
    console.error('加载房间列表失败:', error)
    ElMessage.error('加载房间列表失败')
    rooms.value = []
  } finally {
    isLoading.value = false
  }
}

// 处理搜索
const handleSearch = () => {
  pagination.value.current = 1
  loadRooms()
}

// 处理重置搜索
const handleResetSearch = () => {
  searchForm.value = {
    keyword: '',
    status: '',
    playerCount: '',
    gameType: ''
  }
  handleSearch()
}

// 处理分页变化
const handlePageChange = (page) => {
  pagination.value.current = page
  loadRooms()
}

// 处理页面大小变化
const handleSizeChange = (size) => {
  pagination.value.pageSize = size
  pagination.value.current = 1
  loadRooms()
}

// 加入房间
const joinRoom = async (room) => {
  if (room.status !== 'waiting') {
    ElMessage.warning('该房间不在等待状态，无法加入')
    return
  }

  // 如果房间玩家已满，提示用户可以加入观战席
  if (room.players && room.players.length >= room.playerCount) {
    ElMessage.info('该房间玩家已满，您将以观战者身份加入')
    // 不返回，继续执行加入房间的逻辑
  }

  console.log('准备加入房间:', room.id, room.name)

  try {
    isLoading.value = true

    // 检查用户是否已经在房间中（作为玩家或观众）
    const isAlreadyInRoom = room.players && room.players.some(player => player.userId === userStore.userId);
    const isSpectator = room.spectators && room.spectators.some(spectator => spectator.userId === userStore.userId);

    if (isAlreadyInRoom || isSpectator) {
      console.log('用户已在房间中，直接跳转到房间详情页');
      router.push(`/room/${room.id}`);
      return;
    }

    // 检查房间是否需要密码
    if (room.hasPassword) {
      // 如果需要密码，弹出密码输入对话框
      currentRoom.value = room;
      passwordInput.value = '';
      showPasswordDialog.value = true;
      isLoading.value = false;
      return;
    }

    // 如果不需要密码，直接加入房间
    await joinRoomWithPassword(room.id, null);
  } catch (error) {
    console.error('加入房间失败:', error)
    ElMessage.error(error.message || '加入房间失败，请稍后重试')
    isLoading.value = false
  }
}

// 使用密码加入房间
const joinRoomWithPassword = async (roomId, password) => {
  try {
    isLoading.value = true

    // 确保WebSocket连接（用于接收通知）
    const socketStore = useSocketStore()
    if (!socketStore.isConnected) {
      console.log('WebSocket未连接，尝试连接...')
      await socketStore.connect()
      if (!socketStore.isConnected) {
        console.warn('WebSocket连接失败，但仍然可以加入房间')
      }
    }

    // 使用REST API加入房间
    console.log(`使用REST API加入房间 ${roomId}`, password ? '带密码' : '无密码')

    // 无论有没有密码，都使用REST API加入房间
    const success = await roomStore.joinRoom(roomId, password)
    if (!success) {
      throw new Error(roomStore.error || '加入房间失败')
    }

    // 不再等待WebSocket事件，直接跳转到房间详情页
    // 如果需要房间数据，可以在房间详情页中加载
    console.log('加入房间成功，准备跳转到房间详情页')

    ElMessage.success('成功加入房间')
    // 关闭密码对话框
    showPasswordDialog.value = false
    // 导航到房间详情页
    router.push(`/room/${roomId}`)
  } catch (error) {
    console.error('加入房间失败:', error)
    ElMessage.error(error.message || '加入房间失败，请稍后重试')
  } finally {
    isLoading.value = false
  }
}

// 处理密码提交
const handlePasswordSubmit = () => {
  if (!passwordInput.value) {
    ElMessage.warning('请输入房间密码')
    return
  }

  if (currentRoom.value) {
    joinRoomWithPassword(currentRoom.value.id, passwordInput.value)
  }
}

// 处理密码取消
const handlePasswordCancel = () => {
  showPasswordDialog.value = false
  passwordInput.value = ''
  currentRoom.value = null
}

// 处理创建房间
const handleCreateRoom = () => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    router.push('/login')
    return
  }

  showCreateRoomModal.value = true
}

// 处理房间创建完成
const handleRoomCreated = (roomData) => {
  ElMessage.success('创建房间成功')
  loadRooms() // 重新加载房间列表
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
    case 'picking': return 'status-picking'
    case 'gaming': return 'status-gaming'
    case 'ended': return 'status-ended'
    default: return ''
  }
}

// 格式化时间
const formatTime = (time) => {
  if (!time) return '未知时间'

  const date = new Date(time)
  const now = new Date()
  const diff = Math.floor((now - date) / 1000 / 60) // 分钟差

  if (diff < 1) return '刚刚'
  if (diff < 60) return `${diff}分钟前`
  if (diff < 24 * 60) return `${Math.floor(diff / 60)}小时前`
  return `${Math.floor(diff / 60 / 24)}天前`
}

// 获取分页列表
const getPageList = () => {
  const totalPages = Math.ceil(pagination.value.total / pagination.value.pageSize)
  const current = pagination.value.current

  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  if (current <= 3) {
    return [1, 2, 3, 4, 5]
  }

  if (current >= totalPages - 2) {
    return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }

  return [current - 2, current - 1, current, current + 1, current + 2]
}
</script>

<template>
  <div class="rooms-container">
    <div class="room-list-header">
      <h1>内战房间列表</h1>
      <div class="room-filter">
        <div class="filter-group">
          <label>状态:</label>
          <select v-model="searchForm.status" class="form-input">
            <option v-for="item in statusOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </div>
        <div class="filter-group">
          <label>人数:</label>
          <select v-model="searchForm.playerCount" class="form-input">
            <option v-for="item in playerCountOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </div>
        <div class="filter-group">
          <input type="text" v-model="searchForm.keyword" class="form-input" placeholder="搜索房间...">
        </div>
        <button class="btn btn-primary" @click="handleCreateRoom">创建房间</button>
      </div>
    </div>

    <!-- 房间列表 -->
    <div class="room-list-grid" v-loading="isLoading">
      <div v-for="room in rooms" :key="room.id" class="room-card">
        <div class="room-card-header">
          <h3 class="room-title">{{ room.name }}</h3>
          <span :class="['room-status', statusClass(room.status)]">{{ statusText(room.status) }}</span>
        </div>
        <div class="room-card-info">
          <div class="room-card-info-item">
            <span class="info-label">创建者:</span>
            <div class="info-content">
              <img :src="room.creatorAvatar || getChampionIcon(10)" alt="创建者头像" class="player-avatar">
              <span>{{ room.creatorName || '未知玩家' }}</span>
            </div>
          </div>
          <div class="room-card-info-item">
            <span class="info-label">玩家数:</span>
            <span class="info-content">{{ room.players ? room.players.length : 0 }}/{{ room.playerCount }}</span>
          </div>
          <div class="room-card-info-item">
            <span class="info-label">观众数:</span>
            <span class="info-content"><span class="room-viewers-icon">👁️</span> {{ room.viewerCount || 0 }}</span>
          </div>
          <div class="room-card-info-item">
            <span class="info-label">游戏模式:</span>
            <span class="info-content">{{ room.pickMode || '队长BP(12211)' }}</span>
          </div>
        </div>
        <div class="room-card-players">
          <div class="player-avatars">
            <img v-for="(player, index) in (room.players || []).slice(0, 5)"
                 :key="index"
                 :src="player.avatar || getChampionIcon(index)"
                 alt="玩家头像"
                 class="player-avatar">
            <span v-if="room.players && room.players.length > 5" class="more-players">+{{ room.players.length - 5 }}</span>
          </div>
          <div class="player-slots">
            <div class="slot-count">{{ room.players ? room.players.length : 0 }}/{{ room.playerCount }}</div>
            <div class="slot-bar">
              <div class="slot-filled" :style="{width: `${(room.players ? room.players.length : 0) / room.playerCount * 100}%`}"></div>
            </div>
          </div>
        </div>
        <div class="room-card-details">
          <p>{{ room.description || '房间描述信息暂无' }}</p>
        </div>
        <div class="room-card-footer">
          <span class="room-time">创建于 {{ formatTime(room.createTime) }}</span>
          <a v-if="room.status === 'waiting'" href="javascript:void(0)" class="btn btn-primary" @click="joinRoom(room)">加入房间</a>
          <button v-else-if="room.status === 'gaming'" class="btn btn-outline" @click="joinRoom(room)">观战中+</button>
          <button v-else class="btn btn-outline" disabled>{{ room.status === 'picking' ? '选人进行中' : '已结束' }}</button>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div class="pagination">
      <button class="pagination-btn" @click="handlePageChange(pagination.current - 1)" :disabled="pagination.current <= 1">&laquo;</button>
      <button
        v-for="page in getPageList()"
        :key="page"
        :class="['pagination-btn', { active: page === pagination.current }]"
        @click="handlePageChange(page)"
      >
        {{ page }}
      </button>
      <button class="pagination-btn" @click="handlePageChange(pagination.current + 1)" :disabled="pagination.current >= Math.ceil(pagination.total / pagination.pageSize)">&raquo;</button>
    </div>

    <!-- 创建房间对话框 -->
    <CreateRoomModal
      v-model:visible="showCreateRoomModal"
      @created="handleRoomCreated"
    />

    <!-- 密码输入对话框 -->
    <el-dialog
      v-model="showPasswordDialog"
      title="输入房间密码"
      width="30%"
      :close-on-click-modal="false"
    >
      <el-form>
        <el-form-item label="房间密码" :label-width="'80px'">
          <el-input
            v-model="passwordInput"
            placeholder="请输入房间密码"
            show-password
            @keyup.enter="handlePasswordSubmit"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handlePasswordCancel">取消</el-button>
          <el-button type="primary" @click="handlePasswordSubmit">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.rooms-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.room-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.room-filter {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-group select, .filter-group input {
  padding: 0.5rem;
  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--light-text);
}

.room-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.room-card {
  background-color: #1E1F2D;
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s;
}

.room-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.room-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.room-title {
  font-size: 1.2rem;
  font-weight: bold;
}

.room-status {
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
}

.status-waiting {
  background-color: #FDA92C;
  color: #000;
}

.status-gaming {
  background-color: #00CFA1;
  color: #fff;
}

.status-picking {
  background-color: #5F79FC;
  color: #fff;
}

.status-ended {
  background-color: #6c757d;
  color: #fff;
}

.room-card-info {
  margin-bottom: 1rem;
}

.room-card-info-item {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
}

.info-label {
  width: 70px;
  font-size: 0.9rem;
  color: #a0a0a0;
}

.info-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.player-avatar {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  object-fit: cover;
}

.room-card-players {
  margin-bottom: 1rem;
}

.player-avatars {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.more-players {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.3);
  font-size: 0.8rem;
}

.player-slots {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.slot-count {
  font-size: 0.8rem;
  text-align: right;
}

.slot-bar {
  height: 0.5rem;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  overflow: hidden;
}

.slot-filled {
  height: 100%;
  background: linear-gradient(90deg, #5F79FC, #00CFA1);
}

.room-card-details {
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: #a0a0a0;
  height: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.room-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.room-time {
  font-size: 0.8rem;
  color: #a0a0a0;
}

.room-viewers-icon {
  color: #5F79FC;
}

.pagination {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 2rem;
}

.pagination-btn {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background-color: #1E1F2D;
  color: #a0a0a0;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s;
}

.pagination-btn.active, .pagination-btn:hover:not(:disabled) {
  background-color: #5F79FC;
  color: white;
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>