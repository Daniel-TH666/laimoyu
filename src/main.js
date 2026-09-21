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
import { initShare } from './lib/share.js';

// === 语言包与站点数据都按语言懒加载 ===
// 非 eager 的 glob 会把每种语言拆成独立 chunk，只有当前语言的数据会被真正下载，
// 加语言不会让首屏的 JS 体积变大。
const i18nLoaders = import.meta.glob('./i18n/*.json');
const sitesLoaders = import.meta.glob('./data/sites/*.json');

const LANG_KEY = 'moyu_lang';       // 用户手动选过的语言（记住在这台设备上）
const FAV_KEY = 'moyu_favs';        // 收藏

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

// 分享用的链接：优先取构建期写好的 canonical —— 它是这个页面唯一的正式地址
// （绝对 https、带语言前缀、不带 index.html），比自己拼 location 更可靠。
function canonicalUrl() {
  const link = document.querySelector('link[rel="canonical"]');
  const href = link && link.getAttribute('href');
  if (href) return href;
  return location.origin + location.pathname;
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

// 「更新说明」区块：本站不定期更新、不开放投稿，这里只需要把按钮滚动到该区块。
// ⚠️ 刻意不做任何网络请求、不收集任何输入 —— 页面上不存在表单。
function bindUpdates() {
  const btn = document.getElementById('btn-updates');
  if (btn) btn.addEventListener('click', () => {
    const sec = document.getElementById('updates-section');
    if (sec) sec.scrollIntoView({ behavior: 'smooth' });
  });
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

  // 分享入口先挂上：它分享的是「这个页面」，不依赖站点数据。
  // 文案与海报等真正点开那一刻才算（initShare 内部惰性构建），
  // 所以即使下面 loadData 抛错，分享按钮照样能用。
  try {
    initShare(() => ({
      t: state.t,
      sites: state.sites,
      brand: (state.t && state.t.brand) || document.title,
      url: canonicalUrl()
    }));
  } catch (err) {
    console.error('分享入口初始化失败：', err);
  }

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
    bindUpdates();
    bindTypewriter();
  } catch (err) {
    // 静默降级：正文已经在 HTML 里了，只有搜索/收藏这些增强功能失效
    console.error('交互脚本初始化失败：', err);
    showToast((state.t.toast || {}).loadFail || 'Some features failed to load — refresh to retry.', 'warn', 5000);
  }
})();
