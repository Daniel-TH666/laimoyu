// build/prerender.js
// 多语言静态站点生成器。一个 Vite 插件，负责：
//   1) 为每一种语言渲染整站 HTML（首页 + about/privacy/faq/contact），
//      站点内容、分类、全部点评都直接写进 HTML —— 爬虫不执行 JS 也能读全
//   2) 注入 canonical / hreflang 全套（含 x-default）/ Open Graph / JSON-LD
//   3) 生成 robots.txt 与带 hreflang 注解的 sitemap.xml
//
// 设计要点：完全数据驱动。构建期扫描 src/i18n/*.json 与 src/data/sites/*.json，
// 有几个语言就生成几个语言版本 —— 加新语言不需要改这个文件。

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LANGUAGE_ORDER, DEFAULT_LANG } from '../src/i18n/languages.js';
import { buildCategories, contentPageHtml, escapeHtml } from '../src/lib/render.js';
import { homePageHtml } from './home-template.js';

// 正式域名。换域名时改这里一处。
export const SITE_URL = 'https://laimoyu.top';

// 内容页清单（page → sitemap 权重）。
// ⚠️ 字段名必须是 page：sitemap 生成那里读的是 p.page，渲染那里也读同一个字段。
//    历史上这里叫 kind，而 sitemap 读 p.page —— 两套命名不一致，
//    结果 4 个内容页 × 6 语言的 URL 全被拼成 /undefined.html（24 条坏 URL），
//    而 verify-dist 只查了 hreflang alternate 存在、没查 loc 合法性，所以一直没报错。
//    统一成一个字段名，从根上消掉这类「同一个概念两个名字」的坑。
const CONTENT_PAGES = [
  { page: 'about', priority: '0.6', changefreq: 'monthly' },
  { page: 'faq', priority: '0.6', changefreq: 'monthly' },
  { page: 'contact', priority: '0.5', changefreq: 'yearly' },
  { page: 'privacy', priority: '0.3', changefreq: 'yearly' }
];

function readJson(root, rel) {
  return JSON.parse(readFileSync(resolve(root, rel), 'utf-8'));
}

