// src/lib/share.js
// 首页「分享」功能：右侧常驻入口 → 分享面板（一句话+链接自动复制 / 海报图可复制可下载）。
//
// 三条硬约束：
//   1) 海报图完全用 Canvas 现画。不引任何绘图库、不发任何外部请求 ——
//      本站有「永不调用第三方服务」的约定（favicon 服务挂过一次，全站图标全废）。
//   2) 所有文案从语言包取（t.share.*）。这里不出现硬编码的自然语言字符串。
//   3) 复制一律做能力探测 + 降级：失败就明说「请手动复制」，
//      不做「点了没反应」的静默失败。

import { fmt } from './render.js';
// QR 码生成（kazuhikoarase/qrcode-generator，vendored 详见 qrcode.js 头部）。
// 用法：const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
import qrcode from './qrcode.js';

// 海报尺寸 3:4。这个比例在聊天软件里预览不会被裁成一条。
const POSTER_W = 1080;
const POSTER_H = 1440;
const PAD = 76;

const C = {
  ink: '#1F2D3D',
  slate: '#64748B',
  mint: '#5BB29A',
  mintDeep: '#3D9882',
  // 品牌条深薄荷绿（用户偏好的对比色，确保白字 + QR 码边框在缩略图里也清晰）
  brandDark: '#0F6E56'
};

// 字体栈：emoji 字体放最后 —— 前面的字体没有对应码位时会自动往后退，
// 所以拉丁/中日韩走系统字体，🎣 落到彩色 emoji 字体上。
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Hiragino Sans", "Noto Sans KR", Arial, sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", ' + SANS;
const font = (weight, size, stack) => `${weight} ${size}px ${stack || SANS}`;

// ============================================================
// 文本度量工具
// ============================================================

// 把文本切成「可断行单元」：CJK / 假名 / 谚文逐字可断，拉丁按词断。
function tokenize(text) {
  const units = [];
  let buf = '';
  const isCjk = ch => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch);
  for (const ch of String(text || '')) {
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      if (buf) { units.push(buf); buf = ''; }
      units.push(' ');
    } else if (isCjk(ch)) {
      if (buf) { units.push(buf); buf = ''; }
      units.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf) units.push(buf);
  return units;
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const u of tokenize(text)) {
    if (ctx.measureText(line + u).width <= maxWidth) { line += u; continue; }
    if (line.trim()) { lines.push(line.trim()); line = ''; }
    if (u === ' ') continue;
    if (ctx.measureText(u).width > maxWidth) {
      // 单个单元（超长单词 / 无空格长串）本身就超宽 → 逐字硬断
      let chunk = '';
      for (const ch of u) {
        if (chunk && ctx.measureText(chunk + ch).width > maxWidth) { lines.push(chunk); chunk = ''; }
        chunk += ch;
      }
      line = chunk;
    } else {
      line = u;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

// 逐步缩字号，直到能在 maxLines 行内排下 —— 六种语言长度差很多，写死字号必然溢出
function fitBlock(ctx, text, maxWidth, maxLines, opts = {}) {
  const { weight = 800, max = 92, min = 46, lh = 1.2 } = opts;
  for (let size = max; size >= min; size -= 2) {
    ctx.font = font(weight, size);
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { size, lines, lineHeight: Math.round(size * lh) };
  }
  ctx.font = font(weight, min);
  return { size: min, lines: wrapLines(ctx, text, maxWidth).slice(0, maxLines), lineHeight: Math.round(min * lh) };
}

function ellipsize(ctx, text, maxWidth) {
  const s = String(text == null ? '' : text);
  if (ctx.measureText(s).width <= maxWidth) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(s.slice(0, mid) + '…').width <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo) + '…';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, r); return; }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function softBlob(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================
// QR 码绘制（vendored kazuhikoarase/qrcode-generator）
// ============================================================
//
// 把指定 URL 画成 size×size 的 QR 码，填到 (x,y) 的左上角。
//
// 设计选择：
//   - 误差纠错 'M' (15% 恢复率)：比 'L' 更安全，但仍能让生成的模块数在 URL 长度下保持
//     较小 —— QR 越密越好扫，但也越占空间，'M' 是经验上的甜点位。
//   - 白底加 4 像素静默区（QR 规范要求 ≥ 4 模块宽）：不加的话贴边识别率掉 10%+。
function drawQR(ctx, x, y, size, url, opts = {}) {
  const ec = opts.ec || 'M';
  const qr = qrcode(0, ec);
  qr.addData(String(url || ''));
  qr.make();
  const n = qr.getModuleCount();
  // 静默区：QR 规范要求 4 单位、四边都要
  const QUIET = 4;
  const total = n + QUIET * 2;
  const cell = size / total;

  // 白底圆角矩形
  roundRect(ctx, x, y, size, size, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // 黑色 QR 单元
  ctx.fillStyle = '#1F2D3D';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(
          x + Math.round((c + QUIET) * cell),
          y + Math.round((r + QUIET) * cell),
          Math.ceil(cell),
          Math.ceil(cell)
        );
      }
    }
  }
  return { moduleCount: n, cell };
}

