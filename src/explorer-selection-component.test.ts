import type { WorkspaceLeaf } from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ExplorerTreeItem } from './explorer-tree-items.ts';

import { ExplorerSelectionComponent } from './explorer-selection-component.ts';
import {
  createKeyboardEvent,
  FakeExplorerTree
} from './test-helpers/fake-explorer-tree.test.helper.ts';

describe('ExplorerSelectionComponent', () => {
  let app: App;
  let leaves: WorkspaceLeaf[];
  let statusBarItemEl: HTMLElement;
  let triggerWorkspaceLayoutReady: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    app = App.createConfigured__();
    leaves = [];
    triggerWorkspaceLayoutReady = undefined;
    app.asOriginalType__().workspace.getLeavesOfType = vi.fn(() => leaves);
    app.asOriginalType__().workspace.onLayoutReady = vi.fn((callback: () => void) => {
      triggerWorkspaceLayoutReady = callback;
    });
    statusBarItemEl = createDiv();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function addExplorer(): FakeExplorerTree {
    const tree = new FakeExplorerTree();
    leaves.push(strictProxy<WorkspaceLeaf>({ view: castTo<WorkspaceLeaf['view']>({ tree: tree.asTree() }) }));
    return tree;
  }

  function loadComponent(): ExplorerSelectionComponent {
    const component = new ExplorerSelectionComponent({ app: app.asOriginalType__(), statusBarItemEl });
    component.load();
    triggerWorkspaceLayoutReady?.();
    vi.runAllTimers();
    return component;
  }

  function statusBarText(): string {
    // `isShown()` reads the layout, which jsdom does not have; `hide()` and `toggle()` set `display`.
    return statusBarItemEl.style.display === 'none' ? '' : statusBarItemEl.getText();
  }

  it('hides the status-bar item until something is selected', () => {
    addExplorer();
    loadComponent();

    expect(statusBarItemEl.hasClass('explorer-multi-select-status-bar-item')).toBe(true);
    expect(statusBarText()).toBe('');
  });

  it('counts the selection in the status bar as core changes it', () => {
    const tree = addExplorer();
    const folder = tree.addFolder('folder');
    const file = tree.addFile('file.md');
    loadComponent();

    tree.selectItem(folder);
    tree.selectItem(file);
    expect(statusBarText()).toBe('1 file, 1 folder');

    tree.deselectItem(folder);
    expect(statusBarText()).toBe('1 file');

    tree.clearSelectedDoms();
    expect(statusBarText()).toBe('');
  });

  it('recounts after a deletion, which the explorer removes from the selection behind the patches', async () => {
    const tree = addExplorer();
    const file = tree.addFile('file.md');
    loadComponent();
    tree.selectItem(file);

    tree.selectedDoms.delete(file);
    app.asOriginalType__().vault.trigger('delete', file.file);
    await noopAsync();

    expect(statusBarText()).toBe('');
  });

  it('puts its keys ahead of the keys core registered, and runs them', () => {
    const tree = addExplorer();
    const coreListener = vi.fn();
    tree.scope.register([], ' ', coreListener);
    const a = tree.addFile('a.md');
    tree.addFile('b.md');
    loadComponent();

    tree.focusedItem = a;
    tree.scope.dispatch([], ' ', createKeyboardEvent());
    expect(coreListener).not.toHaveBeenCalled();
    expect(statusBarText()).toBe('1 file');

    tree.scope.dispatch(['Shift'], 'ArrowDown', createKeyboardEvent());
    expect(statusBarText()).toBe('2 files');

    tree.scope.dispatch(['Shift'], 'ArrowUp', createKeyboardEvent());
    expect(statusBarText()).toBe('1 file');

    tree.scope.dispatch(['Mod'], 'A', createKeyboardEvent());
    expect(statusBarText()).toBe('2 files');
  });

  it('removes its keys and patches on unload', () => {
    const tree = addExplorer();
    const file = tree.addFile('file.md');
    const component = loadComponent();

    component.unload();

    expect(tree.scope.keys).toEqual([]);
    tree.selectItem(file);
    expect(statusBarText()).toBe('');
  });

  it('attaches once to each explorer, including one built after layout ready', () => {
    const first = addExplorer();
    leaves.push(strictProxy<WorkspaceLeaf>({ view: castTo<WorkspaceLeaf['view']>({}) }));
    loadComponent();
    const second = addExplorer();

    app.asOriginalType__().workspace.trigger('layout-change');
    app.asOriginalType__().workspace.trigger('layout-change');

    expect(first.scope.keys).toHaveLength(4);
    expect(second.scope.keys).toHaveLength(4);
  });

  it('clears the count when the explorer that last changed is closed', () => {
    const tree = addExplorer();
    const file: ExplorerTreeItem = tree.addFile('file.md');
    loadComponent();
    tree.selectItem(file);

    leaves.length = 0;
    app.asOriginalType__().workspace.trigger('layout-change');

    expect(statusBarText()).toBe('');
  });

  it('keeps the count when another explorer opens', () => {
    const tree = addExplorer();
    const file: ExplorerTreeItem = tree.addFile('file.md');
    loadComponent();
    tree.selectItem(file);

    addExplorer();
    app.asOriginalType__().workspace.trigger('layout-change');

    expect(statusBarText()).toBe('1 file');
  });
});
