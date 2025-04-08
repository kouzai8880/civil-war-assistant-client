# 游戏内战助手 - 产品需求规格说明书

## 1. 文档信息
- **文档版本**：v1.0
- **创建日期**：2023-03-29
- **状态**：初稿

## 2. 产品概述
游戏内战助手是一个为英雄联盟玩家设计的电脑端网页内战组织平台，帮助玩家创建、管理和参与内战房间，提供全方位的内战数据统计和社交互动功能，提升内战体验。本产品专为PC端浏览器设计，不支持移动端访问。

## 3. 用户画像与使用场景

### 用户画像
1. **核心用户**：英雄联盟游戏玩家
   - 年龄：16-35岁
   - 游戏经验：有一定英雄联盟游戏经验
   - 需求：希望能与朋友组织内战，并保存战绩记录

2. **内战组织者**
   - 特点：主动性强，社交圈广
   - 需求：需要简化内战组织流程，自动化队伍分配，记录内战数据

3. **竞技型玩家**
   - 特点：重视游戏数据，关注个人表现
   - 需求：详细的战绩统计，个人表现分析

### 使用场景
1. **朋友内战**：一群朋友希望组织5v5内战，需要平台帮助分配队伍和追踪战绩
2. **社区赛事**：游戏社区组织定期内战活动，需要系统化管理多场内战
3. **训练赛**：半专业战队组织训练赛，需要记录对局数据分析提升

## 4. 功能模块拆解 (MECE原则)

### 4.1 用户账户系统
- 注册/登录功能
- 个人信息管理
- 账户设置
- 积分与等级系统

### 4.2 房间管理系统
- 房间创建
- 房间查询与筛选
- 房间状态管理(进行中/已结束)
- 房间内玩家管理

### 4.3 队伍编排系统
- 随机分队功能
- 队长选择模式(选队友)
- 红蓝方选择
- 队伍聊天(实时语音)分组

### 4.4 游戏集成系统
- LCU API集成：https://developer.riotgames.com/apis
- 对局信息获取
- 对局结果验证
- 英雄选择记录

### 4.5 战绩统计系统
- 个人战绩记录
- 队友配合数据
- 对手对抗数据
- 英雄使用统计

### 4.6 社交互动系统
- 好友管理
- 点赞/红温机制
- 聊天室功能
- 房间邀请功能

### 4.7 信息展示系统
- 个人主页
- 数据可视化
- 排行榜

## 5. 功能流程图

### 5.1 用户注册登录流程
```
@startuml
start
:用户访问网站;
if (是否有账号?) then (是)
  :登录;
  if (验证成功?) then (是)
    :进入主页;
  else (否)
    :显示错误;
    :返回登录;
  endif
else (否)
  :注册新账号;
  :填写基本信息;
  :验证账号;
  :创建账号;
  :进入主页;
endif
stop
@enduml
```

### 5.2 创建内战房间流程
```
@startuml
start
:用户点击"创建房间";
:填写房间信息;
note right
  - 游戏类型(默认英雄联盟)
  - 人数(默认10人)
  - 队伍数(默认2队)
  - 选人模式(队长BP制)
  - 可选密码
end note
:创建房间;
:生成房间ID;
:创建聊天室(文字+语音);
:等待玩家加入;
if (人数已满?) then (是)
  :开始游戏;
  :随机分配队伍;
  :随机选择队长;
  :队长开始BP选人;
  :红蓝方选择;
  :进入游戏客户端;
else (否)
  :继续等待;
endif
stop
@enduml
```

### 5.3 战绩记录流程
```
@startuml
start
:监听游戏状态;
if (检测到游戏开始?) then (是)
  :记录对局开始时间;
  :记录参与玩家;
  :监控游戏进行;
  if (游戏时长>5分钟?) then (是)
    :等待游戏结束;
    :通过LCU API获取对局结果;
    :记录对局数据;
    :更新玩家战绩;
    :更新玩家积分;
  else (否)
    :标记为无效对局;
  endif
endif
stop
@enduml
```

## 6. 交互逻辑说明

### 6.1 主界面交互
- **导航栏**: 首页、我的房间、对战房间、战绩查询、个人信息(右上角登录后放在头像旁边)、登录/注册(右上角)、好有界面（存在所有界面的右边，可以随时靠右收回和弹出），
- **大厅聊天室** 大厅聊天室放在首页，可以看到大厅的所有玩家聊天。不附带语音功能
- **登录/注册界面** 账号密码登录、手机验证登录，同意协议。
- **我加入的房间** 放在首页。

