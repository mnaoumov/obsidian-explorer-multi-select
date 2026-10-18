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

// Cross-platform: selection mode is the plugin's touch UI, so it must hold on the phone as on desktop.
// Isolation: `npx vitest run --project integration-tests:desktop src/selection-mode.cross-platform.integration.test.ts`.
// Each closure keeps its waits under the transport's 30 s cap, so a longer flow is split across closures.

interface ActionResult {
  readonly isDone: boolean;
}

interface ModeSnapshot {
  readonly countText: null | string;
  readonly hasCheckbox: boolean;
  readonly isActive: boolean;
  readonly paths: string[];
}

interface MoreAndDeleteResult {
  readonly deletedPathExists: boolean;
  readonly hasMenuAfterMore: boolean;
}

interface TapResult {
  readonly activeFilePathAfterTaps: null | string;
  readonly activeFilePathBefore: null | string;
  readonly afterFolderTap: ModeSnapshot;
  readonly afterInvert: ModeSnapshot;
  readonly afterSelectAll: ModeSnapshot;
  readonly afterTapAgain: ModeSnapshot;
  readonly afterTaps: ModeSnapshot;
  readonly afterToggle: ModeSnapshot;
}

interface TurnOffResult {
  readonly afterCommandOff: ModeSnapshot;
  readonly afterCommandOn: ModeSnapshot;
  readonly afterDone: ModeSnapshot;
  readonly hasActionBarAfterDone: boolean;
}

const OFF: ModeSnapshot = { countText: null, hasCheckbox: false, isActive: false, paths: [] };

