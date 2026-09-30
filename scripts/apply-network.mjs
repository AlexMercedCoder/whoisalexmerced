#!/usr/bin/env node
// Applies the shared network plumbing to every committed HTML page.
//
// This site has no build step: Netlify publishes the repo root as is. So the
// generated files in network/ (written by alexmercedcom/scripts/build-network-shared.mjs)
// are rendered into the HTML here, and the result is committed.
//
// Run after regenerating network/ and before committing:
//   node scripts/apply-network.mjs          rewrite pages in place
//   node scripts/apply-network.mjs --check  exit 1 if any page is out of date
//
// Marker pairs it fills (add them once per page; a page without a pair is skipped):
//   <!-- network:head:start --> ... <!-- network:head:end -->      inside <head>
//   <!-- network:cta:start --> ... <!-- network:cta:end -->        just above <footer>
//   <!-- network:footer:start --> ... <!-- network:footer:end -->  inside <footer>
//
// Never edit network/ by hand, and never paste its contents into a page.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const headFile = readFileSync(join(root, 'network/network-head.html'), 'utf8').trim();
const network = JSON.parse(readFileSync(join(root, 'network/network.json'), 'utf8'));

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderHead() {
  const lines = [headFile];
  if (network.twitterSite) {
    lines.push(`<meta name="twitter:site" content="${esc(network.twitterSite)}">`);
  }
  return lines.join('\n');
}

function renderCta() {
  const cta = network.cta;
  if (!cta) return '';
  const links = cta.links
    .map(
      (l, i) =>
        `      <li><a class="${i === 0 ? 'btn-primary' : 'btn-secondary'}" href="${esc(l.url)}" data-network-event="${esc(l.event)}">${esc(l.label)}</a></li>`,
    )
    .join('\n');
  return [
    '<aside class="cta-strip" aria-labelledby="cta-strip-title">',
    '  <div class="container">',
    `    <h2 id="cta-strip-title" class="cta-strip__title">${esc(cta.heading)}</h2>`,
    '    <ul class="cta-strip__links">',
    links,
    '    </ul>',
    '  </div>',
    '</aside>',
  ].join('\n');
}

function renderFooter() {
  const { groups, allSitesUrl, allSitesLabel } = network.footer;
  const navs = groups.map((g) => {
    const items = g.links
      .map((l) => `    <li><a href="${esc(l.url)}">${esc(l.title)}</a></li>`)
      .join('\n');
    return [
      `<nav class="footer-run" aria-label="${esc(g.title)}">`,
      `  <div class="footer-run__title">${esc(g.title)}</div>`,
      '  <ul class="footer-run__list">',
      items,
      '  </ul>',
      '</nav>',
    ].join('\n');
  });
  if (allSitesUrl) {
    navs.push(`<p class="footer-run__all"><a href="${esc(allSitesUrl)}">${esc(allSitesLabel)}</a></p>`);
  }
  return navs.join('\n');
}

const blocks = {
  head: renderHead(),
  cta: renderCta(),
  footer: renderFooter(),
};

function applyBlocks(html, file) {
  let out = html;
  for (const [name, body] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- network:${name}:start -->)[\\s\\S]*?(<!-- network:${name}:end -->)`, 'g');
    const count = (out.match(re) || []).length;
    if (count > 1) throw new Error(`${file}: network:${name} markers appear ${count} times`);
    out = out.replace(re, (_m, start, end) => `${start}\n${body}\n${end}`);
  }
  return out;
}

function walk(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'network') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (name.endsWith('.html')) found.push(path);
  }
  return found;
}

let stale = 0;
for (const path of walk(root)) {
  const file = relative(root, path);
  const html = readFileSync(path, 'utf8');
  if (!html.includes('<!-- network:head:start -->')) {
    console.warn(`warn: ${file} has no network:head markers`);
    continue;
  }
  const next = applyBlocks(html, file);
  if (next === html) continue;
  stale++;
  if (check) console.error(`out of date: ${file}`);
  else {
    writeFileSync(path, next);
    console.log(`updated: ${file}`);
  }
}

if (check && stale) {
  console.error(`${stale} page(s) out of date. Run: node scripts/apply-network.mjs`);
  process.exit(1);
}
