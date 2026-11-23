import type {
  FileExplorerView,
  FileTreeItem,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type {
  FileView,
  WorkspaceLeaf
} from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

// Desktop-only: a new window exists only on desktop, and the context menu needs a mouse.
// Isolation: `npx vitest run --project integration-tests:desktop src/open-selection/open-selection.desktop.integration.test.ts`.

interface OpenSelectionResult {
  readonly menuTitles: string[];
  readonly tabPaths: string[];
  readonly windowPaths: string[];
  readonly windowTabCount: number;
}

describe('open the File explorer\'s selection', () => {
  it('opens the selected files, not the folders, in new tabs and in a new window, in order', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { clickElement, waitUntil } }): Promise<OpenSelectionResult> {
        // About eight waits share the transport's 30 s cap per closure; each settles in well under a second.
        const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;
        const FOLDER = 'ems-open-selection';
        const PATHS = [`${FOLDER}/a.md`, `${FOLDER}/b.canvas`, `${FOLDER}/c.md`];

        await app.vault.createFolder(FOLDER);
        await app.vault.createFolder(`${FOLDER}/sub`);
        await app.vault.create(PATHS[0] ?? '', 'a');
        await app.vault.create(PATHS[1] ?? '', '{}');
        await app.vault.create(PATHS[2] ?? '', 'c');

        const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
        if (!leaf) {
          throw new Error('No File explorer leaf.');
        }
        await leaf.loadIfDeferred();
        await app.workspace.revealLeaf(leaf);
        const view = leaf.view as FileExplorerView;
        const tree = view.tree;
        await wait(() => PATHS.every((path) => getItem(path) !== null));
        await (getItem(FOLDER) as FolderTreeItem).setCollapsed(false);

        const menuTitles = await openMenu();
        await clickMenuItem('Open 3 files in new tabs');
        await wait(() => findLeaves(PATHS[2] ?? '').length > 0);
        const tabPaths = tabGroupPaths(findLeaves(PATHS[0] ?? '')[0]);

        await openMenu();
        await clickMenuItem('Open 3 files in new window');
        await wait(() => findLeaves(PATHS[2] ?? '').some((openedLeaf) => openedLeaf.getContainer() !== app.workspace.rootSplit));
        const windowLeaf = findLeaves(PATHS[0] ?? '').find((openedLeaf) => openedLeaf.getContainer() !== app.workspace.rootSplit);
        const windowPaths = tabGroupPaths(windowLeaf);
        let windowTabCount = 0;
        app.workspace.iterateAllLeaves((openedLeaf) => {
          if (openedLeaf.getContainer() === windowLeaf?.getContainer()) {
            windowTabCount++;
          }
        });
        windowLeaf?.getContainer().win.close();
        tree.clearSelectedDoms();

        return { menuTitles, tabPaths, windowPaths, windowTabCount };

        async function clickMenuItem(title: string): Promise<void> {
          const itemEl = [...document.querySelectorAll<HTMLElement>('.menu .menu-item')].find((el) => el.textContent === title);
          if (!itemEl) {
            throw new Error(`No menu item ${title}.`);
          }
          await clickElement({ element: itemEl });
          await wait(() => document.querySelector('.menu') === null);
        }

        function findLeaves(path: string): WorkspaceLeaf[] {
          const leaves: WorkspaceLeaf[] = [];
          app.workspace.iterateAllLeaves((openedLeaf) => {
            if ((openedLeaf.view as FileView).file?.path === path) {
              leaves.push(openedLeaf);
            }
          });
          return leaves;
        }

        function getItem(path: string): FileTreeItem | FolderTreeItem | null {
          return view.fileItems[path] ?? null;
        }

        async function openMenu(): Promise<string[]> {
          tree.clearSelectedDoms();
          for (const path of [PATHS[0], `${FOLDER}/sub`, PATHS[1], PATHS[2]]) {
            tree.selectItem(getItem(path ?? '') as FileTreeItem);
          }
          const rowEl = (getItem(PATHS[0] ?? '') as FileTreeItem).selfEl;
          tree.setFocusedItem(getItem(PATHS[0] ?? '') as FileTreeItem, true);
          await wait(() => rowEl.getBoundingClientRect().height > 0);
          await clickElement({ button: 'right', element: rowEl });
          await wait(() => document.querySelector('.menu') !== null);
          return [...document.querySelectorAll('.menu .menu-item')].map((el) => el.textContent).filter((title) => title.startsWith('Open 3'));
        }

        function tabGroupPaths(openedLeaf: undefined | WorkspaceLeaf): string[] {
          return (openedLeaf?.parent.children ?? [])
            .map((child) => ((child as WorkspaceLeaf).view as FileView).file?.path ?? '')
            .filter((path) => PATHS.includes(path));
        }

        async function wait(isDone: () => boolean): Promise<void> {
          try {
            await waitUntil({ predicate: isDone, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
          } catch (error) {
            throw new Error(`Timed out waiting for: ${isDone.toString()}`, { cause: error });
          }
        }
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.menuTitles).toEqual(['Open 3 files in new tabs', 'Open 3 files in new window']);
    expect(result.tabPaths).toEqual(['ems-open-selection/a.md', 'ems-open-selection/b.canvas', 'ems-open-selection/c.md']);
    expect(result.windowPaths).toEqual(['ems-open-selection/a.md', 'ems-open-selection/b.canvas', 'ems-open-selection/c.md']);
    expect(result.windowTabCount).toBe(3);
  });
});