### 6.2 内战房间管理
- **创建房间**：用户点击"创建房间"按钮，填写房间信息后创建房间，同时自动创建聊天室，重点：聊天室在整个对局一直存在，直到房间关闭
- **加入房间**：用户可通过房间ID或从房间列表加入，若设有密码则需输入密码
- **房间状态**：包括"等待中"、"选人中"、"游戏中"、"已结束"四种状态
- **异常处理**：
  - 玩家中途退出：标记玩家状态为"离线"，保留其位置3分钟
  - 游戏崩溃：自动检测重连，允许房主重置当前对局

### 6.3 队伍编排
- **随机分队**：开始游戏后系统随机将玩家分为两队，随机选择队长
- **队长选人**：按照12211模式或12221模式(房主选择)进行选人
- **阵营选择**：完成选人后，一队队长选择红/蓝方
- **聊天分组**：自动将玩家加入对应队伍聊天室，玩家可自由切换至公共聊天室(语音也是)

### 6.4 数据记录
- **对局绑定**：通过LCU API检测玩家当前对局，仅记录自定义对局且与房间内玩家匹配的游戏
- **数据抓取**：对局结束后获取详细数据，包括KDA、伤害、经济等
- **胜率计算**：更新玩家与特定队友的配合胜率，对抗特定对手的胜率

### 6.5 社交互动
- **点赞/红温**：对局结束后可对队友进行评价，累计记录次数
- **好友管理**：可添加好友，分组管理，查看好友数据
- **邀请机制**：可直接邀请好友进入现有房间，或创建新房间后邀请

## 7. 数据字段定义

### 7.1 用户(User)
```json
{
  "id": "String",
  "username": "String",
  "password": "String (加密存储)",
  "email": "String",
  "avatar": "String (URL)",
  "level": "Number",
  "points": "Number",
  "gameId": "String (游戏ID)",
  "createTime": "Date",
  "lastLoginTime": "Date",
  "settings": {
    "allowInvite": "Boolean",
    "allowFriendRequest": "Boolean"
  },
  "stats": {
    "totalGames": "Number",
    "wins": "Number",
    "likes": "Number",
    "dislikes": "Number"
  }
}
```

### 7.2 房间(Room)
```json
{
  "id": "String",
  "name": "String",
  "creatorId": "String (用户ID)",
  "password": "String (可为空)",
  "gameType": "String (默认'LOL')",
  "playerCount": "Number (默认10)",
  "teamCount": "Number (默认2)",
  "pickMode": "String ('12211'或'12221')",
  "status": "String (waiting/picking/gaming/ended)",
  "createTime": "Date",
  "endTime": "Date (可为空)",
  "players": [
    {
      "userId": "String",
      "teamId": "Number",
      "isCaptain": "Boolean",
      "status": "String (online/offline/ready)"
    }
  ],
  "teams": [
    {
      "id": "Number",
      "name": "String",
      "side": "String (red/blue/none)",
      "captainId": "String (用户ID)"
    }
  ],
  "matches": ["String (比赛ID数组)"]
}
```

### 7.3 比赛(Match)
```json
{
  "id": "String",
  "roomId": "String",
  "gameId": "String (LCU API返回的游戏ID)",
  "startTime": "Date",
  "endTime": "Date",
  "duration": "Number (秒)",
  "isValid": "Boolean",
  "winner": "Number (队伍ID)",
  "teams": [
    {
      "id": "Number",
      "side": "String (red/blue)",
      "result": "String (win/lose)"
    }
  ],
  "players": [
    {
      "userId": "String",
      "teamId": "Number",
      "championId": "Number",
      "kills": "Number",
      "deaths": "Number",
      "assists": "Number",
      "damage": "Number",
      "gold": "Number",
      "cs": "Number",
      "vision": "Number",
      "kda": "Number (计算值)",
      "rating": "Number (评分)",
      "isMVP": "Boolean"
    }
  ],
  "bannedChampions": ["Number (英雄ID数组)"]
}
```

### 7.4 好友关系(Friendship)
```json
{
  "id": "String",
  "userId": "String",
  "friendId": "String",
  "groupName": "String (分组名称)",
  "createTime": "Date",
  "stats": {
    "gamesWithFriend": "Number",
    "winsWithFriend": "Number",
    "gamesAgainstFriend": "Number",
    "winsAgainstFriend": "Number"
  }
}
```

