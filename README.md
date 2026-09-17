# 摸鱼乐园 / Moyu Paradise

摸鱼资源聚合导航站。**多语言**，每个语言一套独立的站点集合与原创点评。

| | |
|---|---|
| 线上地址 | https://laimoyu.top/ |
| 后台地址 | https://laimoyu.top/bookmarks.html |
| 代码仓库 | https://github.com/Daniel-TH666/laimoyu |

## 语言版本

根路径是**英语**（`hreflang` 里的 `x-default`），其余语言各有自己的目录：

| 语言 | 路径 | 站点数 | 自托管图标 | 状态 |
|---|---|---|---|---|
| 🇬🇧 English | `/` | 100 | 75 | ✅ 已上线 |
| 🇨🇳 简体中文 | `/zh/` | 95 | 76 | ✅ 已上线 |
| 🇪🇸 Español | `/es/` | 90 | 54 | ✅ 已上线 |
| 🇫🇷 Français | `/fr/` | 89 | 67 | ✅ 已上线 |
| 🇯🇵 日本語 | `/ja/` | 90 | 60 | ✅ 已上线 |
| 🇰🇷 한국어 | `/ko/` | 89 | 60 | ✅ 已上线 |

站点素材合计 **453 条**。**每个语言区是独立选题 + 该语言的原创点评，不是翻译**：
西语版收 Marca / Menéame / Minijuegos，法语版收 JeuxVideo.com / SensCritique / Topito，
日语版收 ニコニコ動画 / はてなブックマーク / pixiv，韩语版收 디시인사이드 / 클리앙 / 뽐뿌。

每个语言版本都有自己独立的内容页：`about.html` / `faq.html` / `contact.html` / `privacy.html`
（共 6 × 4 = 24 个内容页）。

**语言选择逻辑**（访问根路径 `/` 时）：

1. 用户在本站手动选过语言 → 完全尊重这个选择，永不自动跳转
2. 没选过 → 按浏览器语言匹配一次；匹配得到非英语语言就跳到对应目录
   （`zh-TW` → `zh`、`es-MX` → `es`、`fr-CA` → `fr`，前缀匹配）
3. 浏览器语言没被支持（比如 `de-DE`）→ 留在默认的英语主页
4. **爬虫不会被执行跳转**：Googlebot 的 `Accept-Language` 是 en-US，拿到的是英语主页；
   同时其余 5 个语言目录都有完整 hreflang 声明也在 sitemap 里，6 条路径都能被正常索引

手动切换用页头右上角（和页脚）的语言切换器，纯 `<details>` 实现，**禁用 JS 也能用**。

## 本地开发

```bash
npm install
npm run dev
# 浏览器打开 http://localhost:5173/
# 中文版：http://localhost:5173/zh/
```

---

## 加一种新语言（零代码改动）

整个多语言体系是**数据驱动**的：构建期扫描 `src/i18n/*.json` 和 `src/data/sites/*.json`，
有几个语言包就生成几个语言版本。加语言只做三步：

**① 建语言包 `src/i18n/<code>.json`**

照 `src/i18n/en.json` 抄一份（它是参照模板），把文案全部换掉。必填字段：

| 字段 | 含义 |
|---|---|
| `code` / `htmlLang` / `hreflang` / `ogLocale` | 语言标识（`hreflang` 用标准值，如 `zh-Hans`、`es-ES`、`ja`） |
| `nativeName` / `flag` | 切换器上显示的名字与旗帜 |
| `pathPrefix` | 目录前缀，英语是 `""`（根路径），其余是 `"/zh"`、`"/es"` 这种 |
| `meta.home` | 首页 title / description / keywords / `h1Template` / `heroStat` / `slogans` |
| `meta.about` `meta.privacy` `meta.contact` `meta.faq` | 四个内容页的 title / description |
| `categories.<id>` | 8 个分类的 `title`、`desc`，字母语言建议再加 `navTitle`（顶部 tab 用的短标签） |
| `nav` `card` `sections` `submit` `footer` `toast` `tips` `langSwitch` | 界面文案 |
| `pages.about` / `pages.privacy` / `pages.contact` | 内容页正文，`blocks: [{h, p: [...]}]` |
| `pages.faq` | `items: [{q, a}]` —— 会自动生成 FAQPage 结构化数据 |

