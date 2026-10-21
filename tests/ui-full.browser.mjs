// Real-browser UI audit. Run with: npm run test:browser
// Uses Playwright against the locally installed native Chrome so this exercises
// the same DOM, focus, canvas, dialogs, and event handlers a user sees.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, open: false } });
const results = [];
const errors = [];
const dialogs = [];
const consoleErrors = [];
let acceptNextDialog = false;
let browser;

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const prefix = passed ? 'PASS' : 'FAIL';
  console.log(`${prefix} ${name}${detail ? ` · ${detail}` : ''}`);
}

async function waitForIdle(page, milliseconds = 120) {
  await page.waitForTimeout(milliseconds);
}

async function visibleButton(page, name) {
  const exact = page.getByRole('button', { name, exact: true });
  for (let index = 0; index < await exact.count(); index += 1) {
    const button = exact.nth(index);
    if (await button.isVisible()) return button;
  }
  const partial = page.locator('button').filter({ hasText: name });
  for (let index = 0; index < await partial.count(); index += 1) {
    const button = partial.nth(index);
    if (await button.isVisible()) return button;
  }
  throw new Error(`Visible button not found: ${name}`);
}

async function clickButton(page, name, options = {}) {
  const button = await visibleButton(page, name);
  if (await button.isDisabled()) {
    if (options.allowDisabled) return { button, disabled: true };
    throw new Error(`Button is disabled: ${name}`);
  }
  await button.click({ force: Boolean(options.force) });
  await waitForIdle(page, options.wait ?? 130);
  return { button, disabled: false };
}

async function step(page, name, operation) {
  const before = errors.length;
  try {
    await operation();
    await waitForIdle(page);
    const newErrors = errors.slice(before);
    if (newErrors.length) throw new Error(newErrors.join(' | '));
    record(name, true);
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

async function assertVisible(page, selector, label) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 5000 });
  assert.ok(await page.locator(selector).first().isVisible(), `${label} is not visible`);
}

async function clickWorkspace(page, name, expectedSelector) {
  const tab = page.getByRole('tab', { name, exact: true });
  await tab.click();
  await waitForIdle(page, 250);
  assert.equal(await tab.getAttribute('aria-selected'), 'true', `${name} workspace tab did not select`);
  if (expectedSelector) await assertVisible(page, expectedSelector, name);
}

async function closeIfVisible(page, selector, buttonName) {
  if (await page.locator(selector).first().isVisible().catch(() => false)) {
    await clickButton(page, buttonName);
  }
}

