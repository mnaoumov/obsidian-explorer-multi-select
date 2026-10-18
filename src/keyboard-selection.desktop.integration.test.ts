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
});
