import { chromium } from 'playwright';
// Uses Playwright's own Chromium unless CHROMIUM_PATH points at another build.
const launchOptions = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};
// Debug screenshots go here (set SHOTS_DIR to keep them somewhere else).
const SHOTS = process.env.SHOTS_DIR ?? (await import('node:os')).tmpdir();
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
const log = (...a) => console.log(...a);

await page.goto(BASE + '/register');
const email = `u${Date.now()}@example.com`;
await page.fill('input[type=email]', email);
await page.fill('input[type=password]', 'password123');
await page.click('button[type=submit]');
await page.waitForURL(BASE + '/');
await page.getByRole('button', { name: 'Create a page' }).click();
await page.waitForSelector('.page-title');
log('title focused:', await page.evaluate(() => document.activeElement?.className));
await page.keyboard.type('First page');
await page.keyboard.press('Enter');
await page.keyboard.type('Hello world paragraph');
await page.keyboard.press('Enter');
await page.keyboard.type('/heading 2');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.keyboard.type('Section two');
await page.keyboard.press('Enter');
await page.keyboard.type('/check');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.keyboard.type('todo item');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter'); // exit list
await page.keyboard.type('bold ');
// select the word "bold" and make it bold with Ctrl+B
await page.keyboard.press('Backspace');
for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/toolbar.png` });
await page.keyboard.press('Control+b');
await page.keyboard.press('End');
await page.waitForTimeout(1500);
log('status:', await page.locator('.topbar-status').textContent());
log('sidebar:', await page.locator('.sidebar-tree').innerText());
const pageUrl = page.url();
await page.screenshot({ path: `${SHOTS}/page2.png` });

// reload and verify persistence
await page.reload();
await page.waitForSelector('.bn-editor');
await page.waitForTimeout(500);
log('after reload title:', await page.locator('.page-title').inputValue());
log('after reload content:', JSON.stringify(await page.locator('.bn-editor').innerText()));
log('bold html:', await page.locator('.bn-editor strong').count());

// search
await page.getByRole('button', { name: 'Search' }).click();
await page.keyboard.type('todo');
await page.waitForTimeout(800);
log('search:', await page.locator('.search-results').innerText());
await page.keyboard.press('Enter');
await page.waitForTimeout(300);

// subpage
await page.locator('.tree-row').first().hover();
await page.getByRole('button', { name: 'Add a page inside' }).first().click();
await page.waitForSelector('.page-title');
await page.keyboard.type('Child page');
await page.waitForTimeout(800);
log('sidebar2:', await page.locator('.sidebar-tree').innerText());
// second root page
await page.getByRole('button', { name: 'New page' }).click();
await page.waitForTimeout(300);
await page.keyboard.type('Second root');
await page.waitForTimeout(800);
log('sidebar3:', await page.locator('.sidebar-tree').innerText());
await page.screenshot({ path: `${SHOTS}/tree.png` });

// delete first page (with child) via menu
page.once('dialog', (d) => d.accept());
await page.locator('.tree-row').first().hover();
await page.getByRole('button', { name: 'More actions' }).first().click();
await page.getByRole('menuitem', { name: 'Delete' }).click();
await page.waitForTimeout(800);
log('sidebar4:', await page.locator('.sidebar-tree').innerText());
await page.goto(pageUrl);
await page.waitForTimeout(800);
log('deleted page view:', await page.locator('.center-screen').innerText());
log(errors.join('\n'));
await browser.close();
