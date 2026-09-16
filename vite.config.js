import { defineConfig } from 'vite';
import { resolve } from 'path';
import prerenderPlugin from './build/prerender.js';

export default defineConfig({
  // 相对路径基准：构建产物可发布到任意子目录
  base: './',
  plugins: [prerenderPlugin()],
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
      // 多页应用：前台首页 + 三个内容页 + 独立后台页
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        contact: resolve(__dirname, 'contact.html'),
        // 后台是独立页面，主页上没有任何链接指向它
        bookmarks: resolve(__dirname, 'bookmarks.html')
      }
    }
  }
});