> `{count}`、`{title}`、`{n}` 是模板占位符，会在渲染时替换掉。
> `tips` 和 `hintBody` 里的字符串可以带 HTML 标签（`<kbd>`、`<span>`），本文件原文不转义 ——
> 这是安全的，因为它们来自仓库里的语言包，不是外部输入。
>
> ⚠️ **`navTitle` 不能省。** 顶部 tab 一行要排 8 个分类，字母语言用完整名
> （`Browser Games` / `Trending & News`）会直接溢出容器被裁掉。`navTitle` 建议 ≤10 个字符。
> `buildCategories()` 有 `c.navTitle || c.title` 兜底，但兜底出来的布局是坏的。
>
> ⚠️ **key 结构必须和 `en.json` 完全一致**（递归比对 key 路径集合）。
> 少一个 key 不会报错，只会静默回落到英文兜底 —— 比如漏了
> `submit.issueHeading` / `submit.issueTitlePrefix`，该语言的推荐 Issue 标题就会变成英文。
> 用 `python _diag/audit-data.py` 可以一键查出这类缺漏。

**② 建站点数据 `src/data/sites/<code>.json`**

数组，每条：

```json
{
  "id": "es-g01",
  "title": "Coolmath Games",
  "url": "https://www.coolmathgames.com/",
  "description": "一句话简介，≤70 字符",
  "review": "60~170 词的原创点评：这站是什么 → 什么时候用 → 有什么坑",
  "category": "games",
  "featured": true,
  "isNew": true,
  "addedAt": "2026-09-16",
  "icon": "/icons/sites/es-g01.ico"
}
```

`category` 只能是这 8 个之一：`games` / `weird` / `cover` / `tools` / `trending` / `media` / `relax` / `learned`

> ⚠️ **站点集合要按语言区重新选题，不要直接翻译。** 中文用户爱用的站点（B站、虎扑、今日热榜）
> 放到英语版里没人认识；反过来也一样。同一个站点在两个语言区都合适就都收，这没问题。
>
> ⚠️ **点评长度按语言的「信息量」对齐，不是按字数。** 中文 80~150 字的等效区间是
> 英文 **60~170 词**（实测英文 73 词 ≈ 中文 95~100 字的信息量）。日文/韩文介于两者之间。

**③ 把 `<code>` 加进 `src/i18n/languages.js` 的 `LANGUAGE_ORDER`**

顺序决定切换器里的排列。加完 push，构建会自动多出一整套页面 + hreflang + sitemap 条目。

---

## 后台管理

### 后台是一个独立的网页，不在网站里

后台地址：`bookmarks.html`（本地 `http://localhost:5173/bookmarks.html`，部署后 `https://laimoyu.top/bookmarks.html`）

它跟你看到的网站是**两个完全独立的页面**：

- 网站主页上**没有任何**通往后台的链接、按钮或文字
- 后台也不引用网站的样式和导航，长得就不像同一个东西
- 别人不知道这个网址；就算知道了，没有你的令牌也进不去
- `robots.txt` 里也屏蔽了它

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

### 先选语言，再改站点

每种语言的站点数据是**独立文件**（`src/data/sites/<lang>.json`），所以后台顶部固定条上有一个
**🌐 编辑语言** 下拉框：它决定你现在改的是哪个语言的数据。旁边会显示对应文件路径。

- 切换语言时如果有未保存改动，会先确认一次
- 上次编辑的语言记在 localStorage，下次打开后台自动回到那一版
- 站点总数、文件大小这些统计都是**当前语言**的