### 7.5 聊天室(ChatRoom)
```json
{
  "id": "String",
  "roomId": "String (关联房间ID)",
  "type": "String (public/team)",
  "teamId": "Number (若为team类型)",
  "messages": [
    {
      "userId": "String",
      "content": "String",
      "time": "Date",
      "type": "String (text/voice/system)"
    }
  ]
}
```

## 8. 版本更新日志

### v1.0 (初始版本)
- 基础用户系统
- 内战房间创建和管理
- 队伍随机分配和队长BP选人
- LCU API集成实现游戏数据获取
- 基础战绩统计
- 好友系统
- 聊天室功能 

## 8. 前端技术实现说明

### 8.1 技术栈选型
- **框架**: Vue 3 + TypeScript
- **UI组件库**: Element Plus
- **状态管理**: Pinia
- **路由管理**: Vue Router
- **WebSocket**: Socket.IO-client
- **HTTP请求**: Axios
- **样式方案**: SCSS + CSS Modules
- **构建工具**: Vite
- **代码规范**: ESLint + Prettier

### 8.2 项目结构
```
src/
├── assets/          # 静态资源
├── components/      # 公共组件
├── composables/     # 组合式函数
├── layouts/         # 布局组件
├── pages/           # 页面组件
├── router/          # 路由配置
├── services/        # API服务
├── stores/          # Pinia状态管理
├── styles/          # 全局样式
├── types/           # TypeScript类型定义
└── utils/           # 工具函数
```

### 8.3 核心组件说明

### 7.2 阶段二：用户系统与UI（2周）

#### 7.2.1 用户系统
- 完整注册登录流程
- 用户资料管理
- 权限系统

- **RoomDetail.vue**: 房间详情组件
  ```vue
  <template>
    <div class="room-detail">
      <chat-panel v-model:type="chatType" />
      <div class="teams-container">
        <team-panel v-for="team in teams" :key="team.id" :team="team" />
      </div>
      <spectator-list v-if="showSpectators" />
    </div>
  </template>
  ```
  - 使用`v-model`双向绑定
  - 响应式数据管理
  - 组件通信使用`emit`

#### 8.3.3 聊天组件 (Chat)
- **ChatPanel.vue**: 聊天面板组件
  ```vue
  <template>
    <div class="chat-panel">
      <message-list :messages="messages" />
      <chat-input v-model="message" @send="sendMessage" />
      <voice-controls v-if="isVoiceEnabled" />
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useChatStore } from '@/stores/chat'
  
  const chatStore = useChatStore()
  const message = ref('')
  
  const sendMessage = () => {
    chatStore.sendMessage(message.value)
    message.value = ''
  }
  </script>
  ```

#### 8.3.4 选人组件 (Champion)
- **ChampionSelect.vue**: 选人组件
  ```vue
  <template>
    <div class="champion-select">
      <div class="teams">
        <team-picks :team="blueTeam" />
        <team-picks :team="redTeam" />
      </div>
      <champion-grid @select="handleSelect" />
      <timer :time="timeLeft" />
    </div>
  </template>
  ```

### 8.4 状态管理 (Pinia)

```typescript
// stores/room.ts
export const useRoomStore = defineStore('room', {
  state: () => ({
    currentRoom: null as Room | null,
    players: [] as Player[],
    status: 'waiting' as RoomStatus
  }),
  
  getters: {
    isRoomFull: (state) => state.players.length >= 10,
    readyPlayers: (state) => state.players.filter(p => p.ready)
  },
  
  actions: {
    async joinRoom(roomId: string) {
      // 实现加入房间逻辑
    },
    setReady(status: boolean) {
      // 实现准备状态更新
    }
  }
})

// stores/chat.ts
export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as Message[],
    activeChannel: 'public',
    unreadCount: 0
  }),
  
  actions: {
    async sendMessage(content: string) {
      // 实现发送消息逻辑
    }
  }
})
```

### 8.5 组合式函数 (Composables)

