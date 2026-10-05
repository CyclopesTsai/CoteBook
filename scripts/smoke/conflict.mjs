import { chromium } from 'playwright';
// Uses Playwright's own Chromium unless CHROMIUM_PATH points at another build.
const launchOptions = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch(launchOptions);
const log = (...a) => console.log(...a);
const errors = [];
const mk = async () => {
  const c = await browser.newContext({ locale: 'en-US' });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  return [c, p];
};
const [, A] = await mk();
const email = `c${Date.now()}@example.com`;
await A.goto(BASE + '/register');
await A.fill('input[type=email]', email);
await A.fill('input[type=password]', 'password123');
await A.click('button[type=submit]');
await A.waitForURL(BASE + '/');
await A.getByRole('button', { name: 'New page' }).click();
await A.waitForFunction(() => document.activeElement?.classList.contains('page-title'));
await A.keyboard.type('Conflict');
await A.keyboard.press('Enter');
await A.keyboard.type('base');
await A.waitForTimeout(1500);
const url = A.url();
const [ctxB, B] = await mk();
await B.goto(BASE + '/login');
await B.fill('input[type=email]', email);
await B.fill('input[type=password]', 'password123');
await B.click('button[type=submit]');
await B.waitForURL(BASE + '/');
await B.goto(url);
await B.waitForSelector('.bn-editor');

for (const choice of ['Load their version', 'Keep mine']) {
  await ctxB.setOffline(true);
  await B.locator('.bn-editor p').first().click();
  await B.keyboard.press('End');
  await B.keyboard.type(` B-${choice.split(' ')[0]}`);
  await B.waitForTimeout(1500);
  log('B status offline:', await B.locator('.topbar-status').textContent());
  await A.locator('.bn-editor p').first().click();
  await A.keyboard.press('End');
  await A.keyboard.type(` A-${choice.split(' ')[0]}`);
  await A.waitForTimeout(1500);
  await ctxB.setOffline(false);
  await B.evaluate(() => window.dispatchEvent(new Event('online')));
  await B.waitForTimeout(2500);
  log('B banner:', await B.locator('.page-banner').count());
  await B.getByRole('button', { name: choice }).click();
  await B.waitForTimeout(2500);
  log(
    `[${choice}] banner after:`,
    await B.locator('.page-banner').count(),
    '| A:',
    JSON.stringify(await A.locator('.bn-editor').innerText()),
    '| B:',
    JSON.stringify(await B.locator('.bn-editor').innerText()),
    '| B status:',
    await B.locator('.topbar-status').textContent(),
  );
}
const server = await A.evaluate(
  (u) => fetch('/api/pages/' + u.split('/p/')[1]).then((r) => r.json()),
  url,
);
log(
  'server blocks:',
  JSON.stringify(server.page.blocks.map((b) => b.content?.map((c) => c.text).join(''))),
  'v',
  server.page.version,
);
log(errors.join('\n'));
await browser.close();
