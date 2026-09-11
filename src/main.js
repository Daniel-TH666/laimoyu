// src/main.js - 摸鱼乐园 主逻辑

import './style.css';

// === 状态 ===
const state = {
  sites: [],
  categories: [],
  activeCategory: 'all',
  query: '',
  favorites: loadFavorites(),
  stealthOn: false,
  originalTitle: document.title
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
  const [sites, cats] = await Promise.all([
    fetch('./src/data/sites.json').then(r => r.json()),
    fetch('./src/data/categories.json').then(r => r.json())
  ]);
  state.sites = sites;
  state.categories = cats.sort((a, b) => a.sort - b.sort);
}

// === 工具 ===
function getHostname(siteUrl) {
  try { return new URL(siteUrl).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escapeHtml(text).replace(new RegExp(`(${safe})`, 'gi'),
    '<mark class="bg-mint-100 text-ink-800 rounded px-0.5">$1</mark>');
}
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

// === 图标：站点数据 > favicon service > 字母兜底 ===
function getIconUrl(site) {
  if (site.icon && site.icon.trim()) return site.icon.trim();
  // 兜底：直接用 api.iowen.cn 的 favicon 接口
  try {
    const host = getHostname(site.url);
    if (host) return `https://api.iowen.cn/favicon/${host}.png`;
  } catch {}
  return '';
}
// 字母兜底：生成固定色调的 data-uri svg
function fallbackAvatar(site) {
  // 用标题第一个字符（中英文都支持）
  const title = site.title || '?';
  const ch = [...title.trim()][0] || '?';
  // 用站点 id 哈希出色相
  let hash = 0;
  for (const c of site.id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
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

// === 卡片渲染 ===
function siteCard(site, opts = {}) {
  const isFav = state.favorites.has(site.id);
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
          <h3 class="font-bold text-ink-800 truncate text-[15px]">${highlight(site.title, state.query)}</h3>
          <p class="text-xs text-slate-400 truncate mt-0.5">${escapeHtml(getHostname(site.url))}</p>
        </div>
        <button class="${favBtnClass} text-lg transition flex-shrink-0"
                data-id="${site.id}" data-action="fav"
                title="${isFav ? '取消收藏' : '加入收藏'}">
          ${isFav ? '★' : '☆'}
        </button>
      </div>
      <p class="text-sm text-slate-500 line-clamp-2 mb-3 flex-1">${highlight(site.description, state.query)}</p>
      <div class="flex items-center justify-end mt-auto">
        <a href="${site.url}" target="_blank" rel="noopener noreferrer nofollow"
           data-visit="${site.id}"
           class="text-xs bg-mint-50 text-mint-700 px-3 py-1.5 rounded-full hover:bg-mint-500 hover:text-white transition font-medium">
          打开摸鱼 ↗
        </a>
      </div>
    </article>
  `;
}

// 原生广告卡（混在列表里）
function nativeAdCard() {
  return `
    <article class="ad-native rounded-card p-4 bg-gradient-to-br from-cream-100/60 to-mint-50/40 border-2 border-dashed border-mint-200 flex flex-col items-center justify-center text-center min-h-[134px]">
      <span class="text-[10px] uppercase tracking-wider text-mint-600 font-bold mb-2">广告 · Sponsored</span>
      <p class="text-xs text-slate-500">原生广告位 · ad-native-1</p>
    </article>
  `;
}

// === 渲染各区域 ===
function renderHeroCategories() {
  const c = document.getElementById('quick-cats');
  if (!c) return;
  c.innerHTML = state.categories.map(cat => `
    <button data-cat="${cat.id}" class="hero-cat floating" style="animation-delay:${(Math.random() * 3).toFixed(2)}s">
      <span class="text-3xl">${cat.icon}</span>
      <span class="text-sm font-medium text-ink-700">${cat.title}</span>
    </button>
  `).join('');
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

function renderFeatured() {
  const featured = state.sites.filter(s => s.featured).slice(0, 10);
  const target = document.getElementById('featured-grid');
  if (!target) return;
  target.innerHTML = featured.map(s => siteCard(s, { compact: true })).join('');
}

function renderCategories() {
  const container = document.getElementById('categories-container');
  if (!container) return;

  const filtered = getFilteredSites();
  const catsToShow = state.activeCategory === 'all'
    ? state.categories
    : state.categories.filter(c => c.id === state.activeCategory);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-20 bg-white rounded-card border border-cream-200">
        <div class="text-6xl mb-4">🐟</div>
        <p class="text-slate-500">没找到相关的摸鱼网址</p>
        <button id="back-all"
                class="mt-4 text-sm bg-mint-50 text-mint-700 px-4 py-2 rounded-full hover:bg-mint-500 hover:text-white transition font-medium">
          返回全部
        </button>
      </div>
    `;
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
    return `
      <section id="cat-${cat.id}" class="category-section scroll-mt-32">
        <header class="flex items-center justify-between mb-5">
          <h2 class="text-2xl font-bold flex items-center gap-3 text-ink-800">
            <span class="text-3xl">${cat.icon}</span>
            <span>${cat.title}</span>
            <span class="text-sm text-slate-400 font-normal">${items.length} 个</span>
          </h2>
          <span class="text-xs text-slate-400 hidden md:inline">${escapeHtml(cat.desc)}</span>
        </header>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          ${items.map((s, i) => siteCard(s) + ((i === 2 && items.length > 4) ? nativeAdCard() : '')).join('')}
        </div>
      </section>
    `;
  }).join('');
}

function renderHotList() {
  const hot = [
    ...state.sites.filter(s => s.featured),
    ...state.sites.filter(s => !s.featured).slice(0, 10)
  ].slice(0, 10);

  const ol = document.getElementById('hot-list');
  if (!ol) return;
  ol.innerHTML = hot.map((s, i) => {
    const iconUrl = getIconUrl(s);
    const avatar = fallbackAvatar(s);
    return `
    <li class="flex items-center gap-3">
      <span class="${i < 3 ? 'rank-top' : 'rank'}">${i + 1}</span>
      <a href="${s.url}" target="_blank" rel="noopener noreferrer"
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
  `;}).join('');
}

function syncTabs() {
  document.querySelectorAll('.cat-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.cat === state.activeCategory);
  });
}

