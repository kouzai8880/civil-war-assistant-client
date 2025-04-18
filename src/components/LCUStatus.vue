<template>
  <div class="lcu-status">
    <!-- <el-alert
      v-if="!connected"
      title="未连接到英雄联盟客户端"
      type="warning"
      :closable="false"
      show-icon
    >
      <template #default>
        <div class="lcu-status-content">
          <span>请确保英雄联盟客户端已启动</span>
          <el-button size="small" @click="connectToLCU" :loading="connecting">
            连接
          </el-button>
        </div>
      </template>
    </el-alert>

    <el-alert
      v-else
      title="已连接到英雄联盟客户端"
      type="success"
      :closable="false"
      show-icon
    >
      <template #default>
        <div class="lcu-status-content">
          <span>当前玩家: {{ summonerName }}</span>
          <el-tag size="small" :type="gameStatusTagType">{{ gameStatus }}</el-tag>
        </div>
      </template>
    </el-alert> -->
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage } from 'element-plus'

// 状态变量
const connected = ref(false)
const connecting = ref(false)
const summonerName = ref('')
const gamePhase = ref('')

// 计算游戏状态显示文本
const gameStatus = computed(() => {
  switch (gamePhase.value) {
    case 'None':
      return '空闲中'
    case 'Lobby':
      return '房间中'
    case 'Matchmaking':
      return '匹配中'
    case 'ReadyCheck':
      return '确认对局'
    case 'ChampSelect':
      return '英雄选择'
    case 'InProgress':
      return '游戏中'
    case 'WaitingForStats':
      return '等待结算'
    case 'EndOfGame':
      return '游戏结束'
    default:
      return '未知状态'
  }
})

// 计算游戏状态标签类型
const gameStatusTagType = computed(() => {
  switch (gamePhase.value) {
    case 'None':
    case 'Lobby':
      return 'info'
    case 'Matchmaking':
    case 'ReadyCheck':
    case 'ChampSelect':
      return 'warning'
    case 'InProgress':
      return 'danger'
    case 'WaitingForStats':
    case 'EndOfGame':
      return 'success'
    default:
      return 'info'
  }
})

// 连接到LCU API
async function connectToLCU() {
  if (connecting.value) return

  connecting.value = true
  try {
    const result = await window.electronAPI.connectToLCU()
    if (!result) {
      ElMessage.error('连接失败，请确保英雄联盟客户端已启动')
    }
  } catch (error) {
    ElMessage.error(`连接错误: ${error.message}`)
  } finally {
    connecting.value = false
  }
}

// 监听LCU连接状态
function setupListeners() {
  // 连接成功
  const removeConnectedListener = window.electronAPI.onLCUConnected((summoner) => {
    connected.value = true
    summonerName.value = summoner.displayName
    ElMessage.success(`已连接到英雄联盟客户端，玩家: ${summoner.displayName}`)
  })

  // 连接错误
  const removeErrorListener = window.electronAPI.onLCUConnectionError((message) => {
    // 只有当状态发生变化时才显示提示
    const wasConnected = connected.value
    connected.value = false
    summonerName.value = ''

    // 只有当之前是连接状态时，才显示断开连接的提示
    if (wasConnected) {
      // 使用更友好的错误提示
      ElMessage({
        message: `无法连接到英雄联盟客户端，请确保客户端已启动`,
        type: 'warning',
        duration: 5000,
        showClose: true
      })
    }
  })

  // 游戏状态变化
  const removePhaseListener = window.electronAPI.onGameflowPhaseChanged((phase) => {
    gamePhase.value = phase
    ElMessage.info(`游戏状态变化: ${gameStatus.value}`)
  })

  // 组件卸载时移除监听器
  onUnmounted(() => {
    removeConnectedListener()
    removeErrorListener()
    removePhaseListener()
  })
}

// 组件挂载时自动连接
onMounted(async () => {
  setupListeners()
  await connectToLCU()
})
</script>

<style scoped>
.lcu-status {
  margin-bottom: 16px;
}

.lcu-status-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
