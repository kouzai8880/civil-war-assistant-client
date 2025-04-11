// src/services/electron.js

/**
 * 检查是否在Electron环境中运行
 * @returns {boolean} 是否在Electron环境中
 */
export const isElectron = () => {
  return window && window.electronAPI !== undefined
}

/**
 * Electron API服务
 * 提供与Electron主进程通信的方法
 */
export const electronService = {
  /**
   * 获取应用版本
   * @returns {Promise<string>} 应用版本
   */
  getAppVersion: async () => {
    if (!isElectron()) return '0.0.0'
    return await window.electronAPI.getAppVersion()
  },

  /**
   * 连接到LCU API
   * @returns {Promise<boolean>} 连接是否成功
   */
  connectToLCU: async () => {
    if (!isElectron()) return false
    return await window.electronAPI.connectToLCU()
  },

  /**
   * 检查更新
   */
  checkForUpdates: () => {
    if (!isElectron()) return
    window.electronAPI.checkForUpdates()
  },

  /**
   * 打开外部链接
   * @param {string} url 链接地址
   */
  openExternalLink: (url) => {
    if (!isElectron()) {
      window.open(url, '_blank')
      return
    }
    window.electronAPI.openExternalLink(url)
  },

  /**
   * LCU API相关方法
   */
  lcuAPI: {
    /**
     * 获取当前玩家信息
     * @returns {Promise<object>} 玩家信息
     */
    getCurrentSummoner: async () => {
      if (!isElectron()) return null
      try {
        return await window.electronAPI.lcuAPI.getCurrentSummoner()
      } catch (error) {
        console.error('获取当前玩家信息失败:', error)
        return null
      }
    },

    /**
     * 获取当前游戏状态
     * @returns {Promise<string>} 游戏状态
     */
    getGameflowPhase: async () => {
      if (!isElectron()) return null
      try {
        return await window.electronAPI.lcuAPI.getGameflowPhase()
      } catch (error) {
        console.error('获取游戏状态失败:', error)
        return null
      }
    },

    /**
     * 获取当前对局信息
     * @returns {Promise<object>} 对局信息
     */
    getCurrentGame: async () => {
      if (!isElectron()) return null
      try {
        return await window.electronAPI.lcuAPI.getCurrentGame()
      } catch (error) {
        console.error('获取当前对局信息失败:', error)
        return null
      }
    },

    /**
     * 获取玩家排位信息
     * @param {string} puuid 玩家PUUID
     * @returns {Promise<object>} 排位信息
     */
    getRankedStats: async (puuid) => {
      if (!isElectron()) return null
      try {
        return await window.electronAPI.lcuAPI.getRankedStats(puuid)
      } catch (error) {
        console.error('获取排位信息失败:', error)
        return null
      }
    },

    /**
     * 获取玩家对局历史
     * @param {string} puuid 玩家PUUID
     * @returns {Promise<object>} 对局历史
     */
    getMatchHistory: async (puuid) => {
      if (!isElectron()) return null
      try {
        return await window.electronAPI.lcuAPI.getMatchHistory(puuid)
      } catch (error) {
        console.error('获取对局历史失败:', error)
        return null
      }
    },

    /**
     * 获取对局详情
     * @param {string} gameId 对局ID
     * @returns {Promise<object>} 对局详情
     */
    getGameDetails: async (gameId) => {
      if (!isElectron()) return null
      try {
        return await window.electronAPI.lcuAPI.getGameDetails(gameId)
      } catch (error) {
        console.error('获取对局详情失败:', error)
        return null
      }
    }
  },

  /**
   * 注册LCU连接成功事件监听
   * @param {Function} callback 回调函数
   * @returns {Function} 移除监听器的函数
   */
  onLCUConnected: (callback) => {
    if (!isElectron()) return () => {}
    return window.electronAPI.onLCUConnected(callback)
  },

  /**
   * 注册LCU连接错误事件监听
   * @param {Function} callback 回调函数
   * @returns {Function} 移除监听器的函数
   */
  onLCUConnectionError: (callback) => {
    if (!isElectron()) return () => {}
    return window.electronAPI.onLCUConnectionError(callback)
  },

  /**
   * 注册游戏状态变化事件监听
   * @param {Function} callback 回调函数
   * @returns {Function} 移除监听器的函数
   */
  onGameflowPhaseChanged: (callback) => {
    if (!isElectron()) return () => {}
    return window.electronAPI.onGameflowPhaseChanged(callback)
  },

  /**
   * 注册打开设置事件监听
   * @param {Function} callback 回调函数
   * @returns {Function} 移除监听器的函数
   */
  onOpenSettings: (callback) => {
    if (!isElectron()) return () => {}
    return window.electronAPI.onOpenSettings(callback)
  }
}

export default electronService
