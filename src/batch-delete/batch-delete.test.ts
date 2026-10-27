import type {
  App as AppOriginal,
  TAbstractFile
} from 'obsidian';

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import {
  countFiles,
  deleteByPlan,
  planBatchDelete
} from './batch-delete.ts';

describe('batch delete', () => {
  let app: AppOriginal;

  beforeEach(() => {
    app = App.createConfigured__({
      files: {
        'empty/': '',
        'folder/inner.md': '',
        'folder/nested/deep.md': '',
        'image.png': '',
        'kept.md': '',
        'note.md': '',
        'other.md': '',
        'shared.png': ''
      }
    }).asOriginalType__();
  });

  function get(path: string): TAbstractFile {
    return ensureNonNullable(app.vault.getAbstractFileByPath(path));
  }

  function paths(files: readonly TAbstractFile[]): string[] {
    return files.map((file) => file.path);
  }

  it('counts files and folders', () => {
    expect(countFiles([get('note.md'), get('folder'), get('empty')])).toEqual({ fileCount: 1, folderCount: 2 });
  });

  it('drops the vault root and everything inside a selected folder', () => {
    const plan = planBatchDelete(app, [app.vault.getRoot(), get('folder'), get('folder/inner.md'), get('folder/nested'), get('note.md')]);

    expect(paths(plan.files)).toEqual(['folder', 'note.md']);
    expect(plan.isDeleted('folder/nested/deep.md')).toBe(true);
    expect(plan.isDeleted('note.md')).toBe(true);
    expect(plan.isDeleted('folder-other.md')).toBe(false);
    expect(plan.nonEmptyFolderCount).toBe(1);
  });

  it('counts the non-empty folders only', () => {
    expect(planBatchDelete(app, [get('empty'), get('note.md')]).nonEmptyFolderCount).toBe(0);
  });

  it('counts the links from notes that stay into what is deleted', () => {
    app.metadataCache.resolvedLinks = {
      'folder/inner.md': { 'note.md': 5 },
      'kept.md': { 'folder/nested/deep.md': 2, 'note.md': 1, 'other.md': 4 },
      'note.md': { 'other.md': 1 }
    };

    expect(planBatchDelete(app, [get('note.md'), get('folder')]).brokenLinkCount).toBe(3);
  });

  it('finds the attachments only the deleted notes link to', () => {
    app.metadataCache.resolvedLinks = {
      'folder/inner.md': { 'image.png': 1 },
      'kept.md': { 'shared.png': 1 },
      'note.md': { 'folder/inner.md': 1, 'image.png': 1, 'missing.png': 1, 'other.md': 1, 'shared.png': 1 },
      'other.md': { 'note.md': 1 }
    };

    expect(paths(planBatchDelete(app, [get('note.md'), get('other.md'), get('folder')]).attachments)).toEqual(['image.png']);
  });

  it('leaves out attachments that are deleted already, and notes, canvases and bases', () => {
    app.metadataCache.resolvedLinks = {
      'note.md': { 'board.canvas': 1, 'folder/nested/pic.PNG': 1, 'image.png': 1, 'no-extension': 1, 'table.base': 1 }
    };

    const plan = planBatchDelete(app, [get('note.md'), get('image.png'), get('folder')]);
    expect(plan.attachments).toEqual([]);
  });

  it('deletes through trashFile, following the trash setting, and skips what is gone', async () => {
    app.vault.setConfig('trashOption', 'local');
    app.metadataCache.resolvedLinks = { 'note.md': { 'image.png': 1 } };
    const plan = planBatchDelete(app, [get('note.md'), get('other.md')]);
    await app.fileManager.trashFile(get('other.md'));

    await deleteByPlan(app, plan, false);
    expect(app.vault.getAbstractFileByPath('note.md')).toBeNull();
    expect(app.vault.getAbstractFileByPath('image.png')).not.toBeNull();
    expect(await app.vault.adapter.exists('.trash/note.md')).toBe(true);

    await deleteByPlan(app, plan, true);
    expect(app.vault.getAbstractFileByPath('image.png')).toBeNull();
  });
});
