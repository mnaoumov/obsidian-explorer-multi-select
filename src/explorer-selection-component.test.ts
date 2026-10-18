import type { WorkspaceLeaf } from 'obsidian';

import {
  noop,
  noopAsync
} from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  App,
  Platform
} from 'obsidian-test-mocks/obsidian';
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
import { PluginSettings } from './plugin-settings.ts';
import {
  createKeyboardEvent,
  FakeExplorerView
} from './test-helpers/fake-explorer-tree.test.helper.ts';

interface InternalPluginsHolder {
  internalPlugins: InternalPluginsLike;
}

interface InternalPluginsLike {
  getEnabledPluginById: (id: string) => null;
}

describe('ExplorerSelectionComponent', () => {
  let app: App;
  let leaves: WorkspaceLeaf[];
  let settings: PluginSettings;
  let statusBarItemEl: HTMLElement;
  let triggerWorkspaceLayoutReady: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    app = App.createConfigured__();
    leaves = [];
    settings = new PluginSettings();
    triggerWorkspaceLayoutReady = undefined;
    app.asOriginalType__().workspace.getLeavesOfType = vi.fn(() => leaves);
    app.asOriginalType__().workspace.onLayoutReady = vi.fn((callback: () => void) => {
      triggerWorkspaceLayoutReady = callback;
    });
    app.asOriginalType__().workspace.revealLeaf = vi.fn(noopAsync);
    castTo<InternalPluginsHolder>(app.asOriginalType__()).internalPlugins = { getEnabledPluginById: (): null => null };
    statusBarItemEl = createDiv();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function addExplorer(): FakeExplorerView['tree'] {
    return addExplorerView().tree;
  }

  function addExplorerView(): FakeExplorerView {
    const view = new FakeExplorerView();
    const leaf = strictProxy<WorkspaceLeaf>({
      loadIfDeferred: noopAsync,
      view: castTo<WorkspaceLeaf['view']>(view.asView())
    });
    leaves.push(leaf);
    return view;
  }

  function loadComponent(): ExplorerSelectionComponent {
    const component = new ExplorerSelectionComponent({ app: app.asOriginalType__(), getSettings: (): PluginSettings => settings, statusBarItemEl });
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

  it('routes core\'s click handling through the click settings', () => {
    const tree = addExplorer();
    const a = tree.addFile('a.md');
    const b = tree.addFile('b.md');
    vi.spyOn(app.asOriginalType__().workspace, 'setActiveLeaf').mockImplementation(noop);
    loadComponent();

    expect(tree.handleItemSelection(new MouseEvent('click', { ctrlKey: true }), a)).toBe(false);
    expect(statusBarText()).toBe('');

    settings.shouldToggleSelectionOnCtrlOrCommandClick = true;
    expect(tree.handleItemSelection(new MouseEvent('click', { ctrlKey: true }), a)).toBe(true);
    expect(statusBarText()).toBe('1 file');

    settings.shouldKeepSelectionOnClick = true;
    expect(tree.handleItemSelection(new MouseEvent('click'), b)).toBe(false);
    expect(statusBarText()).toBe('1 file');
    expect(tree.focusedItem).toBe(b);

    // Outside a click, a clear still clears.
    tree.clearSelectedDoms();
    expect(statusBarText()).toBe('');
  });

  it('reads the long-press setting when a long-press comes', () => {
    const view = addExplorerView();
    const file = view.tree.addFile('file.md');
    loadComponent();
    const isMobile = Platform.isMobile;
    Platform.isMobile = true;
    try {
      settings.shouldEnterSelectionModeOnLongPress = false;
      file.selfEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      expect(view.containerEl.hasClass('explorer-multi-select-selection-mode')).toBe(false);

      settings.shouldEnterSelectionModeOnLongPress = true;
      file.selfEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      expect(view.containerEl.hasClass('explorer-multi-select-selection-mode')).toBe(true);
    } finally {
      Platform.isMobile = isMobile;
    }
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

  it('adds a selection mode to each explorer and counts the selection in its bar', async () => {
    const view = addExplorerView();
    const file = view.tree.addFile('file.md');
    const component = loadComponent();
    expect(component.hasExplorer()).toBe(true);

    await component.toggleSelectionMode();
    expect(view.containerEl.hasClass('explorer-multi-select-selection-mode')).toBe(true);

    view.tree.selectItem(file);
    expect(barCountText(view)).toBe('1 file');

    view.tree.selectedDoms.delete(file);
    app.asOriginalType__().vault.trigger('delete', file.file);
    await noopAsync();
    expect(barCountText(view)).toBe('Nothing selected');

    await component.toggleSelectionMode();
    expect(view.containerEl.hasClass('explorer-multi-select-selection-mode')).toBe(false);
  });

  it('toggles nothing without an explorer, or while the explorer is still deferred', async () => {
    const component = loadComponent();
    expect(component.hasExplorer()).toBe(false);
    await component.toggleSelectionMode();

    leaves.push(strictProxy<WorkspaceLeaf>({ loadIfDeferred: noopAsync, view: castTo<WorkspaceLeaf['view']>({}) }));
    await component.toggleSelectionMode();
    expect(app.asOriginalType__().workspace.revealLeaf).toHaveBeenCalledOnce();
  });

  it('removes the selection mode of an explorer that was closed', () => {
    const view = addExplorerView();
    loadComponent();
    expect(view.containerEl.querySelector('.explorer-multi-select-toggle-button')).not.toBeNull();

    leaves.length = 0;
    app.asOriginalType__().workspace.trigger('layout-change');

    expect(view.containerEl.querySelector('.explorer-multi-select-toggle-button')).toBeNull();
  });
});

function barCountText(view: FakeExplorerView): null | string {
  return view.containerEl.querySelector('.explorer-multi-select-action-bar-count')?.textContent ?? null;
}
