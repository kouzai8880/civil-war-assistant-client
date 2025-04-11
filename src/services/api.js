import axios from 'axios';
import { getSocket } from './socket';
import { getToken } from './auth';

// 创建axios实例
const apiClient = axios.create({
  baseURL: 'http://localhost:3000/api/v1', // 实际API地址
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 15000 // 15秒超时
});

// API调用辅助函数 - 用于处理API错误时的情况
const handleApiError = (errorMessage, functionName) => {
  const error = new Error(errorMessage);
  console.error(`API错误(${functionName}): ${errorMessage}`);
  return {
    status: 'error',
    message: errorMessage,
    isApiError: true
  };
};

// 请求拦截器：添加token
apiClient.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 打印请求信息
    console.log(`API请求: ${config.method.toUpperCase()} ${config.url}`, {
      params: config.params || {},
      data: config.data || {},
      headers: config.headers
    });

    return config;
  },
  error => Promise.reject(error)
);

// 响应拦截器：错误处理
apiClient.interceptors.response.use(
  response => {
    // 打印API响应数据
    console.log(`API响应: ${response.config.method.toUpperCase()} ${response.config.url}`, {
      status: response.status,
      data: response.data
    });

    // 确保返回的数据包含状态信息
    const result = {
      status: response.data.status || 'success',
      data: response.data.data || response.data,
      message: response.data.message
    };

    return result;
  },
  error => {
    console.error('API错误:', error);

    // 打印错误详情
    if (error.response) {
      console.error(`API错误响应: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.request) {
      console.error(`API请求未收到响应: ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
    }

    // 处理各种HTTP错误
    if (error.response) {
      const status = error.response.status;

      // 401错误，可能是token过期
      if (status === 401) {
        // 如果不是登录接口返回的401，需要重新登录
        if (!error.config.url.includes('/auth/login')) {
          console.log('Token可能已过期，需要重新登录');
          localStorage.removeItem('token');
          localStorage.removeItem('userInfo');
          // 这里可以触发重定向到登录页
        }
      }

      const errorData = {
        status: 'error',
        code: status,
        message: error.response.data?.message || '服务器返回错误'
      };

      return Promise.reject({
        ...errorData,
        originalError: error
      });
    }

    // 请求被取消
    if (axios.isCancel(error)) {
      return Promise.reject({
        status: 'error',
        message: '请求已取消',
        originalError: error
      });
    }

    // 网络错误或其他错误
    return Promise.reject({
      status: 'error',
      message: error.message || '网络错误，请检查您的连接',
      originalError: error
    });
  }
);

// 用户相关API
export const userApi = {
  // 登录
  login: async (credentials) => {
    console.log('API方法调用: userApi.login', { credentials });

    try {
      // 格式化登录参数，使用email字段
      const formattedData = {
        email: credentials.email || credentials.username,
        password: credentials.password
      };

      console.log('格式化后的登录参数:', formattedData);

      const response = await apiClient.post('/auth/login', formattedData);
      console.log('登录API原始响应:', response);

      // 确保响应格式一致，并保存完整的用户信息
      const result = {
        status: response.status || 'success',
        token: response.token || response.data?.token,
        user: response.user || response.data?.user,
        message: response.message
      };

      // 存储用户信息到localStorage，完整保存所有字段
      if (result.user) {
        localStorage.setItem('userInfo', JSON.stringify(result.user));
      }

      return result;
    } catch (error) {
      console.error('登录API错误:', error);
      return {
        status: 'error',
        message: error.message || '登录失败，请稍后重试'
      };
    }
  },

  // 注册
  register: async (userData) => {
    console.log('API方法调用: userApi.register', { userData });

    try {
      // 确保数据格式正确
      const formattedData = {
        username: userData.username,
        email: userData.email,
        password: userData.password,
        confirmPassword: userData.confirmPassword,
        gameId: userData.gameId
      };

      console.log('发送注册请求:', formattedData);

      const response = await apiClient.post('/auth/register', formattedData);
      console.log('注册API响应:', response);

      // 确保正确处理详细的用户信息
      const result = {
        status: response.status || 'success',
        data: response.data,
        message: response.message
      };

      // 保存返回的token和用户信息
      if (result.data?.token) {
        localStorage.setItem('token', result.data.token);
      }

      if (result.data?.user) {
        localStorage.setItem('userInfo', JSON.stringify(result.data.user));
      }

      return result;
    } catch (error) {
      console.error('注册API错误:', error);
      return {
        status: 'error',
        message: error.message || '注册失败，请稍后重试'
      };
    }
  },

  // 获取当前用户信息
  getCurrentUser: async () => {
    console.log('API方法调用: userApi.getCurrentUser');

    try {
      // 修正API路径为规范文档中的正确路径
      const response = await apiClient.get('/auth/me');
      console.log('获取当前用户信息响应:', response);

      // 确保正确处理详细的用户信息
      const result = {
        status: response.status || 'success',
        user: response.user || response.data?.user,
        message: response.message
      };

      // 更新localStorage中的用户信息，确保包含完整的用户详细数据
      if (result.user) {
        localStorage.setItem('userInfo', JSON.stringify(result.user));
      }

      return result;
    } catch (error) {
      console.error('获取当前用户信息失败:', error);
      return {
        status: 'error',
        message: error.message || '获取用户信息失败',
        user: null
      };
    }
  },

  // 获取用户资料
  getUserProfile: async (userId) => {
    console.log('API方法调用: userApi.getUserProfile', { userId });

    try {
      const response = await apiClient.get(`/users/${userId}/profile`);
      return {
        status: response.status || 'success',
        data: response.data,
        message: response.message
      };
    } catch (error) {
      console.error('获取用户资料失败:', error);
      return {
        status: 'error',
        message: error.message || '获取用户资料失败',
        data: null
      };
    }
  },

  // 更新用户资料
  updateUserProfile: async (userId, userData) => {
    console.log('API方法调用: userApi.updateUserProfile', { userId, userData });

    try {
      const response = await apiClient.put(`/users/${userId}`, userData);
      console.log('更新用户资料响应:', response);

      // 确保正确处理详细的用户信息
      const result = {
        status: response.status || 'success',
        data: response.data || response,
        message: response.message || '资料更新成功'
      };

      // 更新本地存储的用户信息
      if (result.data?.user) {
        const currentUserInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        const updatedUserInfo = {
          ...currentUserInfo,
          ...result.data.user
        };
        localStorage.setItem('userInfo', JSON.stringify(updatedUserInfo));
      }

      return result;
    } catch (error) {
      console.error('更新用户资料失败:', error);
      return {
        status: 'error',
        message: error.message || '更新用户资料失败',
        data: null
      };
    }
  },

  // 上传用户头像
  uploadAvatar: async (userId, file) => {
    console.log('API方法调用: userApi.uploadAvatar', { userId, fileSize: file?.size });

    try {
      console.log('开始处理头像文件，userId:', userId);

      // 创建一个Promise来读取文件并转换为Data URL
      const fileReader = new FileReader();
      const fileToDataUrl = new Promise((resolve, reject) => {
        fileReader.onload = () => resolve(fileReader.result);
        fileReader.onerror = () => reject(new Error('文件读取失败'));
        fileReader.readAsDataURL(file);
      });

      // 等待文件读取完成
      const dataUrl = await fileToDataUrl;
      console.log('文件已转换为Data URL:', dataUrl.substring(0, 50) + '...');

      // 发送base64编码的图像数据
      const response = await apiClient.put(`/users/${userId}`, {
        avatar: dataUrl
      });

      console.log('头像上传API响应:', response);

      // 检查响应中是否包含用户信息和头像URL
      if (!response.user?.avatar && !response.data?.user?.avatar && !response.avatarUrl) {
        console.warn('API响应中未找到头像URL');
      }

      return {
        status: response.status || 'success',
        data: response.data || response,
        message: response.message || '头像已更新'
      };
    } catch (error) {
      console.error('头像上传错误:', error.response || error);

      return {
        status: 'error',
        code: error.response?.status || 500,
        message: error.response?.data?.message || '头像上传失败，服务器未能处理请求',
        originalError: error
      }
    }
  },

  // 修改密码
  changePassword: async (userId, passwordData) => {
    console.log('API方法调用: userApi.changePassword', { userId });

    try {
      const response = await apiClient.post(`/users/${userId}/change-password`, passwordData);
      return {
        status: response.status || 'success',
        data: response,
        message: response.message
      };
    } catch (error) {
      throw error;
    }
  },

  // 获取用户战绩统计
  getUserStats: (userId, params = {}) => {
    console.log('API方法调用: userApi.getUserStats', { userId, params });
    return apiClient.get(`/users/${userId}/stats`, { params });
  },

  // 获取用户对局列表
  getUserMatches: (userId, params = {}) => {
    console.log('API方法调用: userApi.getUserMatches', { userId, params });
    return apiClient.get(`/users/${userId}/matches`, { params });
  },

  // 绑定游戏账号
  bindGameAccount: async (gameData) => {
    console.log('API方法调用: userApi.bindGameAccount', { gameData });

    try {
      const response = await apiClient.post('/users/bind-game-account', gameData);
      return {
        status: response.status || 'success',
        data: response,
        message: response.message
      };
    } catch (error) {
      throw error;
    }
  }
};

// 房间相关API
export const roomApi = {
  // 获取房间列表
  getRoomList: async (params) => {
    console.log('API方法调用: roomApi.getRoomList', { params });

    try {
      const response = await apiClient.get('/rooms', { params });
      console.log('获取房间列表API响应:', response);

      // 完善返回结构，确保包含房间列表和分页信息
      return {
        status: response.status || 'success',
        data: response.data,  // 保留原始数据结构 {rooms: [...]}
        meta: response.meta,  // 分页信息
        message: response.message || '获取房间列表成功'
      };
    } catch (error) {
      console.error('获取房间列表API错误:', error);
      throw {
        message: error.response?.data?.message || error.message || '获取房间列表失败',
        status: 'error',
        originalError: error
      };
    }
  },

  // 获取用户创建的房间
  getUserRooms: async (params) => {
    console.log('API方法调用: roomApi.getUserRooms', { params });

    try {
      // 确保我们使用正确的端点 - 获取当前用户创建的房间
      const response = await apiClient.get(`/users/rooms`, { params });
      console.log('获取我的房间API响应:', response);

      // 完善返回结构
      return {
        status: response.status || 'success',
        data: response.data,  // 保留原始数据结构 {rooms: [...]}
        meta: response.meta,  // 分页信息
        message: response.message || '获取我的房间成功'
      };
    } catch (error) {
      console.error('获取我的房间API错误:', error);
      throw {
        message: error.response?.data?.message || error.message || '获取我的房间失败',
        status: 'error',
        originalError: error
      };
    }
  },

  // 创建房间
  createRoom: async (roomData) => {
    console.log('API方法调用: roomApi.createRoom', { roomData });

    try {
      const response = await apiClient.post('/rooms', roomData);
      console.log('创建房间API响应:', response);

      // 分析返回结果，处理可能的数据结构差异
      const result = {
        status: response.status || 'success',
        data: response.data?.room || response.data,
        message: response.message || '房间创建成功'
      };

      // 确保返回的room对象包含必要字段
      if (result.data && !result.data.id && result.data.room?.id) {
        result.data = result.data.room;
      }

      console.log('格式化后的房间数据:', result);
      return result;
    } catch (error) {
      console.error('创建房间API错误:', error);
      throw {
        message: error.response?.data?.message || error.message || '创建房间失败',
        status: 'error',
        originalError: error
      };
    }
  },

  // 获取房间详情
  getRoomDetail: async (roomId) => {
    console.log('API方法调用: roomApi.getRoomDetail', { roomId });

    try {
      if (!roomId) {
        throw new Error('房间ID不能为空');
      }

      const response = await apiClient.get(`/rooms/${roomId}`);
      console.log('获取房间详情API响应:', response);

      // 验证响应数据
      if (!response.data) {
        throw new Error('服务器未返回房间数据');
      }

      // 处理嵌套的数据结构 - API返回的是 {data: {room: {...}}}
      const roomData = response.data?.room || response.data;

      // 确保房间数据有ID
      if (!roomData.id) {
        console.error('房间数据缺少ID:', roomData);
        throw new Error('房间数据格式不正确，缺少ID');
      }

      // 格式化响应结果
      return {
        status: response.status || 'success',
        data: roomData,  // 直接返回room对象，不保留嵌套结构
        message: response.message || '房间详情获取成功'
      };
    } catch (error) {
      console.error('获取房间详情API错误:', error.response || error);

      // 构建错误响应
      const errorResponse = {
        status: 'error',
        message: error.response?.data?.message || error.message || '获取房间详情失败',
        code: error.response?.status || 500
      };

      // 对特定错误进行处理
      if (error.response?.status === 404) {
        errorResponse.message = '房间不存在或已关闭';
      } else if (error.response?.status === 403) {
        errorResponse.message = '您没有权限访问该房间';
      }

      throw errorResponse;
    }
  },

  // 加入房间
  joinRoom: async (roomId, userData = {}) => {
    console.log('API方法调用: roomApi.joinRoom', { roomId });

    // 使用 WebSocket 加入房间
    const socket = getSocket();
    if (!socket) {
      throw new Error('WebSocket未连接');
    }

    return new Promise((resolve, reject) => {
      socket.emit('joinRoom', { roomId, ...userData }, (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  },

  // 从观众席加入玩家列表
  joinAsPlayer: async (roomId) => {
    console.log('API方法调用: roomApi.joinAsPlayer', { roomId });

    try {
      console.log('发送加入玩家列表请求:', { roomId });
      const response = await apiClient.post(`/rooms/${roomId}/join-as-player`);
      console.log('加入玩家列表成功, 响应:', response.data);
      return {
        status: response.status || 'success',
        data: response.data,
        message: response.message || '已从观众席加入玩家列表'
      };
    } catch (error) {
      console.error('加入玩家列表API调用失败:', error.response?.data || error.message);
      throw error;
    }
  },

  // 从玩家列表进入观众席
  joinAsSpectator: async (roomId) => {
    console.log('API方法调用: roomApi.joinAsSpectator', { roomId });

    try {
      console.log('发送加入观众席请求:', { roomId });
      const response = await apiClient.post(`/rooms/${roomId}/join-as-spectator`);
      console.log('加入观众席成功, 响应:', response.data);
      return {
        status: response.status || 'success',
        data: response.data,
        message: response.message || '已从玩家列表进入观众席'
      };
    } catch (error) {
      console.error('加入观众席API调用失败:', error.response?.data || error.message);
      throw error;
    }
  },

  // 离开房间
  leaveRoom: async (roomId, userId) => {
    console.log('API方法调用: roomApi.leaveRoom', { roomId, userId });

    try {
      const response = await apiClient.post(`/rooms/${roomId}/leave`, { userId });
      return {
        status: response.status || 'success',
        data: response.data,
        message: response.message
      };
    } catch (error) {
      throw error;
    }
  },

  // 踢出玩家
  kickPlayer: async (roomId, targetUserId) => {
    console.log('API方法调用: roomApi.kickPlayer', { roomId, targetUserId });

    try {
      const response = await apiClient.post(`/rooms/${roomId}/kick`, { targetUserId });
      console.log('踢出玩家API响应:', response);

      // 确保返回正确的响应格式
      return {
        status: response.status || 'success',
        data: response.data,
        message: response.message || '已踢出用户'
      };
    } catch (error) {
      console.error('踢出玩家失败:', error);
      throw {
        status: 'error',
        message: error.response?.data?.message || error.message || '踢出玩家失败',
        originalError: error
      };
    }
  },

  // 开始游戏
  startGame: async (roomId) => {
    console.log('API方法调用: roomApi.startGame', { roomId });

    try {
      const response = await apiClient.post(`/rooms/${roomId}/start`);
      return {
        status: response.status || 'success',
        data: response.data,
        message: response.message
      };
    } catch (error) {
      throw error;
    }
  },

  // 邀请好友加入房间
  inviteFriends: (roomId, data = {}) => {
    console.log('API方法调用: roomApi.inviteFriends', { roomId, data });
    return apiClient.post(`/rooms/${roomId}/invite`, data);
  },

  // 更新房间设置
  updateRoomSettings: async (roomId, settingsData) => {
    console.log('API方法调用: roomApi.updateRoomSettings', { roomId, settingsData });

    try {
      const response = await apiClient.put(`/rooms/${roomId}/settings`, settingsData);
      return {
        status: response.status || 'success',
        data: response.data,
        message: response.message
      };
    } catch (error) {
      throw error;
    }
  }
};

// 队伍相关API
export const teamApi = {
  // 队长选择队员
  selectPlayer: (roomId, teamId, data = {}) => {
    console.log('API方法调用: teamApi.selectPlayer', { roomId, teamId, data });
    return apiClient.post(`/rooms/${roomId}/teams/${teamId}/select`, data);
  },

  // 选择红蓝方
  selectSide: (roomId, data = {}) => {
    console.log('API方法调用: teamApi.selectSide', { roomId, data });
    return apiClient.post(`/rooms/${roomId}/teams/select-side`, data);
  }
};

// 游戏相关API
export const gameApi = {
  // 提交游戏数据
  submitMatchData: (roomId, data) => {
    console.log('API方法调用: gameApi.submitMatchData', { roomId, data });
    return apiClient.post(`/rooms/${roomId}/matches`, data);
  },

  // 验证游戏自定义对局
  verifyGame: (data) => {
    console.log('API方法调用: gameApi.verifyGame', { data });
    return apiClient.post('/games/verify', data);
  }
};

// 战绩相关API
export const matchApi = {
  // 获取对局详情
  getMatchDetail: (matchId) => {
    console.log('API方法调用: matchApi.getMatchDetail', { matchId });
    return apiClient.get(`/matches/${matchId}`);
  },

  // 评价队友
  ratePlayer: (matchId, data = {}) => {
    console.log('API方法调用: matchApi.ratePlayer', { matchId, data });
    return apiClient.post(`/matches/${matchId}/rate`, data);
  }
};

// 社交相关API
export const socialApi = {
  // 获取好友列表
  getFriends: () => {
    console.log('API方法调用: socialApi.getFriends');
    return apiClient.get('/users/me/friends');
  },

  // 添加好友
  addFriend: (data = {}) => {
    console.log('API方法调用: socialApi.addFriend', { data });
    return apiClient.post('/users/friends', data);
  },

  // 删除好友
  deleteFriend: (friendId) => {
    console.log('API方法调用: socialApi.deleteFriend', { friendId });
    return apiClient.delete(`/users/me/friends/${friendId}`);
  },

  // 修改好友分组
  updateFriendGroup: (friendId, data = {}) => {
    console.log('API方法调用: socialApi.updateFriendGroup', { friendId, data });
    return apiClient.put(`/users/me/friends/${friendId}`, data);
  }
};

// 聊天相关API
export const chatApi = {
  // 获取房间聊天消息
  getRoomMessages: (roomId, params = {}) => {
    console.log('API方法调用: chatApi.getRoomMessages', { roomId, params });
    return apiClient.get(`/rooms/${roomId}/messages`, { params });
  },

  // 发送聊天消息
  sendMessage: (roomId, data = {}) => {
    console.log('API方法调用: chatApi.sendMessage', { roomId, data });

    // 使用 WebSocket 发送消息
    const socket = getSocket();
    if (!socket) {
      throw new Error('WebSocket未连接');
    }

    return new Promise((resolve, reject) => {
      socket.emit('roomMessage', { roomId, ...data }, (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  },

  // 获取大厅聊天记录
  getLobbyChat: (params = {}) => {
    console.log('API方法调用: chatApi.getLobbyChat', { params });
    return apiClient.get('/lobby/chat', { params });
  },

  // 发送大厅聊天消息
  sendLobbyMessage: (data = {}) => {
    console.log('API方法调用: chatApi.sendLobbyMessage', { data });

    // 使用 WebSocket 发送大厅消息
    const socket = getSocket();
    if (!socket) {
      throw new Error('WebSocket未连接');
    }

    return new Promise((resolve, reject) => {
      socket.emit('lobbyMessage', data, (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }
};

// 比赛统计相关API
export const statsApi = {
  // 获取用户比赛统计
  getUserStats: async (userId, params) => {
    console.log('API方法调用: statsApi.getUserStats', { userId, params });

    try {
      const response = await apiClient.get(`/users/${userId}/stats`, { params });
      return {
        status: response.status || 'success',
        data: response.data,
        message: response.message
      };
    } catch (error) {
      throw error;
    }
  },

  // 获取比赛历史
  getMatchHistory: async (params) => {
    console.log('API方法调用: statsApi.getMatchHistory', { params });

    try {
      const response = await apiClient.get('/matches', { params });
      return {
        status: response.status || 'success',
        data: response.data,
        total: response.total || response.data?.length || 0,
        message: response.message
      };
    } catch (error) {
      throw error;
    }
  },

  // 获取比赛详情
  getMatchDetail: async (matchId) => {
    console.log('API方法调用: statsApi.getMatchDetail', { matchId });

    try {
      const response = await apiClient.get(`/matches/${matchId}`);
      return {
        status: response.status || 'success',
        data: response.data,
        message: response.message
      };
    } catch (error) {
      throw error;
    }
  }
};

export default {
  userApi,
  roomApi,
  teamApi,
  gameApi,
  matchApi,
  socialApi,
  chatApi,
  statsApi
};