function render() {
  renderCategories();
  bindCardEvents();
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
      if (k === 's') {
        e.preventDefault();
        document.getElementById('btn-stealth').click();
      }
    }
    if (e.key === 'Escape') {
      const m = document.getElementById('about-modal');
      if (m) m.classList.add('hidden');
    }
  });
}

function bindStealth() {
  const btn = document.getElementById('btn-stealth');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.stealthOn = !state.stealthOn;
    if (state.stealthOn) {
      document.title = '员工自助系统 · 文档中心 - Excel Online';
      btn.innerHTML = '🎭 <span class="hidden xl:inline">退出伪装</span>';
      showToast('🎭 已切换到「员工自助系统」伪装模式');
    } else {
      document.title = state.originalTitle;
      btn.innerHTML = '🎭 <span class="hidden xl:inline">伪装模式</span>';
      showToast('🎭 已恢复正常标题');
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
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const queue = JSON.parse(localStorage.getItem('moyu_pending') || '[]');
      queue.push({ ...data, submittedAt: new Date().toISOString() });
      localStorage.setItem('moyu_pending', JSON.stringify(queue));
      form.reset();
      showToast('🐟 已收到你的推荐，谢谢摸鱼人');
    });
  }

  const btn = document.getElementById('btn-submit');
  if (btn) btn.addEventListener('click', () => {
    document.getElementById('submit-section').scrollIntoView({ behavior: 'smooth' });
  });
}

function bindAbout() {
  const link = document.getElementById('about-link');
  const modal = document.getElementById('about-modal');
  const close = document.getElementById('about-close');
  if (!modal) return;
  if (link) link.addEventListener('click', e => {
    e.preventDefault();
    modal.classList.remove('hidden');
  });
  if (close) close.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

function showToast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.add('hidden'), 2200);
}

// === Hero 打字机 ===
function bindTypewriter() {
  const el = document.getElementById('hero-slogan');
  if (!el) return;
  const phrases = [
    '摸鱼乐园 · 让划水更优雅',
    '一个网址，摸遍所有鱼',
    '上班摸鱼，从这里开始',
    '工位摸鱼，日拱一卒',
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
    bindStealth();
    bindSubmit();
    bindAbout();
    bindTypewriter();
  } catch (err) {
    console.error('初始化失败：', err);
    document.body.insertAdjacentHTML('afterbegin',
      `<div class="bg-coral-500 text-white px-4 py-2 text-center text-sm">数据加载失败，请检查网络或刷新重试</div>`);
  }
})();