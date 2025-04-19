<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '../stores/user'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// 登录方式
const loginType = ref('password') // 'password' 或 'sms'

// 账号密码表单
const passwordForm = reactive({
  username: '',
  password: '',
  remember: true
})

// 手机验证码表单
const smsForm = reactive({
  phone: '',
  code: '',
  remember: true
})

// 短信倒计时
const countdown = ref(0)
const countdownTimer = ref(null)

// 加载状态
const loading = ref(false)

// 表单校验规则
const passwordRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '长度在3到20个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '长度在6到20个字符', trigger: 'blur' }
  ]
}

const smsRules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入验证码', trigger: 'blur' },
    { len: 6, message: '验证码长度为6位', trigger: 'blur' }
  ]
}

// 密码登录表单引用
const passwordFormRef = ref(null)

// 短信登录表单引用
const smsFormRef = ref(null)

// 切换登录方式
const switchLoginType = (type) => {
  loginType.value = type
}

// 获取短信验证码
const getSmsCode = async () => {
  try {
    // 验证手机号格式
    const phoneValid = await smsFormRef.value.validateField('phone')
    if (phoneValid !== true) return

    // 开始倒计时
    countdown.value = 60
    countdownTimer.value = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(countdownTimer.value)
        countdownTimer.value = null
      }
    }, 1000)

    // 模拟API调用
    ElMessage.success('验证码已发送，请注意查收')
  } catch (error) {
    console.error('获取验证码失败:', error)
  }
}

// 处理登录
const handleLogin = async () => {
  try {
    // 根据登录方式选择表单
    const formRef = loginType.value === 'password' ? passwordFormRef.value : smsFormRef.value
    const form = loginType.value === 'password' ? passwordForm : smsForm

    // 表单验证
    await formRef.validate()

    // 防止重复提交
    if (loading.value) return
    loading.value = true

    // 登录处理
    const loginData = loginType.value === 'password'
      ? { username: form.username, password: form.password }
      : { phone: form.phone, code: form.code }

    const success = await userStore.login(loginData)

    if (success) {
      ElMessage.success('登录成功')

      // 尝试获取用户信息
      try {
        console.log('尝试获取用户信息')
        const userData = await userStore.fetchCurrentUser()

        if (!userData) {
          const errorMsg = userStore.error || ''
          console.error('获取用户信息失败:', errorMsg)

          if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
            ElMessage.error('API错误: 用户信息接口(/auth/me)不存在，请确认后端API实现')
          } else {
            ElMessage.error('API错误: ' + errorMsg)
          }

          // 虽然用户信息获取失败，但不影响登录流程，用户仍可以使用基本功能
          ElMessage.warning('部分功能可能受限，请联系管理员检查API配置')
        }
      } catch (e) {
        console.error('获取用户信息异常:', e)
        ElMessage.error('API错误: ' + (e.message || '未知错误'))
      }

      // 登录成功后的跳转
      const redirectUrl = route.query.redirect || '/'
      router.push(redirectUrl)
    } else {
      ElMessage.error(userStore.error || '登录失败，请稍后重试')
    }
  } catch (error) {
    console.error('登录失败:', error)
    ElMessage.error('登录失败，请检查输入')
  } finally {
    loading.value = false
  }
}

// 去注册
const goToRegister = () => {
  router.push('/register')
}
</script>

<template>
  <div class="login-container">
    <div class="login-card energy-border">
      <div class="login-header">
        <h2 class="login-title">用户登录</h2>
        <p class="login-subtitle">欢迎回到游戏内战助手</p>
      </div>

      <div class="login-tabs">
        <div
          :class="['login-tab', { active: loginType === 'password' }]"
          @click="switchLoginType('password')"
        >
          账号密码登录
        </div>
        <div
          :class="['login-tab', { active: loginType === 'sms' }]"
          @click="switchLoginType('sms')"
        >
          手机验证登录
        </div>
      </div>

      <!-- 账号密码登录 -->
      <el-form
        v-if="loginType === 'password'"
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="passwordForm.username"
            placeholder="请输入用户名"
            prefix-icon="User"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="passwordForm.password"
            type="password"
            placeholder="请输入密码"
            prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <div class="form-option">
          <el-checkbox v-model="passwordForm.remember">记住我</el-checkbox>
          <el-link type="primary" :underline="false">忘记密码？</el-link>
        </div>

        <el-form-item>
          <el-button
            type="primary"
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 手机验证码登录 -->
      <el-form
        v-if="loginType === 'sms'"
        ref="smsFormRef"
        :model="smsForm"
        :rules="smsRules"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="phone">
          <el-input
            v-model="smsForm.phone"
            placeholder="请输入手机号"
            prefix-icon="Iphone"
            maxlength="11"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item prop="code">
          <el-input
            v-model="smsForm.code"
            placeholder="请输入验证码"
            prefix-icon="ChatLineRound"
            maxlength="6"
            @keyup.enter="handleLogin"
          >
            <template #append>
              <el-button
                :disabled="countdown > 0"
                @click="getSmsCode"
              >
                {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
              </el-button>
            </template>
          </el-input>
        </el-form-item>

        <div class="form-option">
          <el-checkbox v-model="smsForm.remember">记住我</el-checkbox>
        </div>

        <el-form-item>
          <el-button
            type="primary"
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <p>还没有账号？ <el-button link type="primary" @click="goToRegister">立即注册</el-button></p>
      </div>
    </div>
  </div>
</template>

<style>
@import '../assets/css/login.css';
/* 所有样式已移动到 login.css */
</style>