```typescript
// composables/useWebSocket.ts
export function useWebSocket() {
  const socket = ref<Socket | null>(null)
  const isConnected = ref(false)
  
  const connect = () => {
    // 实现WebSocket连接逻辑
  }
  
  const disconnect = () => {
    // 实现断开连接逻辑
  }
  
  return {
    socket,
    isConnected,
    connect,
    disconnect
  }
}

// composables/useVoiceChat.ts
export function useVoiceChat() {
  const stream = ref<MediaStream | null>(null)
  const isMuted = ref(false)
  
  const startVoiceChat = async () => {
    // 实现语音聊天逻辑
  }
  
  return {
    stream,
    isMuted,
    startVoiceChat
  }
}
```

### 8.6 样式规范

#### 8.6.1 色彩系统
```scss
// 主色调
$primary-color: #7B68EE;      // 主要按钮、重要文字
$secondary-color: #6C7A89;    // 次要按钮、次要文字
$background-color: #1A1B1E;   // 主背景色
$card-background: #2A2C31;    // 卡片背景色

// 功能色
$success-color: #52C41A;      // 成功状态
$warning-color: #FAAD14;      // 警告状态
$error-color: #FF4D4F;        // 错误状态
$link-color: #1890FF;         // 链接文字

// 文字色
$text-primary: #FFFFFF;       // 主要文字
$text-secondary: #8F9BA8;     // 次要文字
$text-disabled: #6C7A89;      // 禁用文字
```

#### 8.6.2 字体规范
```scss
// 字体家族
$font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;

// 字号定义
$font-size-xs: 12px;     // 辅助文字
$font-size-sm: 14px;     // 正文（小）
$font-size-base: 16px;   // 正文
$font-size-lg: 18px;     // 小标题
$font-size-xl: 20px;     // 标题
$font-size-xxl: 24px;    // 主标题
```

#### 8.6.3 间距规范
```scss
// 间距定义
$spacing-xs: 4px;    // 最小间距
$spacing-sm: 8px;    // 小间距
$spacing-md: 16px;   // 中等间距
$spacing-lg: 24px;   // 大间距
$spacing-xl: 32px;   // 超大间距
```

### 8.7 响应式设计
- 断点设置：
  ```scss
  $breakpoints: (
    'sm': 1024px,    // 小屏幕笔记本
    'md': 1280px,    // 标准显示器
    'lg': 1440px,    // 大屏显示器
    'xl': 1920px,    // 超宽显示器
    'xxl': 2560px    // 4K显示器
  );
  ```
- 布局适配：
  - 最小宽度1024px，确保在小屏笔记本上也能正常显示
  - 默认布局针对1280px-1440px显示器优化
  - 大屏和超宽屏采用居中布局，两侧留白
  - 4K显示器支持缩放，保持界面元素比例

### 8.8 性能优化
1. **代码分割**
   - 路由级别的代码分割
   - 大型组件的异步加载

2. **资源优化**
   - 图片懒加载
   - WebP格式图片
   - 字体图标按需加载

3. **状态管理**
   - 合理使用Redux
   - 使用useCallback和useMemo
   - 避免不必要的重渲染

4. **网络优化**
   - API请求缓存
   - WebSocket心跳检测
   - 断线重连机制

### 8.9 交互动效
1. **过渡动画**
   - 页面切换渐变
   - 模态框弹出/关闭
   - 列表项添加/删除

2. **反馈动效**
   - 按钮点击波纹
   - 加载状态动画
   - 错误提示抖动

3. **功能动效**
   - 房间状态变更
   - 选人阶段动画
   - 战绩展示特效

### 8.10 开发规范
1. **命名规范**
   - 组件名：PascalCase
   - 文件名：kebab-case
   - 样式类名：BEM命名法

2. **代码风格**
   - 强制使用TypeScript
   - 遵循ESLint规则
   - 使用Prettier格式化

3. **注释规范**
   - 组件注释：JSDoc格式
   - 关键逻辑说明
   - TODO标记规范

4. **Git规范**
   - 分支管理：feature/fix/release
   - 提交信息：Angular规范
   - Code Review机制 

## 9. 界面逻辑详细说明

### 9.1 页面结构与导航

#### 9.1.1 整体布局
```
+------------------+------------------+------------------+
|                 顶部导航栏                            |
+------------------+------------------+------------------+
|                 |                  |                  |
|                 |                  |    好友列表      |
|                 |                  |    (可收起)     |
|                 |                  |                  |
|                 |                  |                  |
+------------------+------------------+------------------+
```

