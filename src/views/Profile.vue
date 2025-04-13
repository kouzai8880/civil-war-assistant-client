<script setup>
import { ref, onMounted, computed, reactive, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '../stores/user'
import { ElMessage, ElUpload, ElSkeleton } from 'element-plus'
import { userApi } from '../services/api'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// 用户信息
const userInfo = computed(() => userStore.userInfo || {})
const isLoggedIn = computed(() => userStore.isLoggedIn)

// 编辑状态
const isEditing = ref(false)

// 图片上传相关
const avatarUploadRef = ref(null)
const avatarUploading = ref(false)
const avatarUrl = ref('')
const avatarKey = ref(0)

// 编辑表单
const editForm = ref({
  username: '',
  email: '',
  gameId: '',
  bio: ''
})

// 更新加载状态
const updateLoading = ref(false)

// 当前激活的标签页
const activeTab = ref('stats')

// 战绩信息（模拟数据）
const stats = ref({
  totalGames: 42,
  winGames: 26,
  loseGames: 16,
  winRate: '61.9%',
  kda: '4.2 / 3.1 / 8.7',
  kdaRatio: '4.16:1',
  mvpCount: 5,
  avgCS: 180,
  favoriteChampions: [
    {
      name: '安妮',
      img: 'https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/Annie.png',
      winRate: '70%'
    },
    {
      name: '拉克丝',
      img: 'https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/Lux.png',
      winRate: '65%'
    },
    {
      name: '辛德拉',
      img: 'https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/Syndra.png',
      winRate: '60%'
    },
    {
      name: '金克丝',
      img: 'https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/Jinx.png',
      winRate: '55%'
    },
    {
      name: '阿狸',
      img: 'https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/Ahri.png',
      winRate: '50%'
    }
  ]
})

// 最近对局（模拟数据）
const recentMatches = ref([
  {
    id: 1,
    result: 'win',
    champion: {
      name: '安妮',
      img: 'https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/Annie.png'
    },
    kda: '5/2/10',
    ratio: '7.5:1',
    cs: 180,
    damage: '20.5k',
    time: '今天 16:30',
    duration: '30分钟'
  },
  {
    id: 2,
    result: 'lose',
    champion: {
      name: '拉克丝',
      img: 'https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/Lux.png'
    },
    kda: '2/5/7',
    ratio: '1.8:1',
    cs: 142,
    damage: '15.2k',
    time: '昨天 14:15',
    duration: '27分钟'
  },
  {
    id: 3,
    result: 'win',
    champion: {
      name: '金克丝',
      img: 'https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/Jinx.png'
    },
    kda: '11/3/9',
    ratio: '6.7:1',
    cs: 231,
    damage: '32.7k',
    time: '昨天 10:20',
    duration: '35分钟'
  }
])

// 加载状态
const isLoading = ref(true)

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

// 头像上传处理函数
const handleAvatarSuccess = async (options) => {
  avatarUploading.value = true

  try {
    if (!userStore.userId) {
      throw new Error('用户未登录')
    }

    // 添加详细日志
    console.log('准备上传头像文件，用户ID:', userStore.userId);
    console.log('上传文件信息:', {
      name: options.file.name,
      type: options.file.type,
      size: `${(options.file.size / 1024).toFixed(2)} KB`
    });

    // 调用API上传头像
    const response = await userApi.uploadAvatar(userStore.userId, options.file)
    console.log('头像上传API响应:', response)

    if (response.status === 'success') {
      // 获取服务器返回的头像URL，可能是base64形式的数据
      const newAvatarUrl = response.data.avatarUrl || response.data.user?.avatar || ''
      console.log('获取到的头像URL:', newAvatarUrl)

      if (!newAvatarUrl) {
        throw new Error('服务器未返回有效的头像URL')
      }

      // 更新头像URL
      avatarUrl.value = newAvatarUrl

      // 更新key强制刷新头像组件
      avatarKey.value++
      console.log('头像key更新:', avatarKey.value)

      // 更新本地存储的用户信息
      userStore.userInfo = {
        ...userStore.userInfo,
        avatar: newAvatarUrl
      }

      // 保存到localStorage
      localStorage.setItem('userInfo', JSON.stringify(userStore.userInfo))

      ElMessage.success('头像已成功上传')
    } else {
      throw new Error(response.message || '上传失败')
    }
  } catch (error) {
    console.error('头像上传错误:', error)

    // 显示错误信息
    ElMessage.error('头像上传失败: ' + (error.message || '服务器未能处理请求'))

    // 添加更多错误信息调试
    if (error.originalError) {
      console.error('原始错误:', error.originalError);
      if (error.originalError.response) {
        console.error('服务器响应:', error.originalError.response.status, error.originalError.response.data);
      }
    }
  } finally {
    avatarUploading.value = false
  }
}

// 上传前检查文件
const beforeAvatarUpload = (file) => {
  const isJPGOrPNG = file.type === 'image/jpeg' || file.type === 'image/png'
  const isLt2M = file.size / 1024 / 1024 < 2

  if (!isJPGOrPNG) {
    ElMessage.error('头像只能是JPG或PNG格式!')
    return false
  }
  if (!isLt2M) {
    ElMessage.error('头像大小不能超过2MB!')
    return false
  }
  return true
}

// 检查登录状态并处理URL查询参数
onMounted(async () => {
  console.log('Profile组件挂载，当前用户信息:', userInfo.value)

  isLoading.value = true

  if (!isLoggedIn.value) {
    ElMessage.warning('请先登录')
    router.push('/login')
    return
  }

  // 添加一个短暂延迟确保加载动画显示
  await new Promise(resolve => setTimeout(resolve, 50))

  // 从服务器刷新用户信息，确保获取最新数据
  try {
    console.log('尝试从服务器获取最新用户信息')

    const userData = await userStore.fetchCurrentUser()
    console.log('获取到最新用户信息:', userData)

    if (!userData) {
      const errorMsg = userStore.error || ''
      ElMessage.error(`API错误: ${errorMsg}`)

      if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        ElMessage.error('API端点不存在，请检查后端API路径是否正确配置')
      }

      setTimeout(() => {
        router.push('/login')
      }, 2000)
      return
    }

    ElMessage.success('用户信息已更新')

    // 确保本地头像URL与用户信息中的头像一致
    if (userStore.userInfo.avatar) {
      console.log('更新头像URL:', userStore.userInfo.avatar)
      avatarUrl.value = userStore.userInfo.avatar
      avatarKey.value++ // 强制刷新头像组件
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
    ElMessage.error('API错误: ' + (error.message || '服务器连接错误'))
  } finally {
    // 添加延迟避免闪烁
    setTimeout(() => {
      isLoading.value = false
    }, 300)
  }

  // 检查URL中是否有tab参数，并切换到对应标签页
  const tabParam = route.query.tab
  if (tabParam && ['stats', 'matches', 'champions', 'settings'].includes(tabParam)) {
    activeTab.value = tabParam
  }

  // 初始化编辑表单
  resetForm()
})

// 监听路由变化，切换到对应标签页
watch(() => route.query.tab, (newTab) => {
  if (newTab && ['stats', 'matches', 'champions', 'settings'].includes(newTab)) {
    activeTab.value = newTab
  }
}, { immediate: true })

// 开始编辑
const startEdit = () => {
  isEditing.value = true
  resetForm()
}

// 重置表单
const resetForm = () => {
  editForm.value = {
    username: userInfo.value.username || '',
    email: userInfo.value.email || '',
    gameId: userInfo.value.gameId || '',
    bio: userInfo.value.bio || ''
  }
  avatarUrl.value = userInfo.value.avatar || ''
}

// 取消编辑
const cancelEdit = () => {
  isEditing.value = false
  resetForm()
}

// 更新个人信息
const updateProfile = async () => {
  updateLoading.value = true

  try {
    // 检查用户名
    if (!editForm.value.username.trim()) {
      ElMessage.warning('用户名不能为空')
      return
    }

    console.log('开始更新个人信息:', editForm.value)

    // 更新用户信息
    const success = await userStore.updateUserInfo(editForm.value)

    if (success) {
      console.log('更新成功，新用户信息:', userStore.userInfo)

      // 强制更新头像URL
      if (editForm.value.avatar) {
        avatarUrl.value = editForm.value.avatar
        avatarKey.value++ // 强制刷新头像组件
      }

      // 确保localStorage被更新
      localStorage.setItem('userInfo', JSON.stringify(userStore.userInfo))

      ElMessage.success('个人信息更新成功')
      isEditing.value = false
    } else {
      ElMessage.error('更新失败，请稍后再试')
    }
  } catch (error) {
    console.error('更新个人信息错误:', error)
    ElMessage.error('更新失败，请稍后再试')
  } finally {
    updateLoading.value = false
  }
}

// 改变标签页
const changeTab = (tab) => {
  activeTab.value = tab
  // 更新URL，不刷新页面
  router.push({
    query: { ...route.query, tab }
  })
}

// 登出
const logout = () => {
  ElMessage.success('登出成功')
  userStore.logout()
  router.push('/')
}

// 监听avatarUrl变化，确保界面更新
watch(
  () => avatarUrl.value,
  (newUrl) => {
    console.log('头像URL已更新:', newUrl)
    // 强制更新DOM
    nextTick(() => {
      console.log('头像nextTick触发')
      const avatar = document.querySelector('.profile-avatar')
      if (avatar && avatar.src !== newUrl) {
        console.log('更新DOM中的头像src')
        avatar.src = newUrl
      }
    })
  }
)

// 监听userInfo.avatar变化
watch(
  () => userInfo.value.avatar,
  (newAvatar) => {
    console.log('userInfo.avatar变化:', newAvatar)
    if (newAvatar && !avatarUrl.value) {
      avatarUrl.value = newAvatar
    }
  }
)
</script>

<template>
  <div class="container">
    <el-skeleton v-if="isLoading" style="padding: 20px;" animated :rows="10" :throttle="500" />
    <template v-else>
      <!-- 个人信息卡片 -->
      <div class="profile-header">
        <div class="avatar-container">
          <img :src="avatarUrl || userInfo.avatar || getChampionIcon()"
               :key="'avatar-' + avatarKey"
               alt=""
               class="profile-avatar">
          <div class="avatar-upload">
            <el-upload
              ref="avatarUploadRef"
              class="avatar-uploader"
              action="#"
              :auto-upload="true"
              :show-file-list="false"
              :before-upload="beforeAvatarUpload"
              :http-request="handleAvatarSuccess"
            >
              <button class="btn btn-sm" :disabled="avatarUploading">
                <span v-if="!avatarUploading">更换头像</span>
                <span v-else>上传中...</span>
              </button>
            </el-upload>
          </div>
        </div>
        <div class="profile-info">
          <h1 class="profile-name">{{ userInfo.username || '大神玩家' }}</h1>
          <div class="profile-id">ID: {{ userInfo.gameId || 'Demigod#1234' }}</div>
          <div class="profile-stats">
            <div class="profile-stat">
              <span class="stat-value">{{ stats.totalGames }}</span>
              <span class="stat-label">内战场次</span>
            </div>
            <div class="profile-stat">
              <span class="stat-value">{{ stats.winRate }}</span>
              <span class="stat-label">胜率</span>
            </div>
            <div class="profile-stat">
              <span class="stat-value">{{ stats.kda }}</span>
              <span class="stat-label">KDA</span>
            </div>
            <div class="profile-stat">
              <span class="stat-value">{{ stats.mvpCount }}</span>
              <span class="stat-label">MVP次数</span>
            </div>
          </div>
          <div class="profile-actions">
            <button class="btn btn-outline" @click="startEdit" v-if="!isEditing">编辑资料</button>
            <template v-else>
              <button class="btn btn-outline" @click="cancelEdit">取消</button>
              <button class="btn btn-primary" @click="updateProfile" :disabled="updateLoading">保存</button>
            </template>
          </div>
          <div class="profile-bio" v-if="!isEditing">
            <p>{{ userInfo.bio || '中路法师玩家，擅长安妮、拉克丝、辛德拉等英雄。喜欢团队合作，不喜欢挂机的队友。' }}</p>
          </div>
          <div class="form-group" v-else>
            <label class="form-label">个人简介</label>
            <textarea class="form-input" v-model="editForm.bio" rows="3" placeholder="请输入个人简介"></textarea>
          </div>
        </div>
      </div>

      <div class="profile-tabs">
        <div
          :class="['profile-tab', { active: activeTab === 'stats' }]"
          @click="changeTab('stats')"
        >
          战绩统计
        </div>
        <div
          :class="['profile-tab', { active: activeTab === 'matches' }]"
          @click="changeTab('matches')"
        >
          最近比赛
        </div>
        <div
          :class="['profile-tab', { active: activeTab === 'champions' }]"
          @click="changeTab('champions')"
        >
          常用英雄
        </div>
        <div
          :class="['profile-tab', { active: activeTab === 'settings' }]"
          @click="changeTab('settings')"
        >
          个人设置
        </div>
      </div>

      <!-- 战绩统计 -->
      <div class="profile-section" v-show="activeTab === 'stats'">
        <div class="section-header">
          <h2 class="section-title">战绩概览</h2>
          <div class="section-actions">
            <select class="form-input">
              <option>全部时间</option>
              <option>最近30天</option>
              <option>最近7天</option>
            </select>
          </div>
        </div>

        <div class="stats-card">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-card-value">{{ stats.totalGames }}</div>
              <div class="stat-card-label">总场次</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value">{{ stats.winGames }}</div>
              <div class="stat-card-label">胜利</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value">{{ stats.loseGames }}</div>
              <div class="stat-card-label">失败</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value">{{ stats.winRate }}</div>
              <div class="stat-card-label">胜率</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value">{{ stats.kda }}</div>
              <div class="stat-card-label">平均 K/D/A</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value">{{ stats.kdaRatio }}</div>
              <div class="stat-card-label">KDA比率</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value">{{ stats.mvpCount }}</div>
              <div class="stat-card-label">MVP次数</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value">{{ stats.avgCS }}</div>
              <div class="stat-card-label">平均补刀</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 常用英雄 -->
      <div class="profile-section" v-show="activeTab === 'champions'">
        <div class="section-header">
          <h2 class="section-title">常用英雄</h2>
        </div>

        <div class="champion-list">
          <div v-for="(champion, index) in stats.favoriteChampions" :key="index" class="champion-card">
            <img :src="champion.img" :alt="champion.name" class="champion-image">
            <div class="champion-name">{{ champion.name }}</div>
            <div class="champion-winrate">{{ champion.winRate }} 胜率</div>
          </div>
        </div>
      </div>

      <!-- 最近比赛 -->
      <div class="profile-section" v-show="activeTab === 'matches'">
        <div class="section-header">
          <h2 class="section-title">最近比赛</h2>
          <div class="section-actions">
            <a href="javascript:void(0)" class="btn btn-outline" @click="router.push('/match-history')">查看全部</a>
          </div>
        </div>

        <div class="recent-matches">
          <div v-for="match in recentMatches" :key="match.id" :class="['match-item', match.result]">
            <div class="match-result">{{ match.result === 'win' ? '胜利' : '失败' }}</div>
            <div class="match-champion">
              <img :src="match.champion.img" :alt="match.champion.name" class="match-champion-image">
            </div>
            <div class="match-details">
              <div class="match-kda">{{ match.kda }} ({{ match.ratio }})</div>
              <div class="match-cs">CS: {{ match.cs }} | {{ match.damage }}伤害</div>
            </div>
            <div class="match-time">
              <div>{{ match.time }}</div>
              <div>{{ match.duration }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 个人设置 -->
      <div class="profile-section" v-show="activeTab === 'settings'">
        <div class="section-header">
          <h2 class="section-title">个人设置</h2>
        </div>

        <div class="settings-form">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" class="form-input" v-model="editForm.username" placeholder="请输入用户名">
          </div>

          <div class="form-group">
            <label class="form-label">游戏ID</label>
            <input type="text" class="form-input" v-model="editForm.gameId" placeholder="请输入游戏ID">
          </div>

          <div class="form-group">
            <label class="form-label">邮箱</label>
            <input type="email" class="form-input" v-model="editForm.email" placeholder="请输入邮箱">
          </div>

          <div class="form-group">
            <label class="form-label">个人简介</label>
            <textarea class="form-input" v-model="editForm.bio" rows="3" placeholder="请输入个人简介"></textarea>
          </div>

          <div class="form-actions">
            <button class="btn btn-outline" @click="cancelEdit">取消</button>
            <button class="btn btn-primary" @click="updateProfile" :disabled="updateLoading">保存更改</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
@import '../assets/css/profile.css';
/* 所有样式已移动到 profile.css */

</style>