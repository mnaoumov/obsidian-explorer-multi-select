/**
 * @file
 *
 * Produces the desktop screenshots the community-directory listing needs, driving a real Obsidian on a copy of the
 * demo vault and writing `images/screenshots/screenshot-desktop-N.png`.
 *
 * Five frames, one per headline feature a reader can see, each over the demo note that explains it: selection mode
 * with its checkboxes and action bar, the status-bar count, a select-by-rule prompt naming its folder, the batch
 * delete confirmation, and the settings tab. Five is the directory's cap per form factor. The frames are staged by
 * the closures in `src/test-helpers/screenshot-stages.test.helper.ts`, which the Android suite shares.
 *
 * Excluded from `npm run test:integration` by its file name: see the `capture-screenshots:desktop` project in
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
  applyObsidianTheme,
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

const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;
const RENDER_TIMEOUT_IN_MILLISECONDS = 60_000;
const POLL_INTERVAL_IN_MILLISECONDS = 250;

/**
 * Time for the explorer and the note to finish laying out after their content is ready.
 */
const SETTLE_DELAY_IN_MILLISECONDS = 1000;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

/**
 * The part of Electron's `BrowserWindow` the capture sizes the window with.
 */
interface ElectronBrowserWindow {
  readonly setContentSize: (width: number, height: number) => void;
}

/**
 * Electron's remote module, which reaches the main-process window from the renderer.
 */
interface ElectronRemote {
  readonly getCurrentWindow: () => ElectronBrowserWindow;
}

/**
 * The desktop renderer's window, which can load Electron's remote module.
 */
interface ElectronWindow extends Window {
  readonly require: (id: '@electron/remote') => ElectronRemote;
}

/*
 * `applyObsidianTheme` rather than a bare `app.changeTheme('obsidian')`: that only schedules the config save, and a
 * config reload landing first drops the theme, so every frame would come out light.
 */
beforeAll(async () => {
  await applyObsidianTheme({ theme: 'dark', vaultPath: vaultPath() });
  await evalInObsidian({
    async callback({ app, heightInPixels, lib, widthInPixels }): Promise<void> {
      const { waitUntil } = lib;

      /*
       * The capture pins its viewport only for the length of the frame, so a window of any other size lays the
       * explorer out twice: once when it is staged and again when it is shot.
       */
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 500;
      const browserWindow = (activeWindow as ElectronWindow).require('@electron/remote').getCurrentWindow();

      // The window's viewport and its content size differ by a border, which the second call takes off.
      browserWindow.setContentSize(widthInPixels, heightInPixels);
      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);
      browserWindow.setContentSize(
        2 * widthInPixels - activeWindow.innerWidth,
        2 * heightInPixels - activeWindow.innerHeight
      );
      await waitUntil({
        message: 'the window to take the frame size',
        predicate: () => activeWindow.innerWidth === widthInPixels && activeWindow.innerHeight === heightInPixels
      });

      // Each note opens with its own `# H1`, so the inline title would print every name twice.
      app.vault.setConfig('showInlineTitle', false);
      // The frames are about the left sidebar, and the note needs the room.
      app.workspace.rightSplit.collapse();
    },
    input: { heightInPixels: HEIGHT_IN_PIXELS, widthInPixels: WIDTH_IN_PIXELS },
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
});

describe('desktop store screenshots', () => {
  it('1 - selection mode', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('selection-mode', '01 Selection mode.md', '2 files, 1 folder')).toBe('2 files, 1 folder');
    await shoot(1, 'Selection mode: tick rows, then act on them all');
  });

  it('2 - the selection count', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('selection-count', '03 Selection count.md', '4 files, 1 folder')).toBe('4 files, 1 folder');
    await shoot(2, 'The status bar counts the files and folders you selected');
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
 * Captures the window, captions it, and writes it as `images/screenshots/screenshot-desktop-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({
    heightInPixels: HEIGHT_IN_PIXELS,
    vaultPath: vaultPath(),
    widthInPixels: WIDTH_IN_PIXELS
  });

  // Captioned after capture, so the frame stays an untouched window shot and rewording a label needs no re-shoot.
  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
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
