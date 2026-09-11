// src/studio.js - 摸鱼乐园 · 内容管理后台
// ========================================================
// 入口页面：bookmarks.html（独立页面，网站主页上没有任何链接）
//
// 安全模型：
//   GitHub 访问令牌（PAT）是唯一的门锁。
//   - 没令牌 → 只能看到登录页，改不了任何东西
//   - 有令牌 → 才显示后台，所有改动直接 commit 到仓库
//   令牌只存在你自己浏览器的 localStorage，不上传任何服务器。
//
// 操作模型：
//   每张卡片就是直接可编辑的表单，没有弹窗：
//   - 标题/URL/简介直接是 input/textarea
//   - 分类是 6 个按钮 chips（点哪个就是哪个）
//   - 删除是直接显示的按钮（不用进弹窗）
//   - 拖拽可同分类排序，也可跨分类移动
// ========================================================

import './style.css';
import Sortable from 'sortablejs';
// 本地默认数据：仓库里没有 sites.json 时用于一键初始化
import defaultSites from './data/sites.json';

// === 配置 ===
const CONFIG_KEY = 'moyu_admin_config';
const LOG_KEY = 'moyu_admin_log';

const defaultConfig = {
  owner: 'Daniel-TH666',
  repo: 'laimoyu',
  branch: 'main',
  pat: ''
};

const state = {
  cfg: { ...defaultConfig },
  remote: { sha: '', content: '' },
  sites: [],
  dirty: false,
  saving: false
};

// === 分类（与 sites.json 的 category 字段一致） ===
const CATEGORIES = [
  { id: 'games',    title: '摸鱼小游戏', icon: '🎮' },
  { id: 'trending', title: '热榜资讯',   icon: '🔥' },
  { id: 'weird',    title: '抽象创意',   icon: '🤯' },
  { id: 'cover',    title: '伪装办公',   icon: '🎭' },
  { id: 'tools',    title: '实用工具',   icon: '🛠️' },
  { id: 'media',    title: '影音娱乐',   icon: '🎬' }
];

const CAT_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// === 配置读写 ===
function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    state.cfg = { ...defaultConfig, ...saved };
  } catch {
    state.cfg = { ...defaultConfig };
  }
}

function fillConfigForm() {
  document.getElementById('cfg-owner').value = state.cfg.owner;
  document.getElementById('cfg-repo').value = state.cfg.repo;
  document.getElementById('cfg-branch').value = state.cfg.branch;
  document.getElementById('cfg-pat').value = state.cfg.pat;
}

function saveConfig() {
  state.cfg = {
    owner: document.getElementById('cfg-owner').value.trim() || defaultConfig.owner,
    repo: document.getElementById('cfg-repo').value.trim() || defaultConfig.repo,
    branch: document.getElementById('cfg-branch').value.trim() || 'main',
    pat: document.getElementById('cfg-pat').value.trim()
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.cfg));
}

function isConfigured() {
  return !!(state.cfg.owner && state.cfg.repo && state.cfg.pat);
}

// === GitHub Contents API ===
const FILE_PATH = 'src/data/sites.json';

async function ghFetchFile() {
  const url = `https://api.github.com/repos/${state.cfg.owner}/${state.cfg.repo}/contents/${FILE_PATH}?ref=${state.cfg.branch}`;
  const r = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${state.cfg.pat}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(`${r.status} ${body.message || r.statusText}`);
  }
  return r.json();
}