#### 9.1.2 导航层级
```
首页
│── 聊天大厅
├── 我的房间
│   ├── 当前房间
│   └── 历史房间
├── 房间大厅
│   ├── 房间列表
│   └── 房间详情
├── 战绩查询
│   ├── 战绩概览
│   └── 详细数据
└── 个人中心
    ├── 基本信息
    ├── 战绩统计
    └── 设置
```

### 9.2 页面状态流转

#### 9.2.1 房间状态机
```
等待中 ──────► 选人中 ──────► 游戏中 ──────► 结算中 ──────► 已结束
   ▲            │              │
   │            │              │
   └────────────┴──────────────┘
        (异常情况可回退)
```

#### 9.2.2 选人阶段状态
```
12221模式和122111模式
12221模式：
初始化 ──► 一队队长选1个 ──► 二队队长选2个──► 一队队长选2个 ──► 二队队长2个 ──► 一队队长1个 (服务器会自动选 客户端同步即可)─ ──► 完成
   ▲          │          │           │           │              │
   │          │          │           │           │              │
   └──────────┴──────────┴───────────┴───────────┴──────────────┘
                    (超时自动随机选择)
```
122111模式：
初始化 ──► 一队队长选1个 ──► 二队队长选2个──► 一队队长选2个 ──► 二队队长1个 ──► 一队队长1个 ──► 二队队长1个 (服务器会自动选 客户端同步即可)──► 完成
   ▲          │          │           │           │              │
   │          │          │           │           │              │
   └──────────┴──────────┴───────────┴───────────┴──────────────┘
                    (超时自动随机选择)

### 9.3 关键页面交互说明

#### 9.3.1 顶部导航栏
- **布局结构**：
  ```
  **未登录状态**：
  1. 右侧显示"登录"和"注册"按钮
  +--------------------------------------------------------------------------------+
  | Logo  首页  聊天大厅 我的房间  房间大厅  战绩查询                              登录   注册 |
  +--------------------------------------------------------------------------------+
   **已登录状态**：
  1. 通知按钮：
  2. 头像和昵称：
  +--------------------------------------------------------------------------------+
  | Logo  首页  聊天大厅 我的房间  房间大厅  战绩查询                     通知  头像  昵称  ▼   |
  +--------------------------------------------------------------------------------+
  ```
- **未登录状态**：
  1. 右侧显示"登录"和"注册"按钮
  2. 点击登录按钮弹出登录模态框：
     ```
     +------------------------+
     |        登录账号        |
     +------------------------+
     | 账号：                 |
     | [输入框]              |
     | 密码：                 |
     | [输入框]              |
     +------------------------+
     | [登录]  [忘记密码]     |
     | [手机验证码登录]       |
     +------------------------+
     | 还没有账号？[立即注册]  |
     +------------------------+
     ```
  3. 点击注册按钮弹出注册模态框：
     ```
     +------------------------+
     |        注册账号        |
     +------------------------+
     | 手机号：               |
     | [输入框] [获取验证码]  |
     | 验证码：               |
     | [输入框]              |
     | 密码：                 |
     | [输入框]              |
     | 确认密码：             |
     | [输入框]              |
     +------------------------+
     | [同意用户协议] [注册]  |
     +------------------------+
     ```

- **已登录状态**：
  1. 通知按钮：
     - 未读消息显示红点标记
     - 点击展开通知面板：
       ```
       +------------------------+
       |     通知消息中心       |
       +------------------------+
       | [全部] [未读] [已读]  |
       +------------------------+
       | • 好友申请通知         |
       | • 房间邀请通知         |
       | • 系统公告通知         |
       +------------------------+
       | [全部标为已读] [更多]  |
       +------------------------+
       ```
     - 通知类型：
       - 好友申请：显示申请人头像和昵称，提供"同意"和"拒绝"按钮
       - 房间邀请：显示邀请人和房间信息，提供"加入"和"拒绝"按钮
       - 系统公告：显示公告内容和时间

  2. 头像和昵称：
     - 头像显示用户当前头像
     - 昵称显示用户游戏昵称
     - 点击下拉箭头展开个人菜单：
       ```
       +------------------------+
       | 个人资料               |
       | 我的战绩               |
       | 好友管理               |
       | 系统设置               |
       | ──────────────        |
       | 退出登录               |
       +------------------------+
       ```

  3. 交互逻辑：
     - 通知消息实时更新（WebSocket）
     - 未读消息数量实时显示
     - 点击通知项可直接跳转相关页面
     - 通知支持批量处理（全部已读、批量删除）
     - 个人菜单项支持键盘导航

