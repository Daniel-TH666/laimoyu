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
//   - 分类是数据驱动的按钮 chips（点哪个就是哪个）
//   - 删除是直接显示的按钮（不用进弹窗）
//   - 拖拽可同分类排序，也可跨分类移动
//
// 视图：
//   - 📚 站点管理：编辑 sites.json
//   - 📥 推荐管理：读仓库 Issue 里的访客推荐，按近 30 天推荐次数排序（只读）
// ========================================================

import './style.css';
import Sortable from 'sortablejs';
// 本地默认数据：仓库里没有 sites.json 时用于一键初始化
import defaultSites from './data/sites.json';
import categoriesData from './data/categories.json';

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
  saving: false,
  alertKind: null,
  view: 'sites',
  recs: [],          // 推荐聚合结果
  recRaw: [],        // 原始 issue 列表
  recLoaded: false,
  recLoading: false,
  recFilterHideDone: false,
  recSort: 'count30'
};

// === 分类（数据驱动，直接读 categories.json，避免与前台不同步） ===
const CATEGORIES = [...categoriesData]
  .sort((a, b) => (a.sort ?? 99) - (b.sort ?? 99))
  .map(c => ({ id: c.id, title: c.title, icon: c.icon }));

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
  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    const s = state.sites.find(x => x.id === site.id);
    const name = s?.title || site.id;
    const yes = await askConfirm({
      title: '删除网站', icon: '🗑️', danger: true, okText: '删除',
      msg: `确认删除「${name}」？\n只要还没点「保存到 GitHub」，随时可以刷新页面找回。`
    });
    if (!yes) return;
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
  showSaveAlert('warn',
    `➕ 已新增一张空白卡片（${id}）。把 <strong>名称 / 网址 / 简介</strong> 三项填上之后，` +
    `点右上角 <strong>💾 保存到 GitHub</strong> 才会真正生效。`);
}

function refreshCount(catId) {
  if (!catId) return;
  const grid = document.querySelector(`[data-cat-list="${catId}"]`);
  if (!grid) return;
  const count = grid.querySelectorAll('.admin-card').length;
  // 用 [data-cat] 定位外层分类容器；grid 自身也是 div，不能直接用 closest('div')
  const section = grid.closest('[data-cat]') || grid.parentElement;
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
      const yes = await askConfirm({
        title: '初始化数据', icon: '🆕',
        msg: `仓库中还没有 sites.json，要用本地默认数据（${Array.isArray(defaultSites) ? defaultSites.length : 0} 条）初始化吗？\n点「确定」会自动创建并提交一份初始数据。`,
        okText: '初始化'
      });
      if (yes) {
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
        showError('你取消了初始化。仓库里目前还没有 sites.json —— 点下面的「重试」可以再来一次。');
      }
    } else if (msg.startsWith('401')) {
      showError('令牌无效或已过期。点「设置」重新填写。');
    } else if (msg.startsWith('403')) {
      showError('令牌权限不足：请确认它对仓库有「读写文件」权限（Fine-grained → Contents: Read and write；Classic → 勾选 repo）。');
    } else {
      showError(msg);
    }
  }
}

