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
async function newPage(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return p;
}
const ctxA = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
const A = await newPage(ctxA);
await A.goto(BASE + '/register');
const email = `s${Date.now()}@example.com`;
await A.fill('input[type=email]', email);
await A.fill('input[type=password]', 'password123');
await A.click('button[type=submit]');
await A.waitForURL(BASE + '/');
for (const name of ['One', 'Two', 'Three']) {
  await A.getByRole('button', { name: 'New page' }).click();
  await A.waitForFunction(() => document.activeElement?.classList.contains('page-title'));
  await A.keyboard.type(name);
  await A.waitForTimeout(500);
}
log('tree:', (await A.locator('.sidebar-tree').innerText()).replace(/\n/g, ' | '));

// Drag "Three" above "One"
async function drag(page, fromText, toText, dx = 0, dyFrac = 0.2) {
  const from = await page.locator('.tree-row', { hasText: fromText }).boundingBox();
  const to = await page.locator('.tree-row', { hasText: toText }).boundingBox();
  await page.mouse.move(from.x + 60, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 70, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + 60 + dx, to.y + to.height * dyFrac, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(800);
}
await drag(A, 'Three', 'One', 0, 0.1);
log('after drag Three->top:', (await A.locator('.sidebar-tree').innerText()).replace(/\n/g, ' | '));
// Nest "Two" under "One": drag onto itself with a right offset
await drag(A, 'Two', 'Two', 40, 0.5);
const res = await A.evaluate(() => fetch('/api/pages').then((r) => r.json()));
const byId = Object.fromEntries(res.pages.map((p) => [p.id, p]));
log(
  'server tree:',
  res.pages
    .sort((a, b) => (a.position < b.position ? -1 : 1))
    .map((p) => `${p.title}<${p.parentId ? byId[p.parentId].title : 'root'}>`)
    .join(', '),
);

// Second device (separate login)
const ctxB = await browser.newContext({
  locale: 'en-US',
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const B = await newPage(ctxB);
await B.goto(BASE + '/login');
await B.fill('input[type=email]', email);
await B.fill('input[type=password]', 'password123');
await B.click('button[type=submit]');
await B.waitForURL(BASE + '/');
await B.screenshot({ path: `${SHOTS}/mobile-home.png` });
await B.getByRole('button', { name: 'Open sidebar' }).click();
await B.waitForTimeout(400);
await B.screenshot({ path: `${SHOTS}/mobile-sidebar.png` });
await B.locator('.tree-title', { hasText: 'One' }).click();
await B.waitForSelector('.bn-editor');
log('B url', B.url());

// A opens One and types; B should see it live
await A.locator('.tree-title', { hasText: 'One' }).click();
await A.waitForSelector('.bn-editor');
await A.locator('.bn-editor').click();
await A.keyboard.type('typed on device A');
await A.waitForTimeout(2500);
log('B content (live):', JSON.stringify(await B.locator('.bn-editor').innerText()));
// Rename on A -> B sidebar/title updates
await A.locator('.page-title').fill('One renamed');
await A.locator('.bn-editor').click();
await A.waitForTimeout(1500);
log('B title (live):', await B.locator('.page-title').inputValue());

// Conflict: B goes offline-ish edit simultaneously
await B.locator('.bn-editor').click();
await A.locator('.bn-editor').click();
await Promise.all([B.keyboard.type(' from B'), A.keyboard.type(' from A')]);
await A.waitForTimeout(3000);
const bannerA = await A.locator('.page-banner').count();
const bannerB = await B.locator('.page-banner').count();
log('conflict banners A/B:', bannerA, bannerB);
const who = bannerA ? A : B;
if (bannerA || bannerB) {
  await who.getByRole('button', { name: 'Keep mine' }).click();
  await who.waitForTimeout(2500);
  log('after keep mine A:', JSON.stringify(await A.locator('.bn-editor').innerText()));
  log('after keep mine B:', JSON.stringify(await B.locator('.bn-editor').innerText()));
}
await B.screenshot({ path: `${SHOTS}/mobile-page.png` });

// Image upload through the editor (slash menu -> image -> upload)
await A.locator('.bn-editor').click();
await A.keyboard.press('Control+End');
await A.keyboard.press('Enter');
await A.keyboard.type('/image');
await A.waitForTimeout(300);
await A.keyboard.press('Enter');
await A.waitForTimeout(500);
await A.screenshot({ path: `${SHOTS}/image-panel.png` });
const input = A.locator('input[type=file]');
log('file inputs:', await input.count());
if (await input.count()) {
  await input.first().setInputFiles(FIXTURE_IMAGE);
  await A.waitForTimeout(2000);
  const src = await A.locator('.bn-editor img')
    .first()
    .getAttribute('src')
    .catch(() => null);
  log('img src:', src);
}
await A.waitForTimeout(1500);
await A.screenshot({ path: `${SHOTS}/image.png` });
log(errors.join('\n'));
await browser.close();
