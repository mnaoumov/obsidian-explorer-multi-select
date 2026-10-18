import type { App } from 'obsidian';

import { Keymap } from 'obsidian';

import type {
  ExplorerTree,
  ExplorerTreeItem
} from './explorer-tree-items.ts';

/**
 * The click settings this class reads on every click, so a change applies at once.
 */
export interface ExplorerTreeClickSettings {
  /**
   * Whether a plain click keeps the selection.
   */
  readonly shouldKeepSelectionOnClick: boolean;

  /**
   * Whether a Ctrl/Cmd-click toggles the row in the selection.
   */
  readonly shouldToggleSelectionOnCtrlOrCommandClick: boolean;
}

interface ExplorerTreeClickConstructorParams {
  readonly app: App;
  readonly getSettings: () => ExplorerTreeClickSettings;
  readonly tree: ExplorerTree;
}

/**
 * Handles a click on a row of one File explorer tree, before core's `handleItemSelection` does.
 *
 * Core toggles a row on Alt-click and adds a range on Shift-click. Any other click clears the selection and
 * opens the row, in a new tab for Ctrl/Cmd. Opening a file then clears the selection a second time, unless
 * the file's row is the focused one.
 */
export class ExplorerTreeClick {
  /**
   * Whether the selection is to survive the `clearSelectedDoms` calls core makes right now.
   *
   * @returns Whether those calls are to be skipped.
   */
  public get isKeepingSelection(): boolean {
    return this._isKeepingSelection;
  }

  private _isKeepingSelection = false;
  private readonly app: App;
  private readonly getSettings: () => ExplorerTreeClickSettings;
  private readonly tree: ExplorerTree;

  public constructor(params: ExplorerTreeClickConstructorParams) {
    this.app = params.app;
    this.getSettings = params.getSettings;
    this.tree = params.tree;
  }

  /**
   * Runs instead of core's `handleItemSelection`.
   *
   * @param mouseEvent - The click. Core also passes a key event here, for Enter.
   * @param item - The clicked row.
   * @param isHandledAsSelectionByCore - Runs core's `handleItemSelection`.
   * @returns What core's `handleItemSelection` returns: `true` when the click was a selection change and
   * must not open the row.
   */
  public handleItemSelection(mouseEvent: MouseEvent, item: ExplorerTreeItem, isHandledAsSelectionByCore: () => boolean): boolean {
    if (!isPrimaryClick(mouseEvent) || mouseEvent.altKey || mouseEvent.shiftKey) {
      return isHandledAsSelectionByCore();
    }

    const settings = this.getSettings();
    if (Keymap.isModifier(mouseEvent, 'Mod')) {
      if (!settings.shouldToggleSelectionOnCtrlOrCommandClick) {
        return isHandledAsSelectionByCore();
      }
      this.toggleItem(item);
      return true;
    }

    if (!settings.shouldKeepSelectionOnClick || this.tree.selectedDoms.size === 0) {
      return isHandledAsSelectionByCore();
    }

    this._isKeepingSelection = true;
    try {
      return isHandledAsSelectionByCore();
    } finally {
      this._isKeepingSelection = false;
      // Opening a file clears the selection unless its row is the focused one.
      this.tree.setFocusedItem(item, false);
    }
  }

  /**
   * Toggles a row the way core's Alt-click does.
   *
   * @param item - The row.
   */
  private toggleItem(item: ExplorerTreeItem): void {
    const tree = this.tree;
    this.app.workspace.setActiveLeaf(tree.view.leaf, { focus: true });
    if (tree.selectedDoms.has(item)) {
      tree.deselectItem(item);
    } else {
      tree.selectItem(item);
      tree.setFocusedItem(item, false);
      // Core's Shift-click ranges from `activeDom`.
      tree.activeDom = item;
    }
  }
}

function isPrimaryClick(mouseEvent: MouseEvent): boolean {
  // `instanceOf` rather than `instanceof`, which is false for an event of a popout window.
  return mouseEvent.instanceOf(MouseEvent) && mouseEvent.button === 0;
}