async function saveToGithub() {
  if (state.saving) return;
  const bad = validateSites();
  if (bad.length) {
    renderBadAlert(bad);
    addLog(`❌ 校验失败：${bad.length} 个网站信息不完整（第一个：${bad[0].id}）`);
    jumpToCard(bad[0].id);
    return;
  }
  hideSaveAlert();

  const okGo = await askConfirm({
    title: '保存到 GitHub',
    icon: '💾',
    msg: `确认提交 ${state.sites.length} 条数据到 GitHub？\n（会在你的仓库创建一个 commit，线上页面约 1 分钟后自动更新）`,
    okText: '确认提交'
  });
  if (!okGo) {
    showSaveAlert('warn', '已取消提交，改动还留在这个页面上，随时可以再点「保存到 GitHub」。');
    return;
  }

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
    showSaveAlert('ok',
      `✅ <strong>已保存到 GitHub</strong>（commit ${result.commit.sha.slice(0, 7)}）<br>` +
      `<span class="text-xs">线上自动发布约需 1 分钟，稍后刷新首页即可看到。本次共 ${state.sites.length} 条数据。</span>`);
    toast('已保存到 GitHub ✓', 'success');
  } catch (err) {
    const msg = err.message || String(err);
    let hint = '';
    if (/^401/.test(msg)) hint = '令牌无效或已过期，点右上角「⚙️ 设置」重新粘贴一个。';
    else if (/^403/.test(msg)) hint = '令牌权限不足：需要 Fine-grained → Contents: Read and write。';
    else if (/^404/.test(msg)) hint = '仓库或文件路径不对，点右上角「⚙️ 设置」核对用户名 / 仓库名 / 分支。';
    else if (/^409|^422/.test(msg)) hint = '仓库里的文件已被别处改动（版本过期），点「🔄 从 GitHub 重新拉取」再试。';
    else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) hint = '网络请求失败，检查网络后重试。';
    addLog('❌ 保存失败：' + msg);
    showSaveAlert('error',
      `❌ <strong>保存失败</strong>：${escapeHtml(msg)}` +
      (hint ? `<br><span class="text-xs">👉 ${hint}</span>` : ''));
    toast('保存失败，请看按钮下方的提示', 'error', 5000);
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
  // 之前提示过「有网站没填完」——用户补齐后自动收掉那条提示
  if (state.alertKind === 'error' && validateSites().length === 0) hideSaveAlert();
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
function toast(msg, kind = 'success', duration = 3000) {
  const inner = document.getElementById('toast-inner');
  inner.textContent = msg;
  inner.className = `px-5 py-3 rounded-xl shadow-lg text-sm font-medium pointer-events-auto transition-all ${kind === 'error' ? 'bg-rose-500 text-white' : 'bg-mint-600 text-white'}`;
  inner.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => inner.classList.add('hidden'), duration);
}

// === 常驻结果提示条（显示在「保存到 GitHub」按钮正下方，不会自动消失） ===
function showSaveAlert(kind, html) {
  const el = document.getElementById('save-alert');
  const styles = {
    error: 'bg-rose-50 border border-rose-200 text-rose-700',
    warn: 'bg-amber-50 border border-amber-200 text-amber-800',
    ok: 'bg-mint-50 border border-mint-100 text-mint-800'
  };
  el.className = `mt-2 rounded-xl px-4 py-3 text-sm leading-relaxed ${styles[kind] || styles.warn}`;
  el.innerHTML = html;
  el.classList.remove('hidden');
  state.alertKind = kind;
}
function hideSaveAlert() {
  document.getElementById('save-alert').classList.add('hidden');
  state.alertKind = null;
}

// === 数据校验：把每个问题都归到具体那一张卡片上 ===
function validateSites() {
  const bad = [];
  state.sites.forEach((s, i) => {
    const probs = [];
    if (!s.title?.trim()) probs.push('名称未填');
    if (!s.url?.trim() || !/^https?:\/\/.+/.test(s.url)) probs.push('网址无效（要以 http:// 或 https:// 开头）');
    if (!s.description?.trim()) probs.push('简介未填');
    if (!CATEGORIES.some(c => c.id === s.category)) probs.push('分类错误');
    if (probs.length) bad.push({ id: s.id, idx: i + 1, title: s.title?.trim(), probs });
  });
  return bad;
}
function renderBadAlert(bad) {
  const lines = bad.slice(0, 3).map(b =>
    `· 第 ${b.idx} 条（${b.id}）${b.title ? '「' + escapeHtml(b.title) + '」' : ''}：${b.probs.join('、')}`
  ).join('<br>');
  const more = bad.length > 3 ? `<br>…还有 ${bad.length - 3} 条同样问题` : '';
  showSaveAlert('error',
    `<strong>⚠️ 有 ${bad.length} 个网站还没填完，暂时存不了</strong><br>${lines}${more}<br>` +
    `<span class="text-xs">已自动跳到第一个出问题的卡片（红色框）。填好后这条提示会自己消失，再点一次「保存到 GitHub」即可。</span>`);
}

