import type {
  FileExplorerView,
  FileTreeItem,
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

// Desktop-only: the keys need a hardware keyboard, and the status bar does not exist on mobile.
// Isolation: `npx vitest run --project integration-tests:desktop src/keyboard-selection.desktop.integration.test.ts`.

interface KeyboardSelectionResult {
  readonly afterCtrlA: SelectionSnapshot;
  readonly afterCtrlASecond: SelectionSnapshot;
  readonly afterEscape: SelectionSnapshot;
  readonly afterShiftDownTwice: SelectionSnapshot;
  readonly afterShiftUp: SelectionSnapshot;
  readonly afterSpace: SelectionSnapshot;
  readonly afterSpaceAgain: SelectionSnapshot;
  readonly bookmarksScopeKeyCount: number;
  readonly openedFilePath: null | string;
}

interface KeyEntryLike {
  readonly key: null | string;
}

interface ScopeLike {
  readonly keys: KeyEntryLike[];
}

interface SelectionSnapshot {
  readonly paths: string[];
  readonly statusBarText: string;
}
interface ShiftSpaceResult {
  readonly afterHotkeyWithNothingSelected: ShiftSpaceSnapshot;
  readonly afterHotkeyWithSelection: ShiftSpaceSnapshot;
  readonly afterSelect: ShiftSpaceSnapshot;
  readonly afterShiftSpace: ShiftSpaceSnapshot;
  readonly afterShiftSpaceInMode: ShiftSpaceSnapshot;
}

interface ShiftSpaceSnapshot {
  readonly isSelectionMode: boolean;
  readonly paths: string[];
}

interface TreeLike {
  readonly scope: ScopeLike;
}

interface TreeOwnerLike {
  readonly tree?: TreeLike;
}

describe('keyboard selection in the File explorer', () => {
  it('toggles with Space, shrinks a Shift range on reversal, selects a folder with Ctrl+A, and counts in the status bar', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { pressKey, waitUntil } }): Promise<KeyboardSelectionResult> {
        // Twelve waits share the transport's 30 s cap per closure; each settles in well under a second.
        const WAIT_TIMEOUT_IN_MILLISECONDS = 2000;
        const FOLDER = 'ems-keyboard';
        const OTHER_PATH = 'ems-keyboard-other.md';

        await app.vault.createFolder(FOLDER);
        await app.vault.createFolder(`${FOLDER}/sub`);
        for (const name of ['a', 'b', 'c', 'd']) {
          await app.vault.create(`${FOLDER}/${name}.md`, name);
        }
        await app.vault.create(OTHER_PATH, 'other');

        const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
        if (!leaf) {
          throw new Error('No File explorer leaf.');
        }
        await leaf.loadIfDeferred();
        await app.workspace.revealLeaf(leaf);
        const view = leaf.view as FileExplorerView;
        const tree = view.tree;

        await waitUntil({
          predicate: () => getItem(`${FOLDER}/d.md`) !== undefined && getItem(`${FOLDER}/sub`) !== undefined,
          timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
        });
        const folderItem = getItem(FOLDER) as FolderTreeItem;
        await folderItem.setCollapsed(false);

        // `pressKey` only queues the input in Electron, so each press waits for its own `keyup` to arrive.
        let keyUpCount = 0;
        window.addEventListener('keyup', onKeyUp, { capture: true });

        app.workspace.setActiveLeaf(leaf, { focus: true });
        view.containerEl.focus();
        tree.setFocusedItem(getItem(`${FOLDER}/a.md`) as FileTreeItem);

        await press('Space');
        const afterSpace = snapshot();

        await press('Down', ['Shift']);
        await press('Down', ['Shift']);
        const afterShiftDownTwice = snapshot();

        await press('Up', ['Shift']);
        const afterShiftUp = snapshot();

        await press('Escape');
        const afterEscape = snapshot();

        await press('A', ['Mod']);
        const afterCtrlA = snapshot();

        await press('A', ['Mod']);
        const afterCtrlASecond = snapshot();

        await press('Escape');
        tree.setFocusedItem(getItem(`${FOLDER}/b.md`) as FileTreeItem);
        await press('Space');
        await press('Space');
        const afterSpaceAgain = snapshot();

        const bookmarksScopeKeyCount = countLeadingKeysOfOtherTrees();
        window.removeEventListener('keyup', onKeyUp, { capture: true });

        return {
          afterCtrlA,
          afterCtrlASecond,
          afterEscape,
          afterShiftDownTwice,
          afterShiftUp,
          afterSpace,
          afterSpaceAgain,
          bookmarksScopeKeyCount,
          // Space no longer opens the focused file, so the active file must not be any of the test files.
          openedFilePath: app.workspace.getActiveFile()?.path ?? null
        };

        function countLeadingKeysOfOtherTrees(): number {
          // The Bookmarks view uses the same `Tree` class; its first key must still be core's own ArrowDown.
          const bookmarksLeaf = app.workspace.getLeavesOfType('bookmarks')[0];
          const bookmarksView = bookmarksLeaf?.view as TreeOwnerLike | undefined;
          const firstKey = bookmarksView?.tree?.scope.keys[0]?.key;
          return firstKey === 'ArrowDown' || firstKey === undefined ? 0 : 1;
        }

        function onKeyUp(): void {
          keyUpCount++;
        }

        async function press(key: string, modifiers: Modifier[] = []): Promise<void> {
          const expectedKeyUpCount = keyUpCount + 1;
          await pressKey({ key, modifiers });
          await waitUntil({ predicate: () => keyUpCount >= expectedKeyUpCount, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
        }

        function getItem(path: string): FileTreeItem | FolderTreeItem | undefined {
          return view.fileItems[path];
        }

        function snapshot(): SelectionSnapshot {
          const statusBarItem = document.querySelector('.explorer-multi-select-status-bar-item');
          const isShown = statusBarItem instanceof HTMLElement && statusBarItem.isShown();
          return {
            paths: [...tree.selectedDoms].map((item) => item.file.path).sort(),
            statusBarText: isShown ? statusBarItem.textContent : ''
          };
        }
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.afterSpace).toEqual({ paths: ['ems-keyboard/a.md'], statusBarText: '1 file' });
    expect(result.afterShiftDownTwice).toEqual({
      paths: ['ems-keyboard/a.md', 'ems-keyboard/b.md', 'ems-keyboard/c.md'],
      statusBarText: '3 files'
    });
    expect(result.afterShiftUp).toEqual({ paths: ['ems-keyboard/a.md', 'ems-keyboard/b.md'], statusBarText: '2 files' });
    expect(result.afterEscape).toEqual({ paths: [], statusBarText: '' });
    expect(result.afterCtrlA).toEqual({
      paths: ['ems-keyboard/a.md', 'ems-keyboard/b.md', 'ems-keyboard/c.md', 'ems-keyboard/d.md', 'ems-keyboard/sub'],
      statusBarText: '4 files, 1 folder'
    });
    expect(result.afterCtrlASecond.paths).toContain('ems-keyboard');
    expect(result.afterCtrlASecond.paths).toContain('ems-keyboard-other.md');
    expect(result.afterSpaceAgain).toEqual({ paths: [], statusBarText: '' });
    expect(result.openedFilePath).toBeNull();
    expect(result.bookmarksScopeKeyCount).toBe(0);
  });

  it('clears the whole selection with Shift+Space, in and out of the selection mode', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { pressKey, waitUntil } }): Promise<ShiftSpaceResult> {
        const WAIT_TIMEOUT_IN_MILLISECONDS = 2000;
        const FOLDER = 'ems-shift-space';
        const TOGGLE_COMMAND_ID = 'explorer-multi-select:toggle-selection-mode';

        await app.vault.createFolder(FOLDER);
        for (const name of ['a', 'b']) {
          await app.vault.create(`${FOLDER}/${name}.md`, name);
        }

        const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
        if (!leaf) {
          throw new Error('No File explorer leaf.');
        }
        await leaf.loadIfDeferred();
        await app.workspace.revealLeaf(leaf);
        const view = leaf.view as FileExplorerView;
        const tree = view.tree;

        await waitUntil({
          predicate: () => getItem(`${FOLDER}/b.md`) !== undefined,
          timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
        });
        const folderItem = getItem(FOLDER) as FolderTreeItem;
        await folderItem.setCollapsed(false);

        let keyUpCount = 0;
        window.addEventListener('keyup', onKeyUp, { capture: true });

        selectBoth();
        const afterSelect = snapshot();
        await press('Space', ['Shift']);
        const afterShiftSpace = snapshot();

        app.commands.executeCommandById(TOGGLE_COMMAND_ID);
        selectBoth();
        await press('Space', ['Shift']);
        const afterShiftSpaceInMode = snapshot();
        app.commands.executeCommandById(TOGGLE_COMMAND_ID);

        // With nothing selected, a Shift+Space hotkey the user assigned to a command still runs in the explorer.
        await assignShiftSpaceInHotkeysTab();
        app.workspace.setActiveLeaf(view.leaf, { focus: true });
        await press('Space', ['Shift']);
        const afterHotkeyWithNothingSelected = snapshot();
        selectBoth();
        await press('Space', ['Shift']);
        const afterHotkeyWithSelection = snapshot();
        app.hotkeyManager.removeHotkeys(TOGGLE_COMMAND_ID);
        app.commands.executeCommandById(TOGGLE_COMMAND_ID);

        window.removeEventListener('keyup', onKeyUp, { capture: true });
        return { afterHotkeyWithNothingSelected, afterHotkeyWithSelection, afterSelect, afterShiftSpace, afterShiftSpaceInMode };

        // Settings -> Hotkeys' own recorder, as a user assigns it.
        async function assignShiftSpaceInHotkeysTab(): Promise<void> {
          app.setting.open();
          app.setting.openTabById('hotkeys');
          const containerEl = app.setting.activeTab?.containerEl;
          const searchInputEl = containerEl?.querySelector('input[type="search"]');
          if (!(searchInputEl instanceof HTMLInputElement)) {
            throw new TypeError('No search box in Settings -> Hotkeys.');
          }
          searchInputEl.value = 'Toggle selection mode';
          searchInputEl.dispatchEvent(new Event('input'));
          await waitUntil({ predicate: () => findAddButton() !== undefined, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
          findAddButton()?.click();
          await press('Space', ['Shift']);
          await waitUntil({
            predicate: () => app.hotkeyManager.printHotkeyForCommand(TOGGLE_COMMAND_ID) === 'Shift + Space',
            timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
          });
          app.setting.close();

          function findAddButton(): HTMLElement | undefined {
            const settingEl = [...containerEl?.querySelectorAll('.setting-item') ?? []]
              .find((el) => el.textContent.includes('Toggle selection mode'));
            return settingEl?.querySelector<HTMLElement>('.setting-add-hotkey-button') ?? undefined;
          }
        }

        function getItem(path: string): FileTreeItem | FolderTreeItem | undefined {
          return view.fileItems[path];
        }

        function onKeyUp(): void {
          keyUpCount++;
        }

        async function press(key: string, modifiers: Modifier[] = []): Promise<void> {
          const expectedKeyUpCount = keyUpCount + 1;
          await pressKey({ key, modifiers });
          await waitUntil({ predicate: () => keyUpCount >= expectedKeyUpCount, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
        }

        function selectBoth(): void {
          app.workspace.setActiveLeaf(view.leaf, { focus: true });
          view.containerEl.focus();
          const a = getItem(`${FOLDER}/a.md`) as FileTreeItem;
          tree.setFocusedItem(a);
          tree.selectItem(a);
          tree.selectItem(getItem(`${FOLDER}/b.md`) as FileTreeItem);
        }

        function snapshot(): ShiftSpaceSnapshot {
          return {
            isSelectionMode: view.containerEl.hasClass('explorer-multi-select-selection-mode'),
            paths: [...tree.selectedDoms].map((item) => item.file.path).sort()
          };
        }
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.afterSelect).toEqual({ isSelectionMode: false, paths: ['ems-shift-space/a.md', 'ems-shift-space/b.md'] });
    expect(result.afterShiftSpace).toEqual({ isSelectionMode: false, paths: [] });
    expect(result.afterShiftSpaceInMode).toEqual({ isSelectionMode: true, paths: [] });
    expect(result.afterHotkeyWithNothingSelected).toEqual({ isSelectionMode: true, paths: [] });
    // The selection takes the key, so the hotkey does not toggle the mode back off.
    expect(result.afterHotkeyWithSelection).toEqual({ isSelectionMode: true, paths: [] });
  });
});
