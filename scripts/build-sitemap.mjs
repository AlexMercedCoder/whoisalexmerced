#!/usr/bin/env node
// Rebuilds the sitemap from the HTML pages in this repo, so it never drifts
// from what is published.
//
//   node scripts/build-sitemap.mjs [--check]
//
// A page is listed when it carries a canonical link on this site and no
// robots noindex; the canonical URL is the <loc>. <lastmod> is the last commit
// that changed the page itself, skipping commits that only touch shared chrome
// (network footer and head, consent banner, WebMCP, nav), so a network-wide
// edit does not re-date every page. Commit page changes before running this.
// Existing priority and changefreq values carry over; new pages get 0.7.
// On a shallow clone the git dates would all be the one fetched commit, so the
// script leaves the committed sitemap alone. --check exits 1 if it is stale.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = { site: 'https://whoisalexmerced.com', out: 'sitemap.xml' };
const OUT = path.join(ROOT, CONFIG.out);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.netlify', 'network', 'webmcp', 'public', 'scripts', ...(CONFIG.skipDirs ?? [])]);
const CHROME = /\[mechanical\]|footer|webmcp|site navigation|navigation|\bnav\b|cta strip|consent mode|network head|network plumbing|person @id|person block|ga4|analytics|timezone/i;

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) out.push(...htmlFiles(path.join(dir, e.name)));
    } else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
  }
  return out;
}

function lastContentCommit(file) {
  const log = git(['log', '--follow', '--format=%cs%x09%s', '--', path.relative(ROOT, file)]);
  const rows = log.split('\n').filter(Boolean).map((l) => l.split('\t'));
  if (!rows.length) return null;
  return (rows.find(([, s]) => !CHROME.test(s)) ?? rows.at(-1))[0];
}

function previous() {
  const prev = new Map();
  if (!fs.existsSync(OUT)) return prev;
  for (const m of fs.readFileSync(OUT, 'utf8').matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const get = (t) => m[1].match(new RegExp(`<${t}>\\s*([^<]+?)\\s*</${t}>`))?.[1];
    prev.set(get('loc'), { changefreq: get('changefreq'), priority: get('priority') });
  }
  return prev;
}

let shallow = true;
try { shallow = git(['rev-parse', '--is-shallow-repository']) !== 'false'; } catch {}
if (shallow) {
  console.log('build-sitemap: shallow or missing git history, keeping the committed sitemap.');
  process.exit(0);
}

const host = new URL(CONFIG.site).host;
const prev = previous();
const pages = [];
for (const file of htmlFiles(ROOT)) {
  const html = fs.readFileSync(file, 'utf8');
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html)) continue;
  const href = (html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i) ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical/i))?.[1];
  if (!href) continue;
  const loc = new URL(href).href;
  if (new URL(loc).host !== host) continue;
  pages.push({ loc, lastmod: lastContentCommit(file), ...(prev.get(loc) ?? { priority: '0.7' }) });
}
const order = [...prev.keys()];
const rank = (loc) => (order.includes(loc) ? order.indexOf(loc) : order.length);
pages.sort((a, b) => rank(a.loc) - rank(b.loc) || a.loc.localeCompare(b.loc));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map((p) =>
    [
      '  <url>',
      `    <loc>${p.loc}</loc>`,
      p.lastmod && `    <lastmod>${p.lastmod}</lastmod>`,
      p.changefreq && `    <changefreq>${p.changefreq}</changefreq>`,
      p.priority && `    <priority>${p.priority}</priority>`,
      '  </url>',
    ]
      .filter(Boolean)
      .join('\n'),
  )
  .join('\n')}
</urlset>
`;

const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (process.argv.includes('--check')) {
  if (current !== xml) {
    console.error(`build-sitemap: ${CONFIG.out} is stale; run node scripts/build-sitemap.mjs`);
    process.exit(1);
  }
} else if (current !== xml) {
  fs.writeFileSync(OUT, xml);
  console.log(`build-sitemap: wrote ${pages.length} URLs to ${CONFIG.out}`);
} else {
  console.log(`build-sitemap: ${CONFIG.out} is current (${pages.length} URLs)`);
}
