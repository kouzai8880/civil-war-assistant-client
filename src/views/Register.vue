<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { ElMessage } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()

// 表单数据
const registerForm = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  gameId: '',
  agreement: false
})

// 加载状态
const loading = ref(false)

// 表单校验规则
const registerRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '长度在3到20个字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '长度在6到20个字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== registerForm.password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ],
  gameId: [
    { min: 3, max: 30, message: '长度在3到30个字符', trigger: 'blur' }
  ],
  agreement: [
    {
      validator: (rule, value, callback) => {
        if (!value) {
          callback(new Error('请同意用户协议'))
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ]
}

// 注册表单引用
const registerFormRef = ref(null)

// 处理注册
const handleRegister = async () => {
  try {
    // 表单验证
    await registerFormRef.value.validate()

    // 防止重复提交
    if (loading.value) return
    loading.value = true

    // 注册处理
    const registerData = {
      username: registerForm.username,
      email: registerForm.email,
      password: registerForm.password,
      confirmPassword: registerForm.confirmPassword,
      gameId: registerForm.gameId
    }

    const success = await userStore.register(registerData)

    if (success) {
      ElMessage.success('注册成功，正在跳转到登录页')
      router.push('/login')
    } else {
      ElMessage.error(userStore.error || '注册失败，请稍后重试')
    }
  } catch (error) {
    console.error('注册失败:', error)
    ElMessage.error('注册失败，请检查输入')
  } finally {
    loading.value = false
  }
}

// 去登录
const goToLogin = () => {
  router.push('/login')
}
</script>

<template>
  <div class="register-container">
    <div class="register-card energy-border">
      <div class="register-header">
        <h2 class="register-title">用户注册</h2>
        <p class="register-subtitle">创建您的游戏内战助手账号</p>
      </div>

      <el-form
        ref="registerFormRef"
        :model="registerForm"
        :rules="registerRules"
        class="register-form"
        @submit.prevent="handleRegister"
      >
        <el-form-item prop="username">
          <el-input
            v-model="registerForm.username"
            placeholder="请设置昵称"
            prefix-icon="User"
          />
        </el-form-item>

        <el-form-item prop="email">
          <el-input
            v-model="registerForm.email"
            placeholder="请输入邮箱(登录凭证)"
            prefix-icon="Email"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="registerForm.password"
            type="password"
            placeholder="请设置密码"
            prefix-icon="Lock"
            show-password
          />
        </el-form-item>

        <el-form-item prop="confirmPassword">
          <el-input
            v-model="registerForm.confirmPassword"
            type="password"
            placeholder="请确认密码"
            prefix-icon="Lock"
            show-password
          />
        </el-form-item>

        <el-form-item prop="gameId">
          <el-input
            v-model="registerForm.gameId"
            placeholder="请输入游戏ID（可选）"
            prefix-icon="Game"
          />
          <template #tip>
            <span class="form-tip">游戏ID为可选项，稍后也可以在个人设置中绑定</span>
          </template>
        </el-form-item>

        <el-form-item prop="agreement">
          <el-checkbox v-model="registerForm.agreement">
            我已阅读并同意
            <el-link type="primary" :underline="false">用户协议</el-link>
            和
            <el-link type="primary" :underline="false">隐私政策</el-link>
          </el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            class="register-button"
            :loading="loading"
            @click="handleRegister"
          >
            注册
          </el-button>
        </el-form-item>
      </el-form>

      <div class="register-footer">
        <p>已有账号？ <el-button link type="primary" @click="goToLogin">立即登录</el-button></p>
      </div>
    </div>
  </div>
</template>

<style>
@import '../assets/css/register.css';
/* 所有样式已移动到 register.css */
</style>