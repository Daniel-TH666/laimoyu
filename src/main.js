// src/main.js - 摸鱼乐园 主逻辑

import './style.css';
// 站点数据：构建期打包进产物（不能用运行时 fetch —— 构建后 src/ 目录不存在）
import sitesData from './data/sites.json';
import categoriesData from './data/categories.json';
// 渲染模板与构建期静态渲染（build/prerender.js）共用同一份，避免两边结构走偏
import {
  escapeHtml,
  heroCategoriesHtml,
  featuredGridHtml,
  hotListHtml,
  emptyStateHtml,
  categorySectionHtml
} from './lib/render.js';

// === 状态 ===
const state = {
  sites: [],
  categories: [],
  activeCategory: 'all',
  query: '',
  favorites: loadFavorites()
};

function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem('moyu_favs') || '[]'));
  } catch {
    return new Set();
  }
}
function saveFavorites() {
  localStorage.setItem('moyu_favs', JSON.stringify([...state.favorites]));
}

// === 数据加载 ===
async function loadData() {
  state.sites = Array.isArray(sitesData) ? sitesData : [];
  state.categories = [...(categoriesData || [])].sort((a, b) => a.sort - b.sort);
}

// === 工具 ===
// escapeHtml / safeUrl / getHostname / highlight / 卡片模板 都来自 src/lib/render.js，
// 构建期静态渲染用的是同一份，改一处两边同步生效。
function getFilteredSites() {
  return state.sites.filter(s => {
    const catOk = state.activeCategory === 'all' || s.category === state.activeCategory;
    if (!catOk) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    }
    return true;
  });
}

// 图标、卡片、原生广告卡等模板见 src/lib/render.js

