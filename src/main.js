// src/main.js — 摸鱼乐园 前台主逻辑（多语言）
//
// 三条设计原则：
//   1) 渐进增强。页面正文（全部分类、全部站点卡片、每条点评）在构建期就已经静态
//      渲染进 HTML，所以即使这段 JS 完全不执行（爬虫、用户禁用 JS、加载失败），
//      访问者依然能看到完整内容。JS 只负责「搜索 / 筛选 / 收藏 / 推荐提交」这些交互。
//   2) 语言不由 JS 决定页面内容。当前语言来自 <html data-lang="...">（构建期写入）
//      或 URL 路径。JS 只在「默认语言的根路径」上做一次浏览器语言匹配跳转，
//      并且在用户手动选择过语言之后永远不再自动跳。
//   3) 所有可见文案来自语言包，这里不出现硬编码的自然语言字符串。

import './style.css';
import {
  DEFAULT_LANG,
  LANGUAGE_ORDER,
  langFromPathname,
  matchBrowserLanguage
} from './i18n/languages.js';
import {
  escapeHtml,
  fmt,
  heroCategoriesHtml,
  featuredGridHtml,
  hotListHtml,
  emptyStateHtml,
  categorySectionHtml,
  buildCategories
} from './lib/render.js';

// === 语言包与站点数据都按语言懒加载 ===
// 非 eager 的 glob 会把每种语言拆成独立 chunk，只有当前语言的数据会被真正下载，
// 加语言不会让首屏的 JS 体积变大。
const i18nLoaders = import.meta.glob('./i18n/*.json');
const sitesLoaders = import.meta.glob('./data/sites/*.json');

const LANG_KEY = 'moyu_lang';       // 用户手动选过的语言（记住在这台设备上）
const FAV_KEY = 'moyu_favs';        // 收藏

const REC_REPO = { owner: 'Daniel-TH666', repo: 'laimoyu' };

// === 状态 ===
const state = {
  lang: DEFAULT_LANG,
  t: {},                 // 当前语言的语言包
  sites: [],
  categories: [],
  activeCategory: 'all',
  query: '',
  favorites: loadFavorites()
};

function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function saveFavorites() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...state.favorites])); } catch { /* 隐私模式下忽略 */ }
}

// === 语言识别与自动匹配 ===
function detectLang() {
  const fromDom = document.documentElement.dataset.lang;
  if (fromDom && LANGUAGE_ORDER.includes(fromDom)) return fromDom;
  return langFromPathname(location.pathname);
}

function readSavedLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v && LANGUAGE_ORDER.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function saveLang(code) {
  try { localStorage.setItem(LANG_KEY, code); } catch { /* 忽略 */ }
}

// 只有在「默认语言的根路径」上才做自动匹配跳转。
// 已经在 /zh/ 这类语言目录里 → 说明是用户自己选过来的，绝不打断。
function autoRedirectIfNeeded() {
  const path = location.pathname.replace(/index\.html?$/i, '');
  if (path !== '/' && path !== '') return false;

  // ① 用户手动选过语言 → 尊重选择（包括「特意选了英语」这种情况）
  const saved = readSavedLang();
  if (saved) {
    if (saved === DEFAULT_LANG) return false;
    goToLang(saved);
    return true;
  }

  // ② 没选过 → 按浏览器语言匹配一次；匹配不到就用默认语言（英语）留在根路径
  const matched = matchBrowserLanguage(
    navigator.languages || [navigator.language]
  );
  if (matched && matched !== DEFAULT_LANG) {
    goToLang(matched);
    return true;
  }
  return false;
}

function goToLang(code) {
  // 用 replace 而不是 assign：避免在历史里塞一条「被跳过」的记录，
  // 用户按返回键会回到来时的页面，而不是来回弹。
  location.replace(`/${code}/${location.search}${location.hash}`);
}

// 语言切换器是纯 <a>（禁用 JS 也能用）。这里只做一件事：
// 记下用户的选择，免得下次访问又被自动跳回浏览器语言。
function bindLangSwitch() {
  document.querySelectorAll('.lang-switch a[href]').forEach(a => {
    a.addEventListener('click', () => {
      try {
        saveLang(langFromPathname(new URL(a.getAttribute('href'), location.origin).pathname));
      } catch { /* 忽略 */ }
    });
  });
}