### 编辑卡片上每个东西是什么意思

后台的每张卡片**直接就是表单**，没有弹窗：

| 区域 | 怎么用 |
| --- | --- |
| **左侧 ⋮⋮** | 按住拖动：同分类内排序，或拖到别的分类（自动改分类） |
| **网站名称** | 卡片标题，直接点就能改 |
| **网址 URL** | 链接，直接点就能改 |
| **简介** | 一句话说明，直接点就能改 |
| **点评 review** | 会显示在首页「站点指南」里，也会进搜索引擎（选填，但强烈建议写） |
| **8 个分类按钮** | 点哪个就是哪个分类（绿色高亮 = 当前） |
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

## 访客推荐（Issue 流程）

首页的「推荐网站」表单不会 POST 到任何服务器（**零后端、源码零密钥**），而是：

1. 表单内容拼成一段固定格式的正文
2. `window.open` 打开预填好的 GitHub「新建 Issue」页面
3. 访客点一下绿色的 **Submit new issue** 完成提交

后台「📥 推荐管理」会拉取仓库 Issue，按域名聚合成候选站，按近 30 天推荐次数排序。

**正文格式（改代码时务必保持一致）**：字段名用固定 ASCII 键，**不随语言变化** ——
任何一种语言提交过来后台都能解析：

```
### Site suggestion
- **lang**: zh
- **title**: ...
- **url**: https://...
- **category**: tools
- **categoryLabel**: 🛠️ 实用工具
- **description**: ...
```

解析逻辑在 `src/studio.js` 的 `parseRecIssue()`，同时兼容旧版中文键
（`网站名` / `网址` / `分类` / `简介`），历史 Issue 不会失效。

---

## 项目结构

```
laimoyu/
├── .github/workflows/deploy.yml   # 推送到 main 后自动发布到 GitHub Pages
├── build/
│   ├── prerender.js     # 多语言 SSG：各语言首页/内容页 + robots/sitemap/ads.txt + head 注入
│   └── home-template.js # 首页整页 HTML 模板（所有语言共用，只有文案不同）
├── index.html           # ★ 只作为 Vite 的入口骨架，内容会被构建期整体替换
├── bookmarks.html       # 后台（独立页面，主页无任何链接指向它）
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── public/
│   ├── favicon.svg
│   └── icons/
│       └── sites/       # 站点的真实图标（自托管），见下「图标策略」
└── src/
    ├── main.js          # 前台逻辑：语言识别、自动匹配、搜索筛选收藏提交
    ├── studio.js        # 后台逻辑：按语言读写站点数据
    ├── style.css
    ├── i18n/
    │   ├── languages.js # 语言注册表（LANGUAGE_ORDER / 路径推导 / 浏览器语言匹配）
    │   ├── en.json      # ← 语言包（参照模板）
    │   ├── zh.json
    │   ├── es.json
    │   ├── fr.json
    │   ├── ja.json
    │   └── ko.json
    ├── lib/
    │   └── render.js    # 渲染模板（浏览器与构建期共用，改这里就够）
    └── data/
        └── sites/
            ├── en.json  # ← 网站数据（每种语言一份）
            ├── zh.json
            ├── es.json
            ├── fr.json
            ├── ja.json
            └── ko.json
```

### 改代码之前先看这三条

> ⚠️ **数据必须用 `import` 引入，不能运行时 `fetch`。**
> 构建后 `src/` 目录不存在，`fetch('./data/sites/zh.json')` 线上一定失败。
> 前台用 `import.meta.glob('./data/sites/*.json')` 懒加载，后台用 eager 版本。

> ⚠️ **改页面结构请改 `src/lib/render.js`，不要只改 `main.js`。**
> 卡片、分类区块、热门榜、站点指南这些模板被浏览器端和构建期静态渲染共用，
> 只改一边会出现「首屏和 JS 跑完之后长得不一样」。

