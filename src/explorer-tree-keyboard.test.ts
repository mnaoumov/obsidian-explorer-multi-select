import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import type { ExplorerTreeItem } from './explorer-tree-items.ts';

import {
  ExplorerTreeKeyboard,
  isEditableTarget
} from './explorer-tree-keyboard.ts';
import {
  createKeyboardEvent,
  FakeExplorerTree
} from './test-helpers/fake-explorer-tree.test.helper.ts';

describe('ExplorerTreeKeyboard', () => {
  let tree: FakeExplorerTree;
  let keyboard: ExplorerTreeKeyboard;

  beforeEach(() => {
    tree = new FakeExplorerTree();
    keyboard = new ExplorerTreeKeyboard(tree.asTree());
  });

  function selectedNames(): string[] {
    return [...tree.selectedDoms].map((item) => item.file.path).sort();
  }

  describe('toggleFocusedItem', () => {
    it('selects the focused row, makes it the anchor, and prevents the default', () => {
      const a = tree.addFile('a.md');
      tree.focusedItem = a;

      expect(keyboard.toggleFocusedItem(createKeyboardEvent())).toBe(false);
      expect(selectedNames()).toEqual(['a.md']);
      expect(tree.activeDom).toBe(a);
      expect(tree.onKeyOpen).not.toHaveBeenCalled();
    });

    it('deselects a selected row', () => {
      const a = tree.addFile('a.md');
      tree.focusedItem = a;
      tree.selectedDoms.add(a);

      expect(keyboard.toggleFocusedItem(createKeyboardEvent())).toBe(false);
      expect(selectedNames()).toEqual([]);
    });

    it('leaves the key to core when nothing is focused', () => {
      const keyboardEvent = createKeyboardEvent();

      expect(keyboard.toggleFocusedItem(keyboardEvent)).toBe(true);
      expect(tree.onKeyOpen).toHaveBeenCalledWith(keyboardEvent);
    });

    it('leaves the key to core in a text field', () => {
      tree.focusedItem = tree.addFile('a.md');
      const keyboardEvent = createKeyboardEvent(createEl('input'));

      expect(keyboard.toggleFocusedItem(keyboardEvent)).toBe(true);
      expect(tree.onKeyOpen).toHaveBeenCalledWith(keyboardEvent);
      expect(selectedNames()).toEqual([]);
    });
  });

  describe('selectAll', () => {
    it('selects the visible rows of the focused row\'s folder', () => {
      const folder = tree.addFolder('folder');
      const a = tree.addFile('folder/a.md', folder);
      tree.addFile('folder/b.md', folder);
      tree.addFile('folder/hidden.md', folder, { isHidden: true });
      tree.addFile('outside.md');
      tree.focusedItem = a;

      expect(keyboard.selectAll(createKeyboardEvent())).toBe(false);
      expect(selectedNames()).toEqual(['folder/a.md', 'folder/b.md']);
    });

    it('selects every visible row when the folder is already fully selected', () => {
      const folder = tree.addFolder('folder');
      const a = tree.addFile('folder/a.md', folder);
      tree.addFile('outside.md');
      tree.focusedItem = a;

      keyboard.selectAll(createKeyboardEvent());
      keyboard.selectAll(createKeyboardEvent());

      expect(selectedNames()).toEqual(['folder', 'folder/a.md', 'outside.md']);
    });

    it('escalates even when a row in the folder cannot be selected', () => {
      const folder = tree.addFolder('folder');
      const a = tree.addFile('folder/a.md', folder);
      tree.addFile('folder/unselectable.md', folder, { isSelectable: false });
      tree.focusedItem = a;

      keyboard.selectAll(createKeyboardEvent());
      expect(selectedNames()).toEqual(['folder/a.md']);

      keyboard.selectAll(createKeyboardEvent());
      expect(selectedNames()).toEqual(['folder', 'folder/a.md']);
    });

    it('uses the top level when nothing is focused', () => {
      const folder = tree.addFolder('folder');
      tree.addFile('folder/a.md', folder);
      tree.addFile('top.md');

      keyboard.selectAll(createKeyboardEvent());

      expect(selectedNames()).toEqual(['folder', 'top.md']);
    });

    it('leaves Ctrl/Cmd+A to a text field', () => {
      tree.addFile('a.md');

      expect(keyboard.selectAll(createKeyboardEvent(createEl('textarea')))).toBe(true);
      expect(selectedNames()).toEqual([]);
    });
  });

  it('extends a range into an expanded folder', () => {
    const before = tree.addFile('before.md');
    const folder = tree.addFolder('folder');
    tree.addFile('folder/inside.md', folder);
    tree.focusedItem = before;

    keyboard.extendRange(createKeyboardEvent(), 'forwards');
    keyboard.extendRange(createKeyboardEvent(), 'forwards');

    expect(selectedNames()).toEqual(['before.md', 'folder', 'folder/inside.md']);
  });

  describe('extendRange', () => {
    let a: ExplorerTreeItem;
    let b: ExplorerTreeItem;
    let c: ExplorerTreeItem;
    let d: ExplorerTreeItem;

    beforeEach(() => {
      a = tree.addFile('a.md');
      b = tree.addFile('b.md');
      c = tree.addFile('c.md');
      d = tree.addFile('d.md');
    });

    it('grows the range and shrinks it when the direction reverses', () => {
      tree.focusedItem = a;

      expect(keyboard.extendRange(createKeyboardEvent(), 'forwards')).toBe(false);
      keyboard.extendRange(createKeyboardEvent(), 'forwards');
      expect(selectedNames()).toEqual(['a.md', 'b.md', 'c.md']);

      keyboard.extendRange(createKeyboardEvent(), 'backwards');
      expect(selectedNames()).toEqual(['a.md', 'b.md']);
      expect(tree.activeDom).toBe(a);
    });

    it('crosses the anchor and keeps rows selected before the range started', () => {
      tree.selectedDoms.add(d);
      tree.focusedItem = b;

      keyboard.extendRange(createKeyboardEvent(), 'forwards');
      expect(selectedNames()).toEqual(['b.md', 'c.md', 'd.md']);

      keyboard.extendRange(createKeyboardEvent(), 'backwards');
      keyboard.extendRange(createKeyboardEvent(), 'backwards');
      expect(selectedNames()).toEqual(['a.md', 'b.md', 'd.md']);
    });

    it('starts a fresh range when something else moved the focus', () => {
      tree.focusedItem = a;
      keyboard.extendRange(createKeyboardEvent(), 'forwards');

      tree.clearSelectedDoms();
      tree.focusedItem = c;
      keyboard.extendRange(createKeyboardEvent(), 'forwards');

      expect(selectedNames()).toEqual(['c.md', 'd.md']);
    });

    it('starts a fresh range when a row it added was deselected', () => {
      tree.focusedItem = a;
      keyboard.extendRange(createKeyboardEvent(), 'forwards');
      tree.deselectItem(a);

      keyboard.extendRange(createKeyboardEvent(), 'forwards');

      expect(selectedNames()).toEqual(['b.md', 'c.md']);
    });

    it('keeps the range when the focus is already on the last row', () => {
      tree.focusedItem = c;
      keyboard.extendRange(createKeyboardEvent(), 'forwards');
      keyboard.extendRange(createKeyboardEvent(), 'forwards');

      expect(selectedNames()).toEqual(['c.md', 'd.md']);
    });

    it('anchors on the first row it focuses when nothing was focused', () => {
      keyboard.extendRange(createKeyboardEvent(), 'forwards');

      expect(selectedNames()).toEqual(['a.md']);
    });

    it('selects nothing when there is no row to focus', () => {
      const emptyTree = new FakeExplorerTree();
      const emptyKeyboard = new ExplorerTreeKeyboard(emptyTree.asTree());

      expect(emptyKeyboard.extendRange(createKeyboardEvent(), 'forwards')).toBe(false);
      expect(emptyTree.selectedDoms.size).toBe(0);
    });

    it('restarts at the focus when the anchor is no longer visible', () => {
      tree.focusedItem = a;
      keyboard.extendRange(createKeyboardEvent(), 'forwards');
      a.info.hidden = true;

      keyboard.extendRange(createKeyboardEvent(), 'forwards');

      expect(tree.selectedDoms.has(c)).toBe(true);
      expect(tree.activeDom).toBe(c);
    });

    it('leaves Shift+Up/Down to core in a text field', () => {
      const down = createKeyboardEvent(createEl('input'));
      const up = createKeyboardEvent(createEl('input'));

      expect(keyboard.extendRange(down, 'forwards')).toBe(true);
      expect(keyboard.extendRange(up, 'backwards')).toBe(true);
      expect(tree.onKeyArrowDown).toHaveBeenCalledWith(down);
      expect(tree.onKeyArrowUp).toHaveBeenCalledWith(up);
    });
  });
});

describe('isEditableTarget', () => {
  it('is true for text fields and editable content', () => {
    const editable = createDiv();
    Object.defineProperty(editable, 'isContentEditable', { value: true });

    expect(isEditableTarget(createKeyboardEvent(createEl('input')))).toBe(true);
    expect(isEditableTarget(createKeyboardEvent(createEl('textarea')))).toBe(true);
    expect(isEditableTarget(createKeyboardEvent(createEl('select')))).toBe(true);
    expect(isEditableTarget(createKeyboardEvent(editable))).toBe(true);
  });

  it('is false for other targets', () => {
    expect(isEditableTarget(createKeyboardEvent(createDiv()))).toBe(false);
    expect(isEditableTarget(createKeyboardEvent(document.createTextNode('text')))).toBe(false);
    expect(isEditableTarget(createKeyboardEvent())).toBe(false);
  });
});
