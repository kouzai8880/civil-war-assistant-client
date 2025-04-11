// src/stores/electron.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { electronService, isElectron } from '../services/electron'

/**
 * Electron状态管理Store
 * 用于管理Electron相关的状态
 */
export const useElectronStore = defineStore('electron', () => {
  // 状态
  const appVersion = ref('0.0.0')
  const isElectronEnv = ref(false)
  const lcuConnected = ref(false)
  const lcuConnecting = ref(false)
  const currentSummoner = ref(null)
  const gameflowPhase = ref('None')
  const connectionError = ref(null)

  // 计算属性
  const gameStatus = computed(() => {
    switch (gameflowPhase.value) {
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

  // 初始化
  async function init() {
    isElectronEnv.value = isElectron()
    
    if (!isElectronEnv.value) {
      console.log('非Electron环境，跳过初始化')
      return
    }
    
    try {
      // 获取应用版本
      appVersion.value = await electronService.getAppVersion()
      
      // 注册事件监听
      setupEventListeners()
      
      // 尝试连接LCU API
      await connectToLCU()
    } catch (error) {
      console.error('Electron初始化失败:', error)
    }
  }

  // 设置事件监听
  function setupEventListeners() {
    // LCU连接成功
    electronService.onLCUConnected((summoner) => {
      lcuConnected.value = true
      lcuConnecting.value = false
      currentSummoner.value = summoner
      connectionError.value = null
      
      // 获取当前游戏状态
      refreshGameflowPhase()
    })
    
    // LCU连接错误
    electronService.onLCUConnectionError((message) => {
      lcuConnected.value = false
      lcuConnecting.value = false
      connectionError.value = message
    })
    
    // 游戏状态变化
    electronService.onGameflowPhaseChanged((phase) => {
      gameflowPhase.value = phase
    })
  }

  // 连接到LCU API
  async function connectToLCU() {
    if (lcuConnecting.value) return false
    
    lcuConnecting.value = true
    connectionError.value = null
    
    try {
      const result = await electronService.connectToLCU()
      return result
    } catch (error) {
      connectionError.value = error.message
      return false
    } finally {
      lcuConnecting.value = false
    }
  }

  // 刷新游戏状态
  async function refreshGameflowPhase() {
    if (!lcuConnected.value) return
    
    try {
      const phase = await electronService.lcuAPI.getGameflowPhase()
      if (phase) {
        gameflowPhase.value = phase
      }
    } catch (error) {
      console.error('获取游戏状态失败:', error)
    }
  }

  // 检查更新
  function checkForUpdates() {
    if (!isElectronEnv.value) return
    electronService.checkForUpdates()
  }

  // 打开外部链接
  function openExternalLink(url) {
    electronService.openExternalLink(url)
  }

  return {
    // 状态
    appVersion,
    isElectronEnv,
    lcuConnected,
    lcuConnecting,
    currentSummoner,
    gameflowPhase,
    connectionError,
    gameStatus,
    
    // 方法
    init,
    connectToLCU,
    refreshGameflowPhase,
    checkForUpdates,
    openExternalLink
  }
})

export default useElectronStore
