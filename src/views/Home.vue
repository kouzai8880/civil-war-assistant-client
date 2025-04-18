<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useRoomStore } from '../stores/room'
import { useSocketStore } from '../stores/socket'
import CreateRoomModal from '../components/CreateRoomModal.vue'
import { ElMessage } from 'element-plus'

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

const router = useRouter()
const userStore = useUserStore()
const roomStore = useRoomStore()

// 用户登录状态
const isLoggedIn = computed(() => userStore.isLoggedIn)

// 模态框可见性
const showCreateRoomModal = ref(false)

// 密码输入对话框
const showPasswordDialog = ref(false)
const passwordInput = ref('')
const currentRoom = ref(null)

// 热门房间
const hotRooms = ref([])
const myRooms = ref([])
const isLoading = ref(true)

// 加载数据，从后端直接获取
onMounted(async () => {
  loadData()
})

// 加载数据函数
const loadData = async () => {
  try {
    // 后台异步加载热门房间
    isLoading.value = true
    const rooms = await roomStore.fetchRooms()
    if (rooms && rooms.length > 0) {
      // 获取正在进行的房间，最多显示3个
      hotRooms.value = rooms
        .filter(room => room.status === 'gaming' || room.status === 'waiting')
        .slice(0, 3)
    }

    if (isLoggedIn.value) {
      // 加载我的房间，API会根据当前用户token识别用户
      const userRooms = await roomStore.fetchMyRooms()
      myRooms.value = userRooms.slice(0, 3)
    }
  } catch (error) {
    console.error('加载数据失败:', error)
    ElMessage.error('加载房间列表失败，请稍后重试')
    hotRooms.value = []
  } finally {
    isLoading.value = false
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

// 创建房间
const createRoom = () => {
  if (isLoggedIn.value) {
    showCreateRoomModal.value = true
  } else {
    router.push('/login')
  }
}

// 处理房间创建事件
const handleRoomCreated = (roomData) => {
  console.log('房间创建成功:', roomData)
  // 这里可以进行其他操作，如更新房间列表等
}

// 加入房间
const joinRoom = async (room) => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    router.push('/login')
    return
  }

  try {
    isLoading.value = true

    console.log('准备加入房间:', room.id, room.name)

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

    // 使用WebSocket加入房间
    console.log(`使用WebSocket加入房间 ${roomId}`, password ? '带密码' : '无密码')

    // 无论有没有密码，都使用WebSocket加入房间
    const success = await roomStore.joinRoom(roomId, password)
    if (!success) {
      throw new Error(roomStore.error || '加入房间失败')
    }

    // 等待roomJoined事件处理跳转到房间详情页
    console.log('加入房间成功，等待roomJoined事件处理跳转')

    ElMessage.success('成功加入房间')
    // 关闭密码对话框
    showPasswordDialog.value = false

    // 不再手动跳转，由roomJoined事件处理跳转
    // router.push(`/room/${roomId}`)
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

// 查看更多房间
const viewMoreRooms = () => {
  router.push('/rooms')
}

// 查看我的房间
const viewMyRooms = () => {
  router.push('/my-rooms')
}

// 添加时间格式化函数
const formatTime = (timestamp) => {
  if (!timestamp) return '未知时间'

  const now = new Date()
  const date = new Date(timestamp)
  const diff = Math.floor((now - date) / 1000) // 差异（秒）

  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`

  return date.toLocaleDateString()
}
</script>

<template>
  <div class="container">
    <!-- 英雄区域 -->
    <section class="hero-section">
      <div class="hero-content">
        <h1 class="hero-title">内战助手 - 点燃峡谷激情</h1>
        <p class="hero-subtitle">完美的英雄联盟内战组织平台，帮助您轻松创建、管理和参与内战，享受游戏的乐趣</p>
        <button class="btn btn-primary" id="create-room-btn" @click="createRoom">立即创建房间</button>
      </div>
    </section>

    <!-- 创建房间模态框 -->
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

    <!-- 热门房间 -->
    <div class="row">
      <div class="col">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">热门房间</h2>
            <a href="javascript:void(0)" class="btn btn-outline" @click="viewMoreRooms">查看更多</a>
          </div>
          <el-skeleton :loading="isLoading" animated :count="2" :throttle="500">
            <template #default>
              <div class="room-list" v-if="hotRooms.length > 0">
                <!-- 循环渲染热门房间 -->
                <div class="room-card" v-for="room in hotRooms" :key="room.id">
                  <div class="room-header">
                    <h3 class="room-title">{{ room.name }}</h3>
                    <span :class="['room-status', statusClass(room.status)]">{{ statusText(room.status) }}</span>
                  </div>
                  <div class="room-info">
                    <span>玩家: {{ room.players ? room.players.length : 0 }}/{{ room.playerCount }}</span>
                    <span>创建时间: {{ formatTime(room.createTime) }}</span>
                  </div>
                  <div class="room-players">
                    <template v-if="room.players && room.players.length > 0">
                      <img v-for="(player, index) in room.players.slice(0, 5)"
                           :key="index"
                           :src="player.avatar || getChampionIcon(index)"
                           alt="玩家头像"
                           class="player-avatar">
                      <span v-if="room.players.length > 5" class="player-more">+{{ room.players.length - 5 }}</span>
                    </template>
                    <span v-else class="no-players">暂无玩家</span>
                  </div>
                  <div class="room-footer">
                    <a href="javascript:void(0)"
                       :class="['btn', 'btn-primary']"
                       @click.stop="joinRoom(room)">
                      {{ room.status === 'waiting' ? '加入房间' : '进入观战' }}
                    </a>
                  </div>
                </div>
              </div>

              <!-- 无房间显示 -->
              <div class="empty-state" v-else>
                <div class="empty-icon">🏠</div>
                <div class="empty-text">暂时没有热门房间</div>
                <button class="btn btn-primary" @click="createRoom">立即创建房间</button>
              </div>
            </template>
          </el-skeleton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 主内容区域 */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.hero-section {
  height: 60vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  background: url('https://images.unsplash.com/photo-1542751371-adc38448a05e?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80') no-repeat center center;
  background-size: cover;
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 2rem;
}

.hero-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.5) 100%);
}

.hero-content {
  position: relative;
  z-index: 1;
  max-width: 800px;
}

.hero-title {
  font-size: 3rem;
  margin-bottom: 1rem;
  background: linear-gradient(90deg, #6c5ce7, #00cec9, #fd79a8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 1.2rem;
  margin-bottom: 2rem;
  color: #f8f9fa;
}

/* 卡片组件 */
.card {
  background-color: rgba(30, 30, 46, 0.7);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: transform 0.3s, box-shadow 0.3s;
}

.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 1rem;
}

.card-title {
  font-size: 1.5rem;
  font-weight: bold;
}

/* 网格系统 */
.row {
  display: flex;
  flex-wrap: wrap;
  margin: -0.75rem;
}

.col {
  flex: 1;
  padding: 0.75rem;
}

/* 房间列表 */
.room-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.room-card {
  background-color: rgba(30, 30, 46, 0.7);
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: transform 0.3s, box-shadow 0.3s;
}

.room-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
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
}

.room-status {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
}

.status-waiting {
  background-color: #fdcb6e;
  color: #000;
}

.status-gaming {
  background-color: #00b894;
  color: #fff;
}

.room-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
  color: #a0a0a0;
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

.player-more {
  font-size: 0.85rem;
  color: #a0a0a0;
}

.room-footer {
  display: flex;
  justify-content: flex-end;
}

/* 按钮样式 */
.btn {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
}

.btn-primary {
  background: linear-gradient(90deg, #6c5ce7, #00cec9);
  color: white;
}

.btn-outline {
  background: transparent;
  border: 1px solid #6c5ce7;
  color: #6c5ce7;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

/* 无房间状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-text {
  font-size: 1.2rem;
  margin-bottom: 2rem;
  color: #a0a0a0;
}

.no-players {
  color: #a0a0a0;
  font-size: 0.9rem;
}
</style>