> ⚠️ **改首页整体结构去 `build/home-template.js`。** `index.html` 只是一个空骨架，
> 它的内容在构建期被 `build/prerender.js` 整体替换掉了。

> ⚠️ **`vite.config.js` 的 `base` 必须是 `/`（绝对路径）。** 多语言页面分布在
> `/`、`/zh/` 等不同深度的目录下，用相对路径 `./` 会在子目录里解析错。

---

## 搜索引擎与广告变现基础

这部分是「让搜索引擎能看见、将来能接广告」的地基，全部自动跑在构建里：

| 能力 | 实现位置 | 说明 |
|---|---|---|
| **全站静态渲染** | `build/prerender.js` + `build/home-template.js` | 每个语言版本的站点、8 个分类、全部点评都直接写进 HTML（单页 450~520 KB）。爬虫不执行 JS 也能读全 |
| **内容页** | `src/lib/render.js` 的 `contentPageHtml()` | 每语言 4 个独立页面（about / faq / contact / privacy），零脚本，纯 HTML |
| **hreflang 三件套** | `build/prerender.js` | `<link rel=alternate hreflang>`（6 语言 + `x-default` 指向英语根路径）+ sitemap 里的 `xhtml:link` + 自指 canonical |
| **FAQPage 结构化数据** | `build/prerender.js` | 每个语言的 `faq.html` 里每条问答都进 JSON-LD，Google 搜索结果可直接展开 |
| **JSON-LD** | 构建期注入 | `WebSite` + `WebPage` + `ItemList`（全部站点）+ `BreadcrumbList` + `FAQPage` |
| **sitemap.xml** | 构建期生成 | 6 语言 × 5 页面 = **30 条**，每条带全套 hreflang 注解 |
| **robots.txt** | 构建期生成 | 允许抓取全站，屏蔽 `/bookmarks.html` |
| **ads.txt** | 构建期生成 | 现在是注释模板；广告审核通过后把 `pub-XXXXXXXXXXXXXXXX` 换成真实发布商 ID 并取消注释 |

**换域名时只需改一处**：`build/prerender.js` 顶部的 `SITE_URL`。

**加/改站点之后的动作**：后台保存会自动触发构建，静态渲染、sitemap、JSON-LD 全部跟着更新，
不需要手动改任何 SEO 文件。新加的站点如果没写 `review`，站点指南里会退回显示 `description`。

### 验收脚本

改完前台结构、语言包或 SEO 相关代码，按顺序跑这四个：

```bash
# 有 python 的环境直接用；本机 bash 退化（ls/git 都 command not found）时改用解释器绝对路径
PY=python

# ① 数据审计：条数 / 字段 / 分类配比 / review 长度 / 语言包 key 一致性 / 语言纯度
$PY _diag/audit-data.py              # 期望 120/120

# ② 静态产物检查：hreflang、canonical、sitemap、点评是否真的在 HTML 里
$PY _diag/verify-dist.py             # 期望 96/96

# ③ 浏览器行为检查（需要 Chrome，原生 CDP，不依赖 puppeteer）
node _diag/check-i18n.mjs            # 期望 39/39，JS 错误数 0
#    覆盖：11 种浏览器语言自动匹配 / 手动选择优先 / 切换器点击与记忆 /
#          搜索-分类-收藏不回归 / Issue 字段键 ASCII / 禁 JS 爬虫视角 / 6 语言截图

# ④ 线上核验（推完等 Actions 绿了再跑）
$PY _diag/check-live.py              # 期望 73/73
```

