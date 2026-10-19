import {readFile} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://dualboremedia.com/';
const requiredFiles = [
  'dist/client/index.html', 'dist/server/index.js', 'dist/.openai/hosting.json',
  'dist/client/_headers', 'dist/client/_redirects', 'dist/client/robots.txt',
  'dist/client/sitemap.xml', 'dist/client/assets/favicon.svg',
  ...[5076, 5077, 5078].flatMap(number => [480, 768].map(width => `dist/client/assets/IMG_${number}-${width}.jpg`)),
];

export function checkWebsite({env = {}, files = {}} = {}) {
  const blockers = [];
  if (env.PAYMENTS_ENABLED !== 'false') blockers.push('PAYMENTS_ENABLED must explicitly be false for website publication.');
  if (env.TRANSACTIONAL_EMAILS_ENABLED !== 'false') blockers.push('TRANSACTIONAL_EMAILS_ENABLED must explicitly be false for website publication.');
  for (const name of requiredFiles) if (!files[name]) blockers.push(`Built website file missing: ${name}.`);
  const html = files['dist/client/index.html'] || '';
  const headers = files['dist/client/_headers'] || '';
  const robots = files['dist/client/robots.txt'] || '';
  const sitemap = files['dist/client/sitemap.xml'] || '';
  const redirects = files['dist/client/_redirects'] || '';
  for (const path of Object.keys(files)) {
    if (/^dist[\\/]client[\\/].+\.map$/i.test(path)) blockers.push(`Private source map is publicly packaged: ${path}.`);
  }
  if (!html.includes(`<link rel="canonical" href="${origin}"`) || !html.includes('<title>DualBore Media')) blockers.push('Canonical domain or page identity is missing.');
  if (!robots.includes(`Sitemap: ${origin}sitemap.xml`) || !sitemap.includes(`<loc>${origin}</loc>`)) blockers.push('Robots and sitemap do not identify the canonical domain.');
  if (!/\/\*\s+\/index\.html\s+200/.test(redirects)) blockers.push('Public routes lack the SPA fallback.');
  for (const directive of ['Content-Security-Policy:', "script-src 'self'", "frame-ancestors 'none'", 'X-Content-Type-Options: nosniff', 'Strict-Transport-Security:']) {
    if (!headers.includes(directive)) blockers.push(`Built security headers missing: ${directive}`);
  }
  return {ready: blockers.length === 0, blockers, level: 'public-website'};
}

export async function runWebsiteCheck({root = projectRoot, env = process.env} = {}) {
  const entries = await Promise.all(requiredFiles.map(async name => {
    try { return [name, await readFile(resolve(root, name), 'utf8')]; }
    catch { return [name, '']; }
  }));
  const publicMaps = await findSourceMaps(resolve(root, 'dist/client'), root);
  for (const path of publicMaps) entries.push([path, 'private source map']);
  return checkWebsite({env, files: Object.fromEntries(entries)});
}

async function findSourceMaps(directory, root) {
  const {readdir} = await import('node:fs/promises');
  const found = [];
  let children;
  try { children = await readdir(directory, {withFileTypes: true}); } catch { return found; }
  for (const child of children) {
    const path = resolve(directory, child.name);
    if (child.isDirectory()) found.push(...await findSourceMaps(path, root));
    else if (child.isFile() && child.name.endsWith('.map')) found.push(relative(root, path).replaceAll('\\', '/'));
  }
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runWebsiteCheck();
  console.log(result.ready ? 'Public website configuration passed. No deployment was performed.' : `Public website blocked (${result.blockers.length}):\n${result.blockers.map(item => `- ${item}`).join('\n')}\nNo deployment was performed.`);
  process.exitCode = result.ready ? 0 : 1;
}
