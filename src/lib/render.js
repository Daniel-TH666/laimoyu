// src/lib/render.js
// 渲染模板集合。三条硬约束：
//   1) 纯函数，不碰 DOM —— 浏览器端（src/main.js）与构建期（build/prerender.js）共用同一份，
//      两边结构永远不会走偏。
//   2) 所有可见文案从 i18n 对象取，函数内不出现硬编码的自然语言字符串。
//   3) 所有来自数据的文本必须过 escapeHtml()，外链 href 必须过 safeUrl()。
//
// 注意：这里的 Tailwind 类名依赖 tailwind.config.js 的 content 包含 ./src/**/*.js。
// 内容页（about/privacy/contact/faq）的 HTML 是构建期用 emitFile 生成的，不经过 Vite 的
// HTML 处理，所以它们用到的类名必须也能在这个文件里被扫到。

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

// 模板插值：把 {count} / {title} 这类占位符替换掉。
export function fmt(template, vars = {}) {
  return String(template == null ? '' : template)
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// === 图标：站点自带 > 字母兜底（不再发起网络请求） ===
// 历史教训：曾用 https://api.iowen.cn/favicon/<host>.png 作为兜底，
// 2026-09-16 监测发现该服务 SSL 证书过期 + 接口 404，全站 112 处图标全失败。
// 现在 icon 为空时直接返回 data-uri 字母头像，无任何外网请求。
export function getIconUrl(site) {
  if (site.icon && site.icon.trim()) return site.icon.trim();
  return fallbackAvatar(site);
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

// === i18n 取值（缺 key 时回落到英文默认值，避免线上出现空白） ===
const FALLBACK = {
  card: {
    open: 'Open site ↗',
    favAdd: 'Save to favourites',
    favRemove: 'Remove from favourites',
    newBadge: 'NEW'
  },
  pages: { backHome: 'Back to the homepage' }
};

function L(i18n, path, fallback) {
  let cur = i18n;
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return fallback;
    cur = cur[k];
  }
  return cur == null || cur === '' ? fallback : cur;
}

// === 站点卡片 ===
export function siteCard(site, opts = {}) {
  const { query = '', favorites = EMPTY_SET, t = {} } = opts;
  const isFav = favorites.has(site.id);
  const favBtnClass = isFav ? 'fav-btn text-coral-500' : 'fav-btn text-slate-300 hover:text-coral-500';
  const iconUrl = getIconUrl(site);
  const avatar = fallbackAvatar(site);
  const badgeText = L(t, 'card.newBadge', FALLBACK.card.newBadge);
  const newBadge = site.isNew ? `<span class="new-badge" title="${escapeHtml(badgeText)}">${escapeHtml(badgeText)}</span>` : '';
  const openText = L(t, 'card.open', FALLBACK.card.open);
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
                title="${escapeHtml(isFav ? L(t, 'card.favRemove', FALLBACK.card.favRemove) : L(t, 'card.favAdd', FALLBACK.card.favAdd))}">
          ${isFav ? '★' : '☆'}
        </button>
      </div>
      <p class="text-sm text-slate-500 line-clamp-2 mb-3 flex-1">${highlight(site.description, query)}</p>
      <div class="flex items-center justify-end mt-auto">
        <a href="${escapeHtml(safeUrl(site.url))}" target="_blank" rel="noopener noreferrer nofollow"
           data-visit="${escapeHtml(site.id)}"
           class="text-xs bg-mint-50 text-mint-700 px-3 py-1.5 rounded-full hover:bg-mint-500 hover:text-white transition font-medium">
          ${escapeHtml(openText)}
        </a>
      </div>
    </article>
  `;
}

// 原生广告卡（混在列表里）
export function nativeAdCard(t = {}) {
  return `
    <article class="ad-native rounded-card p-4 bg-gradient-to-br from-cream-100/60 to-mint-50/40 border-2 border-dashed border-mint-200 flex flex-col items-center justify-center text-center min-h-[134px]">
      <span class="text-[10px] uppercase tracking-wider text-mint-600 font-bold mb-2">${escapeHtml(L(t, 'sections.adSponsored', 'Sponsored'))}</span>
      <p class="text-xs text-slate-500">native-ad-1</p>
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

export function hotListHtml(sites, opts = {}) {
  const limit = opts.limit === undefined ? 10 : opts.limit;
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

export function emptyStateHtml(t = {}) {
  return `
      <div class="text-center py-20 bg-white rounded-card border border-cream-200">
        <div class="text-6xl mb-4">🐟</div>
        <p class="text-slate-500">${escapeHtml(L(t, 'sections.emptyTitle', 'Nothing matched that search'))}</p>
        <button id="back-all"
                class="mt-4 text-sm bg-mint-50 text-mint-700 px-4 py-2 rounded-full hover:bg-mint-500 hover:text-white transition font-medium">
          ${escapeHtml(L(t, 'sections.emptyButton', 'Show everything'))}
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
            <span class="text-sm text-slate-400 font-normal">${items.length}</span>
          </h2>
          <span class="text-xs text-slate-400 hidden md:inline">${escapeHtml(cat.desc)}</span>
        </header>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          ${items.map((s, i) => siteCard(s, opts) + ((i === adAfter && items.length > 4) ? nativeAdCard(opts.t) : '')).join('')}
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

// === 站点详解（正文内容，搜索引擎抓取的主体） ===
export function siteGuideHtml(categories, sites, opts = {}) {
  const t = opts.t || {};
  const adLabel = L(t, 'sections.adSponsored', 'Sponsored');
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
            <div class="text-xs uppercase tracking-wider text-mint-600 mb-1">${escapeHtml(adLabel)}</div>
            <div>ad-in-content-${idx}</div>
          </div>
        </div>` : '';

    return `
      <article id="guide-${escapeHtml(cat.id)}" class="mb-10">
        <h3 class="text-xl font-bold flex items-center gap-2 text-ink-800 mb-1">
          <span class="text-2xl">${escapeHtml(cat.icon)}</span>
          <span>${escapeHtml(cat.title)}</span>
          <span class="text-sm text-slate-400 font-normal">${items.length}</span>
        </h3>
        <p class="text-sm text-slate-500 mb-4">${escapeHtml(cat.desc)}</p>
        <ul class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${list}
        </ul>
      </article>${adSlot}`;
  }).join('');

  return blocks;
}

// === 语言切换器 ===
// 用 <details>/<summary> 实现，纯 HTML 不需要 JS —— 零脚本的内容页也能用。
export function langSwitcherHtml(langs, currentCode, page = 'index', opts = {}) {
  const variant = opts.variant || 'header';           // header | footer
  const file = page === 'index' ? '' : page + '.html';

  const hrefFor = (lang) => {
    const prefix = lang.pathPrefix || '';
    return file ? `${prefix}/${file}` : `${prefix}/`;
  };

  const current = langs.find(l => l.code === currentCode);
  const label = current ? `${current.flag || '🌐'} ${current.nativeName}` : '🌐';
  const title = escapeHtml(L(opts.t, 'langSwitch.title', 'Language'));

  if (variant === 'footer') {
    return `
      <div class="lang-switch" data-lang="${escapeHtml(currentCode)}">
        <h3 class="text-sm font-bold text-white mb-4 uppercase tracking-wider">🌐 ${title}</h3>
        <div class="flex flex-wrap gap-2">
          ${langs.map(l => `
            <a href="${escapeHtml(hrefFor(l))}" hreflang="${escapeHtml(l.hreflang)}"
               class="text-xs px-3 py-1.5 rounded-full transition ${l.code === currentCode
                 ? 'bg-mint-500 text-white font-semibold'
                 : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600 hover:text-white'}">
              ${escapeHtml(l.flag || '')} ${escapeHtml(l.nativeName)}
            </a>`).join('')}
        </div>
      </div>`;
  }

  const items = langs.map(l => {
    const active = l.code === currentCode;
    return `
          <li>
            <a href="${escapeHtml(hrefFor(l))}" hreflang="${escapeHtml(l.hreflang)}"
               class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${active
                 ? 'bg-mint-50 text-mint-700 font-semibold'
                 : 'text-slate-600 hover:bg-cream-100 hover:text-ink-800'}">
              <span>${escapeHtml(l.flag || '')}</span>
              <span>${escapeHtml(l.nativeName)}</span>
              ${active ? '<span class="ml-auto text-xs">●</span>' : ''}
            </a>
          </li>`;
  }).join('');

  return `
    <details class="lang-switch relative flex-shrink-0">
      <summary class="list-none cursor-pointer select-none flex items-center gap-1.5 px-3 py-2 rounded-full border border-cream-200 bg-white hover:border-mint-300 transition text-sm text-slate-600"
               title="${title}">
        <span class="hidden sm:inline whitespace-nowrap">${escapeHtml(label)}</span>
        <span class="sm:hidden">🌐</span>
        <span class="text-[10px] text-slate-400">▾</span>
      </summary>
      <div class="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-cream-200 shadow-card-hover p-2 z-50">
        <div class="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">${title}</div>
        <ul class="space-y-0.5">${items}</ul>
      </div>
    </details>`;
}

// === 内容页（about / privacy / contact / faq）的整页渲染 ===
// 这些页面零脚本，构建期直接用 emitFile 写进 dist/<lang>/，所以资源用绝对路径。

export function contentNavPages(i18n) {
  const l = (i18n.footer && i18n.footer.links) || {};
  return [
    { id: 'about', label: l.about || 'About' },
    { id: 'privacy', label: l.privacy || 'Privacy', hideSm: true },
    { id: 'faq', label: l.faq || 'FAQ' },
    { id: 'contact', label: l.contact || 'Contact' }
  ];
}

function contentHeaderHtml(i18n, langs, page) {
  const navPages = contentNavPages(i18n);
  const p = i18n.pathPrefix || '';
  const navItems = navPages.map(nav => {
    const active = nav.id === page;
    return `<a href="${escapeHtml(`${p}/${nav.id}.html`)}"
               class="${active ? 'text-ink-800 font-medium' : 'hover:text-ink-800 transition'}${nav.hideSm ? ' hidden sm:inline' : ''}">${escapeHtml(nav.label)}</a>`;
  }).join('\n        ');

  return `
  <header class="sticky top-0 z-30 bg-cream-50/85 backdrop-blur border-b border-cream-200">
    <div class="max-w-4xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between gap-3 lg:gap-4">
      <a href="${escapeHtml(p + '/')}" class="flex items-center gap-2 flex-shrink-0">
        <span class="text-2xl animate-bob">🎣</span>
        <span class="font-bold text-lg tracking-tight">${escapeHtml(i18n.brand)}</span>
      </a>
      <nav class="flex items-center gap-3 lg:gap-5 text-sm text-slate-500">
        ${navItems}
        ${langSwitcherHtml(langs, i18n.code, page, { t: i18n })}
      </nav>
    </div>
  </header>`;
}

function contentFooterHtml(i18n, langs, page) {
  const f = i18n.footer || {};
  const links = f.links || {};
  const p = i18n.pathPrefix || '';
  return `
  <footer class="bg-ink-800 text-slate-300 mt-8 pt-10 pb-8">
    <div class="max-w-4xl mx-auto px-5 lg:px-8">
      <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-6">
        <a href="${escapeHtml(p + '/')}" class="hover:text-mint-200 transition">${escapeHtml(i18n.nav.home)}</a>
        <a href="${escapeHtml(p + '/about.html')}" class="hover:text-mint-200 transition">${escapeHtml(links.about || '')}</a>
        <a href="${escapeHtml(p + '/privacy.html')}" class="hover:text-mint-200 transition">${escapeHtml(links.privacy || '')}</a>
        <a href="${escapeHtml(p + '/faq.html')}" class="hover:text-mint-200 transition">${escapeHtml(links.faq || '')}</a>
        <a href="${escapeHtml(p + '/contact.html')}" class="hover:text-mint-200 transition">${escapeHtml(links.contact || '')}</a>
        <a href="https://github.com/Daniel-TH666/laimoyu" target="_blank" rel="noopener" class="hover:text-mint-200 transition">GitHub</a>
      </div>
      <div class="mb-8 pb-6 border-t border-slate-700 pt-6">
        ${langSwitcherHtml(langs, i18n.code, page, { variant: 'footer', t: i18n })}
      </div>
      <div class="border-t border-slate-700 pt-6 text-xs text-slate-400 leading-relaxed">
        ${escapeHtml(f.copyright || '')}<br />
        <span class="text-slate-500">${escapeHtml(f.disclosure || '')}</span>
      </div>
    </div>
  </footer>`;
}

// 渲染整张内容页。kind: about | privacy | contact | faq
export function contentPageHtml(kind, i18n, langs, opts = {}) {
  const page = (i18n.pages || {})[kind] || {};
  const meta = (i18n.meta || {})[kind] || {};
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const p = i18n.pathPrefix || '';

  let body;
  if (kind === 'faq' && Array.isArray(page.items)) {
    body = page.items.map((it, i) => `
    <section class="bg-white rounded-card p-6 lg:p-8 shadow-card border border-cream-200 mb-6">
      <h2 class="text-lg font-bold mb-3 flex items-start gap-2.5 text-ink-800">
        <span class="text-mint-500 font-mono text-base flex-shrink-0">Q${i + 1}</span>
        <span>${escapeHtml(it.q)}</span>
      </h2>
      <p class="text-sm text-slate-600 leading-relaxed">${escapeHtml(it.a)}</p>
    </section>`).join('');
  } else {
    body = (page.blocks || []).map(b => `
    <section class="bg-white rounded-card p-6 lg:p-8 shadow-card border border-cream-200 mb-6">
      <h2 class="text-xl font-bold mb-4 flex items-center gap-2 text-ink-800">${escapeHtml(b.h)}</h2>
      <div class="text-sm text-slate-600 space-y-3 leading-relaxed">
        ${(b.p || []).map(par => `<p>${escapeHtml(par)}</p>`).join('')}
      </div>
    </section>`).join('');
  }

  const updated = kind === 'privacy'
    ? `<p class="text-xs text-slate-400 mb-6">${escapeHtml(page.updatedLabel || 'Last updated')}: ${escapeHtml(today)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(i18n.htmlLang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escapeHtml(meta.description || '')}" />
  <title>${escapeHtml(meta.title || page.heading || i18n.brand)}</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <!-- @prerender:head -->
  <link rel="stylesheet" href="${escapeHtml(opts.cssHref || '/assets/style.css')}" />
</head>
<body class="text-ink-800 font-sans antialiased">
${contentHeaderHtml(i18n, langs, kind)}
  <main class="max-w-4xl mx-auto px-5 lg:px-8 py-10 lg:py-14">
    <nav class="text-xs text-slate-400 mb-5" aria-label="Breadcrumb">
      <a href="${escapeHtml(p + '/')}" class="hover:text-mint-600 transition">${escapeHtml(i18n.nav.home)}</a>
      <span class="mx-1.5">/</span>
      <span class="text-slate-500">${escapeHtml(page.heading || '')}</span>
    </nav>
    <h1 class="text-3xl lg:text-4xl font-bold tracking-tight mb-3">${escapeHtml(page.heading || '')}</h1>
    <p class="text-slate-500 leading-relaxed mb-10 max-w-2xl">${escapeHtml(page.intro || '')}</p>
    ${body}
    ${updated}
  </main>
${contentFooterHtml(i18n, langs, kind)}
</body>
</html>`;
}

// === 分类定义（id/icon 固定，title/desc 从 i18n 取）===
export const CATEGORY_DEFS = [
  { id: 'games', icon: '🎮' },
  { id: 'weird', icon: '🤯' },
  { id: 'cover', icon: '🎭' },
  { id: 'tools', icon: '🛠️' },
  { id: 'trending', icon: '🔥' },
  { id: 'media', icon: '🎬' },
  { id: 'relax', icon: '🎵' },
  { id: 'learned', icon: '📚' }
];

export function buildCategories(i18n) {
  const cats = (i18n && i18n.categories) || {};
  return CATEGORY_DEFS.map(d => {
    const c = cats[d.id] || {};
    const title = c.title || d.id;
    return {
      id: d.id,
      icon: d.icon,
      title,
      // navTitle 是可选的短标签，只用在顶部 tab 条上。
      // 英文分类名（Browser Games / Trending & News）比中文长得多，全写上会把
      // 8 个 tab 挤到溢出，所以英文语言包给了一份短的。
      short: c.navTitle || title,
      desc: c.desc || ''
    };
  });
}
