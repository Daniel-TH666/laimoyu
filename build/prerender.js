// build/prerender.js
// 一个 Vite 插件，负责三件事：
//   1) 构建期把 95 个站点的内容直接写进 HTML（爬虫不执行 JS 也能读到全部内容）
//   2) 注入 canonical / Open Graph / JSON-LD 结构化数据
//   3) 生成 robots.txt 与 sitemap.xml
//
// 与 src/lib/render.js 共用同一份模板函数，所以构建产物里的结构和浏览器
// 运行时渲染出来的完全一致。

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  heroCategoriesHtml,
  featuredGridHtml,
  hotListHtml,
  allCategoriesHtml,
  siteGuideHtml
} from '../src/lib/render.js';

// 站点正式域名。换域名时改这里一处即可（同时记得改 index.html 里的可见文案）。
export const SITE_URL = 'https://laimoyu.top';
export const SITE_NAME = '摸鱼乐园';

const PAGES = [
  { file: 'index.html',    path: '/',              priority: '1.0', changefreq: 'daily' },
  { file: 'about.html',    path: '/about.html',    priority: '0.6', changefreq: 'monthly' },
  { file: 'privacy.html',  path: '/privacy.html',  priority: '0.3', changefreq: 'yearly' },
  { file: 'contact.html',  path: '/contact.html',  priority: '0.5', changefreq: 'yearly' }
];

function readJson(root, rel) {
  return JSON.parse(readFileSync(resolve(root, rel), 'utf-8'));
}

function replaceMarker(html, name, content) {
  const re = new RegExp(`<!--\\s*@prerender:${name}\\s*-->`, 'g');
  if (!re.test(html)) return html;
  return html.replace(re, () => content);
}

// JSON-LD 里的 < 必须转义，否则内容里出现 </script> 会提前闭合脚本标签
function jsonLdScript(obj) {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function extractMeta(html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1].trim();
  const desc = (html.match(/<meta\s+name="description"\s+content="([^"]*)"/) || [, ''])[1].trim();
  return { title, desc };
}

export default function prerenderPlugin() {
  let root = process.cwd();
  let sites = [];
  let categories = [];

  return {
    name: 'moyu-prerender',
    enforce: 'post',

    configResolved(config) {
      root = config.root;
    },

    buildStart() {
      sites = readJson(root, 'src/data/sites.json');
      categories = readJson(root, 'src/data/categories.json')
        .slice()
        .sort((a, b) => a.sort - b.sort);
      if (!Array.isArray(sites) || !sites.length) {
        this.warn('sites.json 为空，静态渲染会被跳过');
      }
    },

    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const filename = (ctx.filename || ctx.path || '').split(/[\\/]/).pop();
        const page = PAGES.find(p => p.file === filename) || { path: '/' };
        const today = new Date().toISOString().slice(0, 10);

        // ---- 全站通用占位符：站点数量 / 更新日期 ----
        html = replaceMarker(html, 'count', sites.length ? String(sites.length) : '0');
        html = replaceMarker(html, 'date', today);

        // ---- 站点列表静态渲染（仅首页） ----
        if (filename === 'index.html' && sites.length) {
          html = replaceMarker(html, 'quick-cats', heroCategoriesHtml(categories));
          html = replaceMarker(html, 'featured', featuredGridHtml(sites, { query: '', favorites: new Set() }));
          html = replaceMarker(html, 'hot', hotListHtml(sites));
          html = replaceMarker(html, 'categories', allCategoriesHtml(categories, sites, { query: '', favorites: new Set() }));
          html = replaceMarker(html, 'guide', siteGuideHtml(categories, sites));
        }

        // ---- head 注入：canonical / OG / JSON-LD ----
        const { title, desc } = extractMeta(html);
        const canonical = SITE_URL + page.path;

        const isHome = filename === 'index.html';
        const graph = [
          {
            '@type': 'WebSite',
            '@id': SITE_URL + '/#website',
            url: SITE_URL + '/',
            name: SITE_NAME,
            alternateName: 'MoyuNav',
            description: desc,
            inLanguage: 'zh-CN'
          },
          {
            '@type': 'WebPage',
            '@id': canonical + '#webpage',
            url: canonical,
            name: title,
            description: desc,
            isPartOf: { '@id': SITE_URL + '/#website' },
            inLanguage: 'zh-CN'
          }
        ];

        if (isHome && sites.length) {
          graph.push({
            '@type': 'ItemList',
            '@id': SITE_URL + '/#site-list',
            name: '摸鱼网站合集',
            description: `收录 ${sites.length} 个可直接打开的摸鱼网站，覆盖小游戏、沙雕抽象、伪装办公、实用工具、热榜资讯、影音娱乐、治愈放松、冷知识八个分类。`,
            numberOfItems: sites.length,
            itemListOrder: 'https://schema.org/ItemListOrderAscending',
            itemListElement: sites.map((s, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: s.title,
              description: s.review || s.description || '',
              url: s.url
            }))
          });
          // 面包屑（首页 + 八个分类锚点），让分类页内导航也能被理解
          graph.push({
            '@type': 'BreadcrumbList',
            '@id': SITE_URL + '/#breadcrumb',
            itemListElement: categories.map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: c.title,
              item: SITE_URL + '/#cat-' + c.id
            }))
          });
        }

        const headTags = [
          `<link rel="canonical" href="${canonical}" />`,
          `<meta property="og:type" content="website" />`,
          `<meta property="og:site_name" content="${SITE_NAME}" />`,
          `<meta property="og:locale" content="zh_CN" />`,
          `<meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />`,
          `<meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />`,
          `<meta property="og:url" content="${canonical}" />`,
          `<meta name="twitter:card" content="summary" />`,
          `<meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />`,
          `<meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}" />`,
          jsonLdScript({ '@context': 'https://schema.org', '@graph': graph })
        ].join('\n  ');

        html = replaceMarker(html, 'head', headTags);

        // 首页额外注入站长可见的统计注释（不影响渲染）
        if (isHome && sites.length) {
          html = html.replace('</body>',
            `<!-- 构建期静态渲染：${sites.length} 个站点 / ${categories.length} 个分类，` +
            `爬虫无需执行 JS 即可读取全部内容 -->\n</body>`);
        }
        return html;
      }
    },

    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: [
          '# 摸鱼乐园 robots.txt',
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

      const urls = PAGES.map(p => {
        const loc = SITE_URL + p.path;
        const isHome = p.file === 'index.html';
        return [
          '  <url>',
          `    <loc>${loc}</loc>`,
          `    <lastmod>${today}</lastmod>`,
          `    <changefreq>${p.changefreq}</changefreq>`,
          `    <priority>${p.priority}</priority>`,
          isHome && sites.length
            ? `    <!-- 本站当前收录 ${sites.length} 个站点，共 ${categories.length} 个分类 -->`
            : null,
          '  </url>'
        ].filter(Boolean).join('\n');
      }).join('\n');

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          urls,
          '</urlset>',
          ''
        ].join('\n')
      });
    }
  };
}