// JSON-LD 里的 < 必须转义，否则内容里出现 </script> 会提前闭合脚本标签
function jsonLdScript(obj) {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

// 某个页面在某种语言下的绝对 URL
function pageUrl(lang, page) {
  const prefix = lang.pathPrefix || '';
  const file = page === 'index' ? '' : page + '.html';
  return `${SITE_URL}${prefix}/${file}`;
}

// hreflang 全套（含 x-default → 默认语言）
function alternateLinks(page, langs) {
  const out = langs.map(l =>
    `<link rel="alternate" hreflang="${l.hreflang}" href="${pageUrl(l, page)}" />`);
  const dl = langs.find(l => l.code === DEFAULT_LANG) || langs[0];
  out.push(`<link rel="alternate" hreflang="x-default" href="${pageUrl(dl, page)}" />`);
  return out.join('\n  ');
}

// canonical + hreflang + OG + twitter + JSON-LD
function seoHead(lang, page, langs, ctx) {
  // ⚠️ 首页的 page 标识是 'index'（sitemap / 文件名判定都用它），
  //    但语言包里 meta 的 key 是 'home' —— 两套命名不一致。
  //    不加这层映射时 `lang.meta['index']` 恒为 undefined：
  //    title 有 lang.brand 兜底所以看不出来，description 却直接取到空字符串，
  //    于是 6 个语言的 og:description / twitter:description 全是 content=""。
  //    （页面能正常显示、构建也不报错，属于典型的静默失败。）
  const metaKey = page === 'index' ? 'home' : page;
  const meta = (lang.meta || {})[metaKey] || {};
  const title = meta.title || lang.brand;
  const desc = meta.description || '';
  if (!desc) {
    throw new Error(
      `[prerender] ${lang.code} 的 ${metaKey} 页缺少 meta.${metaKey}.description —— ` +
      `og:description 会是空的，社交平台卡片没有摘要。请补齐 src/i18n/${lang.code}.json。`
    );
  }
  const canonical = pageUrl(lang, page);
  const esc = escapeHtml;

  const tags = [
    `<link rel="canonical" href="${canonical}" />`,
    alternateLinks(page, langs),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(lang.brand)}" />`,
    `<meta property="og:locale" content="${lang.ogLocale}" />`,
    ...langs.filter(o => o.code !== lang.code)
      .map(o => `<meta property="og:locale:alternate" content="${o.ogLocale}" />`),
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    // og:image 必须用绝对 URL；爬虫不会执行 JS，所以只能用 public/ 里的静态图。
    // 每个语言一张（由 _diag/shot-share.mjs 拍好海报后复制进 public/og/），
    // 英文页给中文海报、中文页给英文海报都很别扭，所以按语言分别给。
    `<meta property="og:image" content="${SITE_URL}/og/og-${lang.code}.png" />`,
    `<meta property="og:image:width" content="1080" />`,
    `<meta property="og:image:height" content="1440" />`,
    `<meta property="og:image:alt" content="${esc(title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${SITE_URL}/og/og-${lang.code}.png" />`,
    `<meta name="twitter:image:alt" content="${esc(title)}" />`
  ];

  // ---- JSON-LD ----
  const websiteId = `${SITE_URL}${lang.pathPrefix || ''}/#website`;
  const graph = [
    {
      '@type': 'WebSite',
      '@id': websiteId,
      url: `${SITE_URL}${lang.pathPrefix || ''}/`,
      name: lang.brand,
      alternateName: 'MoyuNav',
      description: desc,
      inLanguage: lang.htmlLang
    },
    {
      '@type': 'WebPage',
      '@id': canonical + '#webpage',
      url: canonical,
      name: title,
      description: desc,
      isPartOf: { '@id': websiteId },
      inLanguage: lang.htmlLang
    }
  ];

  if (page === 'index' && ctx.sites && ctx.sites.length) {
    const cats = ctx.categories || [];
    graph.push({
      '@type': 'ItemList',
      '@id': `${SITE_URL}${lang.pathPrefix || ''}/#site-list`,
      name: lang.brand,
      description: desc,
      numberOfItems: ctx.sites.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: ctx.sites.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: s.title,
        description: s.review || s.description || '',
        url: s.url
      }))
    });
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${SITE_URL}${lang.pathPrefix || ''}/#breadcrumb`,
      itemListElement: cats.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.title,
        item: `${SITE_URL}${lang.pathPrefix || ''}/#cat-${c.id}`
      }))
    });
  }

  // FAQ 页额外给 FAQPage 结构化数据 —— Google 会在搜索结果里直接展开问答，
  // 也是广告审核判断「站点是否有实质内容」时的加分项
  if (page === 'faq' && lang.pages && lang.pages.faq && Array.isArray(lang.pages.faq.items)) {
    graph.push({
      '@type': 'FAQPage',
      '@id': canonical + '#faq',
      inLanguage: lang.htmlLang,
      mainEntity: lang.pages.faq.items.map(it => ({
        '@type': 'Question',
        name: it.q,
        acceptedAnswer: { '@type': 'Answer', text: it.a }
      }))
    });
  }

  // 内容页补一层 BreadcrumbList
  if (page !== 'index') {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': canonical + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: lang.nav.home, item: `${SITE_URL}${lang.pathPrefix || ''}/` },
        {
          '@type': 'ListItem', position: 2,
          name: ((lang.pages || {})[page] || {}).heading || '',
          item: canonical
        }
      ]
    });
  }

  tags.push(jsonLdScript({ '@context': 'https://schema.org', '@graph': graph }));
  return tags.join('\n  ');
}

