# 摸鱼乐园

摸鱼资源聚合导航站，95 个精选网站，8 个分类。纯静态站点，构建期已把内容静态渲染进 HTML，爬虫不执行 JS 也能读到全部内容。

- 线上地址：https://laimoyu.top/
- 后台地址：https://laimoyu.top/bookmarks.html
- 关于 / 隐私 / 联系：`about.html` / `privacy.html` / `contact.html`
- 代码仓库：https://github.com/Daniel-TH666/laimoyu

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

### 怎么生成登录令牌（每台设备一份，做一次）

后台用你的 GitHub **Fine-grained 令牌**来验证身份——这是唯一的门锁。

1. 打开 https://github.com/settings/tokens?type=beta
2. 点 **Generate new token**
3. **Repository access** 选 `Only select repositories` → 勾选 **`laimoyu`**
4. **Permissions** → 展开 `Repository permissions` → 找到 **`Contents`** → 设为 **`Read and write`**（其余权限都不用勾）
5. 过期时间按需选（想省事就选 No expiration）
6. 生成 → 立即复制那串 `github_pat_xxx...`（页面关掉就再也看不到了）

> 注意：必须是 **Fine-grained** 令牌 + **Contents: Read and write**。
> 老的 classic `public_repo` 令牌在这里会报 403。

### 第一次进后台

1. 打开后台地址 → 看到「需要登录」
2. 点「🔑 登录」→ 粘贴令牌 → 保存并连接
3. 令牌存在你自己浏览器的 localStorage 里，**这台设备以后打开后台直接进，不用再输**

> 令牌是**按设备**存的，不会跟仓库同步。换新设备（或换浏览器、清理浏览器数据）后，
> 需要用同一个令牌（或新生成一个）重新登录一次。

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

改一个字段就会标记为「有未保存改动」，顶部固定条上的「💾 保存到 GitHub」按钮变红闪烁。

### 保存没反应 / 点了没变化？

保存按钮**固定在页面顶部**（滚动到哪都在），点下去后有三种结果，都显示在按钮正下方的提示条里：

| 提示条 | 意思 | 怎么办 |
| --- | --- | --- |
| 红色「有 N 个网站还没填完」 | **名称 / 网址 / 简介** 三项是必填的，缺一个都存不了 | 页面会自动跳到第一个有问题的卡片并打红框，补全后提示条会自己消失 |
| 红色「保存失败」 | 提交被 GitHub 拒绝了 | 提示条里会写明原因（令牌过期 / 权限不足 / 需要重新拉取），照着做 |
| 绿色「已保存到 GitHub」 | 成功 | 等约 1 分钟自动发布，刷新首页就能看到 |

> 只要没看到**绿色**提示条，就是还没存进去。改动一直留在你的浏览器里，不会丢。

### 日常操作

- **新增**：每个分类标题右侧「+ 新增到此分类」 → 末尾加一个空白卡片 → 填**名称 / 网址 / 简介** → 保存
- **改内容**：点任意输入框直接改
- **改分类**：点分类按钮直接切；或者直接拖到另一个分类组里
- **排序**：按住 ⋮⋮ 拖动
- **删除**：点 🗑️（会弹确认框）
- **保存**：点顶部固定条上的「💾 保存到 GitHub」

> ⚠️ **没点保存 = 没改**。下次进后台会从 GitHub 重新拉取，别担心改乱。

---

## 项目结构

```
laimoyu/
├── .github/workflows/deploy.yml   # 推送到 main 后自动发布到 GitHub Pages
├── build/
│   └── prerender.js     # 构建期静态渲染 + robots.txt / sitemap.xml / JSON-LD
├── index.html           # 网站首页
├── about.html           # 关于我们（独立页面）
├── privacy.html         # 隐私政策（含 Cookie 与广告披露）
├── contact.html         # 联系方式
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
    ├── lib/
    │   └── render.js    # 渲染模板（浏览器与构建期共用，改这里就够）
    └── data/
        ├── sites.json        # ← 网站数据都在这里
        └── categories.json
```

