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
  console.log('准备加入房间:', room.id, room.name)

  try {
    isLoading.value = true

    // 检查用户是否已经在房间中（作为玩家或观众）
    const isAlreadyInRoom = room.players && room.players.some(player => player.userId === userStore.userId);
    const isSpectator = room.spectators && room.spectators.some(spectator => spectator.userId === userStore.userId);

    if (isAlreadyInRoom || isSpectator) {
      console.log('用户已在房间中，发送joinRoom事件确保数据更新');
      // 即使用户已在房间中，也发送joinRoom事件确保数据更新
      // 跳转将由roomJoined事件处理
      await roomStore.joinRoom(room.id, null);
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
    <el-skeleton :loading="isLoading" animated :count="6" :throttle="500">
      <template #default>
        <div class="room-list-grid">
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
          <a href="javascript:void(0)" class="btn btn-primary" @click="joinRoom(room)">加入房间</a>
        </div>
          </div>
        </div>
      </template>
    </el-skeleton>

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

<style>
@import '../assets/css/rooms.css';
/* 所有样式已移动到 rooms.css */
</style>