> `check-i18n.mjs` 会把 6 个语言的首页截图写到 `_diag/shot-6lang-*.png`，方便肉眼核对排版
> （尤其是顶部 tab 有没有因为 `navTitle` 太长而溢出）。
>
> **两个排查用的小知识点**（踩过的坑）：
> - 站点卡是 `<article class="site-card">`，标识在内部按钮的 `data-id` 上。**别直接数 `<article>`** ——
>   每个分类区块里还塞了一张 `<article class="ad-native">` 广告位占位卡，会让计数每条 +1。
> - 顶部 tab 是 `button.cat-tab[data-cat=...]`，而区块的 id 也叫 `cat-<x>`。
>   用 `getElementById('cat-games').click()` 点到的是区块，不会有任何反应。

### 图标策略（自托管，不再依赖任何第三方 favicon 服务）

历史教训：早期用 `https://api.iowen.cn/favicon/<host>.png` 作为图标兜底，
2026-09-16 监控发现该服务 SSL 证书过期 + 接口 404，**全站 112 处图标引用全部失败**。

**现在的做法**：

- 站点图标全部抓成本地文件放 `public/icons/sites/<id>.{png|ico|svg|jpg|gif}`
- `src/lib/render.js` 的 `getIconUrl()` **不发起任何外网请求**；没有图标时直接返回
  字母头像（站点首字 + 哈希色调的 data-uri SVG）
- 同一灰色模板的通用占位图会被主动剔除，避免「看上去有图标其实是占位」

**补图标的脚本**：`_diag/fetch-favicons.py <lang>`（语言代码，如 `ja`）。它会先读首页 HTML 里的
`<link rel=icon>`，再退到 `/favicon.ico`、`/apple-touch-icon.png` 等约定路径，
校验文件头确认真实格式后写入 `public/icons/sites/`，并回填 JSON 里的 `icon` 字段。

- 默认只处理**还没有图标**的站点，幂等，可以反复跑
- 加 `--all` 会重抓全部
- 网络不通的站点会失败并打印原因，不影响其它站点；失败的继续用字母头像兜底

> 抓不到图标的常见原因不是站点挂了，而是本机网络/代理到不了（`URLError`，
> 或 `WinError 10054` = 站点反爬主动断开）。换个网络环境重跑就行。
>
> ⚠️ **不要再加任何第三方 favicon 服务的兜底**。抓不到就用字母头像，这是刻意的取舍：
> 外网图标服务挂一次就是全站 100+ 处破图，自托管 + 兜底永远不会一起挂。

**幂等重抓策略**：新语言铺完先跑一轮（首次通常 60~75% 成功率），
隔一会儿再跑第二轮能把一部分「第一次超时」的补上 —— 实测西语 54、法语 67、日语 60、韩语 60。

**加新站点时**（后台或直接编辑 JSON）：最好同时把图标放进 `public/icons/sites/`，
并在数据里填 `"icon": "/icons/sites/<id>.<ext>"`。不放也行，会自动用字母头像。

### Google Search Console 绑定

1. 打开 <https://search.google.com/search-console>
2. 选「网址前缀」，填 `https://laimoyu.top/`
3. 验证方式选 **HTML 标记**，复制它给的那一整行 `<meta ... />`
4. 把那行贴到 `build/home-template.js` 里 `<head>` 的 `${seoHead}` 上方（标题下面），推送后回来点「验证」
5. 验证通过后在左侧「站点地图」提交：`sitemap.xml`

> 建议顺便再验证 `https://laimoyu.top/zh/`、`/es/`、`/fr/`、`/ja/`、`/ko/`
> （用同一个标记即可），这样 6 套页面的收录情况能分开看。
> 不过 6 条路径之间已经有完整 hreflang 互相声明，不分开验证也不会影响收录。
>
> 也可以选「网域」验证（用 DNS TXT 记录），需要在 NameSilo 的 DNS 里加一条 TXT，
> 好处是同时覆盖 `www` 等所有子域。两种都行，HTML 标记最简单。

## 构建

```bash
npm run build       # 输出在 dist/
```

产物是纯静态文件，把 `dist/` 上传到 GitHub Pages / Cloudflare Pages / 任何静态托管都 OK。

构建产物大概是：