#### 9.3.2 首页
- **布局结构**：
  ```
  +------------------------+
  |      Banner区域        |
  +------------------------+
  |    热门房间推荐        |
  +------------------------+
  |    我加入的房间        |
  +------------------------+

  ```
- **交互逻辑**：
  1. Banner区域显示创建房间按钮和快速加入按钮
  2. 热门房间最多显示4个，可横向滚动查看更多
  3. 我加入的房间显示最近3个，点击"更多"跳转到房间列表

#### 9.3.2 房间详情页
- **布局结构**：
  ```
  +------------+------------------+----------------+
  |            |   房间信息栏     |                 |
  |   文字语音  +------------------+      好友栏    |
  |    聊天区   |   待加入游戏区   |     (可收起)    |
  |  (可收起)   +------------------+               |
  |            |   操作按钮区     |                 |
  +------------+------------------+----------------+
  ```
- **状态展示**：
  1. 房间信息：显示房间名称、创建者、当前人数、状态等
  2. 队伍展示：显示红蓝双方玩家，包含准备状态和队长标识
  3. 聊天区：支持文字/语音切换，可选择队伍/全体聊天
  4. 观战区：显示当前观战玩家列表，支持申请加入队伍

#### 9.3.3 选人界面
- **布局结构**：
  ```
  +------------------------+-----------------------------------------+
  |               | 一队队长选择队友   |  二队队长选择队友 |           |
  |  一队聊天+语音 +------------------------+--------------           +
  |  二队聊天+语音 |      一队队长      |   二队队长       |   好友栏  |
  | 公共聊天+语音  |      已选队员      |   已选队员       |  (可收起) |
  |  (可收起)     |      待选队员      |   待选队员      |           |
  |               |      待选队员      |   待选队员      |           |
  |               |      待选队员      |   待选队员      |           |
  +------------------------+-----------------------------------------+

  ```
- **交互流程**：
  1. 队长回合：显示倒计时，可选择禁用/选择英雄 顺

#### 9.3.4 选边界面

- **布局结构**：
  ```
  +------------------------+------------------------------------+
  |           | 一队队长选择队友   |  二队队长选择队友 |           |
  |  文字语音 +------------------------+--------------           +
  |  聊天区   |      红色方      |                 |   好友栏  |
  |  (可收起) |                 |                 |  (可收起) |
  |           |                 |                |           |
  |           |                 |                |           |
  |           |                 |                |           |
  +------------------------+------------------------------------+

    ```
- **交互流程**：
  1. 一队队长选择红蓝方：一队选蓝，则二队默认红，一队选红，则二队默认蓝

#### 9.3.5战绩查询页
- **布局结构**：
  ```
  +------------------------+--------------+
  |      数据筛选器        |               |
  +------------------------+              |
  +------------------------+   好友栏      |
  |      对局列表          |    (可收起)   |
  |                       |               |
  |                       |               |
  |                       |               |
  +------------------------+---------------+
  ```
- **筛选条件**：
  1. 时间范围：今天/近7天/近30天/自定义
  2. 游戏模式：所有/内战/排位/常规
  3. 英雄筛选：可多选
  4. 队友筛选：可选择特定队友

### 9.4 状态管理设计

#### 9.4.1 全局状态
```typescript
interface GlobalState {
  // 用户信息
  user: {
    id: string;
    username: string;
    avatar: string;
    online: boolean;
  };
  
  // 房间信息
  currentRoom: {
    id: string;
    status: RoomStatus;
    players: Player[];
    teams: Team[];
  };
  
  // 聊天状态
  chat: {
    activeChannel: string;
    messages: Message[];
    unread: number;
  };
  
  // 系统状态
  system: {
    notifications: Notification[];
    loading: boolean;
    error: Error | null;
  };
}
```

#### 9.4.2 组件状态
```typescript
// 房间组件状态
interface RoomState {
  selectedTeam: number;
  ready: boolean;
  chatType: 'text' | 'voice';
  voiceEnabled: boolean;
}

// 选人组件状态
interface ChampionSelectState {
  currentTurn: number;
  timeLeft: number;
  selectedChampion: number | null;
}

// 战绩组件状态
interface MatchHistoryState {
  filters: MatchFilter;
  sortBy: string;
  page: number;
  pageSize: number;
}
```