> ⚠️ **数据必须用 `import` 引入，不能运行时 `fetch`。**
> `src/main.js` / `src/studio.js` 里若把 JSON 改成 `fetch('./data/sites.json')`，
> 本地开发能跑，但构建后 JSON 不会被打包进 `dist/`，线上会变成空列表。

> ⚠️ **改页面结构请改 `src/lib/render.js`，不要只改 `main.js`。**
> 卡片、分类区块、热门榜这些模板被浏览器端和构建期静态渲染共用，
> 只改一边会出现「首屏和 JS 跑完之后长得不一样」。

## 直接改数据（不走后台也行）

编辑 `src/data/sites.json`：

```json
{
  "id": "g-01",
  "title": "4399",
  "url": "https://www.4399.com",
  "description": "经典小游戏大全",
  "review": "国内最老牌的网页小游戏站之一……（80~150 字的站长点评，会显示在首页「摸鱼指南」里，也会进搜索引擎）",
  "category": "games",
  "featured": true,
  "isNew": true,
  "addedAt": "2026-09-10"
}
```

`category` 只能是这 8 个之一：`games` / `weird` / `cover` / `tools` / `trending` / `media` / `relax` / `learned`

`review` 选填，但强烈建议写：它既是给访客看的正文，也是搜索引擎判断「这个站有没有内容」的主要依据。
建议按「这站怎么玩 → 什么时候适合用 → 有什么坑」三段写，80~150 字。

## 搜索引擎与变现基础（2026-09-16 上线）

这部分是给「让搜索引擎能看见、将来能接广告」打的地基，都已经自动跑在构建里：

| 能力 | 实现位置 | 说明 |
|---|---|---|
| **站点内容静态渲染** | `build/prerender.js` → `transformIndexHtml` | 构建时把 95 个站点、8 个分类、全部点评直接写进 `dist/index.html`。爬虫不执行 JS 也能读到全部内容（原本整站是 JS 渲染，爬虫看到的是空壳） |
| **摸鱼指南正文** | `src/lib/render.js` 的 `siteGuideHtml()` | 首页底部 95 条逐站点评，约 1.6 万字可见正文 |
| **robots.txt** | 构建期生成 | 允许抓取全站，屏蔽 `/bookmarks.html` |
| **sitemap.xml** | 构建期生成 | 首页 + 三个内容页，带 `lastmod` |
| **canonical / OG / twitter** | 构建期注入 `<head>` | 每页自动按自己的 title/description 生成 |
| **JSON-LD 结构化数据** | 构建期注入 | `WebSite` + `WebPage` + `ItemList`（95 条）+ `BreadcrumbList`（8 个分类） |

**换域名时只需改一处**：`build/prerender.js` 顶部的 `SITE_URL`（以及页面里可见的域名文案）。

**加新站点之后的动作**：后台保存会自动触发构建，静态渲染、sitemap、JSON-LD 全部跟着更新，
不需要手动改任何 SEO 文件。新加的站点如果没写 `review`，首页指南里会退回显示 `description`。

### Google Search Console 绑定

1. 打开 <https://search.google.com/search-console>
2. 选「网址前缀」，填 `https://laimoyu.top/`
3. 验证方式选 **HTML 标记**，复制它给的那一整行 `<meta ... />`
4. 把那行贴到 `index.html` 的 `<head>` 里（建议紧跟在 `<!-- @prerender:head -->` 下面），推送后回来点「验证」
5. 验证通过后在左侧「站点地图」提交：`sitemap.xml`

> 也可以选「网域」验证（用 DNS TXT 记录），需要在 NameSilo 的 DNS 里加一条 TXT，
> 好处是同时覆盖 `www` 等所有子域。两种都行，HTML 标记最简单。

## 构建

```bash
npm run build       # 输出在 dist/
```

产物是纯静态文件，把 `dist/` 上传到 GitHub Pages / Cloudflare Pages / 任何静态托管都 OK。

