/**
 * 语音通信工具类
 * 用于处理语音通信相关的功能
 */

class VoiceChat {
  /**
   * 构造函数
   * @param {Object} socket - Socket.io 实例
   * @param {string} roomId - 房间ID
   */
  constructor(socket, roomId) {
    this.socket = socket;
    this.roomId = roomId;
    this.mediaStream = null;
    this.audioContext = null;
    this.scriptProcessor = null;
    this.isMuted = false;
    this.isInitialized = false;
    this.audioPlayers = new Map(); // 用户ID -> 音频播放器
  }

  /**
   * 初始化语音通信
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize() {
    try {
      // 检查浏览器是否支持getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('浏览器不支持getUserMedia');
        return false;
      }

      // 请求麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 创建音频上下文
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      this.isInitialized = true;
      console.log('语音通信初始化成功');
      return true;
    } catch (error) {
      console.error('语音通信初始化失败:', error);
      return false;
    }
  }

  /**
   * 开始捕获麦克风音频
   * @returns {boolean} 是否成功开始捕获
   */
  startCapturingAudio() {
    if (!this.isInitialized || !this.mediaStream || !this.audioContext) {
      console.error('语音通信未初始化，无法开始捕获音频');
      return false;
    }

    try {
      // 创建音频源
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // 创建脚本处理器
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      // 处理音频数据
      this.scriptProcessor.onaudioprocess = (e) => {
        // 只有未静音时才发送语音数据
        if (!this.isMuted) {
          const inputBuffer = e.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          
          // 检查是否有声音（避免发送静默数据）
          if (this.hasSound(inputData)) {
            // 将Float32Array转换为ArrayBuffer
            const dataBuffer = this.float32ToInt16(inputData);
            
            // 发送语音数据
            this.socket.emit('voiceData', {
              roomId: this.roomId,
              data: dataBuffer
            });
          }
        }
      };
      
      // 连接节点
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
      
      console.log('开始捕获麦克风音频');
      return true;
    } catch (error) {
      console.error('开始捕获麦克风音频失败:', error);
      return false;
    }
  }

  /**
   * 停止捕获麦克风音频
   */
  stopCapturingAudio() {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    
    console.log('停止捕获麦克风音频');
  }

  /**
   * 检查音频数据是否有声音
   * @param {Float32Array} data - 音频数据
   * @returns {boolean} 是否有声音
   */
  hasSound(data) {
    // 计算音量均方根值
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);
    
    // 设置一个阈值，低于该阈值认为是静默
    const threshold = 0.01;
    return rms > threshold;
  }

  /**
   * 将Float32Array转换为Int16Array
   * @param {Float32Array} float32Array - 浮点音频数据
   * @returns {ArrayBuffer} 16位整数音频数据
   */
  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // 将-1.0 ~ 1.0的浮点值转换为-32768 ~ 32767的整数值
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array.buffer;
  }

  /**
   * 处理接收到的语音数据
   * @param {Object} data - 语音数据对象
   */
  handleVoiceData(data) {
    if (!data || !data.from || !data.data) {
      console.warn('接收到无效的语音数据');
      return;
    }
    
    try {
      // 创建或获取音频播放器
      let audioPlayer = this.audioPlayers.get(data.from);
      if (!audioPlayer) {
        audioPlayer = new AudioPlayer();
        this.audioPlayers.set(data.from, audioPlayer);
      }
      
      // 播放语音数据
      audioPlayer.play(data.data);
    } catch (error) {
      console.error('处理语音数据失败:', error);
    }
  }

  /**
   * 设置静音状态
   * @param {boolean} muted - 是否静音
   */
  setMuted(muted) {
    this.isMuted = muted;
    console.log(`麦克风${muted ? '已静音' : '已取消静音'}`);
  }

  /**
   * 释放资源
   */
  dispose() {
    // 停止捕获音频
    this.stopCapturingAudio();
    
    // 停止媒体流
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // 关闭音频上下文
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    // 清理音频播放器
    this.audioPlayers.forEach(player => {
      player.dispose();
    });
    this.audioPlayers.clear();
    
    this.isInitialized = false;
    console.log('语音通信资源已释放');
  }
}

/**
 * 音频播放器类
 */
class AudioPlayer {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
  }

  /**
   * 播放音频数据
   * @param {ArrayBuffer} arrayBuffer - 音频数据
   */
  play(arrayBuffer) {
    try {
      // 将Int16Array转换为Float32Array
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        // 将-32768 ~ 32767的整数值转换为-1.0 ~ 1.0的浮点值
        float32Array[i] = int16Array[i] < 0 ? int16Array[i] / 0x8000 : int16Array[i] / 0x7FFF;
      }
      
      // 创建音频缓冲区
      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, this.audioContext.sampleRate);
      audioBuffer.getChannelData(0).set(float32Array);
      
      // 创建音频源
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // 连接到增益节点
      source.connect(this.gainNode);
      
      // 开始播放
      source.start(0);
    } catch (error) {
      console.error('播放音频数据失败:', error);
    }
  }

  /**
   * 设置音量
   * @param {number} volume - 音量值（0.0 ~ 1.0）
   */
  setVolume(volume) {
    this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
  }

  /**
   * 释放资源
   */
  dispose() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export default VoiceChat;