### 9.5 错误处理与反馈

#### 9.5.1 错误类型
1. **网络错误**
   - 连接断开：自动重连，显示重连中状态
   - 请求超时：重试机制，最多重试3次
   - API错误：显示具体错误信息

2. **业务错误**
   - 房间已满：提示并推荐其他房间
   - 密码错误：允许重新输入3次
   - 权限不足：说明所需权限

3. **客户端错误**
   - 数据校验失败：标红提示具体字段
   - 操作冲突：提示等待其他操作完成
   - 状态异常：提供刷新/重置选项

#### 9.5.2 反馈方式
1. **即时反馈**
   - Toast提示：操作结果、临时消息
   - 加载状态：进度条、骨架屏
   - 动画效果：状态转换、操作确认

2. **状态指示**
   - 在线状态：绿点/灰点标识
   - 准备状态：勾选/待机图标
   - 游戏状态：状态标签、进度显示

3. **交互引导**
   - 新手引导：功能介绍、操作提示
   - 空状态：推荐操作、示例展示
   - 异常恢复：操作建议、帮助链接 

## 10. UI风格设计说明

### 10.1 整体风格定位
- **科技感**：采用未来科技风格，体现游戏对战平台的先进性
- **现代简约**：界面布局清晰，减少视觉干扰
- **动感炫酷**：通过动效和光效增强视觉体验
- **游戏风格**：融入英雄联盟的设计元素和氛围

### 10.2 视觉元素规范

#### 10.2.1 色彩方案
```scss
// 主题色
$theme-primary: #7B68EE;      // 科技紫
$theme-secondary: #00B4FF;    // 能量蓝
$theme-accent: #FF4E50;       // 强调红

// 渐变色
$gradient-primary: linear-gradient(135deg, #7B68EE 0%, #00B4FF 100%);
$gradient-dark: linear-gradient(135deg, #1A1B1E 0%, #2A2C31 100%);
$gradient-glow: linear-gradient(180deg, rgba(123,104,238,0.2) 0%, rgba(0,180,255,0.2) 100%);

// 光效色
$neon-primary: rgba(123,104,238,0.8);
$neon-secondary: rgba(0,180,255,0.8);
$neon-accent: rgba(255,78,80,0.8);

// 背景色
$bg-dark: #0A0B0E;           // 深色背景
$bg-card: #1A1B1E;           // 卡片背景
$bg-hover: #2A2C31;          // 悬浮状态
```

#### 10.2.2 光效设计
```scss
// 发光效果
.neon-glow {
  box-shadow: 0 0 10px $neon-primary,
              0 0 20px $neon-primary,
              0 0 30px $neon-primary;
}

// 能量边框
.energy-border {
  border: 1px solid transparent;
  background: linear-gradient($bg-dark, $bg-dark) padding-box,
              $gradient-primary border-box;
}

// 光晕效果
.aura-effect {
  position: relative;
  &::after {
    content: '';
    position: absolute;
    inset: -2px;
    background: $gradient-glow;
    filter: blur(10px);
    z-index: -1;
  }
}
```

#### 10.2.3 字体规范
```scss
// 主标题字体
$font-display: 'Rajdhani', sans-serif;  // 科技感字体
$font-heading: 'Chakra Petch', sans-serif;  // 未来风格字体
$font-body: 'Inter', sans-serif;  // 现代简约字体

// 字重定义
$weight-light: 300;
$weight-regular: 400;
$weight-medium: 500;
$weight-bold: 700;
```

### 10.3 界面元素风格

#### 10.3.1 按钮设计
```scss
// 主要按钮
.btn-primary {
  background: $gradient-primary;
  border: none;
  border-radius: 4px;
  padding: 12px 24px;
  color: white;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 0 15px $neon-primary;
  }
}

// 能量按钮
.btn-energy {
  background: transparent;
  border: 2px solid $theme-secondary;
  box-shadow: 0 0 10px $neon-secondary inset;
  
  &:hover {
    background: rgba(0,180,255,0.1);
    box-shadow: 0 0 20px $neon-secondary inset;
  }
}
```

#### 10.3.2 卡片设计
```scss
// 房间卡片
.room-card {
  background: $bg-card;
  border-radius: 8px;
  padding: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(123,104,238,0.2);
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    border-color: $theme-primary;
  }
}
```

### 10.4 动效设计

