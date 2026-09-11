# 摸鱼乐园

摸鱼资源聚合导航站，66 个精选网站，6 个分类。纯静态站点，部署到任何 CDN/虚拟主机都 OK。

## 本地开发

```bash
npm install
npm run dev
# 浏览器打开 http://localhost:5173/
```

---

## 后台管理

### 后台是一个独立的网页，不在网站里

后台地址：`bookmarks.html`（本地 `http://localhost:5173/bookmarks.html`，部署后 `https://你的域名/bookmarks.html`）

它跟你看到的网站是**两个完全独立的页面**：

- 网站主页上**没有任何**通往后台的链接、按钮或文字
- 后台也不引用网站的样式和导航，长得就不像同一个东西
- 别人不知道这个网址；就算知道了，没有你的令牌也进不去

> **把后台地址存进浏览器书签**，以后从书签直接打开就行，不用记网址。

### 怎么生成登录令牌（只做一次）

后台用你的 GitHub 令牌来验证身份——这是唯一的门锁。

1. 打开 https://github.com/settings/tokens?type=beta
2. 点 **Generate new token**
3. 权限**只勾 `public_repo`**，其他都不要勾
4. 过期时间选 90 天或 No expiration
5. 生成 → 立即复制那串 `ghp_xxx...`（页面关掉就再也看不到了）

### 第一次进后台

1. 打开后台地址 → 看到「需要登录」
2. 点「🔑 登录」→ 粘贴令牌 → 保存并连接
3. 令牌存在你自己的浏览器里，**以后打开后台直接进，不用再输**

### 编辑卡片上每个东西是什么意思

后台的每张卡片**直接就是表单**，没有弹窗。你看到的所有输入框都是直接可编辑的：

| 区域 | 怎么用 |
| --- | --- |
| **左侧 ⋮⋮** | 按住拖动：同分类内排序，或拖到别的分类（自动改分类） |
| **网站名称** | 卡片标题，直接点就能改 |
| **网址 URL** | 链接，直接点就能改 |
| **简介** | 一句话说明，直接点就能改 |
| **6 个分类按钮** | 点哪个就是哪个分类（绿色高亮 = 当前） |
| **右上 ★** | 切换「编辑精选」（绿=精选，灰=普通） |
| **右上 N** | 切换 NEW 角标（红=显示，灰=不显示） |
| **右下 🗑️** | 直接删除（弹确认框） |

改一个字段就会标记为「有未保存改动」，右上角「💾 保存到 GitHub」按钮变红闪烁。

### 日常操作

- **新增**：每个分类标题右侧「+ 新增到此分类」 → 末尾加一个空白卡片 → 直接填 → 保存
- **改内容**：点任意输入框直接改
- **改分类**：点分类按钮直接切；或者直接拖到另一个分类组里
- **排序**：按住 ⋮⋮ 拖动
- **删除**：点 🗑️
- **保存**：点右上角「💾 保存到 GitHub」

> ⚠️ **没点保存 = 没改**。下次进后台会从 GitHub 重新拉取，别担心改乱。

---

## 项目结构

```
moyu-nav/
├── index.html           # 网站首页
├── bookmarks.html       # 后台（独立页面，主页无任何链接指向它）
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── public/
│   ├── favicon.svg
│   └── icons/           # AI 生成的核心图标
└── src/
    ├── main.js          # 首页逻辑
    ├── studio.js        # 后台逻辑
    ├── style.css
    └── data/
        ├── sites.json        # ← 网站数据都在这里
        └── categories.json
```

## 直接改数据（不走后台也行）

编辑 `src/data/sites.json`：

```json
{
  "id": "g-01",
  "title": "4399",
  "url": "https://www.4399.com",
  "description": "经典小游戏大全",
  "category": "games",
  "featured": true,
  "isNew": true,
  "addedAt": "2026-09-10"
}
```

`category` 只能是这 6 个之一：`games` / `trending` / `weird` / `cover` / `tools` / `media`

## 构建

```bash
npm run build       # 输出在 dist/
```

产物是纯静态文件，把 `dist/` 上传到 GitHub Pages / Cloudflare Pages / 任何静态托管都 OK。
