import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // 相对路径基准：构建产物可发布到任意子目录
  base: './',
  server: {
    port: 5173,
    open: false
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      // 多页应用：前台首页 + 独立后台页
      input: {
        main: resolve(__dirname, 'index.html'),
        // 后台是独立页面，主页上没有任何链接指向它
        bookmarks: resolve(__dirname, 'bookmarks.html')
      }
    }
  }
});