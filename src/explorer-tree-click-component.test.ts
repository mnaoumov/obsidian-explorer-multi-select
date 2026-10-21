import type { MockInstance } from 'vitest';

import { noop } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
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

import { ExplorerTreeClickComponent } from './explorer-tree-click-component.ts';
import { PluginSettings } from './plugin-settings.ts';
import { FakeExplorerView } from './test-helpers/fake-explorer-tree.test.helper.ts';

describe('ExplorerTreeClickComponent', () => {
  let app: App;
  let settings: PluginSettings;
  let view: FakeExplorerView;
  let a: ExplorerTreeItem;
  let b: ExplorerTreeItem;
  let click: ExplorerTreeClickComponent;
  let setActiveLeafSpy: MockInstance;

  beforeEach(() => {
    app = App.createConfigured__();
    setActiveLeafSpy = vi.spyOn(app.asOriginalType__().workspace, 'setActiveLeaf').mockImplementation(noop);
    settings = new PluginSettings();
    view = new FakeExplorerView();
    a = view.tree.addFile('a.md');
    b = view.tree.addFolder('b');
    click = new ExplorerTreeClickComponent({ app: app.asOriginalType__(), getSettings: (): PluginSettings => settings, view: view.asView() });
  });

  afterEach(() => {
    click.unload();
    view.containerEl.remove();
  });

  function dispatchClick(el: Element, init: MouseEventInit = {}): MouseEvent {
    const mouseEvent = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(mouseEvent);
    return mouseEvent;
  }

  function loadClick(): void {
    // The click listens on the window, which a detached element never reaches.
    document.body.append(view.containerEl);
    click.load();
  }

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

  it('toggles a Ctrl-clicked row before a plugin that takes Ctrl-clicks on the document, as Folder notes does', () => {
    settings.shouldToggleSelectionOnCtrlOrCommandClick = true;
    loadClick();
    const documentListener = vi.fn((event_: Event) => {
      event_.stopImmediatePropagation();
    });
    const rowListener = vi.fn();
    b.selfEl.addEventListener('click', rowListener);
    document.addEventListener('click', documentListener, { capture: true });

    try {
      const mouseEvent = dispatchClick(b.selfEl, { ctrlKey: true });
      expect([...view.tree.selectedDoms]).toEqual([b]);
      expect(view.tree.activeDom).toBe(b);
      expect(mouseEvent.defaultPrevented).toBe(true);
      expect(documentListener).not.toHaveBeenCalled();
      expect(rowListener).not.toHaveBeenCalled();

      dispatchClick(b.selfEl, { ctrlKey: true });
      expect(view.tree.selectedDoms.size).toBe(0);
    } finally {
      document.removeEventListener('click', documentListener, { capture: true });
    }
  });

  it('leaves to the document a click the window listener does not take', () => {
    loadClick();
    const documentListener = vi.fn();
    document.addEventListener('click', documentListener, { capture: true });
    const collapseIconEl = castTo<Element>(b.selfEl.querySelector('.collapse-icon'));

    try {
      // The setting is off.
      dispatchClick(a.selfEl, { ctrlKey: true });
      settings.shouldToggleSelectionOnCtrlOrCommandClick = true;
      // Not a Ctrl-click, a folder's arrow, Ctrl+Alt, Ctrl+Shift, a Ctrl+middle-click, and off the rows.
      dispatchClick(a.selfEl);
      dispatchClick(collapseIconEl, { ctrlKey: true });
      dispatchClick(a.selfEl, { altKey: true, ctrlKey: true });
      dispatchClick(a.selfEl, { ctrlKey: true, shiftKey: true });
      dispatchClick(a.selfEl, { button: 1, ctrlKey: true });
      dispatchClick(view.containerEl, { ctrlKey: true });

      expect(documentListener).toHaveBeenCalledTimes(7);
      expect(view.tree.selectedDoms.size).toBe(0);
    } finally {
      document.removeEventListener('click', documentListener, { capture: true });
    }
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
