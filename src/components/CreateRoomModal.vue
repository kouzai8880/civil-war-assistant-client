<script setup>
import { ref } from 'vue'
import { ElMessage, ElLoading } from 'element-plus'
import { useRouter } from 'vue-router'
import { useRoomStore } from '../stores/room'

// 路由器实例
const router = useRouter()
// 房间store
const roomStore = useRoomStore()

// 接收参数
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

// 定义事件
const emit = defineEmits(['update:visible', 'created'])

// 表单数据
const roomForm = ref({
  name: '',
  gameType: '英雄联盟',
  playerCount: '10人 (5v5)',
  pickMode: '队长BP模式(12211)',
  password: '',
  description: ''
})

// 游戏类型选项
const gameTypeOptions = [
  '英雄联盟',
  '云顶之弈',
  '无畏契约'
]

// 玩家人数选项
const playerCountOptions = [
  '10人 (5v5)',
  '6人 (3v3)',
  '4人 (2v2)',
  '2人 (1v1)'
]

// 选人模式选项
const pickModeOptions = [
  '队长BP模式(12211)',
  '队长BP模式(12221)',
  '随机分队'
]

// 下拉选择器状态
const dropdownStates = ref({
  gameType: false,
  playerCount: false,
  pickMode: false
})

// 切换下拉选择器
const toggleDropdown = (field) => {
  // 关闭其他下拉框
  Object.keys(dropdownStates.value).forEach(key => {
    if (key !== field) dropdownStates.value[key] = false
  })
  // 切换当前下拉框
  dropdownStates.value[field] = !dropdownStates.value[field]
}

// 选择选项
const selectOption = (field, option) => {
  roomForm.value[field] = option
  dropdownStates.value[field] = false
}

// 关闭模态框
const closeModal = () => {
  emit('update:visible', false)
}

// 提交表单
const submitForm = async () => {
  // 简单表单验证
  if (!roomForm.value.name.trim()) {
    ElMessage.warning('请输入房间名称')
    return
  }
  
  // 显示加载状态
  const loading = ElLoading.service({
    lock: true,
    text: '创建房间中...',
    background: 'rgba(0, 0, 0, 0.7)'
  })
  
  try {
    // 根据表单数据格式化成API需要的格式
    let apiRoomData = {
      name: roomForm.value.name.trim(),
      description: roomForm.value.description.trim(),
      // 根据选择的游戏类型映射到API需要的值
      gameType: roomForm.value.gameType === '英雄联盟' ? 'LOL' : 
                roomForm.value.gameType === '云顶之弈' ? 'TFT' : 
                roomForm.value.gameType === '无畏契约' ? 'VALORANT' : 'LOL',
      // 转换玩家数量
      playerCount: parseInt(roomForm.value.playerCount.split('人')[0]),
      // 转换选人模式
      pickMode: roomForm.value.pickMode.includes('随机分队') ? 'random' : 
                roomForm.value.pickMode.includes('12211') ? '12211' : 
                roomForm.value.pickMode.includes('12221') ? '12221' : '12211'
    }
    
    // 如果设置了密码，添加hasPassword字段
    if (roomForm.value.password.trim()) {
      apiRoomData.password = roomForm.value.password.trim()
      apiRoomData.hasPassword = true
    } else {
      apiRoomData.hasPassword = false
    }
    
    console.log('提交创建房间请求，数据:', apiRoomData)
    
    // 调用roomStore的createRoom方法
    const createdRoom = await roomStore.createRoom(apiRoomData)
    
    // 关闭加载提示
    loading.close()
    
    if (createdRoom && createdRoom.id) {
      console.log('房间创建成功，准备导航，房间ID:', createdRoom.id)
      ElMessage.success('房间创建成功！')
      emit('created', createdRoom)
      closeModal()
    } else {
      console.error('创建房间失败: 未收到有效的房间信息')
      ElMessage.error('创建房间失败: 未收到有效的房间信息')
    }
  } catch (error) {
    // 关闭加载提示
    loading.close()
    
    console.error('创建房间失败:', error)
    ElMessage.error(error.message || '创建房间失败，请稍后重试')
  }
}

// 监听点击事件，如果点击的是模态框外部，关闭模态框
const handleOverlayClick = (event) => {
  if (event.target.classList.contains('modal-overlay')) {
    closeModal()
  }
}