// === 自定义确认弹窗（替代 window.confirm） ===
// 原生 confirm 可能被浏览器「阻止此页面创建更多对话框」静默拦截，
// 表现为点了按钮完全没反应 —— 后台的关键操作一律走这个自绘弹窗。
function askConfirm(opts = {}) {
  const o = typeof opts === 'string' ? { msg: opts } : opts;
  const {
    title = '确认操作', msg = '', okText = '确定', cancelText = '取消',
    danger = false, icon = '❓'
  } = o;
  return new Promise(resolve => {
    const modal = document.getElementById('modal-confirm');
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    document.getElementById('confirm-icon').textContent = icon;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    ok.textContent = okText;
    cancel.textContent = cancelText;
    ok.className = `text-sm text-white px-5 py-2 rounded-full font-medium transition ${danger ? 'bg-rose-500 hover:bg-rose-600' : 'bg-mint-500 hover:bg-mint-600'}`;
    modal.classList.remove('hidden');
    ok.focus();

    const done = v => {
      modal.classList.add('hidden');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
    };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  });
}

// === 高亮并滚动到出问题的卡片 ===
function jumpToCard(id) {
  // 先清掉旧的高亮
  document.querySelectorAll('.admin-card.card-error').forEach(c => c.classList.remove('card-error'));
  const card = document.querySelector(`.admin-card[data-id="${id}"]`);
  if (!card) return;
  card.classList.add('card-error');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const first = card.querySelector('input, textarea');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 400);
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
// 安全 URL：只放行 http/https，挡掉 javascript: 等危险协议（推荐 Issue 的内容来自外部访客）
function safeUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return '#';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return /^https?:/i.test(s) ? s : '#';
  return s;
}

// ========================================================
// 推荐管理：读仓库 Issue 里的访客推荐
//   前台「📮 推荐摸鱼网站」提交 → POST /repos/{o}/{r}/issues 建一条 Issue
//   本模块 GET 全部 Issue → 解析 → 按网址域名聚合成「候选站」→ 按近 30 天次数排序
//   纯只读：不修改、不关闭、不收录任何 Issue
// ========================================================
const REC_TAG = '[推荐]';
const REC_DAYS = 30;
const REC_WINDOW_MS = REC_DAYS * 24 * 60 * 60 * 1000;

function recHeaders() {
  const h = { 'Accept': 'application/vnd.github+json' };
  if (state.cfg.pat) h['Authorization'] = `Bearer ${state.cfg.pat}`;
  return h;
}

