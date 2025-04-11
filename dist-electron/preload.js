import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  // 连接到LCU API
  connectToLCU: () => ipcRenderer.invoke("connect-to-lcu"),
  // 检查更新
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  // 打开外部链接
  openExternalLink: (url) => ipcRenderer.invoke("open-external-link", url),
  // 监听LCU连接状态
  onLCUConnected: (callback) => {
    ipcRenderer.on("lcu-connected", () => callback());
    return () => ipcRenderer.removeListener("lcu-connected", callback);
  },
  // 监听LCU连接错误
  onLCUConnectionError: (callback) => {
    ipcRenderer.on("lcu-connection-error", (_, message) => callback(message));
    return () => ipcRenderer.removeListener("lcu-connection-error", callback);
  },
  // 监听打开设置事件
  onOpenSettings: (callback) => {
    ipcRenderer.on("open-settings", () => callback());
    return () => ipcRenderer.removeListener("open-settings", callback);
  },
  // 监听游戏状态变化
  onGameflowPhaseChanged: (callback) => {
    ipcRenderer.on("gameflow-phase-changed", (_, phase) => callback(phase));
    return () => ipcRenderer.removeListener("gameflow-phase-changed", callback);
  },
  // LCU API相关方法
  lcuAPI: {
    // 获取当前玩家信息
    getCurrentSummoner: () => ipcRenderer.invoke("lcu-get-current-summoner"),
    // 获取当前游戏状态
    getGameflowPhase: () => ipcRenderer.invoke("lcu-get-gameflow-phase"),
    // 获取当前对局信息
    getCurrentGame: () => ipcRenderer.invoke("lcu-get-current-game"),
    // 获取玩家排位信息
    getRankedStats: (puuid) => ipcRenderer.invoke("lcu-get-ranked-stats", puuid),
    // 获取玩家对局历史
    getMatchHistory: (puuid) => ipcRenderer.invoke("lcu-get-match-history", puuid),
    // 获取对局详情
    getGameDetails: (gameId) => ipcRenderer.invoke("lcu-get-game-details", gameId)
  }
});
console.log("Electron预加载脚本已加载");
