import type {
  FileExplorerView,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type { CommonArguments } from 'obsidian-integration-testing';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';

import {
  resetDrawer,
  resetExplorerState
} from './test-helpers/explorer-state.test.helper.ts';

// Android-only: the long-press that enters selection mode is the phone's gesture; desktop keeps its right
// Click for the context menu.
// Isolation: `npx vitest run --project integration-tests:android src/long-press-selection-mode.android.integration.test.ts`.
// Each closure keeps its waits under the transport's 30 s cap, so each long-press runs in a closure of its own.

interface LongPressInput {
  // What the long-press must lead to: core's menu, or the selection mode with the row selected.
  readonly expected: 'menu' | 'selection-mode';
  readonly path: string;
}

interface LongPressSnapshot {
  readonly hasMenu: boolean;
  readonly isActive: boolean;
  readonly paths: string[];
}

interface SettingResult {
  readonly isEnabled: boolean;
}

describe('long-press selection mode in the File explorer', () => {
  afterEach(async () => {
    await evalInObsidian({ callback: resetExplorerState, vaultPath: getTemporaryVault().path });
  });

  it('enters selection mode with the row selected, then leaves the next long-press to core\'s menu', async () => {
    const path = 'ems-long-press/note.md';
    await evalInObsidian({ callback: resetDrawer, vaultPath: getTemporaryVault().path });
    const afterFirstLongPress = await evalInObsidian({
      callback: longPressRow,
      input: { expected: 'selection-mode', path } satisfies LongPressInput,
      vaultPath: getTemporaryVault().path
    });
    const afterSecondLongPress = await evalInObsidian({
      callback: longPressRow,
      input: { expected: 'menu', path } satisfies LongPressInput,
      vaultPath: getTemporaryVault().path
    });

    expect(afterFirstLongPress).toEqual({ hasMenu: false, isActive: true, paths: [path] });
    expect(afterSecondLongPress.hasMenu).toBe(true);
    expect(afterSecondLongPress.isActive).toBe(true);
  });

  it('leaves the long-press to core\'s menu while its setting is off', async () => {
    try {
      const settingOff = await setSetting(false);
      expect(settingOff.isEnabled).toBe(false);

      await evalInObsidian({ callback: resetDrawer, vaultPath: getTemporaryVault().path });
      const result = await evalInObsidian({
        callback: longPressRow,
        input: { expected: 'menu', path: 'ems-long-press-off/note.md' } satisfies LongPressInput,
        vaultPath: getTemporaryVault().path
      });

      expect(result).toEqual({ hasMenu: true, isActive: false, paths: [] });
    } finally {
      const settingOn = await setSetting(true);
      expect(settingOn.isEnabled).toBe(true);
    }
  });
});

// Creates the note when it is missing, long-presses its row and returns what the long-press led to. Core's menu is
// Closed again after the snapshot.
//
// Under load the emulator can read the long-press gesture as a plain tap: no menu opens, and a plain tap on a file
// Opens it and shuts the drawer. A long-press whose outcome does not appear is therefore made once more, with the
// Drawer opened again first.
// TODO: Drop the retry once `obsidian-integration-testing` delivers a long-press as one, or reports one that fired no
// `contextmenu`.
async function longPressRow({ app, expected, lib: { clickElement, pressKey, waitUntil }, path }: CommonArguments & LongPressInput): Promise<LongPressSnapshot> {
  const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;
  const LONG_PRESS_ATTEMPTS = 2;
  // Long enough for core's menu to have opened, had the long-press reached it.
  const MENU_WINDOW_IN_MILLISECONDS = 1000;
  const SELECTION_MODE_CLASS = 'explorer-multi-select-selection-mode';
  const folderPath = path.slice(0, path.lastIndexOf('/'));
  let lastRowLeft = NaN;
  let lastRowTop = NaN;

  if (app.vault.getAbstractFileByPath(folderPath) === null) {
    await app.vault.createFolder(folderPath);
  }
  if (app.vault.getAbstractFileByPath(path) === null) {
    await app.vault.create(path, 'note');
  }
  const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
  if (!leaf) {
    throw new Error('No File explorer leaf.');
  }
  await leaf.loadIfDeferred();
  const view = leaf.view as FileExplorerView;
  await waitFor('the row', () => view.fileItems[path] !== undefined);
  await (view.fileItems[folderPath] as FolderTreeItem).setCollapsed(false);
  const item = view.fileItems[path];
  if (!item) {
    throw new Error(`No row for ${path}.`);
  }

  for (let attempt = 1; attempt <= LONG_PRESS_ATTEMPTS; attempt++) {
    // A phone closes the sidebar whenever a menu opens over it, or when a tap opens a file.
    app.workspace.leftSplit.expand();
    await app.workspace.revealLeaf(leaf);
    await waitFor('the explorer on screen', () => !app.workspace.leftSplit.collapsed && view.containerEl.getBoundingClientRect().width > 0);
    // The tree renders only the rows in view.
    view.tree.setFocusedItem(item, true);
    await waitFor(`${path} in view and still`, () => isRowInViewAndStill(item.selfEl));
    // On mobile the right button is the long-press that opens core's context menu.
    await clickElement({ button: 'right', element: item.selfEl });
    try {
      await waitFor(expected === 'menu' ? 'core\'s menu' : 'selection mode', isOutcomeShown);
      break;
    } catch (error) {
      if (attempt === LONG_PRESS_ATTEMPTS) {
        throw new Error(`The long-press did not lead to ${expected} in ${String(LONG_PRESS_ATTEMPTS)} attempts.`, { cause: error });
      }
    }
  }

  if (expected === 'selection-mode') {
    await sleep(MENU_WINDOW_IN_MILLISECONDS);
  }
  const snapshot: LongPressSnapshot = {
    hasMenu: hasMenu(),
    isActive: isActive(),
    paths: [...view.tree.selectedDoms].map((selectedItem) => selectedItem.file.path).sort()
  };
  if (hasMenu()) {
    await pressKey({ key: 'Escape' });
    await waitFor('the menu to close', () => !hasMenu());
  }
  return snapshot;

  function hasMenu(): boolean {
    return document.querySelector('.menu') !== null;
  }

  function isActive(): boolean {
    return view.containerEl.hasClass(SELECTION_MODE_CLASS);
  }

  function isOutcomeShown(): boolean {
    return expected === 'menu' ? hasMenu() : isActive() && view.tree.selectedDoms.size === 1;
  }

  // A row in a drawer that is still sliding moves between two polls, and a long-press there can miss it.
  function isRowInViewAndStill(rowEl: HTMLElement): boolean {
    if (!rowEl.isConnected) {
      return false;
    }
    const rect = rowEl.getBoundingClientRect();
    const isStill = rect.height > 0 && rect.left === lastRowLeft && rect.top === lastRowTop;
    lastRowLeft = rect.left;
    lastRowTop = rect.top;
    return isStill;
  }

  async function waitFor(step: string, isReady: () => boolean): Promise<void> {
    try {
      await waitUntil({ predicate: isReady, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
    } catch (error) {
      throw new Error(`Timed out waiting for ${step}. collapsed=${String(app.workspace.leftSplit.collapsed)} modal=${String(document.querySelector('.modal-container') !== null)} menu=${String(hasMenu())}`, { cause: error });
    }
  }
}

// Sets the toggle rather than flipping it, so a retry after a failure cannot invert it. A tap on the phone can be
// Lost while the settings modal slides in, so a toggle that did not move is tapped once more.
async function setSetting(shouldEnable: boolean): Promise<SettingResult> {
  return evalInObsidian({
    async callback({ app, lib: { clickElement, openSettingsTab, waitUntil }, shouldEnable: shouldEnableInObsidian }): Promise<SettingResult> {
      const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;
      const TAP_ATTEMPTS = 2;
      const SETTING_NAME = 'Long-press enters selection mode';
      let result: null | SettingResult = null;
      let toggleError: Error | null = null;
      try {
        result = await applySetting();
      } catch (error) {
        toggleError = error instanceof Error ? error : new Error(String(error));
      }

      // Closed even when the toggle failed: left open, the settings modal covers the explorer, and every later test
      // Taps it instead of a row.
      app.setting.close();
      try {
        // The settings modal animates out; the next closure taps where it was.
        await waitUntil({ predicate: () => document.querySelector('.modal-container') === null, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
      } catch (error) {
        const toggleMessage = toggleError === null ? '' : ` The toggle failed first: ${toggleError.message}`;
        throw new Error(`Timed out waiting for the settings modal to close.${toggleMessage}`, { cause: error });
      }
      if (toggleError !== null) {
        throw toggleError;
      }
      if (result === null) {
        throw new Error('The setting was applied without a result.');
      }
      return result;

      async function applySetting(): Promise<SettingResult> {
        await openSettingsTab({ tabId: 'explorer-multi-select' });
        const settingItemEl = [...document.querySelectorAll('.setting-item')]
          .find((el) => el.querySelector('.setting-item-name')?.textContent === SETTING_NAME);
        const toggleEl = settingItemEl?.querySelector('.checkbox-container');
        if (!(toggleEl instanceof HTMLElement)) {
          throw new TypeError(`No toggle for ${SETTING_NAME}.`);
        }
        for (let attempt = 1; attempt <= TAP_ATTEMPTS && toggleEl.hasClass('is-enabled') !== shouldEnableInObsidian; attempt++) {
          await clickElement({ element: toggleEl });
          try {
            await waitUntil({ predicate: () => toggleEl.hasClass('is-enabled') === shouldEnableInObsidian, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
          } catch (error) {
            if (attempt === TAP_ATTEMPTS) {
              throw new Error(`Timed out waiting for the ${SETTING_NAME} toggle to turn ${shouldEnableInObsidian ? 'on' : 'off'} after ${String(TAP_ATTEMPTS)} taps.`, { cause: error });
            }
          }
        }
        return { isEnabled: toggleEl.hasClass('is-enabled') };
      }
    },
    input: { shouldEnable },
    vaultPath: getTemporaryVault().path
  });
}
