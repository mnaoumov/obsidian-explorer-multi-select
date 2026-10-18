import type { MockInstance } from 'vitest';

import { noop } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ExplorerTreeItem } from './explorer-tree-items.ts';

import { ExplorerTreeClick } from './explorer-tree-click.ts';
import { PluginSettings } from './plugin-settings.ts';
import { FakeExplorerView } from './test-helpers/fake-explorer-tree.test.helper.ts';

describe('ExplorerTreeClick', () => {
  let app: App;
  let settings: PluginSettings;
  let view: FakeExplorerView;
  let a: ExplorerTreeItem;
  let b: ExplorerTreeItem;
  let click: ExplorerTreeClick;
  let setActiveLeafSpy: MockInstance;

  beforeEach(() => {
    app = App.createConfigured__();
    setActiveLeafSpy = vi.spyOn(app.asOriginalType__().workspace, 'setActiveLeaf').mockImplementation(noop);
    settings = new PluginSettings();
    view = new FakeExplorerView();
    a = view.tree.addFile('a.md');
    b = view.tree.addFolder('b');
    click = new ExplorerTreeClick({ app: app.asOriginalType__(), getSettings: (): PluginSettings => settings, tree: view.tree.asTree() });
  });

  function doesClickOnlySelect(item: ExplorerTreeItem, init: MouseEventInit = {}): boolean {
    const tree = view.tree;
    return click.handleItemSelection(new MouseEvent('click', init), item, () => tree.handleItemSelection(new MouseEvent('click', init), item));
  }

  it('leaves a Ctrl-click to core while the toggle is off', () => {
    view.tree.selectItem(b);

    expect(doesClickOnlySelect(a, { ctrlKey: true })).toBe(false);
    expect(view.tree.selectedDoms.size).toBe(0);
  });

  it('toggles a row on Ctrl-click, without opening it, while the toggle is on', () => {
    settings.shouldToggleSelectionOnCtrlOrCommandClick = true;
    view.tree.selectItem(b);

    expect(doesClickOnlySelect(a, { ctrlKey: true })).toBe(true);
    expect([...view.tree.selectedDoms]).toEqual([b, a]);
    expect(view.tree.focusedItem).toBe(a);
    expect(view.tree.activeDom).toBe(a);
    expect(setActiveLeafSpy).toHaveBeenCalledWith(view.leaf, { focus: true });

    expect(doesClickOnlySelect(a, { ctrlKey: true })).toBe(true);
    expect([...view.tree.selectedDoms]).toEqual([b]);
  });

  it('leaves Ctrl+Alt, Ctrl+Shift and a Ctrl+middle-click to core', () => {
    settings.shouldToggleSelectionOnCtrlOrCommandClick = true;

    expect(doesClickOnlySelect(a, { altKey: true, ctrlKey: true })).toBe(true);
    expect(doesClickOnlySelect(a, { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(doesClickOnlySelect(b, { button: 1, ctrlKey: true })).toBe(false);
    expect(setActiveLeafSpy).not.toHaveBeenCalled();
  });

  it('leaves a key press to core', () => {
    settings.shouldToggleSelectionOnCtrlOrCommandClick = true;
    view.tree.selectItem(b);
    const keyboardEvent = new KeyboardEvent('keydown', { ctrlKey: true });

    // Core passes Enter's key event to handleItemSelection, which Obsidian types as taking a mouse event.
    const isResult = click.handleItemSelection(castTo<MouseEvent>(keyboardEvent), a, () => false);

    expect(isResult).toBe(false);
    expect(view.tree.selectedDoms.has(b)).toBe(true);
    expect(view.tree.selectedDoms.has(a)).toBe(false);
  });

  it('lets a plain click clear the selection while sticky selection is off', () => {
    view.tree.selectItem(b);

    expect(doesClickOnlySelect(a)).toBe(false);
    expect(view.tree.selectedDoms.size).toBe(0);
    expect(view.tree.focusedItem).toBeNull();
  });

  it('keeps the selection through a plain click while sticky selection is on', () => {
    settings.shouldKeepSelectionOnClick = true;
    view.tree.selectItem(b);
    let wasKeepingSelection = false;

    const isResult = click.handleItemSelection(new MouseEvent('click'), a, () => {
      wasKeepingSelection = click.isKeepingSelection;
      return false;
    });

    expect(isResult).toBe(false);
    expect(wasKeepingSelection).toBe(true);
    expect(click.isKeepingSelection).toBe(false);
    // The opened file's row is focused, which keeps core's `onFileOpen` from clearing the selection.
    expect(view.tree.focusedItem).toBe(a);
  });

  it('leaves a plain click to core when nothing is selected', () => {
    settings.shouldKeepSelectionOnClick = true;
    view.tree.focusedItem = b;

    expect(doesClickOnlySelect(a)).toBe(false);
    expect(view.tree.focusedItem).toBeNull();
  });
});