// === 数据加载 ===
async function loadData(lang) {
  const defaultI18n = async () => {
    const loader = i18nLoaders[`./i18n/${DEFAULT_LANG}.json`];
    return loader ? (await loader()).default : {};
  };

  let t;
  const i18nLoader = i18nLoaders[`./i18n/${lang}.json`];
  if (i18nLoader) {
    t = (await i18nLoader()).default;
  } else {
    // 语言包缺失也不能白屏：退回默认语言，页面正文本来就已经在 HTML 里了
    t = await defaultI18n();
  }

  const sitesLoader = sitesLoaders[`./data/sites/${lang}.json`];
  const sites = sitesLoader ? (await sitesLoader()).default : [];

  state.lang = lang;
  state.t = t || {};
  state.sites = Array.isArray(sites) ? sites : [];
  state.categories = buildCategories(t || {});
}

// === 工具 ===
function getFilteredSites() {
  return state.sites.filter(s => {
    const catOk = state.activeCategory === 'all' || s.category === state.activeCategory;
    if (!catOk) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      return String(s.title || '').toLowerCase().includes(q)
        || String(s.description || '').toLowerCase().includes(q);
    }
    return true;
  });
}

// 传给 render.js 的通用参数：当前查询、收藏集合、语言包
function cardOpts() {
  return { query: state.query, favorites: state.favorites, t: state.t };
}

// === 渲染各区域 ===
function renderHeroCategories() {
  const c = document.getElementById('quick-cats');
  if (!c) return;
  c.innerHTML = heroCategoriesHtml(state.categories);
  // 让每张分类卡片的浮动节奏错开（静态渲染出来的 HTML 没有内联 delay）
  c.querySelectorAll('.hero-cat').forEach(el => {
    el.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
  });
  c.querySelectorAll('[data-cat]').forEach(b => {
    b.addEventListener('click', () => {
      state.activeCategory = b.dataset.cat;
      state.query = '';
      const top = document.getElementById('top-search');
      if (top) top.value = '';
      syncTabs();
      render();
      const box = document.getElementById('categories-container');
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function renderFeatured() {
  const target = document.getElementById('featured-grid');
  if (!target) return;
  target.innerHTML = featuredGridHtml(state.sites, cardOpts());
}

function renderCategories() {
  const container = document.getElementById('categories-container');
  if (!container) return;

  const filtered = getFilteredSites();
  const catsToShow = state.activeCategory === 'all'
    ? state.categories
    : state.categories.filter(c => c.id === state.activeCategory);

  if (filtered.length === 0) {
    container.innerHTML = emptyStateHtml(state.t);
    const back = document.getElementById('back-all');
    if (back) back.onclick = () => {
      state.activeCategory = 'all';
      state.query = '';
      const top = document.getElementById('top-search');
      if (top) top.value = '';
      syncTabs();
      render();
    };
    return;
  }

  container.innerHTML = catsToShow.map(cat => {
    const items = filtered.filter(s => s.category === cat.id);
    if (items.length === 0) return '';
    return categorySectionHtml(cat, items, cardOpts());
  }).join('');
}

function renderHotList() {
  const ol = document.getElementById('hot-list');
  if (!ol) return;
  ol.innerHTML = hotListHtml(state.sites, cardOpts());
}

function syncTabs() {
  document.querySelectorAll('.cat-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.cat === state.activeCategory);
  });
}

function render() {
  renderCategories();
  bindCardEvents();
  const cnt = document.getElementById('hero-count');
  if (cnt) cnt.textContent = String(state.sites.length);
}

// === 事件绑定 ===
function bindCardEvents() {
  document.querySelectorAll('[data-action="fav"]').forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      const id = btn.dataset.id;
      const had = state.favorites.has(id);
      if (had) state.favorites.delete(id);
      else state.favorites.add(id);
      saveFavorites();
      render();
      const toast = state.t.toast || {};
      showToast(had ? (toast.favOff || 'Removed from favourites')
                    : (toast.favOn || 'Saved to favourites'));
    };
  });
}

function bindTabs() {
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeCategory = tab.dataset.cat;
      state.query = '';
      const top = document.getElementById('top-search');
      if (top) top.value = '';
      syncTabs();
      render();
      renderHotList();
    });
  });
}

