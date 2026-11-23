import type {
  App as AppOriginal,
  OpenViewState,
  PaneType,
  TAbstractFile,
  TFile,
  WorkspaceLeaf
} from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
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

import {
  getOpenableFiles,
  openFiles
} from './open-selection.ts';

interface OpenedFile {
  readonly leafIndex: number;
  readonly path: string;
  readonly state: OpenViewState | undefined;
}

describe('open selection', () => {
  let app: AppOriginal;
  let opened: OpenedFile[];
  let paneTypes: PaneType[];

  beforeEach(() => {
    app = App.createConfigured__({
      files: {
        'a.md': '',
        'b.canvas': '',
        'c.base': '',
        'folder/inner.md': ''
      }
    }).asOriginalType__();
    opened = [];
    paneTypes = [];
    app.workspace.getLeaf = vi.fn((paneType?: boolean | PaneType) => {
      paneTypes.push(castTo<PaneType>(paneType));
      const leafIndex = paneTypes.length - 1;
      return castTo<WorkspaceLeaf>({
        openFile: vi.fn((file: TFile, state?: OpenViewState) => {
          opened.push({ leafIndex, path: file.path, state });
          return noopAsync();
        })
      });
    });
  });

  function get(path: string): TAbstractFile {
    return ensureNonNullable(app.vault.getAbstractFileByPath(path));
  }

  it('keeps the files in their order and drops the folders', () => {
    const files = getOpenableFiles([get('c.base'), get('folder'), get('a.md'), get('folder/inner.md')]);

    expect(files.map((file) => file.path)).toEqual(['c.base', 'a.md', 'folder/inner.md']);
    expect(getOpenableFiles([get('folder')])).toEqual([]);
  });

  it('opens each file in a new active tab, in order', async () => {
    const files = getOpenableFiles([get('a.md'), get('b.canvas'), get('c.base')]);

    const leaves = await openFiles(app, files, 'tab');

    expect(leaves).toHaveLength(3);
    expect(paneTypes).toEqual(['tab', 'tab', 'tab']);
    expect(opened).toEqual([
      { leafIndex: 0, path: 'a.md', state: { active: true } },
      { leafIndex: 1, path: 'b.canvas', state: { active: true } },
      { leafIndex: 2, path: 'c.base', state: { active: true } }
    ]);
  });

  it('opens the first file in a new window and the rest as its tabs', async () => {
    const files = getOpenableFiles([get('a.md'), get('b.canvas')]);

    await openFiles(app, files, 'window');

    expect(paneTypes).toEqual(['window', 'tab']);
    expect(opened.map((file) => file.path)).toEqual(['a.md', 'b.canvas']);
  });

  it('opens nothing for no files', async () => {
    expect(await openFiles(app, [], 'window')).toEqual([]);
    expect(paneTypes).toEqual([]);
  });
});
