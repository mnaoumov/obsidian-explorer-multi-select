import type {
  FileExplorerView,
  FileTreeItem,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

// Desktop-only: the Delete key needs a hardware keyboard, and the context menu needs a mouse.
// Isolation: `npx vitest run --project integration-tests:desktop src/batch-delete.desktop.integration.test.ts`.

interface BatchDeleteResult {
  readonly afterCancel: string[];
  readonly batchModalCount: number;
  readonly batchModalTitle: string;
  readonly focusedPath: null | string;
  readonly isCoreModalOurs: boolean | null;
  readonly keptPaths: string[];
  readonly menuModalCount: number;
  readonly selectedPathsAfterDelete: string[];
  readonly trashPaths: string[];
}

describe('batch delete in the File explorer', () => {
  it('asks once for the Delete key and for the context menu, trashes through the trash setting, and keeps core\'s prompt for one row', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { pressKey, waitUntil } }): Promise<BatchDeleteResult> {
        // About ten waits share the transport's 30 s cap per closure; each settles in well under a second.
        const WAIT_TIMEOUT_IN_MILLISECONDS = 2000;
        const FOLDER = 'ems-batch-delete';
        const BATCH_MODAL_SELECTOR = '.modal .explorer-multi-select-batch-delete';

        app.vault.setConfig('trashOption', 'local');
        app.vault.setConfig('promptDelete', true);
        app.vault.setConfig('deleteUnlinkedAttachments', 'ask');
        await app.vault.createFolder(FOLDER);
        await app.vault.createFolder(`${FOLDER}/sub`);
        await app.vault.create(`${FOLDER}/sub/inner.md`, 'inner');
        await app.vault.createBinary(`${FOLDER}/pic.png`, new ArrayBuffer(8));
        await app.vault.create(`${FOLDER}/a.md`, '![[pic.png]]');
        for (const name of ['b', 'c', 'd', 'e']) {
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

        await wait(() => getItem(`${FOLDER}/e.md`) !== undefined && app.metadataCache.resolvedLinks[`${FOLDER}/a.md`]?.[`${FOLDER}/pic.png`] === 1);
        await (getItem(FOLDER) as FolderTreeItem).setCollapsed(false);

        // The Delete key: one confirmation for three rows, then the attachment only `a.md` links to.
        let keyUpCount = 0;
        window.addEventListener('keyup', onKeyUp, { capture: true });
        app.workspace.setActiveLeaf(leaf, { focus: true });
        view.containerEl.focus();
        tree.clearSelectedDoms();
        for (const path of [`${FOLDER}/a.md`, `${FOLDER}/b.md`, `${FOLDER}/sub`]) {
          tree.selectItem(getItem(path) as FileTreeItem);
        }
        tree.setFocusedItem(getItem(`${FOLDER}/a.md`) as FileTreeItem);
        await press('Delete');
        await wait(() => document.querySelector(BATCH_MODAL_SELECTOR) !== null);
        const batchModalCount = document.querySelectorAll('.modal').length;
        const batchModalTitle = document.querySelector('.modal .modal-title')?.textContent ?? '';
        clickModalButton(BATCH_MODAL_SELECTOR, 'Delete');
        await wait(() => app.vault.getAbstractFileByPath(`${FOLDER}/pic.png`) === null && app.vault.getAbstractFileByPath(`${FOLDER}/sub`) === null);
        const trashListing = await app.vault.adapter.list('.trash');
        const trashPaths = [...trashListing.files, ...trashListing.folders].sort();
        const selectedPathsAfterDelete = selectedPaths();
        const focusedPath = tree.focusedItem && 'file' in tree.focusedItem ? (tree.focusedItem as FileTreeItem).file.path : null;

        // The context menu: core's Delete item for a multi-item selection asks once too; cancel keeps the rows.
        tree.selectItem(getItem(`${FOLDER}/c.md`) as FileTreeItem);
        tree.selectItem(getItem(`${FOLDER}/d.md`) as FileTreeItem);
        const cItem = getItem(`${FOLDER}/c.md`) as FileTreeItem;
        view.openFileContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }), cItem.selfEl);
        await wait(() => document.querySelector('.menu .lucide-trash-2') !== null);
        (document.querySelector('.menu .lucide-trash-2')?.closest('.menu-item') as HTMLElement | null)?.click();
        await wait(() => document.querySelector(BATCH_MODAL_SELECTOR) !== null);
        const menuModalCount = document.querySelectorAll('.modal').length;
        clickModalButton(BATCH_MODAL_SELECTOR, 'Cancel');
        await wait(() => document.querySelector('.modal') === null);
        const afterCancel = selectedPaths();

        // One row: core's own prompt, not the batch one.
        tree.clearSelectedDoms();
        tree.selectItem(getItem(`${FOLDER}/e.md`) as FileTreeItem);
        tree.setFocusedItem(getItem(`${FOLDER}/e.md`) as FileTreeItem);
        view.containerEl.focus();
        await press('Delete');
        await wait(() => document.querySelector('.modal') !== null);
        const isCoreModalOurs = document.querySelector(BATCH_MODAL_SELECTOR) !== null;
        clickModalButton('.modal', 'Cancel');
        await wait(() => document.querySelector('.modal') === null);
        window.removeEventListener('keyup', onKeyUp, { capture: true });

        const keptPaths = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'pic.png', 'sub'].map((name) => `${FOLDER}/${name}`).filter((path) => app.vault.getAbstractFileByPath(path) !== null);

        return {
          afterCancel,
          batchModalCount,
          batchModalTitle,
          focusedPath,
          isCoreModalOurs,
          keptPaths,
          menuModalCount,
          selectedPathsAfterDelete,
          trashPaths
        };

        function clickModalButton(modalSelector: string, text: string): void {
          const buttons = [...document.querySelectorAll(`${modalSelector} button`)];
          (buttons.find((buttonEl) => buttonEl.textContent === text) as HTMLElement | undefined)?.click();
        }

        function getItem(path: string): FileTreeItem | FolderTreeItem | undefined {
          return view.fileItems[path];
        }

        function onKeyUp(): void {
          keyUpCount++;
        }

        async function press(key: string): Promise<void> {
          const expectedKeyUpCount = keyUpCount + 1;
          await pressKey({ key, modifiers: [] });
          await wait(() => keyUpCount >= expectedKeyUpCount);
        }

        async function wait(isDone: () => boolean): Promise<void> {
          try {
            await waitUntil({ predicate: isDone, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
          } catch (error) {
            throw new Error(`Timed out waiting for: ${isDone.toString()}`, { cause: error });
          }
        }

        function selectedPaths(): string[] {
          return [...tree.selectedDoms].map((item) => item.file.path).sort();
        }
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.batchModalCount).toBe(1);
    expect(result.batchModalTitle).toBe('Delete 2 files, 1 folder?');
    expect(result.trashPaths).toEqual(expect.arrayContaining(['.trash/a.md', '.trash/b.md', '.trash/pic.png', '.trash/sub']));
    expect(result.selectedPathsAfterDelete).toEqual([]);
    expect(result.focusedPath).toBe('ems-batch-delete/c.md');
    expect(result.menuModalCount).toBe(1);
    expect(result.afterCancel).toEqual(['ems-batch-delete/c.md', 'ems-batch-delete/d.md']);
    expect(result.isCoreModalOurs).toBe(false);
    expect(result.keptPaths).toEqual(['ems-batch-delete/c.md', 'ems-batch-delete/d.md', 'ems-batch-delete/e.md']);
  });
});
