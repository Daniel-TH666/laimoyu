// src/i18n/languages.js
// 语言注册表：只声明「有哪些语言、按什么顺序展示」，不含任何文案。
//
// 为什么要单独一个纯 JS 文件：构建期（Node 用 readFileSync 读 JSON）与浏览器端
// （Vite 打包 JSON）需要共用同一份语言列表，而 Node 的 JSON import attributes
// 在各版本支持不一致，不能直接 import JSON。
//
// === 加一种新语言只需三步 ===
//   ① 新建 src/i18n/<code>.json      —— 界面文案 + 分类名 + 内容页正文
//   ② 新建 src/data/sites/<code>.json —— 该语言区的站点集合与点评
//   ③ 把 <code> 加进下面的 LANGUAGE_ORDER
// 不需要改任何构建代码或模板代码。
//
// 语言包里的 categories.<id> 必须同时给 title 和 navTitle：
//   title    —— 完整名，用在分类区块标题、站点指南小标题上
//   navTitle —— 短标签（建议 ≤10 个字符），只用在顶部 tab 条
//   顶部 tab 一行要排 8 个分类，字母语言给长名会直接溢出容器被裁掉，
//   所以 6 个语言包一律都写 navTitle，`buildCategories()` 用 `c.navTitle || c.title` 兜底。

export const LANGUAGE_ORDER = ['en', 'zh', 'es', 'fr', 'ja', 'ko'];

// 默认语言：根路径 / 用的就是它，同时也是 hreflang 里的 x-default
export const DEFAULT_LANG = 'en';

// 从路径推导语言代码：'/' → 默认语言；'/zh/...' → 'zh'
export function langFromPathname(pathname) {
  const seg = String(pathname || '/').split('/').filter(Boolean)[0];
  if (seg && LANGUAGE_ORDER.includes(seg)) return seg;
  return DEFAULT_LANG;
}

// 浏览器语言 → 支持的站点语言。按前缀匹配（zh-CN → zh、en-GB → en）。
export function matchBrowserLanguage(navLangs) {
  const list = Array.isArray(navLangs) ? navLangs : [navLangs];
  for (const raw of list) {
    if (!raw) continue;
    const lower = String(raw).toLowerCase();
    const base = lower.split('-')[0];
    const hit = LANGUAGE_ORDER.find(c => c === base || c === lower);
    if (hit) return hit;
  }
  return null;
}