await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHARACTER_STUDIO_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions'],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') { const text = message.text(); consoleErrors.push(text); errors.push(`console: ${text}`); } });
  page.on('response', response => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });
  page.on('requestfailed', request => errors.push(`requestfailed: ${request.url()} · ${request.failure()?.errorText ?? 'unknown'}`));
  page.on('dialog', async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message(), accepted: acceptNextDialog });
    const accept = acceptNextDialog;
    acceptNextDialog = false;
    await (accept ? dialog.accept() : dialog.dismiss());
  });

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('.studio-app').waitFor({ state: 'visible', timeout: 10000 });
  await page.screenshot({ path: join(root, 'evidence', 'ui-audit-initial.png'), fullPage: true });

  await step(page, 'Application loads without browser errors', async () => {
    assertVisible(page, '.studio-app', 'studio app');
    assert.equal(errors.length, 0, errors.join(' | '));
  });

  const initialButtons = await page.locator('button:visible').evaluateAll(buttons => buttons.map(button => ({ text: (button.textContent ?? '').replace(/\s+/g, ' ').trim(), aria: button.getAttribute('aria-label'), title: button.getAttribute('title') })).filter(item => item.text || item.aria || item.title));
  await writeFile(join(root, 'evidence', 'ui-audit-initial-buttons.json'), JSON.stringify(initialButtons, null, 2));

  // Top-level workspace tabs.
  await step(page, 'Workspace tab: Environment', () => clickWorkspace(page, 'Environment', '.environment-workspace'));
  await step(page, 'Workspace tab: Character Studio', () => clickWorkspace(page, 'Character Studio', '#views-dock'));
  await step(page, 'Workspace tab: Rigging / Bone Mapping', () => clickWorkspace(page, 'Rigging', '.bone-mapping-board'));
  await step(page, 'Workspace tab: Deformation', () => clickWorkspace(page, 'Deformation', '.mesh-section'));
  await step(page, 'Workspace tab: Animation / Joystick Control', async () => {
    await clickWorkspace(page, 'Animation', '.joystick-workspace');
    await assertVisible(page, '.studio-body', 'main editor layout');
    await assertVisible(page, '.canvas-workspace', 'shared canvas workspace');
    await assertVisible(page, '.timeline-panel', 'shared animation timeline');
    await assertVisible(page, '#joystick-dock', 'Rig-backed joystick dock');
  });
  await step(page, 'Motion Tracking dock stays in the main editor', async () => {
    await clickWorkspace(page, 'Character Studio', '#views-dock');
    const tab = page.getByRole('tab', { name: 'Motion Tracking', exact: true });
    await tab.click();
    await waitForIdle(page, 180);
    assert.equal(await tab.getAttribute('aria-selected'), 'true');
    await assertVisible(page, '#tracking-dock', 'motion tracking dock');
    await assertVisible(page, '.motion-tracking-panel', 'motion tracking panel');
    await assertVisible(page, '.canvas-workspace', 'shared canvas while tracking panel is open');
    await assertVisible(page, '.timeline-panel', 'shared timeline while tracking panel is open');
    await clickWorkspace(page, 'Animation', '.joystick-workspace');
  });
  await step(page, 'Workspace tab: Environment restore', () => clickWorkspace(page, 'Environment', '.environment-workspace'));
  await step(page, 'Willow village props are selectable and transformable', async () => {
    await clickButton(page, 'Willow village');
    await assertVisible(page, '.environment-transform-panel', 'village prop editor');
    const selection = page.getByLabel('Select village prop', { exact: true });
    const options = await selection.locator('option').evaluateAll(items => items.map(item => item.value).filter(Boolean));
    assert.equal(options.length, 10, 'village did not create ten selectable props');
    await selection.selectOption(options[4]);
    await waitForIdle(page, 160);
    const twoD = page.locator('.environment-transform-grid input');
    assert.equal(await twoD.count(), 4, '2D transform fields are incomplete');
    await twoD.nth(0).fill('440');
    await twoD.nth(3).fill('1.25');
    assert.equal(await twoD.nth(0).inputValue(), '440');
    assert.equal(await twoD.nth(3).inputValue(), '1.25');
    const xyz = page.locator('.environment-transform-axis-grid input');
    assert.equal(await xyz.count(), 9, 'XYZ transform fields are incomplete');
    await xyz.nth(2).fill('36');
    assert.equal(await xyz.nth(2).inputValue(), '36');
    await assertVisible(page, '.environment-layer-row.selected', 'selected village layer row');
  });

  // Open the built-in rigged example so mapping, mesh, pose, and animation
  // controls all have real data to work with. The initial project is empty, so
  // this action normally does not require accepting a destructive confirmation;
  // the village smoke test above intentionally populated the scene first.
  await step(page, 'Load rigged example', async () => {
    acceptNextDialog = true;
    await clickButton(page, 'Rigged example');
    await assertVisible(page, '.bone-mapping-board', 'bone mapping board');
    assert.ok((await page.locator('.layer-row').count()) > 0, 'rigged example did not create scene rows');
    const riggedButtons = await page.locator('button:visible').evaluateAll(buttons => buttons.map(button => ({ text: (button.textContent ?? '').replace(/\s+/g, ' ').trim(), aria: button.getAttribute('aria-label'), title: button.getAttribute('title'), disabled: button.disabled })).filter(item => item.text || item.aria || item.title));
    await writeFile(join(root, 'evidence', 'ui-audit-rigged-buttons.json'), JSON.stringify(riggedButtons, null, 2));
  });

  // Bone mapping board controls.
  await step(page, 'Mapping tool strip: Select', () => clickButton(page, 'Select'));
  await step(page, 'Mapping tool strip: Add bone', () => clickButton(page, 'Add bone'));
  await step(page, 'Mapping tool strip: Map layer', () => clickButton(page, 'Map layer'));
  await step(page, 'Mapping tool strip: Pose / IK', () => clickButton(page, 'Pose / IK'));
  await step(page, 'Mapping tool strip: Edit mesh', () => clickButton(page, 'Edit mesh'));
  await step(page, 'Mapping tool strip: Paint weights', () => clickButton(page, 'Paint weights'));
  await step(page, 'Mapping display toggles', async () => {
    for (const label of ['Show bones', 'Show bone names', 'Show preview grid']) {
      const checkbox = page.getByLabel(label, { exact: true });
      await checkbox.click();
      await checkbox.click();
    }
    await assertVisible(page, '[aria-label="side bone mapping preview"]', 'side preview');
    await assertVisible(page, '[aria-label="back bone mapping preview"]', 'back preview');
  });

  await step(page, 'Map artwork to bone through board controls', async () => {
    const source = page.getByLabel('Bone mapping source artwork', { exact: true });
    const target = page.getByLabel('Bone mapping target bone', { exact: true });
    const sourceValues = await source.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, disabled: option.disabled })).filter(option => option.value));
    const targetValues = await target.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, text: option.textContent ?? '', disabled: option.disabled })).filter(option => option.value && !option.text.includes('locked')));
    assert.ok(sourceValues.length, 'no artwork source options');
    assert.ok(targetValues.length, 'no unlocked bone target options');
    await source.selectOption(sourceValues[0].value);
    await target.selectOption(targetValues[targetValues.length - 1].value);
    await clickButton(page, 'Confirm map');
    await assertVisible(page, '.mapping-connection.mapped', 'mapped connection');
    await clickButton(page, 'Unbind');
    await assertVisible(page, '.mapping-connection', 'mapping connection after unbind');
  });

  await step(page, 'Auto rig generation and report', async () => {
    await assertVisible(page, '[aria-label="Auto rig"]', 'auto rig panel');
    await clickButton(page, 'Generate rig');
    await assertVisible(page, '[aria-label="Auto-rig report"]', 'auto-rig report');
  });

  await step(page, 'Main tool tabs activate every editing mode', async () => {
    const toolTabs = ['Pose', 'Bones', 'Select', 'Transform', 'IK', 'Chain', 'Constraint', 'Weight Paint', 'Motion Path', 'Draw', 'Eraser'];
    for (const name of toolTabs) {
      const button = page.locator('.main-tool-tabs > button').filter({ hasText: name }).first();
      await button.click();
      await waitForIdle(page, 90);
      assert.ok(await button.isVisible(), `${name} main tool tab disappeared after click`);
    }
    await clickWorkspace(page, 'Rigging', '.bone-mapping-board');
  });

  await step(page, 'Tool rail buttons activate their tools', async () => {
    const railTools = ['Select Tool', 'Bone Tool', 'Draw Tool', 'Fill Tool', 'Transform Tool', 'Layer Tool', 'Weight Paint', 'IK / Pose', 'Motion Path', 'Camera Tool', 'Pan / More Tools'];
    for (const name of railTools) {
      const button = page.locator('.tool-rail button[aria-label]').filter({ has: page.locator('span') }).filter({ hasText: name }).first();
      await button.click();
      await waitForIdle(page, 90);
      assert.ok(await button.isVisible(), `${name} tool rail button disappeared after click`);
    }
    await clickWorkspace(page, 'Rigging', '.bone-mapping-board');
  });

  await step(page, 'Canvas view controls respond to every view and navigation button', async () => {
    const view = page.getByLabel('Viewport view', { exact: true });
    for (const option of ['front', 'side', 'three-quarter', 'back', 'top', 'front']) {
      await view.selectOption(option);
      await waitForIdle(page, 100);
    }
    for (const label of ['Pan viewport', 'Zoom in viewport', 'Fit viewport', 'Orbit viewport', 'Zoom out', 'Zoom in', 'Fit viewport']) {
      const button = page.getByLabel(label, { exact: true }).last();
      await button.click();
      await waitForIdle(page, 70);
    }
    assert.match(await page.locator('.canvas-hud').textContent(), /800 × 520/);
  });

  await step(page, 'Timeline transport, view tabs, and toggles respond', async () => {
    for (const label of ['First frame', 'Previous frame', 'Play', 'Stop', 'Next frame', 'Last frame']) {
      const button = page.getByLabel(label, { exact: true });
      await button.click();
      await waitForIdle(page, label === 'Play' ? 180 : 60);
    }
    for (const name of ['Timeline', 'Dope Sheet', 'Graph Editor', 'Timeline']) {
      const tab = page.getByRole('tab', { name, exact: true });
      if (await tab.isEnabled()) { await tab.click(); await waitForIdle(page, 100); assert.equal(await tab.getAttribute('aria-selected'), 'true'); }
    }
    for (const name of ['Loop', 'Auto-key', 'Onion Skin']) {
      const button = page.getByRole('button', { name, exact: true }).last();
      await button.click();
      await button.click();
    }
    const timeline = page.locator('.timeline-panel');
    const content = page.locator('#timeline-dock-content');
    const minimize = page.getByRole('button', { name: 'Minimize timeline dock', exact: true });
    assert.equal(await minimize.getAttribute('aria-expanded'), 'true', 'timeline did not start expanded');
    assert.equal(await content.isVisible(), true, 'timeline content did not start visible');
    await minimize.click();
    await waitForIdle(page);
    const restore = page.getByRole('button', { name: 'Restore timeline dock', exact: true });
    assert.equal(await restore.getAttribute('aria-expanded'), 'false', 'timeline did not report minimized state');
    assert.equal(await content.isVisible(), false, 'timeline content is still visible after minimizing');
    assert.equal(await page.locator('.studio-app.timeline-minimized').count(), 1, 'minimized timeline class is missing');
    assert.equal(await timeline.isVisible(), true, 'timeline restore bar disappeared');
    assert.equal(await page.locator('.canvas-workspace').isVisible(), true, 'canvas disappeared with timeline');
    await restore.click();
    await waitForIdle(page);
    assert.equal(await content.isVisible(), true, 'timeline content did not restore');
    assert.equal(await page.locator('.studio-app.timeline-minimized').count(), 0, 'timeline minimized class remained after restore');
  });

  // Main inspector tabs. Every tab must select and expose its panel without a
  // page error. Lazy-loaded panels get a little extra settling time.
  const dockTabs = [
    ['Rig & animate', '#rig-dock'],
    ['Assets', '#assets-dock'],
    ['Brushes', '#brushes-dock'],
    ['Facial', '#facial-dock'],
    ['Head Creator', '#head-dock'],
    ['Constraints', '#constraints-dock'],
    ['Controllers', '#controllers-dock'],
    ['Joystick', '#joystick-dock'],
    ['Motion Tracking', '#tracking-dock'],
    ['Dynamics', '#dynamics-dock'],
    ['Style', '#style-dock'],
    ['Stage', '#stage-dock'],
    ['3D Motion', '#motion-dock'],
    ['Camera', '#camera-dock'],
    ['Onion Skin', '#onion-dock'],
    ['Character views', '#views-dock'],
  ];
  for (const [name, selector] of dockTabs) {
    await step(page, `Inspector tab: ${name}`, async () => {
      const tab = page.getByRole('tab', { name, exact: true });
      await tab.click();
      await waitForIdle(page, 350);
      assert.equal(await tab.getAttribute('aria-selected'), 'true', `${name} did not select`);
      await assertVisible(page, selector, `${name} panel`);
    });
  }

  await step(page, 'Minimize and restore the Scene Objects panel', async () => {
    const panel = page.locator('.scene-objects-section');
    const content = page.locator('#scene-objects-content');
    const minimize = panel.getByRole('button', { name: 'Minimize Scene Objects panel', exact: true });
    assert.equal(await minimize.getAttribute('aria-expanded'), 'true', 'Scene Objects panel did not start expanded');
    await minimize.click();
    const restore = panel.getByRole('button', { name: 'Restore Scene Objects panel', exact: true });
    assert.equal(await restore.getAttribute('aria-expanded'), 'false', 'Scene Objects panel did not report minimized state');
    assert.equal(await content.isVisible(), false, 'Scene Objects content is still visible after minimizing');
    assert.equal(await page.locator('.right-dock.scene-objects-minimized').count(), 1, 'minimized dock class is missing');
    assert.equal(await page.locator('.dock-inspector').isVisible(), true, 'Inspector disappeared with Scene Objects');
    await restore.click();
    assert.equal(await content.isVisible(), true, 'Scene Objects content did not restore');
    assert.equal(await panel.getByRole('button', { name: 'Minimize Scene Objects panel', exact: true }).getAttribute('aria-expanded'), 'true', 'Scene Objects panel did not return to expanded state');
  });

  // Docking is a user-facing layout feature, so verify placement, HTML drag
  // reordering, resize handles, collapse/reopen, reset, and persistence rather
  // than only checking that the toolbar rendered.
  await step(page, 'Dock tools to the bottom and reorder tabs', async () => {
    const rightButton = page.getByRole('button', { name: 'Dock tools to the right', exact: true });
    const bottomButton = page.getByRole('button', { name: 'Dock tools to the bottom', exact: true });
    await rightButton.click();
    await bottomButton.click();
    assert.equal(await bottomButton.getAttribute('aria-pressed'), 'true', 'bottom dock was not selected');
    await assertVisible(page, '.studio-body.dock-bottom', 'bottom dock layout');
    await assertVisible(page, '[aria-label="Resize bottom tool dock"]', 'bottom resize handle');

    const panel = page.locator('.scene-objects-section');
    await panel.getByRole('button', { name: 'Minimize Scene Objects panel', exact: true }).click();
    assert.equal(await page.locator('.studio-body.dock-bottom .right-dock.scene-objects-minimized').count(), 1, 'bottom dock did not minimize Scene Objects');
    await panel.getByRole('button', { name: 'Restore Scene Objects panel', exact: true }).click();
    assert.equal(await page.locator('.studio-body.dock-bottom .right-dock.scene-objects-minimized').count(), 0, 'bottom dock did not restore Scene Objects');

    const viewsTab = page.locator('#views-tab');
    const rigTab = page.locator('#rig-tab');
    await viewsTab.scrollIntoViewIfNeeded();
    await rigTab.scrollIntoViewIfNeeded();
    await viewsTab.dragTo(rigTab);
    const tabOrder = await page.locator('.dock-tabs > button').evaluateAll(buttons => buttons.map(button => button.id));
    assert.ok(tabOrder.indexOf('views-tab') < tabOrder.indexOf('rig-tab'), `tabs did not reorder: ${tabOrder.join(', ')}`);
  });

  await step(page, 'Resize, collapse, and reopen the tool dock', async () => {
    const bottomHandle = page.locator('[aria-label="Resize bottom tool dock"]');
    const before = await bottomHandle.boundingBox();
    assert.ok(before, 'bottom resize handle has no layout box');
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2, before.y - 55);
    await page.mouse.up();
    await waitForIdle(page, 180);
    const after = await bottomHandle.boundingBox();
    assert.ok(after, 'bottom resize handle disappeared after resize');
    assert.notEqual(after.y, before.y, 'bottom dock resize did not move the boundary');

    await clickButton(page, 'Collapse tool dock');
    assert.equal(await page.locator('.right-dock').isVisible(), false, 'collapsed dock is still visible');
    await clickButton(page, 'Open tool dock');
    assert.equal(await page.locator('.right-dock').isVisible(), true, 'collapsed dock did not reopen');
  });

  await step(page, 'Dock layout persists and reset restores the right dock', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.studio-app').waitFor({ state: 'visible', timeout: 10000 });
    await clickWorkspace(page, 'Character Studio', '#views-dock');
    await assertVisible(page, '.studio-body.dock-bottom', 'persisted bottom dock layout');
    const persistedOrder = await page.locator('.dock-tabs > button').evaluateAll(buttons => buttons.map(button => button.id));
    assert.ok(persistedOrder.indexOf('views-tab') < persistedOrder.indexOf('rig-tab'), `tab order was not persisted: ${persistedOrder.join(', ')}`);
    await clickButton(page, 'Reset dock layout');
    const rightButton = page.getByRole('button', { name: 'Dock tools to the right', exact: true });
    assert.equal(await rightButton.getAttribute('aria-pressed'), 'true', 'reset did not restore right placement');
    assert.equal(await page.locator('.studio-body.dock-bottom').count(), 0, 'reset left bottom dock class active');
    const resetOrder = await page.locator('.dock-tabs > button').evaluateAll(buttons => buttons.map(button => button.id));
    assert.equal(resetOrder[0], 'rig-tab', 'reset did not restore default tab order');
  });

  // Context actions and dock switches.
  await step(page, 'Context action: Assets opens Asset Store', async () => {
    await clickButton(page, 'Assets');
    await assertVisible(page, '[role="dialog"][aria-labelledby="asset-store-title"]', 'asset store');
    await clickButton(page, 'Close Asset Store');
  });
  await step(page, 'Context action: Motion opens motion panel', async () => { await clickButton(page, 'Motion'); await assertVisible(page, '#motion-dock', 'motion dock'); });
  await step(page, 'Context action: Camera activates camera panel', async () => { await clickButton(page, 'Camera'); await assertVisible(page, '#camera-dock', 'camera dock'); });
  await step(page, 'Context action: Onion Skin opens onion panel', async () => { await clickButton(page, 'Onion Skin'); await assertVisible(page, '#onion-dock', 'onion skin dock'); });
  await step(page, 'Context action: Views opens character views panel', async () => { await clickButton(page, 'Views'); await assertVisible(page, '#views-dock', 'views dock'); });
  await step(page, 'Context action: Draw activates draw tool', async () => { await clickButton(page, 'Draw'); assert.equal(await page.locator('.status-selection strong').last().textContent(), 'draw'); });
  await step(page, 'Context action: Path activates path tool', async () => { await clickButton(page, 'Path'); assert.equal(await page.locator('.status-selection strong').last().textContent(), 'path'); });
  await step(page, 'Context action: Weights activates weight tool', async () => { await clickButton(page, 'Weights'); assert.equal(await page.locator('.status-selection strong').last().textContent(), 'weight'); });

  // Top-level dialogs that must open and close cleanly.
  await step(page, 'Top action: Character studio opens and closes', async () => {
    await clickButton(page, 'Character studio');
    await assertVisible(page, '[aria-label="Close character studio"]', 'character studio');
    await clickButton(page, 'Close character studio');
  });
  await step(page, 'Top action: Props toolkit opens and closes', async () => {
    await clickButton(page, 'Props toolkit');
    await assertVisible(page, '[aria-label="Close props toolkit"]', 'props toolkit');
    await clickButton(page, 'Close props toolkit');
  });
  await step(page, 'Top action: Video export opens and closes', async () => {
    await clickButton(page, 'Video');
    await assertVisible(page, '[aria-label="Close video export"]', 'video export');
    await clickButton(page, 'Close video export');
  });
  await step(page, 'Top action: Settings reports status', async () => {
    await clickButton(page, 'Settings');
    assert.match(await page.locator('.statusbar').textContent(), /Settings are saved automatically/);
  });

  await step(page, 'Top actions save and export downloads', async () => {
    for (const name of ['Save', 'SVG', 'PNG']) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await clickButton(page, name, { wait: 250 });
      const download = await downloadPromise;
      assert.ok((await download.suggestedFilename()).length > 0, `${name} download had no filename`);
    }
  });

  await step(page, 'Open project and import artwork file choosers work', async () => {
    const openChooser = page.waitForEvent('filechooser');
    await clickButton(page, 'Open');
    await (await openChooser).setFiles(join(root, 'pip-·-trail-courier.json'));
    await page.waitForTimeout(500);
    assert.match(await page.locator('.statusbar').textContent(), /Opened pip/);
    const importChooser = page.waitForEvent('filechooser');
    await clickButton(page, 'Import');
    await (await importChooser).setFiles(join(root, 'uploaded-character.png'));
    await page.waitForTimeout(500);
    assert.match(await page.locator('.statusbar').textContent(), /Imported uploaded-character\.png/);
  });

  await step(page, 'New project confirmation resets the scene', async () => {
    acceptNextDialog = true;
    await clickButton(page, 'New');
    await assertVisible(page, '.canvas-welcome', 'new project welcome');
    await clickButton(page, 'Rigged example');
    await assertVisible(page, '.bone-mapping-board', 'rigging board after new project');
  });

  // Joystick workspace has its own tabs/buttons and is a common source of
  // silent no-op controls, so exercise its selectable panels and live controls.
  await step(page, 'Joystick workspace controls', async () => {
    await clickWorkspace(page, 'Animation', '.joystick-workspace');
    await assertVisible(page, '.canvas-workspace', 'real canvas behind joystick dock');
    await assertVisible(page, '.timeline-panel', 'real timeline behind joystick dock');
    await clickButton(page, 'Attach controller to this Rig');
    await assertVisible(page, '.controller-test', 'real controller test pad');
    await clickButton(page, 'Start test');
    await assertVisible(page, '[aria-label$="joystick, use arrow keys or drag"]', 'real joystick input');
    await clickButton(page, 'Record animation');
    assert.match(await page.locator('.statusbar').textContent(), /Recording enabled|controller instance/i);
    const joystickTabs = page.locator('.joystick-panel-tabs button:visible');
    for (let index = 0; index < await joystickTabs.count(); index += 1) {
      const tab = joystickTabs.nth(index);
      await tab.click();
      assert.equal(await tab.getAttribute('aria-selected'), 'true', `joystick tab ${index} did not select`);
    }
    const liveInput = page.getByLabel('Live input', { exact: false });
    if (await liveInput.count()) { await liveInput.click(); await liveInput.click(); }
    await clickButton(page, 'Reset inputs');
    await clickWorkspace(page, 'Environment', '.environment-workspace');
  });

  // Save the final browser state and a machine-readable report for review.
  await page.screenshot({ path: join(root, 'evidence', 'ui-audit-final.png'), fullPage: true });
  const report = { origin, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results, dialogs, consoleErrors };
  await writeFile(join(root, 'evidence', 'ui-full-browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, dialogs: report.dialogs.length, consoleErrors: report.consoleErrors.length }, null, 2));
  if (report.failed) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
