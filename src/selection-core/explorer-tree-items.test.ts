import type { View } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  describe,
  expect,
  it
} from 'vitest';

import { FakeExplorerTree } from '../test-helpers/fake-explorer-tree.test.helper.ts';
import {
  countItems,
  formatSelectionCount,
  getItemsInRange,
  getVisibleChildren,
  getVisibleItems,
  isFileExplorerView,
  isFolderItem
} from './explorer-tree-items.ts';

describe('countItems', () => {
  it('counts files and folders separately', () => {
    const tree = new FakeExplorerTree();
    const folder = tree.addFolder('folder');
    const file1 = tree.addFile('file1.md');
    const file2 = tree.addFile('file2.md');

    expect(countItems([folder, file1, file2])).toEqual({ fileCount: 2, folderCount: 1 });
  });
});

describe('formatSelectionCount', () => {
  it('is empty when nothing is selected', () => {
    expect(formatSelectionCount({ fileCount: 0, folderCount: 0 })).toBe('');
  });

  it('uses the singular for one item', () => {
    expect(formatSelectionCount({ fileCount: 1, folderCount: 0 })).toBe('1 file');
    expect(formatSelectionCount({ fileCount: 0, folderCount: 1 })).toBe('1 folder');
  });

  it('lists files before folders', () => {
    expect(formatSelectionCount({ fileCount: 12, folderCount: 3 })).toBe('12 files, 3 folders');
  });
});

describe('getVisibleItems', () => {
  it('walks expanded folders and skips collapsed contents, hidden rows and filtered-out rows', () => {
    const tree = new FakeExplorerTree();
    const expanded = tree.addFolder('expanded');
    const inside = tree.addFile('expanded/inside.md', expanded);
    const collapsed = tree.addFolder('collapsed', tree.root, { isCollapsed: true });
    tree.addFile('collapsed/inside.md', collapsed);
    tree.addFile('hidden.md', tree.root, { isHidden: true });
    tree.addFile('filtered.md', tree.root, { isFilteredOut: true });
    const last = tree.addFile('last.md');

    expect(getVisibleItems(tree.root)).toEqual([expanded, inside, collapsed, last]);
    expect(getVisibleChildren(tree.root)).toEqual([expanded, collapsed, last]);
  });
});

describe('getItemsInRange', () => {
  it('returns the rows between both ends in display order, whichever end comes first', () => {
    const tree = new FakeExplorerTree();
    const a = tree.addFile('a.md');
    const b = tree.addFile('b.md');
    const c = tree.addFile('c.md');
    const visibleItems = getVisibleItems(tree.root);

    expect(getItemsInRange(visibleItems, a, c)).toEqual([a, b, c]);
    expect(getItemsInRange(visibleItems, c, b)).toEqual([b, c]);
  });

  it('returns undefined when an end is not visible', () => {
    const tree = new FakeExplorerTree();
    const a = tree.addFile('a.md');
    const hidden = tree.addFile('hidden.md', tree.root, { isHidden: true });

    expect(getItemsInRange(getVisibleItems(tree.root), a, hidden)).toBeUndefined();
  });
});

describe('isFolderItem', () => {
  it('tells folders from files', () => {
    const tree = new FakeExplorerTree();

    expect(isFolderItem(tree.addFolder('folder'))).toBe(true);
    expect(isFolderItem(tree.addFile('file.md'))).toBe(false);
  });
});

describe('isFileExplorerView', () => {
  it('is true only for a built view, which has a tree', () => {
    expect(isFileExplorerView(castTo<View>({ tree: {} }))).toBe(true);
    expect(isFileExplorerView(strictProxy<View>({}))).toBe(false);
  });
});