// 重置表单
const resetForm = () => {
  roomForm.value = {
    name: '',
    gameType: '英雄联盟',
    playerCount: '10人 (5v5)',
    pickMode: '队长BP模式(12211)',
    password: '',
    description: ''
  }
}
</script>

<template>
  <div :class="['modal-overlay', { active: props.visible }]" @click="handleOverlayClick">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">创建内战房间</h2>
        <button class="close-modal" @click="closeModal">&times;</button>
      </div>
      
      <form @submit.prevent="submitForm">
        <div class="form-group">
          <label class="form-label" for="room-name">房间名称</label>
          <input 
            type="text" 
            id="room-name" 
            class="form-input" 
            placeholder="请输入房间名称" 
            v-model="roomForm.name"
          >
        </div>
        
        <div class="form-group">
          <label class="form-label">游戏类型</label>
          <div class="selector">
            <div class="selector-selected" @click="toggleDropdown('gameType')">
              <span>{{ roomForm.gameType }}</span>
              <span>▼</span>
            </div>
            <div class="selector-options" v-show="dropdownStates.gameType">
              <div 
                v-for="option in gameTypeOptions" 
                :key="option" 
                class="selector-option"
                @click="selectOption('gameType', option)"
              >
                {{ option }}
              </div>
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">玩家人数</label>
          <div class="selector">
            <div class="selector-selected" @click="toggleDropdown('playerCount')">
              <span>{{ roomForm.playerCount }}</span>
              <span>▼</span>
            </div>
            <div class="selector-options" v-show="dropdownStates.playerCount">
              <div 
                v-for="option in playerCountOptions" 
                :key="option" 
                class="selector-option"
                @click="selectOption('playerCount', option)"
              >
                {{ option }}
              </div>
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">选人模式</label>
          <div class="selector">
            <div class="selector-selected" @click="toggleDropdown('pickMode')">
              <span>{{ roomForm.pickMode }}</span>
              <span>▼</span>
            </div>
            <div class="selector-options" v-show="dropdownStates.pickMode">
              <div 
                v-for="option in pickModeOptions" 
                :key="option" 
                class="selector-option"
                @click="selectOption('pickMode', option)"
              >
                {{ option }}
              </div>
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="room-password">房间密码(可选)</label>
          <input 
            type="password" 
            id="room-password" 
            class="form-input" 
            placeholder="设置房间密码" 
            v-model="roomForm.password"
          >
          <span class="form-help">不设密码则为公开房间</span>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="room-description">房间描述(可选)</label>
          <textarea 
            id="room-description" 
            class="form-input" 
            placeholder="请输入房间描述" 
            rows="3"
            v-model="roomForm.description"
          ></textarea>
        </div>
        
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">创建房间</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}

.modal-overlay.active {
  opacity: 1;
  pointer-events: all;
}

.modal {
  background-color: #1E1F2D;
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  padding: 2rem;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transform: translateY(20px);
  transition: transform 0.3s;
}

.modal-overlay.active .modal {
  transform: translateY(0);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 1rem;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin: 0;
  color: #fff;
}

.close-modal {
  background: none;
  border: none;
  color: #8b8fa3;
  font-size: 1.5rem;
  cursor: pointer;
  transition: color 0.3s;
}

.close-modal:hover {
  color: #fff;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  color: #8b8fa3;
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background-color: rgba(0, 0, 0, 0.2);
  color: #fff;
  font-size: 1rem;
  transition: border-color 0.3s;
}

.form-input:focus {
  outline: none;
  border-color: #5f79fc;
}

.form-help {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: #8b8fa3;
}

.form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 选择器样式 */
.selector {
  width: 100%;
  position: relative;
}

.selector-selected {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background-color: rgba(0, 0, 0, 0.2);
  color: #fff;
  cursor: pointer;
}

.selector-options {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  background-color: #1E1F2D;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 10;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 5px;
}

.selector-option {
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: background-color 0.3s;
}

.selector-option:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

/* 按钮样式 */
.btn {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: none;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background-color: #5f79fc;
  color: white;
}

.btn-primary:hover {
  background-color: #4a62d8;
  transform: translateY(-2px);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style> 