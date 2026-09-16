// src/lib/render.js
// 纯渲染函数集合：内部不碰 DOM，浏览器端（src/main.js）与构建期静态渲染
// （build/prerender.js）共用同一份模板。
//
// 为什么要共用：站点列表如果只在浏览器里用 JS 渲染，搜索引擎和不执行 JS 的
// 抓取器看到的就是一个空壳。构建期用同一份模板把内容写进 HTML，运行时再用
// 同一份模板覆盖一遍，两边结构永远不会走偏。
//
// 注意：这里的 Tailwind 类名依赖 tailwind.config.js 的 content 包含 ./src/**/*.js，
// 改动类名后无需额外配置，构建时会被自动扫到。

const EMPTY_SET = new Set();

// === 基础工具 ===
export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 安全 URL：只放行 http/https（挡掉 javascript: data: vbscript: 等危险协议），
// 无协议的相对路径放行。站点数据可被后台修改，前台链接一律过这个函数。
export function safeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s) return '#';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return /^https?:/i.test(s) ? s : '#';
  return s;
}

export function getHostname(siteUrl) {
  try { return new URL(siteUrl).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

// === 图标：站点数据 > favicon service > 字母兜底 ===
export function getIconUrl(site) {
  if (site.icon && site.icon.trim()) return site.icon.trim();
  try {
    const host = getHostname(site.url);
    if (host) return `https://api.iowen.cn/favicon/${host}.png`;
  } catch {}
  return '';
}

// 字母兜底：生成固定色调的 data-uri svg（中文取首字，英文取首字母）
export function fallbackAvatar(site) {
  const title = site.title || '?';
  const ch = [...String(title).trim()][0] || '?';
  let hash = 0;
  for (const c of String(site.id || title)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const h = hash % 360;
  const bg1 = `hsl(${h} 70% 55%)`;
  const bg2 = `hsl(${(h + 30) % 360} 70% 45%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="12" fill="url(#g)"/>
    <text x="32" y="42" font-family="-apple-system,'PingFang SC','Microsoft YaHei',sans-serif" font-size="32" font-weight="700" fill="#fff" text-anchor="middle">${escapeHtml(ch)}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function highlight(text, query) {
  const raw = String(text == null ? '' : text);
  if (!query) return escapeHtml(raw);
  const safe = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escapeHtml(raw).replace(new RegExp(`(${safe})`, 'gi'),
    '<mark class="bg-mint-100 text-ink-800 rounded px-0.5">$1</mark>');
}

// === 站点卡片 ===
export function siteCard(site, opts = {}) {
  const { query = '', favorites = EMPTY_SET } = opts;
  const isFav = favorites.has(site.id);
  const favBtnClass = isFav ? 'fav-btn text-coral-500' : 'fav-btn text-slate-300 hover:text-coral-500';
  const iconUrl = getIconUrl(site);
  const avatar = fallbackAvatar(site);
  const newBadge = site.isNew ? `<span class="new-badge" title="新收录">NEW</span>` : '';
  return `
    <article class="site-card group bg-white rounded-card p-4 shadow-card hover:shadow-card-hover transition-all duration-300 flex flex-col border border-cream-200/60 relative overflow-hidden">
      ${newBadge}
      <div class="flex items-start gap-3 mb-2">
        <div class="site-icon w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-cream-100">
          <img src="${escapeHtml(iconUrl)}" alt=""
               class="w-full h-full object-cover"
               loading="lazy"
               data-fallback="${escapeHtml(avatar)}"
               onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback;this.onerror=null;}" />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="font-bold text-ink-800 truncate text-[15px]">${highlight(site.title, query)}</h3>
          <p class="text-xs text-slate-400 truncate mt-0.5">${escapeHtml(getHostname(site.url))}</p>
        </div>
        <button class="${favBtnClass} text-lg transition flex-shrink-0"
                data-id="${escapeHtml(site.id)}" data-action="fav"
                title="${isFav ? '取消收藏' : '加入收藏'}">
          ${isFav ? '★' : '☆'}
        </button>
      </div>
      <p class="text-sm text-slate-500 line-clamp-2 mb-3 flex-1">${highlight(site.description, query)}</p>
      <div class="flex items-center justify-end mt-auto">
        <a href="${escapeHtml(safeUrl(site.url))}" target="_blank" rel="noopener noreferrer nofollow"
           data-visit="${escapeHtml(site.id)}"
           class="text-xs bg-mint-50 text-mint-700 px-3 py-1.5 rounded-full hover:bg-mint-500 hover:text-white transition font-medium">
          打开摸鱼 ↗
        </a>
      </div>
    </article>
  `;
}

// 原生广告卡（混在列表里）
export function nativeAdCard() {
  return `
    <article class="ad-native rounded-card p-4 bg-gradient-to-br from-cream-100/60 to-mint-50/40 border-2 border-dashed border-mint-200 flex flex-col items-center justify-center text-center min-h-[134px]">
      <span class="text-[10px] uppercase tracking-wider text-mint-600 font-bold mb-2">广告 · Sponsored</span>
      <p class="text-xs text-slate-500">原生广告位 · ad-native-1</p>
    </article>
  `;
}

// === 各区块 ===
export function heroCategoriesHtml(categories) {
  return categories.map(cat => `
    <button data-cat="${escapeHtml(cat.id)}" class="hero-cat floating">
      <span class="text-3xl">${escapeHtml(cat.icon)}</span>
      <span class="text-sm font-medium text-ink-700">${escapeHtml(cat.title)}</span>
    </button>
  `).join('');
}

export function featuredGridHtml(sites, opts = {}) {
  return sites.filter(s => s.featured).slice(0, 10).map(s => siteCard(s, opts)).join('');
}

export function hotListHtml(sites, limit = 10) {
  const hot = [
    ...sites.filter(s => s.featured),
    ...sites.filter(s => !s.featured).slice(0, 10)
  ].slice(0, limit);

  return hot.map((s, i) => {
    const iconUrl = getIconUrl(s);
    const avatar = fallbackAvatar(s);
    return `
    <li class="flex items-center gap-3">
      <span class="${i < 3 ? 'rank-top' : 'rank'}">${i + 1}</span>
      <a href="${escapeHtml(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer"
         class="flex-1 min-w-0 flex items-center gap-2 hover:text-mint-600 transition group">
        <div class="w-5 h-5 rounded overflow-hidden flex-shrink-0 bg-cream-100">
          <img src="${escapeHtml(iconUrl)}" alt=""
               class="w-full h-full object-cover"
               loading="lazy"
               data-fallback="${escapeHtml(avatar)}"
               onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback;this.onerror=null;}" />
        </div>
        <span class="truncate text-sm text-ink-700 group-hover:text-mint-600">${escapeHtml(s.title)}</span>
      </a>
    </li>
  `;
  }).join('');
}

export function emptyStateHtml() {
  return `
      <div class="text-center py-20 bg-white rounded-card border border-cream-200">
        <div class="text-6xl mb-4">🐟</div>
        <p class="text-slate-500">没找到相关的摸鱼网址</p>
        <button id="back-all"
                class="mt-4 text-sm bg-mint-50 text-mint-700 px-4 py-2 rounded-full hover:bg-mint-500 hover:text-white transition font-medium">
          返回全部
        </button>
      </div>
    `;
}

// 单个分类区块（默认视图与运行时过滤视图共用）
export function categorySectionHtml(cat, items, opts = {}) {
  const adAfter = opts.adAfter === undefined ? 2 : opts.adAfter;
  return `
      <section id="cat-${escapeHtml(cat.id)}" class="category-section scroll-mt-32">
        <header class="flex items-center justify-between mb-5">
          <h2 class="text-2xl font-bold flex items-center gap-3 text-ink-800">
            <span class="text-3xl">${escapeHtml(cat.icon)}</span>
            <span>${escapeHtml(cat.title)}</span>
            <span class="text-sm text-slate-400 font-normal">${items.length} 个</span>
          </h2>
          <span class="text-xs text-slate-400 hidden md:inline">${escapeHtml(cat.desc)}</span>
        </header>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          ${items.map((s, i) => siteCard(s, opts) + ((i === adAfter && items.length > 4) ? nativeAdCard() : '')).join('')}
        </div>
      </section>
    `;
}

// 「全部」视图：按分类顺序拼出所有区块。构建期静态渲染与运行时共用。
export function allCategoriesHtml(categories, sites, opts = {}) {
  return categories
    .map(cat => {
      const items = sites.filter(s => s.category === cat.id);
      if (!items.length) return '';
      return categorySectionHtml(cat, items, opts);
    })
    .join('');
}

// === 站点详解（只在构建期渲染，作为可供搜索引擎抓取的正文内容） ===
export function siteGuideHtml(categories, sites) {
  const blocks = categories.map((cat, idx) => {
    const items = sites.filter(s => s.category === cat.id);
    if (!items.length) return '';

    const list = items.map(s => `
          <li class="bg-white rounded-xl border border-cream-200 p-4">
            <h4 class="font-semibold text-ink-800 text-[15px] mb-1.5">
              <a href="${escapeHtml(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer nofollow"
                 class="hover:text-mint-600 transition">${escapeHtml(s.title)}</a>
              <span class="ml-2 text-xs font-normal text-slate-400">${escapeHtml(getHostname(s.url))}</span>
            </h4>
            <p class="text-sm text-slate-500 leading-relaxed">${escapeHtml(s.review || s.description || '')}</p>
          </li>`).join('');

    // 每两个分类之间插一个内容区广告位，给将来的广告留出位置
    const adSlot = (idx > 0 && idx % 2 === 0) ? `
        <div data-ad-slot="ad-in-content-${idx}" class="ad-slot my-8">
          <div class="text-center">
            <div class="text-xs uppercase tracking-wider text-mint-600 mb-1">广告位 · Sponsored</div>
            <div>内容区 ad-in-content-${idx} · 推荐放置信息流 / 内容内嵌</div>
          </div>
        </div>` : '';

    return `
      <article id="guide-${escapeHtml(cat.id)}" class="mb-10">
        <h3 class="text-xl font-bold flex items-center gap-2 text-ink-800 mb-1">
          <span class="text-2xl">${escapeHtml(cat.icon)}</span>
          <span>${escapeHtml(cat.title)}</span>
          <span class="text-sm text-slate-400 font-normal">${items.length} 个</span>
        </h3>
        <p class="text-sm text-slate-500 mb-4">${escapeHtml(cat.desc)}</p>
        <ul class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${list}
        </ul>
      </article>${adSlot}`;
  }).join('');

  return blocks;
}
