import { defineConfig } from 'vite';
import { resolve } from 'path';
import prerenderPlugin from './build/prerender.js';

export default defineConfig({
  // 绝对路径基准。
  // 多语言后页面分布在 /、/zh/、/es/ 等不同深度的目录下，相对路径（./）会在
  // 子目录里解析错（/zh/icons/... 而不是 /icons/...），所以统一走根绝对路径。
  // 站点部署在 laimoyu.top 的根目录，这正是我们需要的。
  base: '/',
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
      // 只需要两个真正的 Vite 入口：
      //   main      —— 首页（模板由 build/prerender.js 生成）
      //   bookmarks —— 后台，独立页面，主页上没有任何链接指向它
      // 其余全部页面（含各语言首页与 about/privacy/faq/contact）
      // 都在构建期由 prerender 插件用 emitFile 直接产出。
      input: {
        main: resolve(__dirname, 'index.html'),
        bookmarks: resolve(__dirname, 'bookmarks.html')
      }
    }
  }
});