function bindSearch() {
  const onInput = e => {
    state.query = e.target.value.trim();
    state.activeCategory = 'all';
    const top = document.getElementById('top-search');
    if (top) top.value = state.query;
    syncTabs();
    render();
  };
  const top = document.getElementById('top-search');
  const big = document.getElementById('big-search');
  if (top) top.addEventListener('input', onInput);
  if (big) big.addEventListener('input', onInput);
}

function bindRoll() {
  const roll = () => {
    const pool = state.sites;
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    window.open(pick.url, '_blank', 'noopener,noreferrer');
    showToast(fmt((state.t.toast || {}).roll || '{title}', { title: pick.title }));
  };
  const btn = document.getElementById('btn-roll');
  if (btn) btn.addEventListener('click', roll);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.lang-switch[open]').forEach(d => d.removeAttribute('open'));
      return;
    }
    const active = document.activeElement;
    const inField = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
    if (inField) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'r') {
      e.preventDefault();
      roll();
    } else if (k === '/') {
      e.preventDefault();
      const top = document.getElementById('top-search');
      if (top) top.focus();
      showToast((state.t.toast || {}).searchFocus || '');
    }
  });
}

function bindSubmit() {
  // 分类下拉在构建期已经渲染好了（爬虫也能读），只有内容为空时才补一份
  const select = document.querySelector('#submit-form select[name="category"]');
  if (select && select.options.length <= 1) {
    select.innerHTML = `<option value="">${escapeHtml((state.t.submit || {}).fieldCategoryPlaceholder || '')}</option>`
      + state.categories.map(c =>
        `<option value="${escapeHtml(c.id)}">${escapeHtml(c.icon)} ${escapeHtml(c.title)}</option>`).join('');
  }

  const form = document.getElementById('submit-form');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const cat = state.categories.find(c => c.id === data.category);
      const url = buildRecIssueUrl(data, cat ? `${cat.icon} ${cat.title}` : data.category);
      const sub = state.t.submit || {};

      // 处在用户点击的调用栈里，正常不会被拦截；被拦了就退回手工链接
      const tab = window.open(url, '_blank');

      const hint = document.getElementById('submit-hint');
      const link = document.getElementById('submit-hint-link');
      if (hint && link) {
        link.href = url;
        hint.classList.remove('hidden');
        hint.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      showToast(tab
        ? (sub.toastOpened || 'Opened on GitHub — click "Submit new issue" to finish')
        : (sub.toastBlocked || 'The new tab was blocked — use the link below'),
        tab ? 'success' : 'warn', 5000);
    });
  }

  const btn = document.getElementById('btn-submit');
  if (btn) btn.addEventListener('click', () => {
    const sec = document.getElementById('submit-section');
    if (sec) sec.scrollIntoView({ behavior: 'smooth' });
  });
}

// === 推荐提交：跳到 GitHub 的「新建 Issue」页，内容预先填好 ===
// 为什么不是直接 POST：GitHub 早就禁止未登录匿名建 Issue，前端直连 api.github.com
// 一定拿到 401 Requires authentication，所以改为引导访客在 GitHub 上点一次
// 「Submit new issue」——不需要任何令牌，零后端。
//
// ⚠️ 正文里的字段名必须保持 ASCII 且不随语言变化（lang / title / url / category /
//    description），后台 studio.js 的 parseRecIssue() 靠这些键解析。
//    只有给人看的标题前缀、说明正文才跟着语言走；同时保留对旧版中文键的兼容。
const REC_FIELDS = {
  lang: 'lang', title: 'title', url: 'url',
  category: 'category', categoryLabel: 'categoryLabel', description: 'description'
};

