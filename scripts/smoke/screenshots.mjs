import { chromium } from 'playwright';
// Uses Playwright's own Chromium unless CHROMIUM_PATH points at another build.
const launchOptions = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173';
const OUT = new URL('../../docs/images', import.meta.url).pathname;
const browser = await chromium.launch(launchOptions);
// A cover-like illustration to upload.
const art = await browser.newPage({ viewport: { width: 1200, height: 420 } });
await art.setContent(
  `<body style="margin:0;height:420px;background:linear-gradient(120deg,#f6d365 0%,#fda085 45%,#a18cd1 100%);display:flex;align-items:center;justify-content:center;font:600 56px Inter,sans-serif;color:rgba(255,255,255,.92)">Mountains · 山</body>`,
);
const ART = `${process.env.TMPDIR ?? '/tmp'}/cotebook-art.png`;
await art.screenshot({ path: ART });
await art.close();

const ctx = await browser.newContext({
  locale: 'en-US',
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto(BASE + '/register');
await page.fill('input[autocomplete=name]', 'Alex');
await page.fill('input[type=email]', `demo${Date.now()}@example.com`);
await page.fill('input[type=password]', 'password123');
await page.click('button[type=submit]');
await page.waitForURL(BASE + '/');
const mk = async (title, parentId) =>
  page.evaluate(
    async ([title, parentId]) => {
      const r = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, parentId }),
      });
      return (await r.json()).page.id;
    },
    [title, parentId],
  );
const journal = await mk('Journal');
await mk('2026 · September', journal);
const trips = await mk('Trip planning');
await mk('Packing list', trips);
await mk('Hokkaido itinerary', trips);
await mk('Reading notes');
await mk('Recipes');

await page.goto(`${BASE}/p/${trips}`);
await page.waitForSelector('.bn-editor');
await page.locator('.bn-editor').click();
const type = (s) => page.keyboard.type(s, { delay: 5 });
const slash = async (cmd) => {
  await type('/' + cmd);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
};
await type('Five days in Hokkaido next spring. Budget and route are still open.');
await page.keyboard.press('Enter');
await slash('heading 2');
await type('Must-do');
await page.keyboard.press('Enter');
await slash('bullet');
await type('Morning market in Hakodate');
await page.keyboard.press('Enter');
await type('Blue Pond at Biei');
await page.keyboard.press('Enter');
await type('Hot springs in Noboribetsu');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await slash('heading 2');
await type('Before leaving');
await page.keyboard.press('Enter');
await slash('check');
await type('Book the rail pass');
await page.keyboard.press('Enter');
await type('Reserve the ryokan');
await page.keyboard.press('Enter');
await type('Exchange some cash');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await slash('image');
await page.waitForTimeout(400);
await page.locator('input[type=file]').first().setInputFiles(ART);
await page.waitForTimeout(1500);
// Check the first to-do
await page.locator('.bn-editor input[type=checkbox]').first().check();
// Make "Hakodate" bold + colored via toolbar is fiddly; bold via keyboard selection instead.
await page.locator('.bn-editor').getByText('Morning market in Hakodate').click({ clickCount: 3 });
await page.waitForTimeout(200);
await page.keyboard.press('Control+b');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/toolbar.png` });
await page.locator('.page-title').click();
await page.waitForTimeout(1500);
await page.mouse.move(200, 700);
await page.screenshot({ path: `${OUT}/editor.png` });

await page.getByRole('button', { name: 'Search' }).click();
await page.keyboard.type('hot spring');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/search.png` });
await page.keyboard.press('Escape');

const m = await browser.newContext({
  locale: 'zh-TW',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  storageState: await ctx.storageState(),
});
const mp = await m.newPage();
await mp.goto(`${BASE}/p/${trips}`);
await mp.waitForSelector('.bn-editor');
await mp.waitForTimeout(800);
await mp.screenshot({ path: `${OUT}/mobile.png` });
await browser.close();