async function ghFetchIssues() {
  const { owner, repo } = state.cfg;
  const all = [];
  // 最多翻 5 页（500 条），再多说明真该换个存储了
  for (let page = 1; page <= 5; page++) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues`
      + `?state=all&per_page=100&page=${page}&sort=created&direction=desc`;
    const res = await fetch(url, { headers: recHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error('返回格式异常');
    // /issues 端点会混入 PR，剔掉
    const issues = arr.filter(i => !i.pull_request);
    all.push(...issues);
    if (arr.length < 100) break;
  }
  return all;
}

// 从 Issue body 里按 `**字段**：值` 提取；拿不到就退回标题
function parseRecIssue(issue) {
  const body = issue.body || '';
  const grab = label => {
    const re = new RegExp(`\\*\\*\\s*${label}\\s*\\*\\*\\s*[:：]\\s*(.+)`);
    const m = body.match(re);
    return m ? m[1].trim() : '';
  };
  const rawTitle = (issue.title || '').trim();
  const isRec = rawTitle.startsWith(REC_TAG) || /网站名|网址/.test(body);
  const title = grab('网站名') || rawTitle.replace(/^\[推荐\]\s*/, '').trim() || '(未命名)';
  const catLabel = grab('分类');
  // 中文分类名 → id
  const catHit = CATEGORIES.find(c => catLabel.includes(c.title));
  return {
    isRec,
    number: issue.number,
    htmlUrl: issue.html_url,
    state: issue.state,
    createdAt: issue.created_at,
    title,
    url: grab('网址') || grab('URL') || grab('url'),
    cat: catHit ? catHit.id : '',
    catLabel: catLabel || (catHit ? catHit.title : '未填分类'),
    desc: grab('简介') || grab('一句话简介'),
    author: issue.user?.login || '匿名'
  };
}

function recHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return String(url || '').trim().toLowerCase(); }
}

// 按域名把多条 Issue 聚合成一个候选站，统计 30 天内 / 累计推荐次数
function aggregateRecs(issues) {
  const parsed = issues.map(parseRecIssue).filter(r => r.isRec);
  const cutoff = Date.now() - REC_WINDOW_MS;
  const map = new Map();
  for (const r of parsed) {
    const key = recHost(r.url) || `t:${r.title}`;
    if (!map.has(key)) {
      map.set(key, {
        key, title: r.title, url: r.url, cat: r.cat, catLabel: r.catLabel, desc: r.desc,
        count30: 0, countAll: 0, openCount: 0,
        firstAt: r.createdAt, lastAt: r.createdAt, numbers: []
      });
    }
    const g = map.get(key);
    g.countAll++;
    const t = new Date(r.createdAt).getTime();
    if (t >= cutoff) g.count30++;
    if (r.state === 'open') g.openCount++;
    if (t >= new Date(g.lastAt).getTime()) {
      g.lastAt = r.createdAt;
      if (r.title) g.title = r.title;
      if (r.url) g.url = r.url;
      if (r.desc) g.desc = r.desc;
      if (r.cat) { g.cat = r.cat; g.catLabel = r.catLabel; }
    }
    if (t <= new Date(g.firstAt).getTime()) g.firstAt = r.createdAt;
    g.numbers.push(r.number);
  }
  return [...map.values()];
}

function fmtRelative(iso) {
  const t = new Date(iso).getTime();
  if (!t) return '—';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

function renderRecStats() {
  const recs = state.recs;
  const total30 = recs.reduce((a, r) => a + r.count30, 0);
  const totalAll = recs.reduce((a, r) => a + r.countAll, 0);
  const candidates = recs.filter(r => r.count30 > 0).length;
  const latest = recs.length
    ? recs.reduce((a, b) => (new Date(a.lastAt) > new Date(b.lastAt) ? a : b)).lastAt
    : null;

  document.getElementById('rec-stat-30d').textContent = total30;
  document.getElementById('rec-stat-cand').textContent = candidates;
  document.getElementById('rec-stat-all').textContent = totalAll;
  document.getElementById('rec-stat-latest').textContent = latest ? fmtRelative(latest) : '—';

  // header 小红点：30 天内有推荐才显示
  const badge = document.getElementById('rec-badge');
  if (badge) {
    if (total30 > 0) { badge.textContent = total30; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }
}

function renderRecs() {
  const list = document.getElementById('rec-list');
  const empty = document.getElementById('rec-empty');
  const loading = document.getElementById('rec-loading');
  const errBox = document.getElementById('rec-error');
  loading.classList.add('hidden');
  errBox.classList.add('hidden');

  let rows = [...state.recs];
  if (state.recFilterHideDone) rows = rows.filter(r => r.openCount > 0);

  const by = state.recSort;
  rows.sort((a, b) => {
    if (by === 'latest') return new Date(b.lastAt) - new Date(a.lastAt);
    if (by === 'countAll') return b.countAll - a.countAll || new Date(b.lastAt) - new Date(a.lastAt);
    return b.count30 - a.count30 || b.countAll - a.countAll;
  });

  if (rows.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = rows.map((r, i) => {
    const num = i + 1;
    const rankCls = num <= 3 ? 'rec-rank top' : 'rec-rank';
    const url = r.url || '#';
    const catLabel = r.catLabel || (r.cat && CAT_BY_ID[r.cat]?.title) || '未填分类';
    const host = recHost(r.url);
    const hot = r.count30 >= 3 ? ' hot' : '';
    const done = r.openCount === 0;
    return `
      <article class="rec-card">
        <div class="flex items-start gap-3">
          <span class="${rankCls}">${num}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-bold text-ink-800 truncate">${escapeHtml(r.title)}</h3>
              <span class="rec-count${hot}">🔥 30 天 ${r.count30} 次</span>
              ${r.countAll > r.count30 ? `<span class="text-xs text-slate-400">累计 ${r.countAll} 次</span>` : ''}
              ${done ? '<span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">已关闭</span>' : ''}
            </div>
            <a href="${escapeAttr(safeUrl(url))}" target="_blank" rel="noopener"
               class="text-xs text-mint-600 hover:text-mint-700 hover:underline break-all mt-1 inline-block">${escapeHtml(url)}</a>
            ${r.desc ? `<p class="text-sm text-slate-600 mt-1.5 leading-relaxed">${escapeHtml(r.desc)}</p>` : ''}
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-400">
              <span>建议分类：<span class="text-slate-500">${escapeHtml(catLabel)}</span></span>
              <span>首次：${fmtRelative(r.firstAt)}</span>
              <span>最近：${fmtRelative(r.lastAt)}</span>
              <span>域名：<span class="font-mono">${escapeHtml(host)}</span></span>
              <a href="https://github.com/${state.cfg.owner}/${state.cfg.repo}/issues?q=is%3Aissue+${encodeURIComponent(r.numbers[0])}"
                 target="_blank" rel="noopener" class="hover:text-mint-600">查看 Issue #${r.numbers[0]}${r.numbers.length > 1 ? ` 等 ${r.numbers.length} 条` : ''}</a>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function recAlert(kind, msg) {
  const box = document.getElementById('rec-alert');
  if (!box) return;
  if (!msg) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const style = kind === 'error'
    ? 'bg-rose-50 border border-rose-200 text-rose-700'
    : kind === 'warn'
      ? 'bg-amber-50 border border-amber-200 text-amber-700'
      : 'bg-mint-50 border border-mint-100 text-mint-700';
  box.className = `mt-2 rounded-xl px-4 py-3 text-sm leading-relaxed ${style}`;
  box.innerHTML = msg;
}

