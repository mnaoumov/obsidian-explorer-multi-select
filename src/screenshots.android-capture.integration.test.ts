/**
 * @file
 *
 * Produces the mobile screenshots the community-directory listing needs, driving a real Obsidian Mobile on an
 * Android emulator and writing `images/screenshots/screenshot-mobile-N.png`.
 *
 * The mobile half of `screenshots.desktop-capture.integration.test.ts`, staged by the same closures. Selection mode
 * in the left drawer is the first frame, since touch is where core has no multi-select at all. A phone has no
 * status bar, so the desktop's count frame is replaced by core's own menu for the selection, which More opens.
 *
 * There is no mobile equivalent of the desktop viewport override, so the capture is always the device's own
 * framebuffer, and the AVD is built at exactly the 900x1600 the directory asks for: see `SCREENSHOT_AVD_NAME` in
 * `scripts/vitest-config.ts`.
 *
 * Excluded from `npm run test:integration` by its file name: see the `capture-screenshots:android` project in
 * `scripts/vitest-config.ts`. Capturing is an explicit operation (`npm run capture:screenshots`).
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleepInNode } from 'node:timers/promises';
import {
  captureObsidianScreenshot,
  computeLabelBand,
  evalInObsidian,
  labelScreenshot,
  pollInObsidian,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import type { ScreenshotStage } from './test-helpers/screenshot-stages.test.helper.ts';

import {
  areAllLinksResolved,
  pollStage,
  reserveCaptionBand,
  startStage
} from './test-helpers/screenshot-stages.test.helper.ts';

const WIDTH_IN_PIXELS = 900;
const HEIGHT_IN_PIXELS = 1600;

/**
 * A cold-booted AVD renders its first view far more slowly than a warm desktop does.
 */
const RENDER_TIMEOUT_IN_MILLISECONDS = 120_000;

const TEST_TIMEOUT_IN_MILLISECONDS = 600_000;

const POLL_INTERVAL_IN_MILLISECONDS = 500;

/**
 * Time for a drawer to finish sliding, or a view to finish laying out, after its content is ready.
 */
const SETTLE_DELAY_IN_MILLISECONDS = 1500;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
  await evalInObsidian({
    callback({ app }): void {
      app.changeTheme('obsidian');
      // Each note opens with its own `# H1`, so the inline title would print every name twice.
      app.vault.setConfig('showInlineTitle', false);
    },
    vaultPath: vaultPath()
  });
  await evalInObsidian({
    callback: reserveCaptionBand,
    input: { bandHeightInPixels: computeLabelBand({ imageHeightInPixels: HEIGHT_IN_PIXELS, imageWidthInPixels: WIDTH_IN_PIXELS }).heightInPixels },
    vaultPath: vaultPath()
  });
  await pollInObsidian({
    intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
    poll: areAllLinksResolved,
    timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the metadata cache never resolved every note',
    until: (isResolved: boolean): boolean => isResolved,
    vaultPath: vaultPath()
  });

  await sleepInNode(SETTLE_DELAY_IN_MILLISECONDS);
}, TEST_TIMEOUT_IN_MILLISECONDS);

describe('mobile store screenshots', () => {
  it('1 - selection mode in the drawer', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('selection-mode', '01 Selection mode.md', '2 files, 1 folder')).toBe('2 files, 1 folder');
    await shoot(1, 'Selection mode: tap rows to tick them');
  });

  it('2 - core\'s menu for the selection', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('more-menu', '01 Selection mode.md', 'menu')).toBe('menu');
    await shoot(2, 'More opens core\'s own menu for them all');
  });

  it('3 - a select-by-rule prompt', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    const expected = 'Select by glob pattern in Materials/04 Select by rule: *a*';
    expect(await stage('rule-prompt', '04 Select by rule.md', expected)).toBe(expected);
    await shoot(3, 'Select by rule, in the folder the prompt names');
  });

  it('4 - the batch delete confirmation', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('batch-delete', '05 Batch delete.md', 'Delete 3 files?')).toBe('Delete 3 files?');
    await shoot(4, 'One confirmation deletes the whole selection');
  });

  it('5 - the settings tab', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('settings', null, 'settings')).toBe('settings');
    await shoot(5, 'Every option is a toggle in the settings tab');
  });
});

/**
 * Captures the device framebuffer, captions it, and writes it as `images/screenshots/screenshot-mobile-<index>.png`.
 *
 * The AVD is 900x1600, so the device frame IS the directory's size. Asserting it here keeps that true: run this
 * against any other AVD and it fails loudly instead of quietly shipping an off-spec image.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({ vaultPath: vaultPath() });

  expect(readPngDimensions(bytes)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  // Captioned after capture, so the frame stays an untouched device screenshot and rewording a label needs no re-shoot.
  const labeled = await labelScreenshot(bytes, { text: caption });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
}

/**
 * Stages a frame and waits in Node until it shows what it is about.
 *
 * @param screenshotStage - The frame to stage.
 * @param notePath - The demo note to open behind it, or `null` to leave the main area as it is.
 * @param expected - What the frame shows once it is ready.
 * @returns What the frame shows.
 */
async function stage(screenshotStage: ScreenshotStage, notePath: null | string, expected: string): Promise<string> {
  const shown = await pollInObsidian({
    input: { notePath, stage: screenshotStage },
    intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
    poll: pollStage,
    start: startStage,
    timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: `the ${screenshotStage} frame never showed ${expected}`,
    until: (result: string): boolean => result === expected,
    vaultPath: vaultPath()
  });
  await sleepInNode(SETTLE_DELAY_IN_MILLISECONDS);
  return shown;
}

function vaultPath(): string {
  return getTemporaryVault().path;
}
