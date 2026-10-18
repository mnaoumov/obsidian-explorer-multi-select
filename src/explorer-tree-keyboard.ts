import type {
  ExplorerTree,
  ExplorerTreeItem
} from './explorer-tree-items.ts';

import {
  getItemsInRange,
  getVisibleChildren,
  getVisibleItems
} from './explorer-tree-items.ts';

/**
 * The direction of a Shift+Up/Down press.
 */
export type RangeDirection = 'backwards' | 'forwards';

/**
 * What a keymap listener returns to Obsidian's `Scope`: `false` handles the key and prevents its default,
 * while any other value stops the scope chain and leaves the default alone. That is also what core's own
 * listeners return, so delegating to them keeps their effect.
 */
type KeymapResult = boolean;

/**
 * The Shift+Up/Down range in progress. Core's Shift+arrow only ever adds rows; this one remembers what it
 * added, so it can take rows back off when the direction reverses.
 */
interface RangeState {
  readonly anchor: ExplorerTreeItem;
  readonly baseSelection: ReadonlySet<ExplorerTreeItem>;
  readonly focus: ExplorerTreeItem;
  readonly items: readonly ExplorerTreeItem[];
}

/**
 * The keyboard selection of one File explorer tree: Ctrl/Cmd+A, Space and a Shift+Up/Down range that
 * shrinks when the direction reverses.
 */
export class ExplorerTreeKeyboard {
  private rangeState: RangeState | undefined;

  public constructor(private readonly tree: ExplorerTree) {}

  /**
   * Handles Shift+Up/Down: moves the focus and makes the selection the range from the anchor to the new
   * focus, plus whatever was selected before the range started.
   *
   * @param keyboardEvent - The key event.
   * @param direction - Which way the focus moves.
   * @returns The keymap result.
   */
  public extendRange(keyboardEvent: KeyboardEvent, direction: RangeDirection): KeymapResult {
    if (isEditableTarget(keyboardEvent)) {
      return this.delegateArrow(keyboardEvent, direction);
    }

    const tree = this.tree;
    const previousFocus = this.getFocusedItem();
    const state = this.isRangeInProgress(previousFocus) ? this.rangeState : undefined;

    tree.changeFocusedItem(direction);
    const focus = this.getFocusedItem();
    if (!focus) {
      this.rangeState = undefined;
      return false;
    }

    let anchor = state?.anchor ?? previousFocus ?? focus;
    const visibleItems = getVisibleItems(tree.root);
    let items = getItemsInRange(visibleItems, anchor, focus);
    if (!items) {
      // The anchor is gone from view: its folder was collapsed, or the filter hides it. Start over here.
      anchor = focus;
      items = [focus];
    }

    const baseSelection = state?.baseSelection ?? new Set(tree.selectedDoms);
    const itemSet = new Set(items);
    for (const item of state?.items ?? []) {
      if (!itemSet.has(item) && !baseSelection.has(item)) {
        tree.deselectItem(item);
      }
    }
    for (const item of items) {
      tree.selectItem(item);
    }

    // Core's Shift-click ranges from `activeDom`, so a Shift-click after the keys continues this range.
    tree.activeDom = anchor;
    this.rangeState = { anchor, baseSelection, focus, items };
    return false;
  }

  /**
   * Handles Ctrl/Cmd+A: selects the visible rows in the focused row's folder. When that adds nothing,
   * because they are all selected already, it selects every visible row in the explorer.
   *
   * @param keyboardEvent - The key event.
   * @returns The keymap result.
   */
  public selectAll(keyboardEvent: KeyboardEvent): KeymapResult {
    if (isEditableTarget(keyboardEvent)) {
      // Leave Ctrl/Cmd+A to the text field, where it selects the text.
      return true;
    }

    const tree = this.tree;
    const parent = this.getFocusedItem()?.parent ?? tree.root;
    const sizeBefore = tree.selectedDoms.size;
    this.selectItems(getVisibleChildren(parent));
    if (tree.selectedDoms.size === sizeBefore) {
      this.selectItems(getVisibleItems(tree.root));
    }

    this.rangeState = undefined;
    return false;
  }

  /**
   * Handles Space: toggles the focused row in the selection, where core would open it. Enter still opens.
   *
   * @param keyboardEvent - The key event.
   * @returns The keymap result.
   */
  public toggleFocusedItem(keyboardEvent: KeyboardEvent): KeymapResult {
    const tree = this.tree;
    const focus = this.getFocusedItem();
    if (!focus || isEditableTarget(keyboardEvent)) {
      tree.onKeyOpen(keyboardEvent);
      return true;
    }

    if (tree.selectedDoms.has(focus)) {
      tree.deselectItem(focus);
    } else {
      tree.selectItem(focus);
      tree.activeDom = focus;
    }

    this.rangeState = undefined;
    return false;
  }

  private delegateArrow(keyboardEvent: KeyboardEvent, direction: RangeDirection): KeymapResult {
    const tree = this.tree;
    const methodName = direction === 'forwards' ? 'onKeyArrowDown' : 'onKeyArrowUp';
    tree[methodName](keyboardEvent);
    return true;
  }

  private getFocusedItem(): ExplorerTreeItem | null {
    const focusedItem = this.tree.focusedItem;
    return this.tree.isItem(focusedItem ?? undefined) ? focusedItem : null;
  }

  /**
   * A range continues only while nothing else touched the focus or the rows it added. A click, Esc or
   * plain arrow key in between starts a fresh range from wherever the focus is now.
   *
   * @param previousFocus - The focused row before this key press.
   * @returns Whether the next press extends the current range.
   */
  private isRangeInProgress(previousFocus: ExplorerTreeItem | null): boolean {
    const state = this.rangeState;
    return state?.focus === previousFocus && state.items.every((item) => this.tree.selectedDoms.has(item));
  }

  private selectItems(items: readonly ExplorerTreeItem[]): void {
    for (const item of items) {
      this.tree.selectItem(item);
    }
  }
}

/**
 * Tells whether a key press is meant for a text field, such as the explorer's own filter box.
 *
 * @param keyboardEvent - The key event.
 * @returns Whether the event's target takes text input.
 */
export function isEditableTarget(keyboardEvent: KeyboardEvent): boolean {
  // `targetNode` and `instanceOf` rather than `instanceof`, which is false for an element of a popout window.
  const target = keyboardEvent.targetNode;
  return !!target?.instanceOf(HTMLElement) && (
    target.isContentEditable || target.instanceOf(HTMLInputElement) || target.instanceOf(HTMLTextAreaElement)
    || target.instanceOf(HTMLSelectElement)
  );
}