// ============================================================
// 画海报
// ============================================================
// d: { brand, url, count, title, subtitle, footer, sitesLabel, sites:[{title}] }
function drawPoster(ctx, d) {
  const W = POSTER_W;
  const H = POSTER_H;
  const innerW = W - PAD * 2;
  ctx.textBaseline = 'top';

  // 底色 + 柔光：和站点的奶油底、薄荷绿呼应，缩略图里也认得出是同一个站
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#FBF7F1');
  bg.addColorStop(1, '#F1E8D8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  softBlob(ctx, 90, 90, 620, 'rgba(91,178,154,0.20)');
  softBlob(ctx, W - 40, 460, 560, 'rgba(255,122,107,0.13)');
  softBlob(ctx, 120, H - 60, 660, 'rgba(91,178,154,0.12)');

  // ---- 品牌行 ----
  let y = PAD;
  ctx.font = font(400, 62, EMOJI);
  ctx.fillStyle = C.ink;
  ctx.fillText('🎣', PAD, y - 6);
  ctx.font = font(700, 46);
  ctx.fillText(d.brand || '', PAD + 84, y + 4);
  y += 62 + 46;

  // ---- 主标题（含站点数，是整张图的钩子）----
  const head = fitBlock(ctx, d.title, innerW, 3, { weight: 800, max: 92, min: 46, lh: 1.2 });
  ctx.font = font(800, head.size);
  ctx.fillStyle = C.ink;
  head.lines.forEach((ln, i) => ctx.fillText(ln, PAD, y + i * head.lineHeight));
  y += head.lines.length * head.lineHeight + 26;

  // ---- 副标题 ----
  const sub = fitBlock(ctx, d.subtitle, innerW, 2, { weight: 500, max: 40, min: 26, lh: 1.4 });
  ctx.font = font(500, sub.size);
  ctx.fillStyle = C.slate;
  sub.lines.forEach((ln, i) => ctx.fillText(ln, PAD, y + i * sub.lineHeight));
  y += sub.lines.length * sub.lineHeight + 54;

  // ---- 底部品牌条（锚在底边，先算出来好给面板留位置）----
  const bandH = 168;
  const bandTop = H - PAD - bandH;

  // ---- 站点面板 ----
  // 高度按内容算（小标题一行 + 每站一行），再被「副标题下沿 → 品牌条」之间的
  // 可用高度夹住；夹住之后在可用区间里**垂直居中**，把富余空白平摊到上下。
  // 上一版是把面板钉死在 y=690，结果副标题和面板之间堆了一坨 260px 的空洞。
  const rows = (d.sites || []).slice(0, 6);
  const panelLimit = bandTop - 52;
  const avail = panelLimit - y;
  const idealH = 104 + rows.length * 74;
  const panelH = Math.max(240, Math.min(idealH, avail - 16));
  const panelTop = y + Math.max(0, Math.round((avail - panelH) / 2));
  const panelBottom = panelTop + panelH;

  roundRect(ctx, PAD, panelTop, innerW, panelH, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(235,224,204,0.95)';
  ctx.stroke();

  let py = panelTop + 42;
  ctx.font = font(700, 27);
  ctx.fillStyle = C.mintDeep;
  ctx.fillText(ellipsize(ctx, d.sitesLabel || '', innerW - 88), PAD + 44, py);
  py += 27 + 34;

  if (rows.length) {
    const rowH = Math.max(38, Math.min(78, Math.floor((panelBottom - py - 22) / rows.length)));
    const fs = Math.min(38, Math.max(24, rowH - 14));
    const dotX = PAD + 56;
    rows.forEach(s => {
      ctx.beginPath();
      ctx.arc(dotX, py + fs * 0.52, 7, 0, Math.PI * 2);
      ctx.fillStyle = C.mint;
      ctx.fill();

      ctx.font = font(600, fs);
      ctx.fillStyle = C.ink;
      ctx.fillText(ellipsize(ctx, s.title || '', innerW - 132), PAD + 84, py);
      py += rowH;
    });
  }

  // ---- 底部条：左侧 QR 码，右侧大字 URL + footer ----
  // 品牌条改成深薄荷绿实色（无渐变）—— 白字 + 白底 QR 在深色上对比度更强，
  // 即使在缩略图里也能一秒认出品牌区。
  roundRect(ctx, PAD, bandTop, innerW, bandH, 36);
  ctx.fillStyle = C.brandDark;
  ctx.fill();

  // QR 码：左侧 152×152，纵向居中。预留 4 单位静默区让微信/Telegram 都能扫。
  const qrSize = 152;
  const qrX = PAD + 28;
  const qrY = bandTop + Math.round((bandH - qrSize) / 2);
  drawQR(ctx, qrX, qrY, qrSize, d.url || '');

  // 「扫码访问」小提示（在 QR 上方右侧，或下方右侧，让国内用户一看就懂）
  ctx.font = font(600, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  const hintText = (d.scanHint || 'Scan to open · 扫码访问');
  const textX = PAD + 28 + qrSize + 32;
  ctx.fillText(hintText, textX, bandTop + 26);

  // URL 主行（字号从 46→58，缩略图里一眼看清）
  const shownUrl = String(d.url || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const textMaxW = innerW - (qrSize + 28 + 32 + 28);
  ctx.font = font(800, 58);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(ellipsize(ctx, shownUrl, textMaxW), textX, bandTop + 64);

  // Footer（版权 / 价值点）
  ctx.font = font(500, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(ellipsize(ctx, d.footer || '', textMaxW), textX, bandTop + 138);
}

async function renderPoster(d) {
  // 字体没加载完就画，海报上的字会退回默认字体（中文尤其明显）
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch { /* 不支持就照画 */ }

  const canvas = document.createElement('canvas');
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  drawPoster(ctx, d);

  return await new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
  });
}

// ============================================================
// 复制 / 下载
// ============================================================
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 落到下面的兜底 */ }
  // 兜底：非安全上下文（http）或旧浏览器 —— 临时 textarea + execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// 富文本复制：text/plain 和 text/html 各写一份。
// 支持富文本粘贴的目标（邮件、在线文档、Telegram、Word……）拿到的是带
// <a href> 的真超链接，直接就能点；只认纯文本的场合（微信/QQ 聊天框）
// 拿到的还是纯文本 —— 链接独占一行，聊天软件的自动识别不受影响。
// 两份都写不进去时退回纯文本复制（copyText 还有 execCommand 兜底）。
async function copyRich(text, url) {
  const esc = (s) => String(s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escUrl = esc(url);
  const html = esc(text).split(escUrl).join(`<a href="${escUrl}">${escUrl}</a>`);
  try {
    if (navigator.clipboard && window.isSecureContext && typeof window.ClipboardItem === 'function') {
      await navigator.clipboard.write([new window.ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      })]);
      return true;
    }
  } catch { /* 落到纯文本 */ }
  return copyText(text);
}

// 图片写剪贴板只有 Chromium 系支持；失败就明确让用户改用「下载图片」
async function copyImage(blob) {
  if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') return false;
  try {
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeFileName(name, fallback) {
  const s = String(name == null ? '' : name).replace(/[\\/:*?"<>|]+/g, '-').trim();
  return s || fallback;
}

// ============================================================
// 入口
// ============================================================
// getData: () => ({ t, sites, url, brand })
//   传函数而不是对象：入口要在「还没取到数据」时就能露出来，
//   海报和文案等到真正点开分享那一刻再算（惰性）。
export function initShare(getData) {
  const rail = document.getElementById('share-rail');
  const modal = document.getElementById('share-modal');
  const openBtn = document.getElementById('btn-share');
  if (!rail || !modal || !openBtn) return;

  const el = id => document.getElementById(id);
  const img = el('share-preview-img');
  const loading = el('share-preview-loading');
  const statusEl = el('share-status');
  const nativeBtn = el('btn-native-share');

  let built = null;
  let lastFocus = null;

  // 先露出入口。分享的是「这个页面」，不依赖站点数据是否加载成功。
  rail.hidden = false;

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.className = 'share-status' + (kind ? ' is-' + kind : '');
  }

  function snapshot() {
    const d = getData() || {};
    const t = d.t || {};
    const s = t.share || {};
    const sites = Array.isArray(d.sites) ? d.sites : [];
    return {
      t, s, d,
      url: d.url || '',
      brand: d.brand || '',
      count: sites.length,
      // featured 优先，其余补足 —— 海报上要放最能勾人的那几个
      sites: [...sites.filter(x => x && x.featured), ...sites.filter(x => x && !x.featured)]
    };
  }

  function buildMessage(snap) {
    return fmt(snap.s.text || '{url}', {
      count: snap.count,
      url: snap.url,
      brand: snap.brand
    });
  }

  // 惰性构建：第一次点开才算文案、画海报，之后复用
  async function prepare(snap) {
    if (built) return built;
    const message = buildMessage(snap);
    const textPreview = el('share-text-preview');
    if (textPreview) textPreview.textContent = message;

    let blob = null;
    try {
      blob = await renderPoster({
        brand: snap.brand,
        url: snap.url,
        title: fmt(snap.s.posterTitle || '', { count: snap.count }),
        subtitle: snap.s.posterSubtitle || '',
        footer: snap.s.posterFooter || '',
        sitesLabel: snap.s.posterSitesLabel || '',
        scanHint: snap.s.posterScanHint || '',
        sites: snap.sites
      });
    } catch (err) {
      // 海报画不出来不该让整块功能失效 —— 链接照样能复制
      console.error('分享海报生成失败：', err);
    }

    built = { blob, message, s: snap.s, url: snap.url, objUrl: '' };
    return built;
  }

  function open() {
    const snap = snapshot();
    lastFocus = document.activeElement;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setStatus('');
    if (loading) loading.classList.remove('hidden');

    // ① 先同步复制 —— 剪贴板 API 对「用户手势」有要求，
    //    越靠近 click 本身调用越稳，所以放在任何 await 之前。
    const message = buildMessage(snap);
    copyRich(message, snap.url).then(ok => {
      setStatus(ok ? (snap.s.copiedAuto || '') : (snap.s.copyFailed || ''), ok ? 'ok' : 'warn');
    });

    const closeBtn = el('share-close');
    if (closeBtn) closeBtn.focus();

    // ② 再慢慢画海报
    prepare(snap).then(c => {
      if (c.blob && img) {
        if (c.objUrl) URL.revokeObjectURL(c.objUrl);
        c.objUrl = URL.createObjectURL(c.blob);
        img.src = c.objUrl;
        img.classList.add('is-ready');
      }
      if (loading) loading.classList.add('hidden');
    });
  }

  function close() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  openBtn.addEventListener('click', open);
  const closeBtn = el('share-close');
  if (closeBtn) closeBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });

  // ---- 复制这一句话 ----
  const copyTextBtn = el('btn-copy-text');
  if (copyTextBtn) copyTextBtn.addEventListener('click', async () => {
    const snap = snapshot();
    const ok = await copyRich(buildMessage(snap), snap.url);
    setStatus(ok ? (snap.s.copiedManual || '') : (snap.s.copyFailed || ''), ok ? 'ok' : 'warn');
  });

  // ---- 只复制链接 ----
  const copyUrlBtn = el('btn-copy-url');
  if (copyUrlBtn) copyUrlBtn.addEventListener('click', async () => {
    const snap = snapshot();
    const ok = await copyText(snap.url);
    setStatus(ok ? (snap.s.linkOnlyCopied || '') : (snap.s.copyFailed || ''), ok ? 'ok' : 'warn');
  });

  // ---- 复制图片 ----
  const copyImgBtn = el('btn-copy-image');
  if (copyImgBtn) copyImgBtn.addEventListener('click', async () => {
    const c = await prepare(snapshot());
    if (!c.blob) { setStatus(c.s.imageCopyFailed || '', 'warn'); return; }
    const ok = await copyImage(c.blob);
    setStatus(ok ? (c.s.imageCopied || '') : (c.s.imageCopyFailed || ''), ok ? 'ok' : 'warn');
  });

  // ---- 下载图片 ----
  const dlBtn = el('btn-download');
  if (dlBtn) dlBtn.addEventListener('click', async () => {
    const c = await prepare(snapshot());
    if (!c.blob) { setStatus(c.s.imageCopyFailed || '', 'warn'); return; }
    downloadBlob(c.blob, safeFileName(c.s.imageName, 'share') + '.png');
    setStatus(c.s.downloaded || '', 'ok');
  });

  // ---- 系统分享（手机上的「更多方式」；桌面浏览器多数没有，就整块不显示）----
  if (nativeBtn && typeof navigator.share === 'function') {
    nativeBtn.classList.remove('hidden');
    nativeBtn.addEventListener('click', async () => {
      const snap = snapshot();
      const c = await prepare(snap);
      const payload = { title: document.title, text: c.message, url: c.url };
      try {
        if (c.blob && typeof navigator.canShare === 'function') {
          const file = new File([c.blob], safeFileName(c.s.imageName, 'share') + '.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) payload.files = [file];
        }
        await navigator.share(payload);
      } catch { /* 用户自己取消，不是错误 */ }
    });
  }
}
