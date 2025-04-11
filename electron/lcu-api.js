// electron/lcu-api.js
import { exec } from 'child_process'
import { readFile } from 'fs/promises'
import { promisify } from 'util'
import https from 'https'
import WebSocket from 'ws'
import path from 'path'

// 将exec转换为Promise形式
const execAsync = promisify(exec)

/**
 * LCU API 客户端类
 * 用于与英雄联盟客户端进行交互
 */
class LCUClient {
  constructor() {
    this.port = null
    this.token = null
    this.password = null
    this.connected = false
    this.ws = null
    this.eventHandlers = {}
  }

  /**
   * 初始化LCU客户端
   * @returns {Promise<boolean>} 连接是否成功
   */
  async init() {
    try {
      // 获取英雄联盟客户端进程信息
      const lockfileInfo = await this.getLockfileInfo()
      if (!lockfileInfo) {
        console.error('无法获取英雄联盟客户端信息，请确保客户端已启动')
        return false
      }

      // 解析lockfile信息
      const [, , port, password] = lockfileInfo.split(':')
      this.port = port
      this.password = password
      this.token = Buffer.from(`riot:${password}`).toString('base64')
      this.connected = true

      // 初始化WebSocket连接
      await this.initWebSocket()

      console.log('成功连接到LCU API')
      return true
    } catch (error) {
      console.error('LCU API初始化失败:', error)
      this.connected = false
      return false
    }
  }

  /**
   * 获取英雄联盟客户端lockfile信息
   * @returns {Promise<string|null>} lockfile内容
   */
  async getLockfileInfo() {
    try {
      // 尝试通过进程查找英雄联盟客户端
      const { stdout } = await execAsync('wmic PROCESS WHERE name="LeagueClientUx.exe" GET commandline')

      // 从命令行参数中提取安装路径
      const appPathMatch = stdout.match(/--app-path=([^\s"]+)/)
      if (!appPathMatch) {
        return null
      }

      const appPath = appPathMatch[1].replace(/"/g, '')
      const lockfilePath = path.join(appPath, 'lockfile')

      // 读取lockfile内容
      const lockfileContent = await readFile(lockfilePath, 'utf8')
      return lockfileContent
    } catch (error) {
      console.error('获取lockfile信息失败:', error)
      return null
    }
  }

  /**
   * 初始化WebSocket连接
   * @returns {Promise<void>}
   */
  async initWebSocket() {
    if (!this.connected) {
      throw new Error('未连接到LCU API')
    }

    // 创建WebSocket连接
    return new Promise((resolve, reject) => {
      // 创建WebSocket客户端，忽略SSL证书验证
      this.ws = new WebSocket(`wss://127.0.0.1:${this.port}`, {
        headers: {
          Authorization: `Basic ${this.token}`
        },
        rejectUnauthorized: false,
        perMessageDeflate: false, // 禁用压缩，避免依赖bufferutil
        maxPayload: 100 * 1024 * 1024 // 设置最大负载为100MB
      })

      // 连接成功
      this.ws.on('open', () => {
        console.log('WebSocket连接已建立')

        // 订阅游戏状态事件
        this.ws.send(JSON.stringify([5, 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase']))

        resolve()
      })

      // 接收消息
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data)

          // 处理事件消息
          if (message[0] === 8 && message[2]) {
            const { uri, data: eventData } = message[2]

            // 触发对应的事件处理函数
            if (uri.startsWith('/lol-gameflow/v1/gameflow-phase') && this.eventHandlers['gameflow-phase']) {
              this.eventHandlers['gameflow-phase'](eventData)
            }
          }
        } catch (error) {
          console.error('解析WebSocket消息失败:', error)
        }
      })

      // 连接错误
      this.ws.on('error', (error) => {
        console.error('WebSocket连接错误:', error)
        reject(error)
      })

      // 连接关闭
      this.ws.on('close', () => {
        console.log('WebSocket连接已关闭')
        this.connected = false
      })
    })
  }

  /**
   * 发送HTTP请求到LCU API
   * @param {string} method - HTTP方法
   * @param {string} endpoint - API端点
   * @param {object} [data] - 请求数据
   * @returns {Promise<any>} 响应数据
   */
  async request(method, endpoint, data = null) {
    if (!this.connected) {
      throw new Error('未连接到LCU API')
    }

    return new Promise((resolve, reject) => {
      // 构建请求选项
      const options = {
        hostname: '127.0.0.1',
        port: this.port,
        path: endpoint,
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.token}`
        },
        rejectUnauthorized: false
      }

      // 创建HTTPS请求
      const req = https.request(options, (res) => {
        let responseData = ''

        // 接收数据
        res.on('data', (chunk) => {
          responseData += chunk
        })

        // 请求完成
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              // 尝试解析JSON响应
              const jsonData = responseData ? JSON.parse(responseData) : {}
              resolve(jsonData)
            } catch (error) {
              // 如果不是JSON，返回原始响应
              resolve(responseData)
            }
          } else {
            reject(new Error(`HTTP错误: ${res.statusCode} ${responseData}`))
          }
        })
      })

      // 请求错误
      req.on('error', (error) => {
        reject(error)
      })

      // 发送请求数据
      if (data) {
        req.write(JSON.stringify(data))
      }

      req.end()
    })
  }

  /**
   * 获取当前玩家信息
   * @returns {Promise<object>} 玩家信息
   */
  async getCurrentSummoner() {
    return this.request('GET', '/lol-summoner/v1/current-summoner')
  }

  /**
   * 获取当前游戏状态
   * @returns {Promise<string>} 游戏状态
   */
  async getGameflowPhase() {
    return this.request('GET', '/lol-gameflow/v1/gameflow-phase')
  }

  /**
   * 获取当前对局信息
   * @returns {Promise<object>} 对局信息
   */
  async getCurrentGame() {
    return this.request('GET', '/lol-gameflow/v1/session')
  }

  /**
   * 获取玩家排位信息
   * @param {string} puuid - 玩家PUUID
   * @returns {Promise<object>} 排位信息
   */
  async getRankedStats(puuid) {
    return this.request('GET', `/lol-ranked/v1/ranked-stats/${puuid}`)
  }

  /**
   * 获取玩家对局历史
   * @param {string} puuid - 玩家PUUID
   * @returns {Promise<object>} 对局历史
   */
  async getMatchHistory(puuid) {
    return this.request('GET', `/lol-match-history/v1/products/lol/${puuid}/matches`)
  }

  /**
   * 获取对局详情
   * @param {string} gameId - 对局ID
   * @returns {Promise<object>} 对局详情
   */
  async getGameDetails(gameId) {
    return this.request('GET', `/lol-match-history/v1/games/${gameId}`)
  }

  /**
   * 注册事件处理函数
   * @param {string} event - 事件名称
   * @param {Function} handler - 处理函数
   */
  on(event, handler) {
    this.eventHandlers[event] = handler
  }

  /**
   * 移除事件处理函数
   * @param {string} event - 事件名称
   */
  off(event) {
    delete this.eventHandlers[event]
  }

  /**
   * 关闭连接
   */
  close() {
    if (this.ws) {
      this.ws.close()
    }
    this.connected = false
    this.port = null
    this.token = null
    this.password = null
    this.eventHandlers = {}
  }
}

// 导出LCU客户端类
export default LCUClient