// === 渲染各区域 ===
function renderHeroCategories() {
  const c = document.getElementById('quick-cats');
  if (!c) return;
  c.innerHTML = heroCategoriesHtml(state.categories);
  // 让每张分类卡片的浮动节奏错开，静态渲染出来的 HTML 没有内联 delay
  c.querySelectorAll('.hero-cat').forEach(el => {
    el.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
  });
  c.querySelectorAll('[data-cat]').forEach(b => {
    b.addEventListener('click', () => {
      state.activeCategory = b.dataset.cat;
      state.query = '';
      document.getElementById('top-search').value = '';
      syncTabs();
      render();
      document.getElementById('categories-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function cardOpts() {
  return { query: state.query, favorites: state.favorites };
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
    container.innerHTML = emptyStateHtml();
    const back = document.getElementById('back-all');
    if (back) back.onclick = () => {
      state.activeCategory = 'all';
      state.query = '';
      document.getElementById('top-search').value = '';
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
  ol.innerHTML = hotListHtml(state.sites);
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
  if (cnt) cnt.textContent = state.sites.length;
}

// === 事件绑定 ===
function bindCardEvents() {
  document.querySelectorAll('[data-action="fav"]').forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      const id = btn.dataset.id;
      if (state.favorites.has(id)) state.favorites.delete(id);
      else state.favorites.add(id);
      saveFavorites();
      render();
    };
  });
}

function bindTabs() {
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeCategory = tab.dataset.cat;
      state.query = '';
      document.getElementById('top-search').value = '';
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
    document.getElementById('top-search').value = state.query;
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
    showToast(`🐟 出发！${pick.title}`);
  };
  const btn = document.getElementById('btn-roll');
  if (btn) btn.addEventListener('click', roll);

  document.addEventListener('keydown', e => {
    const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (inField) return;
    const k = e.key.toLowerCase();
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      if (k === 'r') { e.preventDefault(); roll(); }
      if (k === '/') {
        e.preventDefault();
        document.getElementById('top-search').focus();
        showToast('🐟 已聚焦搜索框');
      }
    }
    if (e.key === 'Escape') {
      ['about-modal', 'reward-modal'].forEach(id => {
        const m = document.getElementById(id);
        if (m) m.classList.add('hidden');
      });
    }
  });
}

function bindSubmit() {
  const select = document.querySelector('#submit-form select[name="category"]');
  if (select) {
    select.innerHTML = '<option value="">选择分类</option>' +
      state.categories.map(c => `<option value="${c.id}">${c.icon} ${c.title}</option>`).join('');
  }

  const form = document.getElementById('submit-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const cat = state.categories.find(c => c.id === data.category);
    const url = buildRecIssueUrl(data, cat ? `${cat.icon} ${cat.title}` : data.category);

    // 处在用户点击的调用栈里，正常不会被拦截；被拦了就退回手工链接
    const tab = window.open(url, '_blank');

    const hint = document.getElementById('submit-hint');
    const link = document.getElementById('submit-hint-link');
    if (hint && link) {
      link.href = url;
      hint.classList.remove('hidden');
      hint.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    showToast(
      tab ? '已在 GitHub 打开，点「Submit new issue」完成提交 🐟'
          : '新标签页被拦了，点下面的链接继续 🐟',
      tab ? 'success' : 'warn',
      5000
    );
  });

  const btn = document.getElementById('btn-submit');
  if (btn) btn.addEventListener('click', () => {
    document.getElementById('submit-section').scrollIntoView({ behavior: 'smooth' });
  });
}

// === 推荐提交：跳转到 GitHub 的「新建 Issue」页，内容预先填好 ===
// 为什么不是直接 POST：GitHub 早就禁止未登录匿名建 Issue，
// 前端直连 api.github.com 一定拿到 401 Requires authentication，所以改为
// 引导访客在 GitHub 上点一次「Submit new issue」——不需要任何令牌，零后端。
// 正文格式必须与后台 studio.js 的 parseRecIssue() 解析规则保持一致：
//   `- **网站名**：xxx` / `**网址**` / `**分类**` / `**简介**`
const REC_REPO = { owner: 'Daniel-TH666', repo: 'laimoyu' };

function buildRecIssueUrl(data, catTitle) {
  const one = s => String(s == null ? '' : s).replace(/\s*\n\s*/g, ' ').trim();
  const body = [
    '### 推荐摸鱼网站',
    '',
    `- **网站名**：${one(data.title)}`,
    `- **网址**：${one(data.url)}`,
    `- **分类**：${one(catTitle)}`,
    `- **简介**：${one(data.description)}`,
    `- **提交时间**：${new Date().toLocaleString('zh-CN')}`
  ].join('\n');

  const q = new URLSearchParams({
    title: `[推荐] ${one(data.title)}`,
    body
  });
  return `https://github.com/${REC_REPO.owner}/${REC_REPO.repo}/issues/new?${q.toString()}`;
}

// === 打赏弹窗 ===
// 注：打赏功能已于 2026-09-16 暂时下线（index.html 里的入口与弹窗已移除），
// 本函数在 DOM 不存在时第一行即返回，留着是为了将来一行 HTML 就能恢复。
function bindReward() {
  const link = document.getElementById('reward-link');
  const modal = document.getElementById('reward-modal');
  const close = document.getElementById('reward-close');
  if (!modal) return;
  if (link) link.addEventListener('click', e => {
    e.preventDefault();
    modal.classList.remove('hidden');
  });
  if (close) close.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') modal.classList.add('hidden');
  });
  // 收款码未上传时优雅降级，不显示破图
  // 注意：图片 404 的 error 事件可能早于本函数执行，所以要同时检查 complete/naturalWidth
  const img = document.getElementById('reward-qr');
  const missing = document.getElementById('reward-qr-missing');
  if (img && missing) {
    const showMissing = () => {
      img.classList.add('hidden');
      missing.classList.remove('hidden');
    };
    if (img.complete && img.naturalWidth === 0) showMissing();
    else img.addEventListener('error', showMissing);
  }
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
  if (!t) return;
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
  const n = state.sites.length || 0;
  const phrases = [
    `摸鱼乐园 · ${n} 个摸鱼网站导航`,
    '一个网址，摸遍所有鱼',
    '上班摸鱼，从这里开始',
    '让划水更优雅一点',
    '上班的快乐，一个导航就够'
  ];
  let pi = 0, ci = 0, deleting = false;
  const tick = () => {
    const word = phrases[pi];
    if (!deleting) {
      ci++;
      el.innerHTML = highlightTypewriter(word.slice(0, ci));
      if (ci === word.length) {
        deleting = true;
        return setTimeout(tick, 1800);
      }
      setTimeout(tick, 90);
    } else {
      ci--;
      el.innerHTML = highlightTypewriter(word.slice(0, ci));
      if (ci === 0) {
        deleting = false;
        pi = (pi + 1) % phrases.length;
        return setTimeout(tick, 300);
      }
      setTimeout(tick, 40);
    }
  };
  function highlightTypewriter(text) {
    return escapeHtml(text) + '<span class="caret"></span>';
  }
  tick();
}

// === 启动 ===
(async function init() {
  try {
    await loadData();
    syncTabs();
    renderHeroCategories();
    renderFeatured();
    renderHotList();
    render();
    bindTabs();
    bindSearch();
    bindRoll();
    bindSubmit();
    bindReward();
    bindTypewriter();
  } catch (err) {
    console.error('初始化失败：', err);
    document.body.insertAdjacentHTML('afterbegin',
      `<div class="bg-coral-500 text-white px-4 py-2 text-center text-sm">数据加载失败，请检查网络或刷新重试</div>`);
  }
})();