async function loadRecommendations(force = false) {
  if (state.recLoading) return;
  if (state.recLoaded && !force) return;
  state.recLoading = true;
  document.getElementById('rec-error').classList.add('hidden');
  document.getElementById('rec-empty').classList.add('hidden');
  document.getElementById('rec-loading').classList.remove('hidden');
  recAlert('info', '');
  try {
    const issues = await ghFetchIssues();
    state.recRaw = issues;
    state.recs = aggregateRecs(issues);
    state.recLoaded = true;
    renderRecStats();
    renderRecs();
    const total = state.recs.reduce((a, r) => a + r.countAll, 0);
    if (total === 0) {
      recAlert('info', '拉到 ' + issues.length + ' 条 Issue，其中没有「' + REC_TAG + '」格式的推荐。'
        + '确认前台首页的推荐表单已能提交（提交入口在首页底部「📮 推荐摸鱼网站」）。');
    }
  } catch (err) {
    const code = String(err.message || '');
    let hint = '拉取失败了。';
    if (code === '401') hint = '令牌无效或已过期，点右上角「⚙️ 设置」重新粘贴。';
    else if (code === '403') hint = '触发了 GitHub 频率限制，或令牌权限不足。等几分钟再试。';
    else if (code === '404') hint = '仓库名不对，或令牌没有这个仓库的权限。';
    else if (/Failed to fetch|NetworkError|Load failed/i.test(code)) hint = '网络请求失败，检查网络后重试。';
    document.getElementById('rec-loading').classList.add('hidden');
    document.getElementById('rec-error').classList.remove('hidden');
    document.getElementById('rec-error-msg').textContent = hint + (code ? `（${code}）` : '');
    state.recs = [];
    renderRecStats();
  } finally {
    state.recLoading = false;
  }
}

