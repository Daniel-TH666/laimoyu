// build/home-template.js
// 首页整页 HTML 模板。构建期对每一种语言渲染一份，输出到：
//   /            （默认语言，英语）
//   /zh/ /es/ /fr/ /ja/ /ko/ ...
//
// 为什么整页都在构建期生成、而不是让 Vite 处理一个 index.html：
//   多语言版本必须结构完全一致，只有文案不同。用同一个函数渲染所有语言，
//   可以保证不会出现「英语版和西语版长得不一样」这种问题。
//
// 所有可见文案来自 i18n 对象；所有站点内容来自该语言的 sites 数据。

import {
  escapeHtml,
  safeUrl,
  fmt,
  heroCategoriesHtml,
  featuredGridHtml,
  hotListHtml,
  allCategoriesHtml,
  siteGuideHtml,
  langSwitcherHtml
} from '../src/lib/render.js';

export function homePageHtml(i18n, langs, sites, categories, opts = {}) {
  const cssHref = opts.cssHref || '/assets/style.css';
  const jsSrc = opts.jsSrc || '/assets/main.js';
  const seoHead = opts.seoHead || '';

  const p = i18n.pathPrefix || '';
  const nav = i18n.nav || {};
  const sec = i18n.sections || {};
  const sub = i18n.submit || {};
  const foot = i18n.footer || {};
  const home = (i18n.meta && i18n.meta.home) || {};
  const count = sites.length;
  const opts4render = { query: '', favorites: new Set(), t: i18n };

  // 分类 tab 导航（第一个是「全部」）。用 short（可选短标签）而不是 title ——
  // 英文全名太长，8 个 tab 会溢出容器。
  const catTabs = [
    `<button data-cat="all" class="cat-tab active">🌈 ${escapeHtml(nav.all || 'All')}</button>`,
    ...categories.map(c =>
      `<button data-cat="${escapeHtml(c.id)}" class="cat-tab">${escapeHtml(c.icon)} ${escapeHtml(c.short || c.title)}</button>`)
  ].join('\n        ');

  // 友情链接（各语言可不同，没有就整块不渲染）
  const friends = Array.isArray(foot.friends) ? foot.friends : [];
  const friendsHtml = friends.length ? `
      <section class="mb-10">
        <h3 class="text-sm font-bold text-white mb-4 uppercase tracking-wider">🔗 ${escapeHtml(foot.friendsTitle || '')}</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          ${friends.map(f => `<a href="${escapeHtml(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer" class="hover:text-mint-200 transition">${escapeHtml(f.name)}</a>`).join('\n          ')}
        </div>
      </section>` : '';

  // 贴士（内容含 <kbd> 标签，来自本地语言包，不转义）
  const tipsHtml = (Array.isArray(i18n.tips) ? i18n.tips : [])
    .map(t => `<li>${t}</li>`).join('\n          ');

  // 提交提示条的两行说明（含 span/strong）
  const hintBody = (Array.isArray(sub.hintBody) ? sub.hintBody : [])
    .map(l => `<p>${l}</p>`).join('\n        ');

  // 分类下拉：静态 HTML 里先渲染好一份（爬虫可读），JS 启动后会用同一份数据重填
  const catOptions = [
    `<option value="">${escapeHtml(sub.fieldCategoryPlaceholder || '')}</option>`,
    ...categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.icon)} ${escapeHtml(c.title)}</option>`)
  ].join('');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(i18n.htmlLang)}" data-lang="${escapeHtml(i18n.code)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escapeHtml(home.description || '')}" />
  <meta name="keywords" content="${escapeHtml(home.keywords || '')}" />
  <title>${escapeHtml(home.title || i18n.brand)}</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  ${seoHead}
  <link rel="stylesheet" href="${escapeHtml(cssHref)}" />
  <script type="module" src="${escapeHtml(jsSrc)}"></script>
</head>
<body class="text-ink-800 font-sans antialiased">

  <!-- ===== Header ===== -->
  <header class="sticky top-0 z-30 bg-cream-50/85 backdrop-blur border-b border-cream-200">
    <div class="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center gap-3 lg:gap-5">
      <a href="${escapeHtml(p + '/')}" class="flex items-center gap-2 flex-shrink-0">
        <span class="text-2xl animate-bob">🎣</span>
        <span class="font-bold text-lg tracking-tight whitespace-nowrap">${escapeHtml(i18n.brand)}</span>
      </a>

      <div class="flex-1 max-w-xl min-w-0">
        <div class="relative">
          <input id="top-search" type="text" placeholder="${escapeHtml(nav.searchPlaceholder || '')}"
                 title="${escapeHtml(nav.searchTip || '')}"
                 class="w-full pl-10 pr-10 py-2 rounded-full bg-white border border-cream-200 focus:border-mint-500 focus:ring-2 focus:ring-mint-100 outline-none transition text-sm" />
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">🔍</span>
          <kbd class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 bg-cream-100 border border-cream-200 px-1.5 py-0.5 rounded pointer-events-none">/</kbd>
        </div>
      </div>

      <button id="btn-submit"
              title="${escapeHtml(sub.title || '')}"
              class="hidden md:inline-block bg-mint-500 hover:bg-mint-600 text-white px-3 lg:px-4 py-2 rounded-full text-sm font-medium transition shadow-card whitespace-nowrap">
        + ${escapeHtml(nav.submitBtn || '')}
      </button>

      ${langSwitcherHtml(langs, i18n.code, 'index', { t: i18n })}
    </div>

    <nav class="border-t border-cream-200 bg-cream-100/40">
      <div class="max-w-7xl mx-auto px-5 lg:px-8 h-12 flex items-center gap-2 overflow-x-auto scrollbar-thin">
        ${catTabs}
      </div>
    </nav>
  </header>

  <!-- ===== Hero ===== -->
  <section class="relative overflow-hidden">
    <div class="max-w-7xl mx-auto px-5 lg:px-8 py-12 lg:py-20 text-center">
      <div class="text-6xl lg:text-7xl mb-4 animate-bob">🐟</div>
      <h1 id="hero-slogan" class="text-3xl lg:text-5xl font-bold tracking-tight text-ink-800 min-h-[1.2em]">
        ${escapeHtml(fmt(home.h1Template || '', { count }))}<span class="caret"></span>
      </h1>
      <p class="mt-4 text-slate-500 text-base lg:text-lg max-w-2xl mx-auto leading-relaxed">
        ${escapeHtml(fmt(home.heroStat || '', { count }))}
      </p>

      <div class="mt-8 max-w-2xl mx-auto">
        <div class="relative">
          <input id="big-search" type="text" placeholder="${escapeHtml(nav.searchBigPlaceholder || '')}"
                 title="${escapeHtml(nav.searchTip || '')}"
                 class="w-full pl-5 pr-36 py-4 rounded-full bg-white border-2 border-mint-100 focus:border-mint-500 focus:ring-4 focus:ring-mint-100 outline-none transition text-base shadow-card" />
          <button id="btn-roll"
                  title="${escapeHtml(nav.randomTip || '')}"
                  class="absolute right-2 top-1/2 -translate-y-1/2 bg-mint-500 hover:bg-mint-600 text-white px-4 py-2 rounded-full font-medium transition shadow-card flex items-center gap-2 whitespace-nowrap">
            🎲 ${escapeHtml(nav.randomBtn || '')} <kbd class="hidden sm:inline text-[10px] font-mono bg-white/20 border border-white/30 px-1.5 py-0.5 rounded">R</kbd>
          </button>
        </div>
      </div>

      <div id="quick-cats" class="mt-10 grid grid-cols-3 lg:grid-cols-8 gap-3 max-w-5xl mx-auto">${heroCategoriesHtml(categories)}</div>
    </div>
  </section>

  <!-- ===== Main ===== -->
  <main class="max-w-7xl mx-auto px-5 lg:px-8 pb-8 grid grid-cols-12 gap-6">

    <div class="col-span-12 lg:col-span-9 space-y-10">

      <!-- 顶部广告位 -->
      <div data-ad-slot="ad-top-banner" class="ad-slot">
        <div class="text-center">
          <div class="text-xs uppercase tracking-wider text-mint-600 mb-1">${escapeHtml(sec.adSponsored || '')}</div>
          <div>${escapeHtml(sec.adSlotTop || '')}</div>
        </div>
      </div>

      <!-- 编辑精选 -->
      <section class="bg-gradient-to-br from-mint-50 via-white to-cream-100 rounded-card p-6 lg:p-8 shadow-card border border-mint-100">
        <header class="flex items-center justify-between mb-5">
          <h2 class="text-xl font-bold flex items-center gap-2 text-ink-800">
            <span class="text-2xl">✨</span><span>${escapeHtml(sec.featuredTitle || '')}</span>
          </h2>
          <span class="text-xs text-slate-500">${escapeHtml(sec.featuredNote || '')}</span>
        </header>
        <div id="featured-grid" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">${featuredGridHtml(sites, opts4render)}</div>
      </section>

      <!-- 分类卡片墙（构建期已把全部站点写进 HTML，JS 启动后按需重渲染） -->
      <div id="categories-container" class="space-y-12">${allCategoriesHtml(categories, sites, opts4render)}</div>

      <!-- 底部广告位 -->
      <div data-ad-slot="ad-bottom" class="ad-slot">
        <div class="text-center">
          <div class="text-xs uppercase tracking-wider text-mint-600 mb-1">${escapeHtml(sec.adSponsored || '')}</div>
          <div>${escapeHtml(sec.adSlotBottom || '')}</div>
        </div>
      </div>

      <!-- 站点逐个说：构建期全量渲染的正文内容，爬虫不执行 JS 也能读完 -->
      <section id="guide" class="scroll-mt-32">
        <header class="mb-6">
          <h2 class="text-2xl font-bold flex items-center gap-3 text-ink-800">
            <span class="text-3xl">📖</span><span>${escapeHtml(sec.guideTitle || '')}</span>
          </h2>
          <p class="text-sm text-slate-500 mt-2 leading-relaxed">${escapeHtml(sec.guideIntro || '')}</p>
        </header>
        <div id="site-guide">${siteGuideHtml(categories, sites, opts4render)}</div>
      </section>
    </div>

    <!-- 侧边栏 -->
    <aside class="col-span-12 lg:col-span-3 space-y-6">
      <div data-ad-slot="ad-sidebar-1" class="ad-slot-vertical">
        <div>
          <div class="text-xs uppercase tracking-wider text-mint-600 mb-1">${escapeHtml(sec.adLabel || '')}</div>
          <div>${escapeHtml(String(sec.adSlotSidebar || '').replace(/\{n\}/g, '1'))}</div>
        </div>
      </div>

      <section class="bg-white rounded-card p-5 shadow-card border border-cream-200">
        <header class="flex items-center justify-between mb-4">
          <h3 class="text-base font-bold flex items-center gap-2 text-ink-800">
            <span class="text-xl">🔥</span><span>${escapeHtml(sec.hotTitle || '')}</span>
          </h3>
          <span class="text-xs text-slate-400">${escapeHtml(sec.hotBadge || '')}</span>
        </header>
        <ol id="hot-list" class="space-y-3">${hotListHtml(sites, opts4render)}</ol>
      </section>

      <div data-ad-slot="ad-sidebar-2" class="ad-slot-vertical">
        <div>
          <div class="text-xs uppercase tracking-wider text-mint-600 mb-1">${escapeHtml(sec.adLabel || '')}</div>
          <div>${escapeHtml(String(sec.adSlotSidebar || '').replace(/\{n\}/g, '2'))}</div>
        </div>
      </div>

      <section class="bg-gradient-to-br from-cream-100 to-white rounded-card p-5 border border-cream-200">
        <h3 class="text-base font-bold mb-3 flex items-center gap-2 text-ink-800">
          <span class="text-xl">💡</span><span>${escapeHtml(sec.tipsTitle || '')}</span>
        </h3>
        <ul class="text-sm text-slate-600 leading-relaxed space-y-2.5">
          ${tipsHtml}
        </ul>
      </section>
    </aside>
  </main>

  <!-- ===== 提交推荐 ===== -->
  <section id="submit-section" class="bg-gradient-to-br from-mint-50 to-cream-100 py-14 border-y border-cream-200">
    <div class="max-w-3xl mx-auto px-5 lg:px-8">
      <div class="text-center mb-8">
        <h2 class="text-2xl lg:text-3xl font-bold mb-2 text-ink-800">📮 ${escapeHtml(sub.title || '')}</h2>
        <p class="text-slate-500 text-sm lg:text-base">${sub.subtitle || ''}</p>
      </div>

      <form id="submit-form" class="bg-white rounded-card p-6 lg:p-8 shadow-card border border-cream-200 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-slate-600 mb-1.5 block">${escapeHtml(sub.fieldTitle || '')} <span class="text-coral-500">*</span></label>
            <input name="title" required
                   class="w-full px-4 py-2.5 rounded-lg border border-cream-200 focus:border-mint-500 focus:ring-2 focus:ring-mint-100 outline-none text-sm" />
          </div>
          <div>
            <label class="text-sm text-slate-600 mb-1.5 block">${escapeHtml(sub.fieldCategory || '')} <span class="text-coral-500">*</span></label>
            <select name="category" required
                    class="w-full px-4 py-2.5 rounded-lg border border-cream-200 focus:border-mint-500 focus:ring-2 focus:ring-mint-100 outline-none text-sm bg-white">
              ${catOptions}
            </select>
          </div>
        </div>
        <div>
          <label class="text-sm text-slate-600 mb-1.5 block">${escapeHtml(sub.fieldUrl || '')} <span class="text-coral-500">*</span></label>
          <input name="url" type="url" required placeholder="https://..."
                 class="w-full px-4 py-2.5 rounded-lg border border-cream-200 focus:border-mint-500 focus:ring-2 focus:ring-mint-100 outline-none text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-600 mb-1.5 block">${escapeHtml(sub.fieldDesc || '')} <span class="text-coral-500">*</span></label>
          <textarea name="description" required rows="2" maxlength="120"
                    class="w-full px-4 py-2.5 rounded-lg border border-cream-200 focus:border-mint-500 focus:ring-2 focus:ring-mint-100 outline-none text-sm resize-none"
                    placeholder="${escapeHtml(sub.fieldDescPlaceholder || '')}"></textarea>
        </div>
        <div class="flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-3 pt-2">
          <p class="text-xs text-slate-500">${escapeHtml(sub.note || '')}</p>
          <button type="submit"
                  class="bg-mint-500 hover:bg-mint-600 text-white px-6 py-2.5 rounded-full font-medium transition shadow-card whitespace-nowrap">
            ${escapeHtml(sub.submitBtn || '')} 🐟
          </button>
        </div>
      </form>

      <!-- 提交后引导：GitHub 新标签页已打开，点 Submit new issue 完成 -->
      <div id="submit-hint"
           class="hidden mt-4 bg-white/90 border border-mint-200 rounded-card px-5 py-4 text-sm text-slate-600 leading-relaxed">
        <p class="font-semibold text-ink-800 mb-1.5">${escapeHtml(sub.hintTitle || '')}</p>
        ${hintBody}
        <a id="submit-hint-link" href="#" target="_blank" rel="noopener"
           class="inline-block mt-2 text-mint-600 hover:text-mint-700 font-medium underline">${escapeHtml(sub.hintLink || '')}</a>
      </div>
    </div>
  </section>

  <!-- ===== Footer ===== -->
  <footer class="bg-ink-800 text-slate-300 pt-14 pb-6">
    <div class="max-w-7xl mx-auto px-5 lg:px-8">
      ${friendsHtml}

      <section class="mb-10 pb-8 border-b border-slate-700">
        ${langSwitcherHtml(langs, i18n.code, 'index', { variant: 'footer', t: i18n })}
      </section>

      <div class="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <div class="text-center md:text-left">
          ${escapeHtml(foot.copyright || '')}<br />
          <span class="text-slate-500">${escapeHtml(foot.disclosure || '')}</span>
        </div>
        <div class="flex flex-wrap items-center justify-center md:justify-end gap-x-5 gap-y-2">
          <a href="#submit-section" class="hover:text-white transition">${escapeHtml((foot.links && foot.links.submit) || '')}</a>
          <a href="${escapeHtml(p + '/about.html')}" class="hover:text-white transition">${escapeHtml((foot.links && foot.links.about) || '')}</a>
          <a href="${escapeHtml(p + '/privacy.html')}" class="hover:text-white transition">${escapeHtml((foot.links && foot.links.privacy) || '')}</a>
          <a href="${escapeHtml(p + '/faq.html')}" class="hover:text-white transition">${escapeHtml((foot.links && foot.links.faq) || '')}</a>
          <a href="${escapeHtml(p + '/contact.html')}" class="hover:text-white transition">${escapeHtml((foot.links && foot.links.contact) || '')}</a>
        </div>
      </div>
    </div>
  </footer>

  <!-- ===== Toast ===== -->
  <div id="toast"
       class="hidden fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-ink-800 text-white px-5 py-3 rounded-full shadow-card-hover text-sm font-medium">
    ${escapeHtml((i18n.toast && i18n.toast.roll) || '').replace('{title}', '')}
  </div>

</body>
</html>`;
}