```
dist/
├── index.html         英语主页（~496 KB，gzip ~60 KB）
├── about.html faq.html contact.html privacy.html      英语内容页
├── zh/index.html      中文主页（~407 KB，gzip ~55 KB）
├── es/index.html      西语主页（~502 KB）
├── fr/index.html      法语主页（~493 KB）
├── ja/index.html      日语主页（~425 KB）
├── ko/index.html      韩语主页（~415 KB）
├── <lang>/*.html      每种语言的 4 个内容页
├── bookmarks.html     后台（只有根路径一份）
├── assets/            带 hash 的 JS / CSS（每种语言一个语言包 chunk）
├── icons/sites/       自托管站点图标（392 个）
├── robots.txt  sitemap.xml  ads.txt
```

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

## 推送（`git push` 被网络阻断时怎么办）

**现象**：`git push` 报 `Failed to connect to github.com:443 after 21058 ms` 或
`Empty reply from server`。这是本地网络/代理到 `github.com` 的路由问题，**不是仓库或令牌的问题**。

**判断方法**：`git push` 不通，但 `https://api.github.com` 通 —— 用下面的命令确认：

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.github.com/
# 200 就说明可以走 API 推送
```

**解法**：走 Git Data API 推送，位置在 `_diag/push-via-api.py`。

```bash
GH_PUSH_TOKEN=github_pat_xxx PY _diag/push-via-api.py
```

它做的事：

1. 用 Contents API 的 `git/ref` + `git/commits` 取远端 HEAD 和它的 tree
2. **按 tree 比对**在本地历史里找出「与远端内容一致的那个 commit」作为基准
   （⚠️ 不能用 `FETCH_HEAD` —— `fetch` 同样走不通，而且通过 API 推出来的 commit
   sha 由服务端计算，根本不在本地历史里；但它的 tree 一定等于本地对应 commit 的 tree）
3. `git diff 基准 HEAD` 得到文件清单，逐个 `POST git/blobs`（8 线程并发）上传
4. 以远端 tree 为 `base_tree` 建新 tree → 建 commit → `PATCH` 更新 `refs/heads/main`

> 250 个文件约 37 秒。`_diag/` 已在 `.gitignore` 里，所以上传的都是 `src/` 与 `public/` 的真内容。

**推完必须核对**：脚本会打印 `new_tree`，把它和本地
`git rev-parse HEAD^{tree}` 比一下 —— 一致就说明远端内容与本地完全对齐。
本文档提到的两次推送分别是 `f3ab6d5692` / `ce5aea5551`，都对上了。

**同理不要用 `git fetch` / `git pull`**：同样的原因会失败。远端状态一律通过
`https://api.github.com/repos/Daniel-TH666/laimoyu/actions/runs` 查询。

## 换设备 / 迁移

**代码和数据全都在 GitHub 上，新设备只要 clone 下来就行**，不存在「漏了哪个文件」的问题。

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
| `_diag/` | 本机验收脚本与截图，已被 gitignore —— ⚠️ 见下方提醒 |
| `.workbuddy/` | 本机内部工作记录，与网站无关，已被 gitignore |

> ⚠️ **`_diag/` 被 gitignore 了，所以换设备时这几个验收脚本不会跟着走。**
> 它们是排查问题的主力工具（`audit-data.py` / `verify-dist.py` / `check-i18n.mjs` /
> `check-live.py` / `fetch-favicons.py` / `push-via-api.py`）。
> 换设备前记得单独把它们复制走，或者跟维护者确认是否要把 `_diag/*.py` `_diag/*.mjs`
> 从 `.gitignore` 里放出来、只忽略截图。

**唯一要额外记的**：后台地址 `bookmarks.html` 和你的 GitHub 令牌（建议存密码管理器）。

## 换自定义域名

免费二级域名 `daniel-th666.github.io/laimoyu/` 后面换成了自己的域名 `laimoyu.top`（2026-09-16 完成）：