export default function prerenderPlugin() {
  let root = process.cwd();
  let langs = [];
  let sitesByLang = {};
  let buildWarnings = [];

  return {
    name: 'moyu-prerender',
    enforce: 'post',

    configResolved(config) {
      root = config.root;
    },

    buildStart() {
      // 1) 语言包（顺序由 LANGUAGE_ORDER 决定）
      langs = LANGUAGE_ORDER.map(code => {
        try {
          return readJson(root, `src/i18n/${code}.json`);
        } catch (e) {
          buildWarnings.push(`读不到语言包 src/i18n/${code}.json，已跳过该语言`);
          return null;
        }
      }).filter(Boolean);

      if (!langs.length) throw new Error('没有任何可用语言包，构建中止');

      // 2) 各语言的站点数据
      sitesByLang = {};
      for (const l of langs) {
        try {
          const arr = readJson(root, `src/data/sites/${l.code}.json`);
          sitesByLang[l.code] = Array.isArray(arr) ? arr : [];
          if (!sitesByLang[l.code].length) buildWarnings.push(`站点数据 ${l.code}.json 为空`);
        } catch (e) {
          sitesByLang[l.code] = [];
          buildWarnings.push(`读不到站点数据 src/data/sites/${l.code}.json`);
        }
      }
    },

    generateBundle(options, bundle) {
      for (const w of buildWarnings) this.warn(w);

      const today = new Date().toISOString().slice(0, 10);

      // ---- 找出 Vite 生成的带 hash 的资源路径 ----
      const chunks = Object.values(bundle).filter(c => c.type === 'chunk');
      const mainChunk = chunks.find(c => c.name === 'main') || chunks.find(c => c.isEntry);
      const cssAsset = Object.values(bundle).find(a => a.type === 'asset' && a.fileName.endsWith('.css'));
      const assets = {
        cssHref: cssAsset ? '/' + cssAsset.fileName : '/assets/style.css',
        jsSrc: mainChunk ? '/' + mainChunk.fileName : '/assets/main.js'
      };

      // 切换器需要的语言元数据（不含正文，保持轻量）
      const langsMeta = langs.map(l => ({
        code: l.code,
        hreflang: l.hreflang,
        ogLocale: l.ogLocale,
        nativeName: l.nativeName,
        flag: l.flag,
        pathPrefix: l.pathPrefix || ''
      }));

      // ================= 1. 各语言首页 =================
      const homeFile = (l) => (l.code === DEFAULT_LANG ? 'index.html' : `${l.code}/index.html`);

      for (const l of langs) {
        const sites = sitesByLang[l.code] || [];
        const categories = buildCategories(l);

        let html = homePageHtml(l, langsMeta, sites, categories, {
          ...assets,
          seoHead: seoHead(l, 'index', langsMeta, { sites, categories })
        });

        // 给站长看的构建信息注释
        html = html.replace('</body>',
          `<!-- 构建期静态渲染：${l.code} · ${sites.length} 个站点 / ${categories.length} 个分类，` +
          `爬虫无需执行 JS 即可读取全部内容 -->\n</body>`);

        // 默认语言的首页直接覆盖 Vite 输出的 index.html，其余用 emitFile
        if (l.code === DEFAULT_LANG && bundle['index.html']) {
          bundle['index.html'].source = html;
        } else {
          this.emitFile({ type: 'asset', fileName: homeFile(l), source: html });
        }
      }

      // ================= 2. 各语言内容页 =================
      for (const l of langs) {
        for (const cp of CONTENT_PAGES) {
          let html = contentPageHtml(cp.page, l, langsMeta, {
            cssHref: assets.cssHref,
            today
          });
          html = html.replace('<!-- @prerender:head -->',
            seoHead(l, cp.page, langsMeta, { sites: sitesByLang[l.code] || [] }));

          const prefix = l.pathPrefix || '';   // '' 或 '/zh'
          const file = prefix ? `${prefix.slice(1)}/${cp.page}.html` : `${cp.page}.html`;
          this.emitFile({ type: 'asset', fileName: file, source: html });
        }
      }

      // ================= 3. robots.txt =================
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: [
          '# Moyu Paradise / 摸鱼乐园',
          'User-agent: *',
          'Allow: /',
          '',
          '# 后台管理页，无需收录',
          'Disallow: /bookmarks.html',
          '',
          `Sitemap: ${SITE_URL}/sitemap.xml`,
          ''
        ].join('\n')
      });

      // ================= 4. sitemap.xml（带 hreflang 注解） =================
      const allPages = [
        { page: 'index', priority: '1.0', changefreq: 'daily' },
        ...CONTENT_PAGES
      ];

      const entries = [];
      for (const p of allPages) {
        // 构建期断言：宁可构建失败，也不要产出一份「看着正常、其实全是坏 URL」的 sitemap。
        // 之前就是字段名写错（kind vs page）静默拼出 /undefined.html，线上挂了很久没人发现 ——
        // sitemap 里的坏地址会直接被 GSC 报成抓取错误，白白浪费抓取配额。
        if (typeof p.page !== 'string' || !p.page) {
          throw new Error(
            `[sitemap] 页面清单里有缺 page 字段的条目：${JSON.stringify(p)}。` +
            `sitemap 的 URL 由 p.page 拼出，缺了就会生成 /undefined.html。`
          );
        }
        for (const l of langs) {
          const loc = pageUrl(l, p.page);
          const links = langs.map(o =>
            `    <xhtml:link rel="alternate" hreflang="${o.hreflang}" href="${pageUrl(o, p.page)}"/>`).join('\n');
          const dl = langs.find(x => x.code === DEFAULT_LANG) || langs[0];
          entries.push([
            '  <url>',
            `    <loc>${loc}</loc>`,
            `    <lastmod>${today}</lastmod>`,
            `    <changefreq>${p.changefreq}</changefreq>`,
            `    <priority>${p.priority}</priority>`,
            links,
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(dl, p.page)}"/>`,
            '  </url>'
          ].join('\n'));
        }
      }

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
          '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
          entries.join('\n'),
          '</urlset>',
          ''
        ].join('\n')
      });

      // ================= 5. ads.txt（AdSense 通过审核后填入 pub-id 即可） =================
      this.emitFile({
        type: 'asset',
        fileName: 'ads.txt',
        source: [
          '# AdSense / 广告联盟授权文件',
          '# 申请通过后，把下面这行的 pub-XXXXXXXXXXXXXXXX 换成你的发布商 ID 并取消注释：',
          '# google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0',
          ''
        ].join('\n')
      });
    }
  };
}
