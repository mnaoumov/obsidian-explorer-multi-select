import type {
  FileTreeItemParent,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type {
  FrontMatterCache,
  TFile
} from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import type { ExplorerTreeItem } from '../selection-core/explorer-tree-items.ts';
import type { ItemRule } from './select-by-rule.ts';

import {
  FakeExplorerTree,
  FakeExplorerView
} from '../test-helpers/fake-explorer-tree.test.helper.ts';
import {
  createExtensionRule,
  createGlobRule,
  createPropertyRule,
  getCandidateItems,
  getFilterMatchingItems,
  getRelativePath,
  getRuleFolder,
  getRuleFolderLabel,
  hasActiveFilter,
  invertSelection
} from './select-by-rule.ts';

describe('select-by-rule', () => {
  let tree: FakeExplorerTree;

  beforeEach(() => {
    tree = new FakeExplorerTree();
  });

  function matchNames(rule: ItemRule | null, folder: FileTreeItemParent = tree.root, shouldIncludeSubfolders = true): string[] {
    if (!rule) {
      throw new Error('No rule.');
    }
    return getCandidateItems(folder, shouldIncludeSubfolders)
      .filter((item) => rule(item, getRelativePath(item, folder)))
      .map((item) => getRelativePath(item, tree.root));
  }

  describe('createExtensionRule', () => {
    it('matches files by any of the extensions, with or without a dot, ignoring case', () => {
      tree.addFile('a.md');
      tree.addFile('b.PNG');
      tree.addFile('c.txt');
      tree.addFile('.hidden');
      tree.addFile('README');
      tree.addFolder('folder.md');

      expect(matchNames(createExtensionRule('md, .png'))).toEqual(['a.md', 'b.PNG']);
    });

    it('builds no rule from an input that names no extension', () => {
      expect(createExtensionRule(' , . ')).toBeNull();
    });
  });

  describe('createGlobRule', () => {
    it('matches the name when the pattern has no slash, files and folders alike', () => {
      const folder = tree.addFolder('drafts');
      tree.addFile('Draft-1.md', folder);
      tree.addFile('final.md');
      tree.addFolder('draft-old');

      expect(matchNames(createGlobRule(' draft* '))).toEqual(['drafts', 'drafts/Draft-1.md', 'draft-old']);
    });

    it('matches the path relative to the folder when the pattern has a slash', () => {
      const folder = tree.addFolder('notes');
      const sub = tree.addFolder('sub', folder);
      tree.addFile('a.md', sub);
      tree.addFile('b.md', folder);

      expect(matchNames(createGlobRule('sub/*.md'), folder)).toEqual(['notes/sub/a.md']);
      expect(matchNames(createGlobRule('**/*.md'), folder)).toEqual(['notes/sub/a.md', 'notes/b.md']);
    });

    it('builds no rule from an empty pattern', () => {
      expect(createGlobRule('  ')).toBeNull();
    });
  });

  describe('createPropertyRule', () => {
    let frontmatterByPath: Map<string, FrontMatterCache>;

    beforeEach(() => {
      frontmatterByPath = new Map();
    });

    function addNote(name: string, frontmatter?: FrontMatterCache): void {
      tree.addFile(name);
      if (frontmatter) {
        frontmatterByPath.set(name, frontmatter);
      }
    }

    function rule(key: string, value: string): ItemRule {
      return createPropertyRule((file: TFile) => frontmatterByPath.get(file.path), key, value);
    }

    it('matches a scalar or any list element as text, ignoring case', () => {
      addNote('scalar.md', { status: 'Done' });
      addNote('list.md', { status: ['open', 'DONE'] });
      addNote('number.md', { status: 1 });
      addNote('boolean.md', { status: true });
      addNote('other.md', { status: 'open' });
      addNote('none.md');
      tree.addFolder('folder');

      expect(matchNames(rule('status', ' done '))).toEqual(['scalar.md', 'list.md']);
      expect(matchNames(rule('status', '1'))).toEqual(['number.md']);
      expect(matchNames(rule('status', 'TRUE'))).toEqual(['boolean.md']);
    });

    it('matches every note that has the property when the value is empty', () => {
      addNote('empty.md', { status: null });
      addNote('set.md', { status: 'x' });
      addNote('other.md', { tags: 'x' });

      expect(matchNames(rule('status', ''))).toEqual(['empty.md', 'set.md']);
    });

    it('compares an empty or an object value as text', () => {
      addNote('empty.md', { status: [null, undefined] });
      addNote('object.md', { status: { a: 1 } });

      expect(matchNames(rule('status', '{"a":1}'))).toEqual(['object.md']);
      expect(matchNames(rule('status', 'null'))).toEqual([]);
    });
  });

  describe('getCandidateItems', () => {
    it('takes the children, or everything under the folder, and leaves hidden rows out', () => {
      const folder = tree.addFolder('folder', tree.root, { isCollapsed: true });
      tree.addFile('inside.md', folder);
      tree.addFile('top.md');
      tree.addFile('filtered.md', tree.root, { isFilteredOut: true });
      tree.addFile('hidden.md', tree.root, { isHidden: true });

      expect(getCandidateItems(tree.root, false).map((item) => item.file.name)).toEqual(['folder', 'top.md']);
      expect(getCandidateItems(tree.root, true).map((item) => item.file.name)).toEqual(['folder', 'inside.md', 'top.md']);
    });
  });

  describe('getRuleFolder and getRuleFolderLabel', () => {
    it('uses the focused folder, the focused file\'s folder, or the root', () => {
      const view = new FakeExplorerView(tree).asView();
      const folder = tree.addFolder('folder');
      const file = tree.addFile('file.md', folder);
      const topFile = tree.addFile('top.md');
      // A live explorer leaves a row's `parent` unset at times; the folder comes from the file instead.
      const fileWithoutParentRow = castTo<ExplorerTreeItem>({ ...tree.addFile('orphan.md', folder), parent: undefined });
      const fileWithoutParentFolder = castTo<ExplorerTreeItem>({ ...file, file: castTo<TFile>({ name: 'file.md', parent: null, path: 'folder/file.md' }) });

      expect(getRuleFolder(view)).toBe(tree.root);
      tree.focusedItem = castTo<ExplorerTreeItem>(tree.root);
      expect(getRuleFolder(view)).toBe(tree.root);
      tree.focusedItem = folder;
      expect(getRuleFolder(view)).toBe(folder);
      tree.focusedItem = file;
      expect(getRuleFolder(view)).toBe(folder);
      tree.focusedItem = fileWithoutParentRow;
      expect(getRuleFolder(view)).toBe(folder);
      tree.focusedItem = topFile;
      expect(getRuleFolder(view)).toBe(tree.root);
      tree.focusedItem = fileWithoutParentFolder;
      expect(getRuleFolder(view)).toBe(tree.root);

      expect(getRuleFolderLabel(folder)).toBe('folder');
      expect(getRuleFolderLabel(tree.root)).toBe('the vault root');
      expect(getRuleFolderLabel(castTo<FolderTreeItem>({ file: { path: '/' } }))).toBe('the vault root');
    });
  });

  describe('the explorer\'s filter', () => {
    it('selects nothing while no filter is set', () => {
      const view = new FakeExplorerView(tree);
      tree.addFile('a.md');

      expect(hasActiveFilter(view.asView())).toBe(false);
      expect(getFilterMatchingItems(view.asView())).toEqual([]);

      view.searchQuery = { matcher: null };
      expect(hasActiveFilter(view.asView())).toBe(false);
    });

    it('finds the files the filter shows, inside collapsed folders too', () => {
      const view = new FakeExplorerView(tree);
      const folder = tree.addFolder('folder', tree.root, { isCollapsed: true });
      const inside = tree.addFile('inside.md', folder);
      tree.addFile('out.md', tree.root, { isFilteredOut: true });
      view.searchQuery = { matcher: {} };

      expect(hasActiveFilter(view.asView())).toBe(true);
      expect(getFilterMatchingItems(view.asView())).toEqual([inside]);
    });
  });

  describe('invertSelection', () => {
    it('swaps the selected and the unselected visible rows', () => {
      const a = tree.addFile('a.md');
      const b = tree.addFile('b.md');
      tree.selectItem(a);

      invertSelection(tree.asTree());

      expect([...tree.selectedDoms]).toEqual([b]);
    });
  });
});