async function ghPutFile(content, sha, message) {
  const url = `https://api.github.com/repos/${state.cfg.owner}/${state.cfg.repo}/contents/${FILE_PATH}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${state.cfg.pat}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      sha,
      branch: state.cfg.branch
    })
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(`${r.status} ${body.message || r.statusText}`);
  }
  return r.json();
}

// === 渲染 ===
function renderCategories() {
  const wrap = document.getElementById('categories');
  wrap.innerHTML = '';
  for (const cat of CATEGORIES) {
    const sites = state.sites.filter(s => s.category === cat.id);
    const section = document.createElement('div');
    section.className = 'bg-white rounded-2xl border border-cream-200 p-5';
    section.dataset.cat = cat.id;
    section.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <span class="text-2xl">${cat.icon}</span>
          <h3 class="font-bold text-lg">${cat.title}</h3>
          <span class="text-xs text-slate-400 ml-2 site-count">${sites.length} 条</span>
        </div>
        <button class="btn-add-cat text-xs bg-mint-500 hover:bg-mint-600 text-white px-3 py-1.5 rounded-full transition font-medium" data-cat="${cat.id}">
          + 新增到此分类
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sites-grid" data-cat-list="${cat.id}"></div>
    `;
    wrap.appendChild(section);

    const grid = section.querySelector('[data-cat-list]');
    for (const site of sites) {
      grid.appendChild(renderCard(site));
    }

    // 同分类内 + 跨分类拖拽
    Sortable.create(grid, {
      group: 'shared-sites',
      animation: 180,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd: () => persistOrderFromDom()
    });

    section.querySelector('.btn-add-cat').addEventListener('click', () => addBlankToCategory(cat.id));
  }
}

// 同步 DOM 顺序 + 跨分类移动 → state.sites
function persistOrderFromDom() {
  const newOrder = []; // [{id, category}]
  for (const cat of CATEGORIES) {
    const grid = document.querySelector(`[data-cat-list="${cat.id}"]`);
    if (!grid) continue;
    for (const card of grid.querySelectorAll('.admin-card')) {
      newOrder.push({ id: card.dataset.id, category: cat.id });
    }
  }
  // 按 newOrder 重排 state.sites，同时把跨分类的 category 改掉
  const byId = Object.fromEntries(state.sites.map(s => [s.id, s]));
  const result = [];
  for (const item of newOrder) {
    const s = byId[item.id];
    if (s) {
      // 跨分类拖拽：把 category 改掉
      if (s.category !== item.category) {
        s.category = item.category;
      }
      result.push(s);
      delete byId[item.id];
    }
  }
  // 兜底：没出现在 DOM 里的（理论上不应该）追加到末尾
  for (const k of Object.keys(byId)) result.push(byId[k]);
  state.sites = result;
  markDirty();
}