---

## 部署（已在用 GitHub Pages，自动发布）

`main` 分支一有新提交，GitHub Actions（`.github/workflows/deploy.yml`）就会自动
`npm ci` → `npm run build` → 把 `dist/` 发布上线。**不需要本地构建、不需要上传 dist。**

- 查看发布状态：仓库 **Actions** 标签页，最新一条是绿色 ✓ 就是成功了
- 手动触发：Actions → Deploy to GitHub Pages → Run workflow
- 发布源不要手动改：Settings → Pages 里 Source 保持 `GitHub Actions`

> 改 `.github/workflows/` 下的文件需要令牌带 `workflow` 权限。
> 普通后台令牌没有，遇到 403 就在 GitHub 网页上直接编辑/提交该文件。

## 提交身份（重要，别改回来）

本仓库已固定本地提交身份（`.git/config`），**不要设置全局身份**：

```bash
git config user.name  "Daniel-TH666"
git config user.email "Daniel-TH666@users.noreply.github.com"
```

原因：这台机器的 git 全局身份是空的，git 会用「Windows 账户名 + 主机域名」自动拼出一个真实邮箱
（曾经因此把公司邮箱写进了提交历史，必须重写历史才能清掉）。用 GitHub 的 noreply 邮箱既不影响贡献统计，
也不会再泄露私人邮箱。`git config --global` 里不要放任何真实邮箱。

## 换设备 / 迁移

**代码和数据全都在 GitHub 上，新设备只要 clone 下来就行**，不存在"漏了哪个文件"的问题。

```bash
git clone https://github.com/Daniel-TH666/laimoyu.git
cd laimoyu
npm install
npm run dev
```

不需要迁移的东西（这些要么能重新生成、要么只是本机产物）：

| 不迁移 | 原因 |
| --- | --- |
| `node_modules/` | `npm install` 重新装 |
| `dist/` | CI 自动构建，或本地 `npm run build` |
| GitHub 登录令牌 | 存在浏览器 localStorage，按设备各存一份 |
| `.workbuddy/` | 本机内部工作记录，与网站无关，已被 gitignore |

**唯一要额外记的**：后台地址 `bookmarks.html` 和你的 GitHub 令牌（建议存密码管理器）。

## 换自定义域名

免费二级域名 `daniel-th666.github.io/laimoyu/` 后面换成了自己的域名 `laimoyu.top`（2026-09-16 完成）：

1. 在仓库 Settings → Pages → Custom domain 填入域名并保存
2. 在域名服务商处按提示配置 DNS（CNAME 指向 `daniel-th666.github.io`）
3. 勾选 Enforce HTTPS

改一次就永久生效。仓库里的构建、数据、后台地址逻辑都不用动。
（注意：换域名后后台地址也会跟着变成 `https://你的域名/bookmarks.html`。）

## 打赏功能（已暂时下线，2026-09-16）

入口与弹窗已从 `index.html` 移除，**打算等流量起来再启用**。完整实现保留在提交 `438db18` 里，恢复步骤：

1. `git show 438db18:index.html` → 把页脚的「打赏支持」链接与 `#reward-modal` 弹窗整块贴回 `index.html`
2. 把收款码图片放到 `public/reward-qr.png`（构建后即 `./reward-qr.png`，未放置会自动显示「收款码暂未上传」）
3. 保留弹窗底部的免责文案：**「本站打赏为自愿行为，不构成任何交易或合同关系，不提供发票及售后保障。」**

`src/main.js` 里的 `bindReward()` 无需改动——它在弹窗 DOM 不存在时第一行就返回，属于安全空转。

**收款方式提醒**：个人收款码用于公开站点长期收款，属于平台协议禁止的「经营性收款」，有风控限额、暂停收款的风险；金额稳定后建议升级为支付宝商户收钱码或正规聚合支付，并避免使用与工资卡/家庭生活强绑定的主账户。

