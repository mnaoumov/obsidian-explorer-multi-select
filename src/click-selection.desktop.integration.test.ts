import type {
  FileExplorerView,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type { Modifier } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

// Desktop-only: Ctrl/Cmd-click needs a hardware keyboard, and the settings are about mouse clicks.
// Isolation: `npx vitest run --project integration-tests:desktop src/click-selection.desktop.integration.test.ts`.

interface ClickResult {
  readonly activeFilePathAfterCtrlClicks: null | string;
  readonly activeFilePathAfterPlainClick: null | string;
  readonly activeFilePathBefore: null | string;
  readonly afterCtrlClickAgain: string[];
  readonly afterCtrlClicks: string[];
  readonly afterPlainClick: string[];
}

interface SettingResult {
  readonly isEnabled: boolean;
}

const MOD_CLICK_SETTING_NAME = 'Ctrl/Cmd-click toggles the selection';
const STICKY_SETTING_NAME = 'Keep the selection when a click opens a file';

describe('click selection in the File explorer', () => {
  it('toggles rows on Ctrl/Cmd-click and keeps the selection through a plain click, when the settings are on', async () => {
    expect(await isSettingEnabledAfterToggle(MOD_CLICK_SETTING_NAME)).toBe(true);
    expect(await isSettingEnabledAfterToggle(STICKY_SETTING_NAME)).toBe(true);

    let result: ClickResult;
    try {
      result = await evalInObsidian({
        async callback({ app, lib: { clickElement, waitUntil } }): Promise<ClickResult> {
          // Eight waits share the transport's 30 s cap per closure; each settles in well under a second.
          const WAIT_TIMEOUT_IN_MILLISECONDS = 2500;
          const FOLDER = 'ems-click';

          await app.vault.createFolder(FOLDER);
          for (const name of ['a', 'b', 'c']) {
            await app.vault.create(`${FOLDER}/${name}.md`, name);
          }

          const view = await revealExplorer();
          await waitFor('the rows', () => view.fileItems[`${FOLDER}/c.md`] !== undefined);
          await (view.fileItems[FOLDER] as FolderTreeItem).setCollapsed(false);
          const activeFilePathBefore = getActiveFilePath();

          await clickRow(`${FOLDER}/a.md`, ['Mod'], () => view.tree.selectedDoms.size === 1);
          await clickRow(`${FOLDER}/b.md`, ['Mod'], () => view.tree.selectedDoms.size === 2);
          const afterModuleClicks = getSelectedPaths();
          const activeFilePathAfterModuleClicks = getActiveFilePath();

          await clickRow(`${FOLDER}/a.md`, ['Mod'], () => view.tree.selectedDoms.size === 1);
          const afterModuleClickAgain = getSelectedPaths();

          const cPath = `${FOLDER}/c.md`;
          // Core's `onFileOpen` moves `is-active` to the opened row, after it would have cleared the selection.
          await clickRow(cPath, [], () => view.fileItems[cPath]?.selfEl.hasClass('is-active') === true);
          const afterPlainClick = getSelectedPaths();
          const activeFilePathAfterPlainClick = getActiveFilePath();

          return {
            activeFilePathAfterCtrlClicks: activeFilePathAfterModuleClicks,
            activeFilePathAfterPlainClick,
            activeFilePathBefore,
            afterCtrlClickAgain: afterModuleClickAgain,
            afterCtrlClicks: afterModuleClicks,
            afterPlainClick
          };

          async function clickRow(path: string, modifiers: Modifier[], isDone: () => boolean): Promise<void> {
            const item = view.fileItems[path];
            if (!item) {
              throw new Error(`No row for ${path}.`);
            }
            // The tree renders only the rows in view.
            view.tree.setFocusedItem(item, true);
            await waitFor(`${path} in view`, () => item.selfEl.isConnected && item.selfEl.getBoundingClientRect().height > 0);
            await clickElement({ element: item.selfEl, modifiers });
            await waitFor(`the click on ${path}`, isDone);
          }

          function getActiveFilePath(): null | string {
            return app.workspace.getActiveFile()?.path ?? null;
          }

          function getSelectedPaths(): string[] {
            return [...view.tree.selectedDoms].map((item) => item.file.path).sort();
          }

          async function revealExplorer(): Promise<FileExplorerView> {
            const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
            if (!leaf) {
              throw new Error('No File explorer leaf.');
            }
            await leaf.loadIfDeferred();
            await app.workspace.revealLeaf(leaf);
            return leaf.view as FileExplorerView;
          }

          async function waitFor(step: string, isReady: () => boolean): Promise<void> {
            try {
              await waitUntil({ predicate: isReady, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
            } catch (error) {
              throw new Error(`Timed out waiting for ${step}.`, { cause: error });
            }
          }
        },
        vaultPath: getTemporaryVault().path
      });
    } finally {
      expect(await isSettingEnabledAfterToggle(MOD_CLICK_SETTING_NAME)).toBe(false);
      expect(await isSettingEnabledAfterToggle(STICKY_SETTING_NAME)).toBe(false);
    }

    const afterPlainClickWithStickyOff = await evalInObsidian({
      async callback({ app, lib: { clickElement, waitUntil } }): Promise<string[]> {
        const WAIT_TIMEOUT_IN_MILLISECONDS = 2500;
        const FOLDER = 'ems-click';
        const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
        if (!leaf) {
          throw new Error('No File explorer leaf.');
        }
        await app.workspace.revealLeaf(leaf);
        const view = leaf.view as FileExplorerView;
        const a = view.fileItems[`${FOLDER}/a.md`];
        const b = view.fileItems[`${FOLDER}/b.md`];
        if (!a || !b) {
          throw new Error('No rows for a.md and b.md.');
        }
        view.tree.selectItem(b);
        view.tree.setFocusedItem(a, true);
        await waitUntil({ predicate: () => a.selfEl.isConnected && a.selfEl.getBoundingClientRect().height > 0, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
        await clickElement({ element: a.selfEl });
        await waitUntil({ predicate: () => a.selfEl.hasClass('is-active'), timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
        const selectedPaths = [...view.tree.selectedDoms].map((item) => item.file.path);

        // The other suites share this vault and expect no note to be open.
        for (const markdownLeaf of app.workspace.getLeavesOfType('markdown')) {
          markdownLeaf.detach();
        }
        view.tree.clearSelectedDoms();
        return selectedPaths;
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.afterCtrlClicks).toEqual(['ems-click/a.md', 'ems-click/b.md']);
    expect(result.activeFilePathAfterCtrlClicks).toBe(result.activeFilePathBefore);
    expect(result.afterCtrlClickAgain).toEqual(['ems-click/b.md']);
    expect(result.activeFilePathAfterPlainClick).toBe('ems-click/c.md');
    expect(result.afterPlainClick).toEqual(['ems-click/b.md']);
    expect(afterPlainClickWithStickyOff).toEqual([]);
  });
});

async function isSettingEnabledAfterToggle(settingName: string): Promise<boolean> {
  const result = await evalInObsidian({
    async callback({ app, lib: { clickElement, openSettingsTab, waitUntil }, name }): Promise<SettingResult> {
      const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;
      await openSettingsTab({ tabId: 'explorer-multi-select' });
      const settingItemEl = [...document.querySelectorAll('.setting-item')]
        .find((el) => el.querySelector('.setting-item-name')?.textContent === name);
      const toggleEl = settingItemEl?.querySelector('.checkbox-container');
      if (!(toggleEl instanceof HTMLElement)) {
        throw new TypeError(`No toggle for ${name}.`);
      }
      const wasEnabled = toggleEl.hasClass('is-enabled');
      await clickElement({ element: toggleEl });
      await waitUntil({ predicate: () => toggleEl.hasClass('is-enabled') !== wasEnabled, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
      const isEnabled = toggleEl.hasClass('is-enabled');
      app.setting.close();
      // The settings modal animates out; the next closure clicks where it was.
      await waitUntil({ predicate: () => document.querySelector('.modal-container') === null, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
      return { isEnabled };
    },
    input: { name: settingName },
    vaultPath: getTemporaryVault().path
  });
  return result.isEnabled;
}
