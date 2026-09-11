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
    // 不清空产物目录：CI 里每次都是干净环境，本地也能避开文件锁问题
    emptyOutDir: false,
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