// === 单卡片渲染（内联 form 风格） ===
function renderCard(site) {
  const card = document.createElement('div');
  card.className = 'admin-card bg-cream-50 border border-cream-200 rounded-xl p-3';
  card.dataset.id = site.id;
  // 6 个 chips：当前分类高亮
  const chips = CATEGORIES.map(c => {
    const active = c.id === site.category;
    return `<button type="button"
      class="cat-chip text-[11px] px-2 py-1 rounded-full border transition ${active
        ? 'bg-mint-500 text-white border-mint-500'
        : 'bg-white text-slate-500 border-cream-200 hover:border-mint-300 hover:text-mint-700'}"
      data-cat="${c.id}" title="点一下切到「${c.title}」">${c.icon} ${c.title}</button>`;
  }).join('');

  card.innerHTML = `
    <div class="flex items-start gap-2">
      <span class="drag-handle text-slate-300 hover:text-slate-500 cursor-grab pt-1.5 select-none text-lg" title="按住拖动排序（可拖到别的分类）">⋮⋮</span>
      <img class="site-icon w-9 h-9 rounded-lg bg-white object-contain border border-cream-200 flex-shrink-0"
           src="${escapeAttr(getIconUrl(site))}"
           onerror="this.onerror=null;this.replaceWith(makeFallbackAvatar('${escapeAttr(site.title || site.id)}'))"
           alt="" />
      <div class="flex-1 min-w-0">
        <input data-field="title" type="text" value="${escapeAttr(site.title || '')}"
          placeholder="网站名称（必填）"
          class="w-full bg-transparent font-medium text-sm text-ink-800 outline-none border-b border-transparent hover:border-cream-200 focus:border-mint-500 focus:bg-white px-1 py-0.5 transition" />
        <input data-field="url" type="url" value="${escapeAttr(site.url || '')}"
          placeholder="https://..."
          class="w-full bg-transparent text-xs text-slate-500 font-mono outline-none border-b border-transparent hover:border-cream-200 focus:border-mint-500 focus:bg-white px-1 py-0.5 transition mt-1" />
      </div>
      <div class="flex flex-col items-center gap-1 flex-shrink-0">
        <button type="button" data-action="toggle-featured"
          class="text-base w-7 h-7 rounded-full border transition flex items-center justify-center ${site.featured
            ? 'bg-mint-500 text-white border-mint-500'
            : 'bg-white text-slate-300 border-cream-200 hover:text-mint-600'}"
          title="${site.featured ? '取消精选' : '设为精选（首页顶部显示）'}">★</button>
        <button type="button" data-action="toggle-new"
          class="text-[10px] font-bold w-7 h-7 rounded-full border transition flex items-center justify-center ${site.isNew
            ? 'bg-rose-500 text-white border-rose-500'
            : 'bg-white text-slate-300 border-cream-200 hover:text-rose-500'}"
          title="${site.isNew ? '取消 NEW 角标' : '显示 NEW 角标'}">N</button>
      </div>
    </div>
    <textarea data-field="description" rows="1" placeholder="一句话简介（必填）"
      class="w-full mt-2 bg-transparent text-xs text-slate-600 outline-none border-b border-transparent hover:border-cream-200 focus:border-mint-500 focus:bg-white px-1 py-0.5 transition resize-none">${escapeHtml(site.description || '')}</textarea>
    <div class="flex items-center justify-between mt-2">
      <div class="flex flex-wrap gap-1 chips-wrap">${chips}</div>
      <button type="button" data-action="delete"
        class="text-xs text-slate-300 hover:text-rose-500 hover:bg-rose-50 px-2 py-1 rounded transition"
        title="删除这个网站">🗑️</button>
    </div>
  `;

  // 字段变更 → 直接同步到 state.sites
  card.querySelectorAll('[data-field]').forEach(input => {
    input.addEventListener('input', () => {
      const s = state.sites.find(x => x.id === site.id);
      if (!s) return;
      s[input.dataset.field] = input.value;
      // 标题变化时也更新图标 fallback 的颜色种子
      if (input.dataset.field === 'title') {
        const img = card.querySelector('img.site-icon');
        if (img && img.dataset.fallback === '1') {
          const fb = makeFallbackAvatar(s.title || s.id);
          img.replaceWith(fb);
        }
      }
      markDirty();
    });
  });

  // 分类 chip 切换
  card.querySelectorAll('.cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.cat;
      // 直接更新 DOM 中的卡片分类，并改 state
      const s = state.sites.find(x => x.id === site.id);
      if (!s) return;
      if (s.category === target) return;
      // 1. 改 state
      s.category = target;
      // 2. 从原分类 DOM 中移除，append 到新分类（不要触发 reorderSites）
      const oldGrid = card.parentElement;
      const newGrid = document.querySelector(`[data-cat-list="${target}"]`);
      if (oldGrid && newGrid && oldGrid !== newGrid) {
        newGrid.appendChild(card);
        refreshCount(oldGrid.dataset.catList || oldGrid.getAttribute('data-cat-list'));
        refreshCount(target);
      }
      // 3. 更新 chips 视觉
      card.querySelectorAll('.cat-chip').forEach(b => {
        const isActive = b.dataset.cat === target;
        b.className = `cat-chip text-[11px] px-2 py-1 rounded-full border transition ${isActive
          ? 'bg-mint-500 text-white border-mint-500'
          : 'bg-white text-slate-500 border-cream-200 hover:border-mint-300 hover:text-mint-700'}`;
      });
      markDirty();
    });
  });

  // 精选 / NEW 切换
  card.querySelector('[data-action="toggle-featured"]').addEventListener('click', e => {
    const s = state.sites.find(x => x.id === site.id);
    if (!s) return;
    s.featured = !s.featured;
    const btn = e.currentTarget;
    btn.className = `text-base w-7 h-7 rounded-full border transition flex items-center justify-center ${s.featured
      ? 'bg-mint-500 text-white border-mint-500'
      : 'bg-white text-slate-300 border-cream-200 hover:text-mint-600'}`;
    btn.title = s.featured ? '取消精选' : '设为精选（首页顶部显示）';
    renderStats();
    markDirty();
  });

  card.querySelector('[data-action="toggle-new"]').addEventListener('click', e => {
    const s = state.sites.find(x => x.id === site.id);
    if (!s) return;
    s.isNew = !s.isNew;
    const btn = e.currentTarget;
    btn.className = `text-[10px] font-bold w-7 h-7 rounded-full border transition flex items-center justify-center ${s.isNew
      ? 'bg-rose-500 text-white border-rose-500'
      : 'bg-white text-slate-300 border-cream-200 hover:text-rose-500'}`;
    btn.title = s.isNew ? '取消 NEW 角标' : '显示 NEW 角标';
    renderStats();
    markDirty();
  });

  // 删除（直接）
  card.querySelector('[data-action="delete"]').addEventListener('click', () => {
    const s = state.sites.find(x => x.id === site.id);
    const name = s?.title || site.id;
    if (!confirm(`确认删除「${name}」？\n（点「保存到 GitHub」前都可以反悔）`)) return;
    state.sites = state.sites.filter(x => x.id !== site.id);
    card.remove();
    const grid = card.parentElement;
    if (grid) refreshCount(grid.dataset.catList);
    addLog(`🗑️ 删除 ${name}`);
    renderStats();
    markDirty();
  });

  return card;
}

