import { chromium } from 'playwright';
// Uses Playwright's own Chromium unless CHROMIUM_PATH points at another build.
const launchOptions = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};
// Debug screenshots go here (set SHOTS_DIR to keep them somewhere else).
const SHOTS = process.env.SHOTS_DIR ?? (await import('node:os')).tmpdir();
const FIXTURE_IMAGE = new URL('./fixtures/sample.png', import.meta.url).pathname;
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch(launchOptions);
const log = (...a) => console.log(...a);
const errors = [];
const apiCalls = [];
const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith('/api/')) apiCalls.push(r.method() + ' ' + u.pathname);
});

await page.goto(BASE + '/login');
await page.waitForSelector('.bn-editor');
log('url:', page.url());
log('title:', await page.locator('.page-title').inputValue());
log('badge:', await page.locator('.demo-badge').textContent());
log('banner:', (await page.locator('.page-banner').first().textContent()).slice(0, 30));
log('tree:', (await page.locator('.sidebar-tree').innerText()).replace(/\n/g, ' | '));
await page.screenshot({ path: `${SHOTS}/demo-desktop.png` });

// Edit welcome page, go elsewhere, come back: edits survive in memory
await page.locator('.bn-editor p').first().click();
await page.keyboard.press('End');
await page.keyboard.type(' 我的修改');
await page.locator('.tree-title', { hasText: '讀書筆記' }).click();
await page.waitForTimeout(300);
log('reading page:', (await page.locator('.bn-editor').innerText()).split('\n')[0]);
await page.locator('.tree-title', { hasText: '歡迎使用' }).click();
await page.waitForTimeout(300);
log('edit kept:', (await page.locator('.bn-editor').innerText()).includes('我的修改'));

// Slash menu + formatting
await page.locator('.bn-editor p').last().click();
await page.keyboard.press('Control+End');
await page.keyboard.press('Enter');
await page.keyboard.type('/');
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/demo-slash.png` });
log(
  'slash menu:',
  (await page.locator('.bn-suggestion-menu').innerText()).replace(/\n/g, ' ').slice(0, 80),
);
await page.keyboard.press('Escape');

// New page, rename, subpage via "+"
await page.getByRole('button', { name: '新增頁面', exact: true }).click();
await page.waitForFunction(() => document.activeElement?.classList.contains('page-title'));
await page.keyboard.type('展示新頁面');
await page.keyboard.press('Enter');
await page.keyboard.type('內容');
await page.waitForTimeout(300);
log('tree after create:', (await page.locator('.sidebar-tree').innerText()).replace(/\n/g, ' | '));

// Drag new page onto top
const from = await page.locator('.tree-row', { hasText: '展示新頁面' }).boundingBox();
const to = await page.locator('.tree-row', { hasText: '歡迎使用' }).boundingBox();
await page.mouse.move(from.x + 60, from.y + from.height / 2);
await page.mouse.down();
await page.mouse.move(from.x + 70, from.y + from.height / 2, { steps: 3 });
await page.mouse.move(to.x + 60, to.y + to.height * 0.1, { steps: 12 });
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(300);
log('tree after drag:', (await page.locator('.sidebar-tree').innerText()).replace(/\n/g, ' | '));

// Image via object URL
await page.locator('.bn-editor').click();
await page.keyboard.press('Control+End');
await page.keyboard.press('Enter');
await page.keyboard.type('/圖片');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.locator('input[type=file]').first().setInputFiles(FIXTURE_IMAGE);
await page.waitForTimeout(800);
log('img src:', (await page.locator('.bn-editor img').first().getAttribute('src'))?.slice(0, 5));

// Delete
page.once('dialog', (d) => d.accept());
await page.locator('.tree-row', { hasText: '展示新頁面' }).hover();
await page
  .locator('.tree-row', { hasText: '展示新頁面' })
  .getByRole('button', { name: '更多操作' })
  .click();
await page.getByRole('menuitem', { name: '刪除' }).click();
await page.waitForTimeout(400);
log(
  'after delete url:',
  page.url(),
  '| tree:',
  (await page.locator('.sidebar-tree').innerText()).replace(/\n/g, ' | '),
);

// Reload resets
await page.reload();
await page.waitForSelector('.bn-editor');
log(
  'after reload edit gone:',
  !(await page.locator('.bn-editor').innerText()).includes('我的修改'),
);

// English + mobile
const m = await browser.newContext({
  locale: 'en-US',
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const mp = await m.newPage();
mp.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
await mp.goto(BASE + '/');
await mp.waitForSelector('.bn-editor');
log('en title:', await mp.locator('.page-title').inputValue());
await mp.screenshot({ path: `${SHOTS}/demo-mobile.png` });

log('api calls:', [...new Set(apiCalls)].join(', '));
log(errors.join('\n'));
await browser.close();