1. 在仓库 Settings → Pages → Custom domain 填入域名并保存
2. 在域名服务商处按提示配置 DNS（CNAME 指向 `daniel-th666.github.io`）
3. 勾选 Enforce HTTPS
4. 改 `build/prerender.js` 顶部的 `SITE_URL`（canonical / hreflang / sitemap 全靠它）

> 注意：**Actions 部署会忽略仓库里的 CNAME 文件**，自定义域名只能在 Settings → Pages 里设。
> 换域名后后台地址也会跟着变成 `https://你的域名/bookmarks.html`。

## 广告位（当前是可见的占位框，待接入时替换）

页面里已经预留了 4 类广告位，**目前显示为虚线占位框 + 技术文案**
（例如 `Top banner · ad-top-banner · 728×90 or responsive`）。这些文案来自语言包的
`sections.adLabel`（`Ad`）/ `sections.adSponsored`（`Sponsored`，也用在站点指南的插入位）/
`sections.adSlotTop` / `sections.adSlotBottom` / `sections.adSlotSidebar`，**6 个语言各一份**。

| 位置 | 标识 | 尺寸 |
|---|---|---|
| 首屏下方横栏 | `ad-top-banner` | 728×90 或自适应 |
| 侧边栏 | `ad-sidebar-{n}` | 300×250 |
| 页面底部 | `ad-bottom` | 自适应 |
| 站点指南里每两个分类之间 | `ad-in-content-{n}` | 自适应 |

接入 AdSense 之后要做三件事（缺一不可）：

1. 把占位框换成真实的 `<ins class="adsbygoogle">` 代码（在 `src/lib/render.js` 的
   `adSlot` 变量与该模板的其它广告位处）
2. `ads.txt` 里把 `pub-XXXXXXXXXXXXXXXX` 换成真实发布商 ID 并取消注释
3. **显著标明「广告」**，并把页脚文案从「未来可能接入展示广告」改成「本站展示」

> ⚠️ 个人 ICP 备案**不能放广告**（非经营性 vs 广告=经营性），
> 合法接国内广告需要企业主体 + 经营性备案。这也是这个站做多语言、走 AdSense 赚海外流量的根本原因。
>
> ⚠️ 占位文案是给开发看的技术标注，**正式上线前建议换成给访客看的说法**
> （或直接隐藏占位框只保留留白），否则访客会觉得站点没做完。这一条待定。

## 打赏功能（已暂时下线，2026-09-16）

入口与弹窗已移除，**打算等流量起来再启用**。完整实现保留在提交 `438db18` 里，
但注意那版是**单语言**的 `index.html`，多语言改造后首页搬到了 `build/home-template.js`，
所以恢复步骤要按下面来：

1. `git show 438db18:index.html` → 取出页脚的「打赏支持」链接与 `#reward-modal` 弹窗结构
2. 把链接插进 `build/home-template.js` 的 `<footer>` 里；弹窗结构插在 `</body>` 前面
   （弹窗文案如果有中文/英文两份，分别加进 `src/i18n/<code>.json`，不要硬编码在模板里）
3. 把收款码图片放到 `public/reward-qr.png`（未放置会自动显示「收款码暂未上传」，不会破图）
4. 保留弹窗底部的免责文案：**「本站打赏为自愿行为，不构成任何交易或合同关系，不提供发票及售后保障。」**

`src/main.js` 的 `bindReward()` 无需改动——它在弹窗 DOM 不存在时第一行就返回，属于安全空转。

> ⚠️ 不要在页面里留「打赏」字样的 HTML 注释（注释也会进 dist），会被线上核验脚本判成失败。

**收款方式提醒**：个人收款码用于公开站点长期收款，属于平台协议禁止的「经营性收款」，有风控限额、暂停收款的风险；金额稳定后建议升级为支付宝商户收钱码或正规聚合支付，并避免使用与工资卡/家庭生活强绑定的主账户。
