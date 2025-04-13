<script setup>
import { RouterView } from 'vue-router'
import MainLayout from './layouts/MainLayout.vue'
import { ref, onMounted, provide, watch } from 'vue'
import { ElConfigProvider, ElAlert, ElButton } from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import { userApi } from './services/api'
import { useUserStore } from './stores/user'
import { useSocketStore } from './stores/socket'
import { useElectronStore } from './stores/electron'
import { isElectron } from './services/electron'
import LCUStatus from './components/LCUStatus.vue'

// API错误状态
const apiError = ref(false)
const apiErrorMessage = ref('')

// 获取store
const userStore = useUserStore()
const socketStore = useSocketStore()
const electronStore = useElectronStore()

// 是否在Electron环境中
const isElectronEnv = ref(isElectron())

// 监听登录状态变化
watch(() => userStore.isLoggedIn, async (isLoggedIn) => {
  if (isLoggedIn) {
    // 用户登录时，初始化WebSocket连接
    try {
      const connected = await socketStore.connect()
      if (!connected) {
        console.warn('WebSocket连接失败，将在用户进行交互时重试')
        // 添加重试逻辑
        const retryConnection = async () => {
          if (!socketStore.isConnected) {
            await socketStore.connect()
          }
        }
        // 监听用户交互事件
        window.addEventListener('click', retryConnection, { once: true })
        window.addEventListener('keydown', retryConnection, { once: true })
      }
    } catch (error) {
      console.error('WebSocket连接初始化失败:', error)
    }
  } else {
    // 用户登出时，断开WebSocket连接
    socketStore.disconnect()
  }
})

// 检查API连接状态
const checkApiConnection = async () => {
  try {
    console.log('正在检查API连接状态...')
    const response = await userApi.getCurrentUser()

    if (response.status === 'error') {
      if (response.message?.includes('404')) {
        apiErrorMessage.value = '(接口路径可能不正确)'
        apiError.value = true
      } else {
        // 其他API错误
        apiErrorMessage.value = `(${response.message})`
        apiError.value = true
      }
    } else {
      // API正常响应
      apiError.value = false
      apiErrorMessage.value = ''
    }
  } catch (error) {
    console.error('API连接测试失败:', error)
    apiErrorMessage.value = `(${error.message || '未知错误'})`
    apiError.value = true
  }
}

// 重试API连接
const retryApiConnection = async () => {
  await checkApiConnection()
}

// 提供API连接状态给子组件使用
provide('apiStatus', {
  apiError,
  apiErrorMessage,
  retryApiConnection
})

// 初始化时检查API连接和初始化Electron
onMounted(async () => {
  // 检查API连接
  checkApiConnection()

  // 初始化Electron功能
  if (isElectronEnv.value) {
    await electronStore.init()
  }
})
</script>

<template>
  <div class="app">
    <el-config-provider :locale="zhCn">
      <!-- Electron环境下显示LCU状态 -->
      <LCUStatus v-if="isElectronEnv" />

      <!-- 路由容器 -->
      <MainLayout>
        <RouterView />
      </MainLayout>
    </el-config-provider>
  </div>
</template>

<style>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* API错误提示条样式 */
.api-error-banner {
  position: sticky;
  top: 0;
  z-index: 2000;
  width: 100%;
}

.api-error-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 页面过渡动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* 全局样式已在main.css中定义 */
</style>
