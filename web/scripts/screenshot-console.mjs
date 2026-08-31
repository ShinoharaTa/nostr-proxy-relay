/**
 * 管理コンソールの画面キャプチャ。
 * UI 変更を目視確認するために、主要ページを PC / モバイル幅で撮る。
 *
 *   node scripts/screenshot-console.mjs [--base URL] [--out DIR] [--user U] [--pass P]
 *
 * 既定は BasicAuth 付きのローカルサーバー (127.0.0.1:8080)。
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : [],
  ),
);

const BASE = args.base ?? 'http://127.0.0.1:8080';
const OUT = args.out ?? 'screenshots';
const USER = args.user ?? process.env.ADMIN_USER ?? 'admin';
const PASS = args.pass ?? process.env.ADMIN_PASS ?? 'admin';

/** 撮影対象。console 配下は BasicAuth、LP と docs は公開ページ。 */
const PAGES = [
  ['deck',        '/console/'],
  ['dashboard',   '/console/dashboard'],
  ['live',        '/console/live'],
  ['logs',        '/console/logs'],
  ['relays',      '/console/backend/relays'],
  ['nip11',       '/console/backend/nip11'],
  ['post-policy', '/console/access/post-policy'],
  ['npub',        '/console/access/npub'],
  ['ip-acl',      '/console/access/ip'],
  ['quarantine',  '/console/access/quarantine'],
  ['kind',        '/console/filter/kind'],
  ['dsl',         '/console/filter/dsl'],
  ['quick-ban',   '/console/filter/quick-ban'],
  ['auto-guard',  '/console/filter/auto-guard'],
  ['telemetry',   '/console/operations/telemetry'],
  ['system',      '/console/operations/system'],
  ['landing',     '/'],
];

const VIEWPORTS = [
  ['pc',     { width: 1440, height: 960 }],
  ['mobile', { width: 390,  height: 844 }],
];

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

for (const [vpName, viewport] of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport,
    httpCredentials: { username: USER, password: PASS },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  for (const [name, path] of PAGES) {
    const url = `${BASE}${path}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    } catch {
      // networkidle は SSE を張るページで永久に来ないので load で妥協する
      await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    }
    // ポーリング初回の描画とアニメーション落ち着き待ち
    await page.waitForTimeout(1800);
    const file = `${OUT}/${vpName}-${name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`captured ${file}`);
  }
  await ctx.close();
}

await browser.close();
console.log('done');
