import type {
  FileExplorerView,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type { WorkspaceLeaf } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

// Android-only: the long-press that enters selection mode is the phone's gesture; desktop keeps its right
// Click for the context menu.
// Isolation: `npx vitest run --project integration-tests:android src/long-press-selection-mode.android.integration.test.ts`.
// Each closure keeps its waits under the transport's 30 s cap, so the flow is split across closures.

interface LongPressResult {
  readonly afterFirstLongPress: LongPressSnapshot;
  readonly afterSecondLongPress: LongPressSnapshot;
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
  it('enters selection mode with the row selected, then leaves the next long-press to core\'s menu', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { clickElement, pressKey, waitUntil } }): Promise<LongPressResult> {
        const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;
        const FOLDER = 'ems-long-press';
        // Long enough for core's menu to have opened, had the long-press reached it.
        const MENU_WINDOW_IN_MILLISECONDS = 1000;
        const path = `${FOLDER}/note.md`;

        await app.vault.createFolder(FOLDER);
        await app.vault.create(path, 'note');
        const view = await showExplorer();

        await longPress();
        await waitFor('selection mode', () => isActive() && view.tree.selectedDoms.size === 1);
        await sleep(MENU_WINDOW_IN_MILLISECONDS);
        const afterFirstLongPress = snapshot();

        await longPress();
        await waitFor('core\'s menu', () => hasMenu());
        const afterSecondLongPress = snapshot();
        await pressKey({ key: 'Escape' });
        await waitFor('the menu to close', () => !hasMenu());
        app.commands.executeCommandById('explorer-multi-select:toggle-selection-mode');
        await waitFor('selection mode to end', () => !isActive());

        return { afterFirstLongPress, afterSecondLongPress };

        function getExplorerLeaf(): WorkspaceLeaf {
          const explorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
          if (!explorerLeaf) {
            throw new Error('No File explorer leaf.');
          }
          return explorerLeaf;
        }

        function hasMenu(): boolean {
          return document.querySelector('.menu') !== null;
        }

        function isActive(): boolean {
          return view.containerEl.hasClass('explorer-multi-select-selection-mode');
        }

        async function longPress(): Promise<void> {
          const item = view.fileItems[path];
          if (!item) {
            throw new Error(`No row for ${path}.`);
          }
          // A phone closes the sidebar whenever a menu opens over it.
          app.workspace.leftSplit.expand();
          await app.workspace.revealLeaf(getExplorerLeaf());
          await waitFor('the explorer on screen', () => !app.workspace.leftSplit.collapsed && view.containerEl.getBoundingClientRect().width > 0);
          // The tree renders only the rows in view.
          view.tree.setFocusedItem(item, true);
          await waitFor(`${path} in view`, () => item.selfEl.isConnected && item.selfEl.getBoundingClientRect().height > 0);
          // On mobile the right button is the long-press that opens core's context menu.
          await clickElement({ button: 'right', element: item.selfEl });
        }

        async function showExplorer(): Promise<FileExplorerView> {
          const leaf = getExplorerLeaf();
          await leaf.loadIfDeferred();
          await app.workspace.revealLeaf(leaf);
          const explorerView = leaf.view as FileExplorerView;
          await waitFor('the row', () => explorerView.fileItems[path] !== undefined);
          await (explorerView.fileItems[FOLDER] as FolderTreeItem).setCollapsed(false);
          return explorerView;
        }

        function snapshot(): LongPressSnapshot {
          return {
            hasMenu: hasMenu(),
            isActive: isActive(),
            paths: [...view.tree.selectedDoms].map((item) => item.file.path).sort()
          };
        }

        async function waitFor(step: string, isReady: () => boolean): Promise<void> {
          try {
            await waitUntil({ predicate: isReady, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
          } catch (error) {
            throw new Error(`Timed out waiting for ${step}. collapsed=${String(app.workspace.leftSplit.collapsed)} modal=${String(document.querySelector('.modal-container') !== null)} menu=${String(document.querySelector('.menu') !== null)}`, { cause: error });
          }
        }
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.afterFirstLongPress).toEqual({ hasMenu: false, isActive: true, paths: ['ems-long-press/note.md'] });
    expect(result.afterSecondLongPress.hasMenu).toBe(true);
    expect(result.afterSecondLongPress.isActive).toBe(true);
  });

  it('leaves the long-press to core\'s menu while its setting is off', async () => {
    const settingOff = await toggleSetting();
    expect(settingOff.isEnabled).toBe(false);

    try {
      const result = await evalInObsidian({
        async callback({ app, lib: { clickElement, pressKey, waitUntil } }): Promise<LongPressSnapshot> {
          const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;
          // How long the phone's drawer takes to slide out.
          const DRAWER_ANIMATION_IN_MILLISECONDS = 1000;
          const FOLDER = 'ems-long-press-off';
          const path = `${FOLDER}/note.md`;

          await app.vault.createFolder(FOLDER);
          await app.vault.create(path, 'note');
          const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
          if (!leaf) {
            throw new Error('No File explorer leaf.');
          }
          await leaf.loadIfDeferred();
          const view = leaf.view as FileExplorerView;
          await waitFor('the row', () => view.fileItems[path] !== undefined);
          await (view.fileItems[FOLDER] as FolderTreeItem).setCollapsed(false);
          const item = view.fileItems[path];
          if (!item) {
            throw new Error(`No row for ${path}.`);
          }

          // A phone closes the sidebar whenever a menu opens over it, and the previous test's menu can leave it
          // Marked open while its drawer is hidden; closing it first resets both.
          app.workspace.leftSplit.collapse();
          await waitFor('the sidebar to close', () => app.workspace.leftSplit.collapsed);
          await sleep(DRAWER_ANIMATION_IN_MILLISECONDS);
          app.workspace.leftSplit.expand();
          await app.workspace.revealLeaf(leaf);
          await waitFor('the explorer on screen', () => !app.workspace.leftSplit.collapsed && view.containerEl.getBoundingClientRect().width > 0);
          // The tree renders only the rows in view.
          view.tree.setFocusedItem(item, true);
          await waitFor(`${path} in view`, () => item.selfEl.isConnected && item.selfEl.getBoundingClientRect().height > 0);
          await clickElement({ button: 'right', element: item.selfEl });
          await waitFor('core\'s menu', () => document.querySelector('.menu') !== null);
          const snapshot: LongPressSnapshot = {
            hasMenu: true,
            isActive: view.containerEl.hasClass('explorer-multi-select-selection-mode'),
            paths: [...view.tree.selectedDoms].map((selectedItem) => selectedItem.file.path)
          };
          await pressKey({ key: 'Escape' });
          await waitFor('the menu to close', () => document.querySelector('.menu') === null);
          return snapshot;

          async function waitFor(step: string, isReady: () => boolean): Promise<void> {
            try {
              await waitUntil({ predicate: isReady, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
            } catch (error) {
              throw new Error(`Timed out waiting for ${step}. collapsed=${String(app.workspace.leftSplit.collapsed)} modal=${String(document.querySelector('.modal-container') !== null)} menu=${String(document.querySelector('.menu') !== null)}`, { cause: error });
            }
          }
        },
        vaultPath: getTemporaryVault().path
      });

      expect(result).toEqual({ hasMenu: true, isActive: false, paths: [] });
    } finally {
      const settingOn = await toggleSetting();
      expect(settingOn.isEnabled).toBe(true);
    }
  });
});

async function toggleSetting(): Promise<SettingResult> {
  return evalInObsidian({
    async callback({ app, lib: { clickElement, openSettingsTab, waitUntil } }): Promise<SettingResult> {
      const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;
      const SETTING_NAME = 'Long-press enters selection mode';
      await openSettingsTab({ tabId: 'explorer-multi-select' });
      const settingItemEl = [...document.querySelectorAll('.setting-item')]
        .find((el) => el.querySelector('.setting-item-name')?.textContent === SETTING_NAME);
      const toggleEl = settingItemEl?.querySelector('.checkbox-container');
      if (!(toggleEl instanceof HTMLElement)) {
        throw new TypeError(`No toggle for ${SETTING_NAME}.`);
      }
      const wasEnabled = toggleEl.hasClass('is-enabled');
      await clickElement({ element: toggleEl });
      await waitUntil({ predicate: () => toggleEl.hasClass('is-enabled') !== wasEnabled, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
      const isEnabled = toggleEl.hasClass('is-enabled');
      app.setting.close();
      // The settings modal animates out; the next closure taps where it was.
      await waitUntil({ predicate: () => document.querySelector('.modal-container') === null, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
      return { isEnabled };
    },
    vaultPath: getTemporaryVault().path
  });
}
