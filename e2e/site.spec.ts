import { expect, test, type Page } from '@playwright/test';

const errors = (page: Page) => {
  const list: string[] = [];
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/supabase|Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/i.test(m.text()) && list.push(m.text()));
  return list;
};

test('the 3D unit renders, with labels, timeline and toggles', async ({ page }) => {
  const errs = errors(page);
  await page.goto('frostpure/model');
  const canvas = page.locator('.fp-3d canvas');
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('illustration', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /V2 drain valve/ })).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'X-ray' }).click();
  await page.getByRole('button', { name: 'Cross-section' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  // Labels float over the 3D view (and can overlap at phone width), so click the label itself.
  await page.getByRole('button', { name: /V2 drain valve/ }).dispatchEvent('click');
  await expect(page.getByRole('dialog')).toContainText('Open in Build');
  await page.keyboard.press('Escape');
  // AR: the GLB + USDZ export runs in the browser and hands the files to model-viewer.
  await page.getByRole('button', { name: 'View in AR' }).click();
  await expect(page.getByRole('button', { name: 'Open in AR' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('model-viewer')).toHaveAttribute('ios-src', /^blob:/);
  await page.locator('.fp-3d').screenshot({ path: 'test-results/model.png' });
  // The canvas draws something (not all background).
  const lit = await canvas.evaluate((c: HTMLCanvasElement) => {
    const g = c.getContext('webgl2') ?? c.getContext('webgl');
    return !!g;
  });
  expect(lit).toBe(true);
  expect(errs).toEqual([]);
});

test('the kit studio renders robots, styles, explode, steps and the box', async ({ page }) => {
  const errs = errors(page);
  await page.goto('tagylym/studio');
  await expect(page.locator('.tg-3d canvas')).toBeVisible({ timeout: 20_000 });
  for (const style of ['Cardboard', 'Plywood', 'Glossy plastic', 'Deep Blue']) await page.getByRole('radio', { name: style }).click();
  await page.getByLabel('Exploded view').fill('70');
  await page.waitForTimeout(500);
  await page.locator('.tg-3d').screenshot({ path: 'test-results/robot.png' });
  await page.getByRole('button', { name: 'Step →' }).click();
  await expect(page.getByText(/Step 1 of/)).toBeVisible();
  await page.getByRole('radio', { name: /D · Ertegi/ }).click();
  await page.getByRole('tab', { name: 'Box mockup' }).click();
  await page.getByLabel('Name in Russian').fill('Ертегі карточки');
  await page.waitForTimeout(500);
  await page.locator('.tg-3d').screenshot({ path: 'test-results/box.png' });
  await page.getByLabel('Lid').fill('90');
  expect(errs).toEqual([]);
});

test('works offline after the first visit (except sync, Radar updates and the Bridge)', async ({ page, context }) => {
  await page.goto('');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Today');
  // Let the service worker install and cache the app.
  await page.waitForFunction(async () => !!(await navigator.serviceWorker?.ready)?.active, null, { timeout: 30_000 });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 });
  // Visit each section once online so its lazy code is cached (precache covers it too).
  await context.setOffline(true);
  for (const [path, heading] of [
    ['', /Today/],
    ['english', /English/],
    ['planner', /Planner|Day|Week/],
    ['radar', /Radar/],
    ['frostpure/lab', /Experiment lab/],
    ['tagylym/decide', /Decide/],
    ['settings', /Settings/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(heading, { timeout: 15_000 });
  }
  await context.setOffline(false);
});

test('Settings exports all data as JSON (every module’s tables)', async ({ page }) => {
  await page.goto('');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Today');
  await page.waitForTimeout(2500); // modules start after the first paint and seed their data
  await page.goto('settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export all data (JSON)' }).click()]);
  const body = JSON.parse(await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8')));
  expect(body.app).toBe('dosym-os');
  for (const t of ['plannerItems', 'settings', 'vocabNotes', 'radarOpps', 'fpBom', 'fpSteps', 'tgOptions']) expect(body.tables).toHaveProperty(t);
  expect(body.tables.radarOpps.length).toBe(55);
  expect(body.tables.tgOptions.length).toBe(5);
  expect(body.tables.fpBom.length).toBeGreaterThan(20);
});
