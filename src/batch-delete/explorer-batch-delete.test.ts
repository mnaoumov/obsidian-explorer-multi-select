import type {
  FileTreeItemParent,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type { App as AppOriginal } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ExplorerTreeItem } from '../selection-core/explorer-tree-items.ts';
import type { BatchDeleteChoice } from './batch-delete-modal.ts';
import type { ConfirmBatchDelete } from './explorer-batch-delete.ts';

import { FakeExplorerView } from '../test-helpers/fake-explorer-tree.test.helper.ts';
import { ExplorerBatchDelete } from './explorer-batch-delete.ts';

interface ItemWithFile {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests replace the fake row's file with a vault file or an invalid value.
  file: unknown;
}

describe('ExplorerBatchDelete', () => {
  let app: AppOriginal;
  let choice: BatchDeleteChoice | null;
  let confirmBatchDelete: ConfirmBatchDelete & ReturnType<typeof vi.fn>;
  let view: FakeExplorerView;

  beforeEach(() => {
    app = App.createConfigured__({
      files: {
        'a.md': '',
        'b.md': '',
        'c.md': '',
        'folder/inner.md': '',
        'image.png': ''
      }
    }).asOriginalType__();
    choice = { shouldDeleteAttachments: true, shouldNotAskAgain: false };
    confirmBatchDelete = vi.fn(() => Promise.resolve(choice));
    view = new FakeExplorerView();
  });

  function add(path: string, parent?: FileTreeItemParent): ExplorerTreeItem {
    const file = ensureNonNullable(app.vault.getAbstractFileByPath(path));
    const item = 'children' in file ? view.tree.addFolder(path, parent) : view.tree.addFile(path, parent);
    castTo<ItemWithFile>(item).file = file;
    return item;
  }

  function createBatchDelete(): ExplorerBatchDelete {
    return new ExplorerBatchDelete({ app, confirmBatchDelete, view: view.asView() });
  }

  function isInVault(path: string): boolean {
    return app.vault.getAbstractFileByPath(path) !== null;
  }

  function select(...items: ExplorerTreeItem[]): void {
    for (const item of items) {
      view.tree.selectItem(item);
    }
  }

  it('counts two or more selected rows as a batch', () => {
    const batchDelete = createBatchDelete();
    const a = add('a.md');
    select(a);
    expect(batchDelete.isBatch()).toBe(false);
    select(add('b.md'));
    expect(batchDelete.isBatch()).toBe(true);
  });

  it('asks once, deletes every selected row, and moves the focus past them', async () => {
    const a = add('a.md');
    const b = add('b.md');
    const c = add('c.md');
    select(a, b);
    view.tree.focusedItem = a;

    await createBatchDelete().deleteSelection();

    expect(confirmBatchDelete).toHaveBeenCalledOnce();
    expect(confirmBatchDelete).toHaveBeenCalledWith(expect.objectContaining({ attachmentMode: 'ask', trashOption: 'system' }));
    expect(isInVault('a.md')).toBe(false);
    expect(isInVault('b.md')).toBe(false);
    expect(view.tree.selectedDoms.size).toBe(0);
    expect(view.tree.focusedItem).toBe(c);
  });

  it('moves the focus back when nothing follows the deleted rows, starting from the first selected row', async () => {
    const a = add('a.md');
    const b = add('b.md');
    const c = add('c.md');
    select(b, c);

    await createBatchDelete().deleteSelection();
    expect(view.tree.focusedItem).toBe(a);
  });

  it('leaves the focus alone when no row is left', async () => {
    select(add('a.md'), add('b.md'));
    await createBatchDelete().deleteSelection();
    expect(view.tree.focusedItem).toBeNull();
  });

  it('leaves the focus alone when the row to start from is not shown', async () => {
    const folder = castTo<FolderTreeItem>(add('folder'));
    const inner = add('folder/inner.md', folder);
    folder.collapsed = true;
    // Nothing is focused, and the first selected row is hidden in its collapsed folder.
    select(inner, add('c.md'));

    await createBatchDelete().deleteSelection();
    expect(view.tree.focusedItem).toBeNull();
  });

  it('does nothing when the user cancels', async () => {
    choice = null;
    select(add('a.md'), add('b.md'));

    await createBatchDelete().deleteSelection();
    expect(isInVault('a.md')).toBe(true);
    expect(view.tree.selectedDoms.size).toBe(2);
  });

  it('asks with its own modal by default, and keeps everything when it is dismissed', async () => {
    select(add('a.md'), add('b.md'));

    // The mocked modal closes itself on the next tick, which is a cancel.
    await new ExplorerBatchDelete({ app, view: view.asView() }).deleteSelection();
    expect(isInVault('a.md')).toBe(true);
  });

  it('falls back to the system trash when the trash setting is unset, and keeps the vault root selected', async () => {
    app.vault.setConfig('trashOption', castTo<'system'>(undefined));
    const rootItem = view.tree.addFile('root');
    castTo<ItemWithFile>(rootItem).file = app.vault.getRoot();
    select(rootItem, add('a.md'));

    await createBatchDelete().deleteSelection();
    expect(confirmBatchDelete).toHaveBeenCalledWith(expect.objectContaining({ trashOption: 'system' }));
    expect([...view.tree.selectedDoms]).toEqual([rootItem]);
  });

  it('does nothing when only the vault root is selected', async () => {
    const rootItem = view.tree.addFile('root');
    castTo<ItemWithFile>(rootItem).file = app.vault.getRoot();
    select(rootItem, rootItem);

    await createBatchDelete().deleteSelection();
    expect(confirmBatchDelete).not.toHaveBeenCalled();
  });

  it('turns the confirmation off when the user asks not to be asked again', async () => {
    choice = { shouldDeleteAttachments: true, shouldNotAskAgain: true };
    select(add('a.md'), add('b.md'));

    await createBatchDelete().deleteSelection();
    expect(app.vault.getConfig('promptDelete')).toBe(false);
  });

  it('deletes without asking when the confirmation is off', async () => {
    app.vault.setConfig('promptDelete', false);
    select(add('a.md'), add('b.md'));

    await createBatchDelete().deleteSelection();
    expect(confirmBatchDelete).not.toHaveBeenCalled();
    expect(isInVault('a.md')).toBe(false);
  });

  it('still asks about the attachments when the confirmation is off, and deletes them when the user agrees', async () => {
    app.vault.setConfig('promptDelete', false);
    app.metadataCache.resolvedLinks = { 'a.md': { 'image.png': 1 } };
    select(add('a.md'), add('b.md'));

    await createBatchDelete().deleteSelection();
    expect(confirmBatchDelete).toHaveBeenCalledOnce();
    expect(isInVault('image.png')).toBe(false);
  });

  it('keeps the attachments when the user clears their checkbox', async () => {
    choice = { shouldDeleteAttachments: false, shouldNotAskAgain: false };
    app.metadataCache.resolvedLinks = { 'a.md': { 'image.png': 1 } };
    select(add('a.md'), add('b.md'));

    await createBatchDelete().deleteSelection();
    expect(isInVault('a.md')).toBe(false);
    expect(isInVault('image.png')).toBe(true);
  });

  it('deletes the attachments without a checkbox when the setting says always, and never when it says never', async () => {
    app.vault.setConfig('deleteUnlinkedAttachments', 'always');
    app.vault.setConfig('promptDelete', false);
    app.vault.setConfig('trashOption', 'none');
    app.metadataCache.resolvedLinks = { 'a.md': { 'image.png': 1 }, 'c.md': { 'folder/inner.md': 1 } };
    select(add('a.md'), add('b.md'));

    await createBatchDelete().deleteSelection();
    expect(confirmBatchDelete).not.toHaveBeenCalled();
    expect(isInVault('image.png')).toBe(false);

    app.vault.setConfig('deleteUnlinkedAttachments', 'never');
    app.vault.setConfig('promptDelete', true);
    view.tree.clearSelectedDoms();
    const folder = add('folder');
    select(add('c.md'), folder);
    await createBatchDelete().deleteSelection();
    expect(confirmBatchDelete).toHaveBeenCalledWith(expect.objectContaining({ attachmentMode: 'never', trashOption: 'none' }));
    expect(isInVault('folder/inner.md')).toBe(false);
  });
});