// === 视图切换 ===
function switchView(view) {
  state.view = view;
  document.querySelectorAll('.view-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === view);
  });
  document.getElementById('view-sites').classList.toggle('hidden', view !== 'sites');
  document.getElementById('view-recommend').classList.toggle('hidden', view !== 'recommend');
  if (view === 'recommend') loadRecommendations();
}

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
    const btn = document.getElementById('btn-save-config');
    if (btn.disabled) return;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '连接中…';
    btn.classList.add('opacity-70', 'cursor-wait');
    try {
      saveConfig();
      if (!isConfigured()) {
        toast('需要填写访问令牌才能进入后台', 'error');
        return; // 弹窗保持打开，方便继续填写
      }
      hideModal('modal-settings');
      showAdminView();
      updateStatus('idle', '已配置 · 加载中…');
      await loadFromGithub();
    } finally {
      btn.disabled = false;
      btn.textContent = original;
      btn.classList.remove('opacity-70', 'cursor-wait');
    }
  });
  // 在任意输入框按回车 = 点「保存并连接」
  ['cfg-owner', 'cfg-repo', 'cfg-branch', 'cfg-pat'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-save-config').click();
      }
    });
  });
  document.getElementById('btn-clear-config').addEventListener('click', async () => {
    const yes = await askConfirm({
      title: '清除令牌', icon: '🔑', danger: true, okText: '清除',
      msg: '确定清除本机保存的访问令牌？\n清除后需要重新粘贴令牌才能进入后台。'
    });
    if (!yes) return;
    localStorage.removeItem(CONFIG_KEY);
    state.cfg = { ...defaultConfig };
    fillConfigForm();
    hideModal('modal-settings');
    showLoginView();
    toast('令牌已清除', 'success');
  });
  document.getElementById('btn-logout').addEventListener('click', async () => {
    if (state.dirty) {
      const yes = await askConfirm({
        title: '退出登录', icon: '🚪', danger: true, okText: '退出',
        msg: '有未保存的改动，确定退出吗？\n退出后这些改动会丢失。'
      });
      if (!yes) return;
    }
    state.sites = [];
    state.dirty = false;
    hideModal('modal-settings');
    showLoginView();
    toast('已退出，令牌仍保留在本机', 'success');
  });
  document.getElementById('btn-retry').addEventListener('click', loadFromGithub);
  document.getElementById('btn-reload').addEventListener('click', async () => {
    if (state.dirty) {
      const yes = await askConfirm({
        title: '重新拉取', icon: '🔄', danger: true, okText: '放弃改动并拉取',
        msg: '有未保存的改动，重新拉取会丢失当前编辑。继续吗？'
      });
      if (!yes) return;
    }
    loadFromGithub();
  });
  document.getElementById('btn-save').addEventListener('click', saveToGithub);
  document.getElementById('btn-clear-log').addEventListener('click', () => {
    localStorage.removeItem(LOG_KEY);
    renderLog();
  });

  // ---- 视图切换 ----
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  // ---- 推荐管理 ----
  document.getElementById('btn-rec-refresh').addEventListener('click', () => loadRecommendations(true));
  document.getElementById('btn-rec-retry').addEventListener('click', () => loadRecommendations(true));
  document.getElementById('rec-sort').addEventListener('change', e => {
    state.recSort = e.target.value;
    renderRecs();
  });
  document.getElementById('rec-hide-done').addEventListener('change', e => {
    state.recFilterHideDone = e.target.checked;
    renderRecs();
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