// 6 个分类 chips 切换时，目标卡片在新分类里要插到末尾（这里已经做过）

// 自动算下一个 ID
function nextIdFor(catId) {
  const prefixMap = { games: 'g', trending: 't', weird: 'w', cover: 'c', tools: 'u', media: 'm' };
  const prefix = prefixMap[catId] || 's';
  const max = state.sites
    .filter(s => String(s.id).startsWith(prefix + '-'))
    .map(s => parseInt(String(s.id).slice(2), 10) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

function addBlankToCategory(catId) {
  const id = nextIdFor(catId);
  const blank = {
    id,
    title: '',
    url: '',
    description: '',
    category: catId,
    icon: '',
    addedAt: new Date().toISOString().slice(0, 10),
    featured: false,
    isNew: true
  };
  state.sites.push(blank);
  const grid = document.querySelector(`[data-cat-list="${catId}"]`);
  const card = renderCard(blank);
  grid.appendChild(card);
  refreshCount(catId);
  // 自动聚焦标题输入框
  setTimeout(() => {
    const titleInput = card.querySelector('[data-field="title"]');
    if (titleInput) titleInput.focus();
  }, 50);
  addLog(`➕ 新增 ${id} 到「${CAT_BY_ID[catId]?.title || catId}」`);
  renderStats();
  markDirty();
}

function refreshCount(catId) {
  if (!catId) return;
  const grid = document.querySelector(`[data-cat-list="${catId}"]`);
  if (!grid) return;
  const count = grid.querySelectorAll('.admin-card').length;
  const section = grid.closest('section, div');
  // 找到最近的 site-count 元素
  const cntEl = section?.querySelector('.site-count');
  if (cntEl) cntEl.textContent = `${count} 条`;
}

// === 图标 fallback ===
function getIconUrl(site) {
  if (site.icon && site.icon.startsWith('http')) return site.icon;
  if (site.icon && site.icon.startsWith('/')) return '.' + site.icon;
  if (site.icon) return '.' + site.icon;
  if (!site.url) return '';
  try {
    const u = new URL(site.url);
    return `https://api.iowen.cn/favicon/${u.hostname}.png`;
  } catch {
    return '';
  }
}

function makeFallbackAvatar(text) {
  const t = (text || '?').trim().slice(0, 1).toUpperCase();
  // 简单的 HSL 颜色种子
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  const el = document.createElement('div');
  el.className = 'site-icon w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0 border border-cream-200';
  el.dataset.fallback = '1';
  el.style.background = `hsl(${h} 55% 55%)`;
  el.textContent = t || '?';
  return el;
}
// 暴露到 onerror
window.makeFallbackAvatar = makeFallbackAvatar;

// === 数据加载 ===
async function loadFromGithub() {
  showLoading(true);
  hideError();
  try {
    const data = await ghFetchFile();
    const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    state.remote = { sha: data.sha, content: decoded };
    state.sites = JSON.parse(decoded);
    renderCategories();
    renderStats();
    updateStatus('connected', '已连接 · ' + state.cfg.repo);
    showLoading(false);
    addLog(`📥 已拉取 ${state.sites.length} 条记录`);
  } catch (err) {
    showLoading(false);
    const msg = err.message || String(err);
    if (msg.startsWith('404')) {
      // 先分清是「仓库不存在」还是「仓库里没有这个文件」
      let repoExists = false;
      try {
        const rr = await fetch(`https://api.github.com/repos/${state.cfg.owner}/${state.cfg.repo}`, {
          headers: { 'Authorization': `Bearer ${state.cfg.pat}`, 'Accept': 'application/vnd.github+json' }
        });
        repoExists = rr.ok;
      } catch { /* 网络问题按仓库不存在处理 */ }
      if (!repoExists) {
        showError(`GitHub 上还没有 ${state.cfg.owner}/${state.cfg.repo} 这个仓库。请先把网站项目推送到 GitHub（部署第 4 步），再来登录后台。`);
        return;
      }
      if (confirm('仓库中还没有 sites.json，要用本地默认数据（66 条）初始化吗？\n\n点确定会自动创建并提交一份初始数据。')) {
        try {
          const local = Array.isArray(defaultSites) ? defaultSites : [];
          state.sites = local;
          state.remote.content = JSON.stringify(local, null, 2);
          renderCategories();
          renderStats();
          markDirty();
          addLog('🆕 用本地数据初始化');
          toast('初始化完成，点「保存」提交到 GitHub', 'success');
        } catch (e) {
          showError('初始化失败：' + e.message);
        }
      } else {
        showError('仓库里没有 sites.json。请先初始化，或确认仓库配置正确。');
      }
    } else if (msg.startsWith('401')) {
      showError('令牌无效或已过期。点「设置」重新填写。');
    } else if (msg.startsWith('403')) {
      showError('令牌权限不够，需要勾选 public_repo。');
    } else {
      showError(msg);
    }
  }
}

async function saveToGithub() {
  if (state.saving) return;
  // 先做一次合法性校验
  const bad = [];
  state.sites.forEach((s, i) => {
    if (!s.title?.trim()) bad.push(`第 ${i + 1} 条（${s.id}）：网站名称为空`);
    if (!s.url?.trim() || !/^https?:\/\/.+/.test(s.url)) bad.push(`第 ${i + 1} 条（${s.id}）：网址无效`);
    if (!s.description?.trim()) bad.push(`第 ${i + 1} 条（${s.id}）：简介为空`);
    if (!CATEGORIES.some(c => c.id === s.category)) bad.push(`第 ${i + 1} 条（${s.id}）：分类错误`);
  });
  if (bad.length) {
    toast(`有 ${bad.length} 条数据不完整：${bad[0]}`, 'error');
    addLog('❌ 校验失败：' + bad.length + ' 条');
    return;
  }
  if (!confirm(`确认提交 ${state.sites.length} 条数据到 GitHub？\n（这会在你的仓库创建一个 commit）`)) return;
  state.saving = true;
  const saveBtnEl = document.getElementById('btn-save');
  saveBtnEl.disabled = true;
  saveBtnEl.textContent = '⏳ 提交中…';
  try {
    const newContent = JSON.stringify(state.sites, null, 2) + '\n';
    const result = await ghPutFile(newContent, state.remote.sha, 'chore: 从管理后台更新 sites.json');
    state.remote.sha = result.content.sha;
    state.remote.content = newContent;
    state.dirty = false;
    updateSaveBtn();
    renderStats();
    addLog('✅ 已提交 · ' + result.commit.sha.slice(0, 7));
    toast('已保存到 GitHub ✓', 'success');
  } catch (err) {
    toast('保存失败：' + err.message, 'error');
    addLog('❌ 保存失败：' + err.message);
  } finally {
    state.saving = false;
    saveBtnEl.textContent = '💾 保存到 GitHub';
    updateSaveBtn();
  }
}

// === UI 辅助 ===
function showLoading(on) {
  document.getElementById('loading').classList.toggle('hidden', !on);
}
function hideError() {
  document.getElementById('error-state').classList.add('hidden');
}
function showError(msg) {
  document.getElementById('error-state').classList.remove('hidden');
  document.getElementById('error-msg').textContent = msg;
  updateStatus('error', '连接失败');
}
function updateStatus(kind, text) {
  const badge = document.getElementById('status-badge');
  badge.classList.remove('hidden');
  const dot = badge.querySelector('.w-2');
  const t = badge.querySelector('.status-text');
  const palette = {
    connected: 'bg-emerald-500/15 text-emerald-300',
    error:     'bg-rose-500/15 text-rose-300',
    idle:      'bg-slate-800 text-slate-300'
  };
  badge.className = `hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${palette[kind] || palette.idle}`;
  dot.className = `w-2 h-2 rounded-full ${kind === 'connected' ? 'bg-emerald-400' : kind === 'error' ? 'bg-rose-400' : 'bg-slate-500'}`;
  t.textContent = text;
}
function renderStats() {
  document.getElementById('stat-total').textContent = state.sites.length || '0';
  document.getElementById('stat-featured').textContent = state.sites.filter(s => s.featured).length || '0';
  document.getElementById('stat-new').textContent = state.sites.filter(s => s.isNew).length || '0';
  document.getElementById('stat-size').textContent = state.sites.length ? (new Blob([JSON.stringify(state.sites)]).size / 1024).toFixed(2) + ' KB' : '—';
  document.getElementById('stat-last-commit').textContent = state.dirty ? '⚠ 有未保存改动' : '已同步';
}
function markDirty() {
  state.dirty = true;
  updateSaveBtn();
  renderStats();
}
function updateSaveBtn() {
  const btn = document.getElementById('btn-save');
  if (state.dirty && !state.saving) {
    btn.disabled = false;
    btn.className = 'text-xs bg-rose-500 hover:bg-rose-600 text-white px-4 py-1.5 rounded-full transition font-medium animate-pulse';
    btn.textContent = '💾 保存到 GitHub';
  } else {
    btn.disabled = true;
    btn.className = 'text-xs bg-slate-100 text-slate-400 px-4 py-1.5 rounded-full cursor-not-allowed transition font-medium';
    btn.textContent = '💾 保存到 GitHub';
  }
}
function toast(msg, kind = 'success') {
  const inner = document.getElementById('toast-inner');
  inner.textContent = msg;
  inner.className = `px-5 py-3 rounded-xl shadow-lg text-sm font-medium pointer-events-auto transition-all ${kind === 'error' ? 'bg-rose-500 text-white' : 'bg-mint-600 text-white'}`;
  inner.classList.remove('hidden');
  setTimeout(() => inner.classList.add('hidden'), 2500);
}
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

// === 操作日志 ===
function addLog(text) {
  const log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  log.unshift({ time: new Date().toLocaleTimeString('zh-CN'), text });
  localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 50)));
  renderLog();
}
function renderLog() {
  const log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  const list = document.getElementById('log-list');
  if (!list) return;
  if (!log.length) {
    list.innerHTML = '<div class="text-slate-400">暂无操作记录</div>';
    return;
  }
  list.innerHTML = log.map(e =>
    `<div class="flex items-start gap-2 text-slate-600"><span class="text-xs text-slate-400 font-mono w-20 flex-shrink-0">${e.time}</span><span>${escapeHtml(e.text)}</span></div>`
  ).join('');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// === 视图切换 ===
function showLoginView() {
  document.getElementById('page-login').classList.remove('hidden');
  document.getElementById('page-admin').classList.add('hidden');
  document.getElementById('btn-logout').classList.add('hidden');
  updateStatus('idle', '未登录');
}

function showAdminView() {
  document.getElementById('page-login').classList.add('hidden');
  document.getElementById('page-admin').classList.remove('hidden');
  document.getElementById('btn-logout').classList.remove('hidden');
}

// === 事件绑定 ===
function bindEvents() {
  document.getElementById('btn-settings').addEventListener('click', () => {
    fillConfigForm();
    showModal('modal-settings');
  });
  document.getElementById('btn-login-settings').addEventListener('click', () => {
    fillConfigForm();
    showModal('modal-settings');
  });
  document.getElementById('btn-save-config').addEventListener('click', async () => {
    saveConfig();
    hideModal('modal-settings');
    if (!isConfigured()) {
      toast('需要填写访问令牌才能进入后台', 'error');
      return;
    }
    showAdminView();
    updateStatus('idle', '已配置 · 加载中…');
    await loadFromGithub();
  });
  document.getElementById('btn-clear-config').addEventListener('click', () => {
    if (!confirm('确定清除本地保存的令牌？\n（清除后需要重新粘贴才能进入后台）')) return;
    localStorage.removeItem(CONFIG_KEY);
    state.cfg = { ...defaultConfig };
    fillConfigForm();
    hideModal('modal-settings');
    showLoginView();
    toast('令牌已清除', 'success');
  });
  document.getElementById('btn-logout').addEventListener('click', () => {
    if (state.dirty && !confirm('有未保存的改动，确定退出吗？改动会丢失。')) return;
    state.sites = [];
    state.dirty = false;
    hideModal('modal-settings');
    showLoginView();
    toast('已退出，令牌仍保留在本机', 'success');
  });
  document.getElementById('btn-retry').addEventListener('click', loadFromGithub);
  document.getElementById('btn-reload').addEventListener('click', () => {
    if (state.dirty && !confirm('有未保存的改动，重新拉取会丢失当前编辑。继续？')) return;
    loadFromGithub();
  });
  document.getElementById('btn-save').addEventListener('click', saveToGithub);
  document.getElementById('btn-clear-log').addEventListener('click', () => {
    localStorage.removeItem(LOG_KEY);
    renderLog();
  });

  document.querySelectorAll('.modal-close').forEach(el => {
    el.addEventListener('click', e => {
      const modal = e.target.closest('.modal-mask');
      if (modal) modal.classList.add('hidden');
    });
  });
  document.querySelectorAll('.modal-mask').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) m.classList.add('hidden');
    });
  });

  window.addEventListener('beforeunload', e => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '有未保存的改动，确定离开？';
    }
  });
}

// === 启动 ===
(function init() {
  loadConfig();
  bindEvents();
  renderLog();

  if (isConfigured()) {
    showAdminView();
    updateStatus('idle', '已配置 · 加载中…');
    loadFromGithub();
  } else {
    showLoginView();
  }
})();