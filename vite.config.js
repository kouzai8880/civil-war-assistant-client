import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { join } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 配置Electron主进程
    electron([
      {
        // 主进程入口文件
        entry: 'electron/main.js',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        // 预加载脚本
        entry: 'electron/preload.js',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            // 为 preload 脚本使用 CommonJS 格式
            rollupOptions: {
              format: 'cjs'
            }
          }
        }
      }
    ]),
    // 配置渲染进程
    renderer()
  ],
  server: {
    host: "0.0.0.0",
    port: process.env.VITE_PORT || "3001"
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