describe('selection mode in the File explorer', () => {
  it('turns on from the header button, toggles rows on tap, counts, selects all, inverts and turns off', async () => {
    const tapResult = await evalInObsidian({
      async callback({ app, lib: { clickElement, waitUntil } }): Promise<TapResult> {
        const WAIT_TIMEOUT_IN_MILLISECONDS = 1500;
        const FOLDER = 'ems-mode';

        await app.vault.createFolder(FOLDER);
        await app.vault.createFolder(`${FOLDER}/sub`);
        for (const name of ['a', 'b']) {
          await app.vault.create(`${FOLDER}/${name}.md`, name);
        }

        const leaf = getExplorerLeaf();
        await leaf.loadIfDeferred();
        await app.workspace.revealLeaf(leaf);
        const view = leaf.view as FileExplorerView;
        await waitFor('the rows', () => view.fileItems[`${FOLDER}/b.md`] !== undefined && view.fileItems[`${FOLDER}/sub`] !== undefined);
        await (view.fileItems[FOLDER] as FolderTreeItem).setCollapsed(false);
        const activeFilePathBefore = app.workspace.getActiveFile()?.path ?? null;

        await clickElement({ element: getElement('.explorer-multi-select-toggle-button') });
        await waitFor('selection mode', () => isActive());
        const afterToggle = snapshot();

        await tap(`${FOLDER}/a.md`, 1);
        await tap(`${FOLDER}/b.md`, 2);
        const afterTaps = snapshot();
        const activeFilePathAfterTaps = app.workspace.getActiveFile()?.path ?? null;

        await tap(`${FOLDER}/a.md`, 1);
        const afterTapAgain = snapshot();

        await tap(`${FOLDER}/sub`, 2);
        const afterFolderTap = snapshot();

        await clickElement({ element: getElement('[data-action="select-all"]') });
        await waitFor('select all', () => view.tree.selectedDoms.size > 2);
        const afterSelectAll = snapshot();

        await clickElement({ element: getElement('[data-action="invert"]') });
        await waitFor('invert', () => view.tree.selectedDoms.size === 0);
        const afterInvert = snapshot();

        return { activeFilePathAfterTaps, activeFilePathBefore, afterFolderTap, afterInvert, afterSelectAll, afterTapAgain, afterTaps, afterToggle };

        function getElement(selector: string): HTMLElement {
          const el = view.containerEl.querySelector(selector);
          if (!(el instanceof HTMLElement)) {
            throw new TypeError(`No element matches ${selector}.`);
          }
          return el;
        }

        function getExplorerLeaf(): WorkspaceLeaf {
          const explorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
          if (!explorerLeaf) {
            throw new Error('No File explorer leaf.');
          }
          return explorerLeaf;
        }

        function isActive(): boolean {
          return view.containerEl.hasClass('explorer-multi-select-selection-mode');
        }

        function snapshot(): ModeSnapshot {
          const firstRowEl = view.fileItems[`${FOLDER}/a.md`]?.selfEl ?? null;
          return {
            countText: view.containerEl.querySelector('.explorer-multi-select-action-bar-count')?.textContent ?? null,
            hasCheckbox: firstRowEl !== null && getComputedStyle(firstRowEl, '::before').content === '""',
            isActive: isActive(),
            paths: [...view.tree.selectedDoms].map((item) => item.file.path).sort()
          };
        }

        async function tap(path: string, expectedSize: number): Promise<void> {
          const item = view.fileItems[path];
          if (!item) {
            throw new Error(`No row for ${path}.`);
          }
          await revealExplorer();
          // The tree renders only the rows in view.
          view.tree.setFocusedItem(item, true);
          await waitFor(`${path} in view`, () => item.selfEl.isConnected && item.selfEl.getBoundingClientRect().height > 0);
          await clickElement({ element: item.selfEl });
          await waitFor(`the tap on ${path}`, () => view.tree.selectedDoms.size === expectedSize);
        }

        async function revealExplorer(): Promise<void> {
          // A phone closes the sidebar whenever a menu or a modal opens over it.
          app.workspace.leftSplit.expand();
          await app.workspace.revealLeaf(getExplorerLeaf());
          await waitFor('the explorer on screen', () => !app.workspace.leftSplit.collapsed && view.containerEl.getBoundingClientRect().width > 0);
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

    const turnOffResult = await evalInObsidian({
      async callback({ app, lib: { clickElement, waitUntil } }): Promise<TurnOffResult> {
        const WAIT_TIMEOUT_IN_MILLISECONDS = 2000;
        const FOLDER = 'ems-mode';

        const leaf = getExplorerLeaf();
        await app.workspace.revealLeaf(leaf);
        const view = leaf.view as FileExplorerView;

        const item = view.fileItems[`${FOLDER}/b.md`];
        if (!item) {
          throw new Error('No row for b.md.');
        }
        await revealExplorer();
        view.tree.setFocusedItem(item, true);
        await waitFor('b.md in view', () => item.selfEl.isConnected && item.selfEl.getBoundingClientRect().height > 0);
        await clickElement({ element: item.selfEl });
        await waitFor('the tap on b.md', () => view.tree.selectedDoms.size === 1);

        const doneButtonEl = view.containerEl.querySelector('.explorer-multi-select-action-bar-done');
        if (!(doneButtonEl instanceof HTMLElement)) {
          throw new TypeError('No Done button.');
        }
        await clickElement({ element: doneButtonEl });
        await waitFor('selection mode to end', () => !isActive());
        const afterDone = snapshot();
        const hasActionBarAfterDone = view.containerEl.querySelector('.explorer-multi-select-action-bar') !== null;

        app.commands.executeCommandById('explorer-multi-select:toggle-selection-mode');
        await waitFor('selection mode from the command', () => isActive());
        const afterCommandOn = snapshot();
        app.commands.executeCommandById('explorer-multi-select:toggle-selection-mode');
        await waitFor('selection mode to end from the command', () => !isActive());
        const afterCommandOff = snapshot();

        return { afterCommandOff, afterCommandOn, afterDone, hasActionBarAfterDone };

        function getExplorerLeaf(): WorkspaceLeaf {
          const explorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
          if (!explorerLeaf) {
            throw new Error('No File explorer leaf.');
          }
          return explorerLeaf;
        }

        function isActive(): boolean {
          return view.containerEl.hasClass('explorer-multi-select-selection-mode');
        }

        function snapshot(): ModeSnapshot {
          const firstRowEl = view.fileItems[`${FOLDER}/a.md`]?.selfEl ?? null;
          return {
            countText: view.containerEl.querySelector('.explorer-multi-select-action-bar-count')?.textContent ?? null,
            hasCheckbox: firstRowEl !== null && getComputedStyle(firstRowEl, '::before').content === '""',
            isActive: isActive(),
            paths: [...view.tree.selectedDoms].map((selectedItem) => selectedItem.file.path).sort()
          };
        }

        async function revealExplorer(): Promise<void> {
          // A phone closes the sidebar whenever a menu or a modal opens over it.
          app.workspace.leftSplit.expand();
          await app.workspace.revealLeaf(getExplorerLeaf());
          await waitFor('the explorer on screen', () => !app.workspace.leftSplit.collapsed && view.containerEl.getBoundingClientRect().width > 0);
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

    expect(tapResult.afterToggle).toEqual({ countText: 'Nothing selected', hasCheckbox: true, isActive: true, paths: [] });
    expect(tapResult.afterTaps).toEqual({ countText: '2 files', hasCheckbox: true, isActive: true, paths: ['ems-mode/a.md', 'ems-mode/b.md'] });
    expect(tapResult.activeFilePathAfterTaps).toBe(tapResult.activeFilePathBefore);
    expect(tapResult.afterTapAgain.paths).toEqual(['ems-mode/b.md']);
    expect(tapResult.afterFolderTap).toEqual({ countText: '1 file, 1 folder', hasCheckbox: true, isActive: true, paths: ['ems-mode/b.md', 'ems-mode/sub'] });
    expect(tapResult.afterSelectAll.paths).toEqual(expect.arrayContaining(['ems-mode', 'ems-mode/a.md', 'ems-mode/b.md', 'ems-mode/sub']));
    expect(tapResult.afterInvert).toEqual({ countText: 'Nothing selected', hasCheckbox: true, isActive: true, paths: [] });
    expect(turnOffResult.afterDone).toEqual(OFF);
    expect(turnOffResult.hasActionBarAfterDone).toBe(false);
    expect(turnOffResult.afterCommandOn).toEqual({ countText: 'Nothing selected', hasCheckbox: true, isActive: true, paths: [] });
    expect(turnOffResult.afterCommandOff).toEqual(OFF);
  });

  it('moves the selection through core\'s own move', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { clickElement, pressKey, waitUntil } }): Promise<ActionResult> {
        const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;
        const FOLDER = 'ems-move';

        await app.vault.createFolder(FOLDER);
        await app.vault.createFolder(`${FOLDER}/target`);
        await app.vault.create(`${FOLDER}/note.md`, 'note');
        const view = await enterSelectionMode();

        await tap(`${FOLDER}/note.md`);
        await clickAction('move');
        await waitFor('the move prompt', () => document.querySelector('.prompt-input') instanceof HTMLInputElement);
        const moveInputEl = document.querySelector('.prompt-input');
        if (!(moveInputEl instanceof HTMLInputElement)) {
          throw new TypeError('The move prompt has no input.');
        }
        moveInputEl.value = `${FOLDER}/target`;
        // A notification event, not a simulated user: the suggest modal reads the value on `input`.
        moveInputEl.dispatchEvent(new Event('input'));
        await waitFor('a move suggestion', () => document.querySelector('.suggestion-item.is-selected') !== null);
        await pressKey({ key: 'Enter' });
        await waitFor('the move', () => app.vault.getAbstractFileByPath(`${FOLDER}/target/note.md`) !== null);
        app.commands.executeCommandById('explorer-multi-select:toggle-selection-mode');
        return { isDone: true };

        async function clickAction(action: string): Promise<void> {
          await revealExplorer();
          const el = view.containerEl.querySelector(`[data-action="${CSS.escape(action)}"]`);
          if (!(el instanceof HTMLElement)) {
            throw new TypeError(`No ${action} button.`);
          }
          await clickElement({ element: el });
        }

        async function enterSelectionMode(): Promise<FileExplorerView> {
          const leaf = getExplorerLeaf();
          await leaf.loadIfDeferred();
          await app.workspace.revealLeaf(leaf);
          const explorerView = leaf.view as FileExplorerView;
          await waitFor('the rows', () => explorerView.fileItems[`${FOLDER}/note.md`] !== undefined);
          await (explorerView.fileItems[FOLDER] as FolderTreeItem).setCollapsed(false);
          app.commands.executeCommandById('explorer-multi-select:toggle-selection-mode');
          await waitFor('selection mode', () => explorerView.containerEl.hasClass('explorer-multi-select-selection-mode'));
          return explorerView;
        }

        function getExplorerLeaf(): WorkspaceLeaf {
          const explorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
          if (!explorerLeaf) {
            throw new Error('No File explorer leaf.');
          }
          return explorerLeaf;
        }

        async function tap(path: string): Promise<void> {
          const item = view.fileItems[path];
          if (!item) {
            throw new Error(`No row for ${path}.`);
          }
          await revealExplorer();
          // The tree renders only the rows in view.
          view.tree.setFocusedItem(item, true);
          await waitFor(`${path} in view`, () => item.selfEl.isConnected && item.selfEl.getBoundingClientRect().height > 0);
          await clickElement({ element: item.selfEl });
          await waitFor(`the tap on ${path}`, () => view.tree.selectedDoms.has(item));
        }

        async function revealExplorer(): Promise<void> {
          // A phone closes the sidebar whenever a menu or a modal opens over it.
          app.workspace.leftSplit.expand();
          await app.workspace.revealLeaf(getExplorerLeaf());
          await waitFor('the explorer on screen', () => !app.workspace.leftSplit.collapsed && view.containerEl.getBoundingClientRect().width > 0);
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

    expect(result.isDone).toBe(true);
  });

  it('bookmarks the selection through the Bookmarks plugin\'s own modal', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { clickElement, waitUntil } }): Promise<ActionResult> {
        const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;
        const FOLDER = 'ems-bookmark';
        const PATH = `${FOLDER}/note.md`;

        await app.vault.createFolder(FOLDER);
        await app.vault.create(PATH, 'note');
        const view = await enterSelectionMode();

        await tap(PATH);
        await clickAction('bookmark');
        await waitFor('the bookmark modal', () => document.querySelector('.modal.mod-bookmark .mod-cta') instanceof HTMLElement);
        // The modal focuses its title field, and on a phone the soft keyboard that raises moves the button
        // While the tap is on its way.
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        const saveButtonEl = document.querySelector('.modal.mod-bookmark .mod-cta');
        if (!(saveButtonEl instanceof HTMLElement)) {
          throw new TypeError('The bookmark modal has no Save button.');
        }
        await clickElement({ element: saveButtonEl });
        const bookmarks = app.internalPlugins.getEnabledPluginById('bookmarks');
        await waitFor('the bookmark', () => (bookmarks?.getBookmarks() ?? []).some((bookmark) => bookmark.type === 'file' && bookmark.path === PATH));
        app.commands.executeCommandById('explorer-multi-select:toggle-selection-mode');
        return { isDone: true };

        async function clickAction(action: string): Promise<void> {
          await revealExplorer();
          const el = view.containerEl.querySelector(`[data-action="${CSS.escape(action)}"]`);
          if (!(el instanceof HTMLElement)) {
            throw new TypeError(`No ${action} button.`);
          }
          await clickElement({ element: el });
        }

        async function enterSelectionMode(): Promise<FileExplorerView> {
          const leaf = getExplorerLeaf();
          await leaf.loadIfDeferred();
          await app.workspace.revealLeaf(leaf);
          const explorerView = leaf.view as FileExplorerView;
          await waitFor('the rows', () => explorerView.fileItems[PATH] !== undefined);
          await (explorerView.fileItems[FOLDER] as FolderTreeItem).setCollapsed(false);
          app.commands.executeCommandById('explorer-multi-select:toggle-selection-mode');
          await waitFor('selection mode', () => explorerView.containerEl.hasClass('explorer-multi-select-selection-mode'));
          return explorerView;
        }

        function getExplorerLeaf(): WorkspaceLeaf {
          const explorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
          if (!explorerLeaf) {
            throw new Error('No File explorer leaf.');
          }
          return explorerLeaf;
        }

        async function tap(path: string): Promise<void> {
          const item = view.fileItems[path];
          if (!item) {
            throw new Error(`No row for ${path}.`);
          }
          await revealExplorer();
          // The tree renders only the rows in view.
          view.tree.setFocusedItem(item, true);
          await waitFor(`${path} in view`, () => item.selfEl.isConnected && item.selfEl.getBoundingClientRect().height > 0);
          await clickElement({ element: item.selfEl });
          await waitFor(`the tap on ${path}`, () => view.tree.selectedDoms.has(item));
        }

        async function revealExplorer(): Promise<void> {
          // A phone closes the sidebar whenever a menu or a modal opens over it.
          app.workspace.leftSplit.expand();
          await app.workspace.revealLeaf(getExplorerLeaf());
          await waitFor('the explorer on screen', () => !app.workspace.leftSplit.collapsed && view.containerEl.getBoundingClientRect().width > 0);
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

    expect(result.isDone).toBe(true);
  });

  it('opens core\'s menu for the selection, and deletes it through core\'s delete', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { clickElement, pressKey, waitUntil } }): Promise<MoreAndDeleteResult> {
        const WAIT_TIMEOUT_IN_MILLISECONDS = 2500;
        const FOLDER = 'ems-delete';
        const PATH = `${FOLDER}/note.md`;

        await app.vault.createFolder(FOLDER);
        await app.vault.create(PATH, 'note');
        const view = await enterSelectionMode();

        await tap(PATH);
        await clickAction('more');
        await waitFor('core\'s menu', () => document.querySelector('.menu') !== null);
        const hasMenuAfterMore = document.querySelector('.menu') !== null;
        await pressKey({ key: 'Escape' });
        await waitFor('the menu to close', () => document.querySelector('.menu') === null);

        await clickAction('delete');
        // Core asks first only while the vault's "Confirm file deletion" option is on.
        await waitFor('the deletion or its prompt', () => isDeleted() || document.querySelector('.modal .mod-destructive') !== null);
        const confirmButtonEl = document.querySelector('.modal .mod-destructive');
        if (confirmButtonEl instanceof HTMLElement) {
          await clickElement({ element: confirmButtonEl });
        }
        await waitFor('the deletion', () => isDeleted());
        app.commands.executeCommandById('explorer-multi-select:toggle-selection-mode');
        return { deletedPathExists: !isDeleted(), hasMenuAfterMore };

        async function clickAction(action: string): Promise<void> {
          await revealExplorer();
          const el = view.containerEl.querySelector(`[data-action="${CSS.escape(action)}"]`);
          if (!(el instanceof HTMLElement)) {
            throw new TypeError(`No ${action} button.`);
          }
          await clickElement({ element: el });
        }

        async function enterSelectionMode(): Promise<FileExplorerView> {
          const leaf = getExplorerLeaf();
          await leaf.loadIfDeferred();
          await app.workspace.revealLeaf(leaf);
          const explorerView = leaf.view as FileExplorerView;
          await waitFor('the rows', () => explorerView.fileItems[PATH] !== undefined);
          await (explorerView.fileItems[FOLDER] as FolderTreeItem).setCollapsed(false);
          app.commands.executeCommandById('explorer-multi-select:toggle-selection-mode');
          await waitFor('selection mode', () => explorerView.containerEl.hasClass('explorer-multi-select-selection-mode'));
          return explorerView;
        }

        function getExplorerLeaf(): WorkspaceLeaf {
          const explorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
          if (!explorerLeaf) {
            throw new Error('No File explorer leaf.');
          }
          return explorerLeaf;
        }

        function isDeleted(): boolean {
          return app.vault.getAbstractFileByPath(PATH) === null;
        }

        async function tap(path: string): Promise<void> {
          const item = view.fileItems[path];
          if (!item) {
            throw new Error(`No row for ${path}.`);
          }
          await revealExplorer();
          // The tree renders only the rows in view.
          view.tree.setFocusedItem(item, true);
          await waitFor(`${path} in view`, () => item.selfEl.isConnected && item.selfEl.getBoundingClientRect().height > 0);
          await clickElement({ element: item.selfEl });
          await waitFor(`the tap on ${path}`, () => view.tree.selectedDoms.has(item));
        }

        async function revealExplorer(): Promise<void> {
          // A phone closes the sidebar whenever a menu or a modal opens over it.
          app.workspace.leftSplit.expand();
          await app.workspace.revealLeaf(getExplorerLeaf());
          await waitFor('the explorer on screen', () => !app.workspace.leftSplit.collapsed && view.containerEl.getBoundingClientRect().width > 0);
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

    expect(result.hasMenuAfterMore).toBe(true);
    expect(result.deletedPathExists).toBe(false);
  });
});
