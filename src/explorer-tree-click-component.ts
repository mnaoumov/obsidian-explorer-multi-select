import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import {
  Component,
  Keymap
} from 'obsidian';

import type {
  ExplorerTree,
  ExplorerTreeItem
} from './explorer-tree-items.ts';

import {
  getItemFromEvent,
  isOnCollapseIcon,
  registerWindowCaptureClick
} from './explorer-window-click.ts';

/**
 * The click settings this class reads on every click, so a change applies at once.
 */
export interface ExplorerTreeClickComponentSettings {
  /**
   * Whether a plain click keeps the selection.
   */
  readonly shouldKeepSelectionOnClick: boolean;

  /**
   * Whether a Ctrl/Cmd-click toggles the row in the selection.
   */
  readonly shouldToggleSelectionOnCtrlOrCommandClick: boolean;
}

interface ExplorerTreeClickComponentConstructorParams {
  readonly app: App;
  readonly getSettings: () => ExplorerTreeClickComponentSettings;
  readonly view: FileExplorerView;
}

/**
 * Handles a click on a row of one File explorer tree, before core's `handleItemSelection` does.
 *
 * Core toggles a row on Alt-click and adds a range on Shift-click. Any other click clears the selection and
 * opens the row, in a new tab for Ctrl/Cmd. Opening a file then clears the selection a second time, unless
 * the file's row is the focused one.
 */
export class ExplorerTreeClickComponent extends Component {
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
  private readonly getSettings: () => ExplorerTreeClickComponentSettings;
  private readonly tree: ExplorerTree;
  private readonly view: FileExplorerView;

  public constructor(params: ExplorerTreeClickComponentConstructorParams) {
    super();
    this.app = params.app;
    this.getSettings = params.getSettings;
    this.view = params.view;
    this.tree = params.view.tree;
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

    if (Keymap.isModifier(mouseEvent, 'Mod')) {
      // The window listener takes this click first; this handles one that reaches core some other way.
      if (!this.shouldToggleOnClick(mouseEvent)) {
        return isHandledAsSelectionByCore();
      }
      this.toggleItem(item);
      return true;
    }

    if (!this.getSettings().shouldKeepSelectionOnClick || this.tree.selectedDoms.size === 0) {
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

  public override onload(): void {
    registerWindowCaptureClick(this, this.view, this.onWindowClick.bind(this));
  }

  /**
   * Toggles a Ctrl/Cmd-clicked row before any listener on the document sees the click. `Folder notes` opens a
   * folder's note on a Ctrl/Cmd-click from a capture listener on the document and stops the click, so it never
   * reaches core's `handleItemSelection`.
   *
   * @param mouseEvent - The click.
   */
  private onWindowClick(mouseEvent: MouseEvent): void {
    if (!this.shouldToggleOnClick(mouseEvent) || isOnCollapseIcon(mouseEvent)) {
      return;
    }
    const item = getItemFromEvent(this.view, mouseEvent);
    if (!item) {
      return;
    }
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    this.toggleItem(item);
  }

  private shouldToggleOnClick(mouseEvent: MouseEvent): boolean {
    return this.getSettings().shouldToggleSelectionOnCtrlOrCommandClick && isPrimaryClick(mouseEvent) && !mouseEvent.altKey
      && !mouseEvent.shiftKey && Keymap.isModifier(mouseEvent, 'Mod');
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