#### 10.4.1 过渡动画
```typescript
// 页面切换动画
const pageTransition = {
  enter: {
    opacity: 0,
    transform: 'scale(0.98)',
  },
  enterActive: {
    opacity: 1,
    transform: 'scale(1)',
    transition: 'all 0.3s ease-out',
  },
  exit: {
    opacity: 0,
    transform: 'scale(1.02)',
    transition: 'all 0.3s ease-in',
  },
};
```

#### 10.4.2 交互动效
```scss
// 能量波纹效果
@keyframes energyRipple {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

// 悬浮光效
@keyframes hoverGlow {
  0%, 100% {
    box-shadow: 0 0 15px $neon-primary;
  }
  50% {
    box-shadow: 0 0 25px $neon-primary;
  }
}
```

### 10.5 特效元素

#### 10.5.1 粒子效果
```typescript
// 背景粒子配置
const particlesConfig = {
  particles: {
    number: {
      value: 80,
      density: {
        enable: true,
        area: 800
      }
    },
    color: {
      value: ["#7B68EE", "#00B4FF"]
    },
    links: {
      enable: true,
      color: "#7B68EE",
      opacity: 0.2
    },
    move: {
      enable: true,
      speed: 1,
      direction: "none"
    }
  }
};
```

#### 10.5.2 光束效果
```scss
// 能量光束
.energy-beam {
  position: absolute;
  width: 2px;
  background: $gradient-primary;
  filter: blur(4px);
  animation: beamMove 2s infinite;
}

@keyframes beamMove {
  0% {
    height: 0;
    opacity: 0;
  }
  50% {
    height: 100%;
    opacity: 1;
  }
  100% {
    height: 0;
    opacity: 0;
  }
}
```

### 10.6 响应式适配

#### 10.6.1 布局优化
```typescript
// 根据屏幕尺寸调整布局
const layoutConfig = {
  default: {
    sidebarWidth: 280,
    chatPanelWidth: 320,
    contentMaxWidth: 1440
  },
  wide: {
    sidebarWidth: 320,
    chatPanelWidth: 360,
    contentMaxWidth: 1920
  },
  ultraWide: {
    sidebarWidth: 360,
    chatPanelWidth: 400,
    contentMaxWidth: 2560
  }
};
```

#### 10.6.2 性能优化
```typescript
// 根据设备性能调整动效
const performanceConfig = {
  highEnd: {
    enableParticles: true,
    enableBlur: true,
    enableShadows: true,
    enableComplexAnimations: true
  },
  mediumEnd: {
    enableParticles: true,
    enableBlur: true,
    enableShadows: false,
    enableComplexAnimations: false
  },
  lowEnd: {
    enableParticles: false,
    enableBlur: false,
    enableShadows: false,
    enableComplexAnimations: false
  }
};
```

### 10.7 浏览器兼容性
- **支持浏览器**：
  - Chrome 80+
  - Firefox 75+
  - Edge 80+
  - Safari 13+
- **不支持**：
  - IE浏览器
  - 移动端浏览器
  - 旧版浏览器

### 10.8 键盘快捷键支持
```typescript
// 全局快捷键配置
const keyboardShortcuts = {
  // 房间操作
  'ctrl+n': '创建新房间',
  'ctrl+j': '加入房间',
  'ctrl+l': '离开房间',
  'ctrl+r': '准备/取消准备',
  
  // 聊天操作
  'ctrl+enter': '发送消息',
  'ctrl+up': '切换到语音聊天',
  'ctrl+down': '切换到文字聊天',
  
  // 界面操作
  'ctrl+b': '显示/隐藏好友列表',
  'ctrl+m': '显示/隐藏聊天面板',
  'esc': '关闭当前弹窗/取消操作',
  
  // 游戏操作
  'ctrl+1': '选择红方',
  'ctrl+2': '选择蓝方',
  'ctrl+space': '开始游戏'
};
```

### 10.9 鼠标操作优化
- **右键菜单**：
  - 玩家头像右键：快速操作菜单（邀请、私聊、查看资料等）
  - 房间右键：快速加入、收藏等操作
  - 聊天消息右键：复制、引用、举报等操作

- **拖拽支持**：
  - 玩家可拖拽到不同队伍
  - 聊天窗口可调整大小
  - 面板可自由排列

- **双击操作**：
  - 双击玩家：查看详细资料
  - 双击房间：快速加入
  - 双击聊天消息：复制内容 