function buildRecIssueUrl(data, catLabel) {
  const sub = state.t.submit || {};
  const one = s => String(s == null ? '' : s).replace(/\s*\n\s*/g, ' ').trim();
  const body = [
    sub.issueHeading || '### Site suggestion',
    '',
    `- **${REC_FIELDS.lang}**: ${one(state.lang)}`,
    `- **${REC_FIELDS.title}**: ${one(data.title)}`,
    `- **${REC_FIELDS.url}**: ${one(data.url)}`,
    `- **${REC_FIELDS.category}**: ${one(data.category)}`,
    `- **${REC_FIELDS.categoryLabel}**: ${one(catLabel)}`,
    `- **${REC_FIELDS.description}**: ${one(data.description)}`,
    `- **submittedAt**: ${new Date().toISOString()}`
  ].join('\n');

  const q = new URLSearchParams({
    title: `${sub.issueTitlePrefix || '[Suggestion]'} ${one(data.title)}`,
    body
  });
  return `https://github.com/${REC_REPO.owner}/${REC_REPO.repo}/issues/new?${q.toString()}`;
}

// 前台提示条：文本写进 JS，保证 Tailwind 能扫到这些类名并生成
const TOAST_COLOR = {
  success: 'bg-mint-500 text-white',
  warn: 'bg-amber-400 text-amber-900',
  error: 'bg-rose-500 text-white',
  info: 'bg-ink-800 text-white'
};

function showToast(text, kind = 'info', duration = 2200) {
  const t = document.getElementById('toast');
  if (!t || !text) return;
  t.textContent = text;
  t.classList.remove('bg-mint-500', 'text-white', 'bg-amber-400', 'text-amber-900', 'bg-rose-500', 'bg-ink-800');
  (TOAST_COLOR[kind] || TOAST_COLOR.info).split(' ').forEach(c => t.classList.add(c));
  t.classList.remove('hidden');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.add('hidden'), duration);
}

// === Hero 打字机 ===
function bindTypewriter() {
  const el = document.getElementById('hero-slogan');
  if (!el) return;
  // 第一句刻意写成含关键词、含收录数量的完整描述：它既是首屏文案，
  // 也是被搜索引擎抓到的 h1 文本（静态渲染出来的就是这一句）
  const home = (state.t.meta && state.t.meta.home) || {};
  const n = state.sites.length || 0;
  const phrases = (Array.isArray(home.slogans) && home.slogans.length
    ? home.slogans
    : [home.h1Template || '{count} sites']
  ).map(s => fmt(s, { count: n }));

  let pi = 0, ci = 0, deleting = false;
  const paint = text => { el.innerHTML = escapeHtml(text) + '<span class="caret"></span>'; };
  const tick = () => {
    const word = phrases[pi];
    if (!deleting) {
      ci++;
      paint(word.slice(0, ci));
      if (ci >= word.length) {
        deleting = true;
        return setTimeout(tick, 1800);
      }
      setTimeout(tick, 90);
    } else {
      ci--;
      paint(word.slice(0, ci));
      if (ci <= 0) {
        deleting = false;
        pi = (pi + 1) % phrases.length;
        return setTimeout(tick, 300);
      }
      setTimeout(tick, 40);
    }
  };
  tick();
}

// === 启动 ===
(async function init() {
  // ① 语言自动匹配（必须在取数据之前，跳走就什么都不用做了）
  try {
    if (autoRedirectIfNeeded()) return;
  } catch { /* 匹配失败不影响正常浏览 */ }

  const lang = detectLang();
  document.documentElement.dataset.lang = lang;
  bindLangSwitch();

  try {
    await loadData(lang);
    syncTabs();
    renderHeroCategories();
    renderFeatured();
    renderHotList();
    render();
    bindTabs();
    bindSearch();
    bindRoll();
    bindSubmit();
    bindTypewriter();
  } catch (err) {
    // 静默降级：正文已经在 HTML 里了，只有搜索/收藏这些增强功能失效
    console.error('交互脚本初始化失败：', err);
    showToast((state.t.toast || {}).loadFail || 'Some features failed to load — refresh to retry.', 'warn', 5000);
  }
})();
