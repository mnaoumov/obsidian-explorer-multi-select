import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  IconName,
  TAbstractFile
} from 'obsidian';

import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  Component,
  Menu,
  Platform,
  setIcon,
  setTooltip
} from 'obsidian';

import type { ExplorerBatchDelete } from '../batch-delete/explorer-batch-delete.ts';
import type { ExplorerTreeItem } from '../selection-core/explorer-tree-items.ts';

import {
  getItemFromEvent,
  isOnCollapseIcon,
  registerWindowCaptureClick
} from '../click/explorer-window-click.ts';
import { invertSelection } from '../select-by-rule/select-by-rule.ts';
import {
  countItems,
  formatSelectionCount,
  getVisibleItems
} from '../selection-core/explorer-tree-items.ts';
import {
  FILE_EXPLORER_MENU_SOURCE,
  findMenuItem,
  findMenuItemByIcon
} from '../selection-core/menu-items.ts';

/**
 * The icon of core's "Move N items to..." item, which is how it is told apart from the other items that
 * `files-menu` listeners add: its title is translated.
 */
const MOVE_MENU_ITEM_ICON_CLASS = 'lucide-folder-tree';

interface ActionButton {
  readonly el: HTMLElement;
  readonly isAvailable: () => boolean;
}

interface ExplorerSelectionModeComponentAddActionButtonOptions {
  readonly action: string;
  readonly icon: IconName;
  readonly isAvailable?: () => boolean;
  readonly label: string;
  readonly onClick: (mouseEvent: MouseEvent) => void;
}

interface ExplorerSelectionModeComponentConstructorParams {
  readonly app: App;
  readonly batchDelete: ExplorerBatchDelete;
  readonly shouldEnterOnLongPress: () => boolean;
  readonly view: FileExplorerView;
}

/**
 * The touch selection mode of one File explorer. While it is on, every row shows a checkbox, a tap toggles
 * the row instead of opening it, and an action bar under the tree counts the selection and acts on it.
 *
 * The actions are core's own, except Delete: the bar runs the same Move and Bookmark the context menu runs,
 * Delete asks once for the whole selection, and More opens the context menu, so every plugin that adds to it
 * through `files-menu` is there too.
 */
export class ExplorerSelectionModeComponent extends Component {
  /**
   * Whether the mode is on.
   *
   * @returns Whether the mode is on.
   */
  public get isActive(): boolean {
    return this._isActive;
  }

  private _isActive = false;
  private actionBarEl: HTMLElement | null = null;
  private readonly actionButtons: ActionButton[] = [];
  private readonly app: App;
  private readonly batchDelete: ExplorerBatchDelete;
  private countEl: HTMLElement | null = null;
  private isSwallowingContextMenu = false;
  private readonly shouldEnterOnLongPress: () => boolean;
  private toggleButtonEl: HTMLElement | null = null;

  private readonly view: FileExplorerView;

  public constructor(params: ExplorerSelectionModeComponentConstructorParams) {
    super();
    this.app = params.app;
    this.batchDelete = params.batchDelete;
    this.shouldEnterOnLongPress = params.shouldEnterOnLongPress;
    this.view = params.view;
  }

  /**
   * Turns the mode on.
   */
  public enter(): void {
    if (this._isActive) {
      return;
    }
    this._isActive = true;
    this.view.containerEl.addClass('explorer-multi-select-selection-mode');
    this.toggleButtonEl?.addClass('is-active');
    this.createActionBar();
    this.refresh();
  }

  /**
   * Turns the mode off and clears the selection, the way Done does in a phone's file manager.
   */
  public exit(): void {
    if (!this._isActive) {
      return;
    }
    this.leave();
    this.view.tree.clearSelectedDoms();
  }

  public override onload(): void {
    this.createToggleButton();
    // Taps are taken on the window, ahead of other plugins that take row clicks on the document.
    registerWindowCaptureClick(this, this.view, this.onClick.bind(this));
    // Capture phase: the rows' own listeners run after these, and must not run for a tap the mode takes.
    this.registerDomEvent(this.view.containerEl, 'contextmenu', this.onContextMenu.bind(this), { capture: true });
    this.registerDomEvent(this.view.containerEl, 'touchend', this.onGestureEnd.bind(this), { capture: true });
    this.registerDomEvent(this.view.containerEl, 'mouseup', this.onGestureEnd.bind(this), { capture: true });
  }

  public override onunload(): void {
    this.leave();
    this.toggleButtonEl?.remove();
    this.toggleButtonEl = null;
  }

  /**
   * Updates the action bar to the current selection.
   */
  public refresh(): void {
    if (!this.countEl) {
      return;
    }
    const selectedItems = this.getSelectedItems();
    this.countEl.setText(formatSelectionCount(countItems(selectedItems)) || 'Nothing selected');
    for (const button of this.actionButtons) {
      const isAvailable = button.isAvailable();
      button.el.toggleClass('is-disabled', !isAvailable);
      button.el.setAttribute('aria-disabled', String(!isAvailable));
    }
  }

  /**
   * Turns the mode on when it is off, and off when it is on.
   */
  public toggle(): void {
    if (this._isActive) {
      this.exit();
    } else {
      this.enter();
    }
  }

  private addActionButton(parentEl: HTMLElement, options: ExplorerSelectionModeComponentAddActionButtonOptions): void {
    const el = parentEl.createDiv({ attr: { 'data-action': options.action }, cls: 'clickable-icon explorer-multi-select-action-bar-button' });
    setIcon(el, options.icon);
    setTooltip(el, options.label);
    const isAvailable = options.isAvailable ?? ((): boolean => this.view.tree.selectedDoms.size > 0);
    el.addEventListener('click', (mouseEvent) => {
      if (isAvailable()) {
        options.onClick(mouseEvent);
      }
    });
    this.actionButtons.push({ el, isAvailable });
  }

  private bookmarkSelection(): void {
    // The button is available only while the Bookmarks plugin is enabled.
    const bookmarks = ensureNonNullable(this.app.internalPlugins.getEnabledPluginById('bookmarks'));
    const menu = new Menu();
    bookmarks.onFilesMenu(menu, this.getSelectedFiles(), FILE_EXPLORER_MENU_SOURCE, this.view.leaf);
    findMenuItem(menu, () => true)?.callback?.();
  }

  private createActionBar(): void {
    const actionBarEl = this.view.containerEl.createDiv({ cls: 'explorer-multi-select-action-bar' });
    this.actionBarEl = actionBarEl;
    this.countEl = actionBarEl.createDiv({ cls: 'explorer-multi-select-action-bar-count' });

    const buttonsEl = actionBarEl.createDiv({ cls: 'explorer-multi-select-action-bar-buttons' });
    this.addActionButton(buttonsEl, { action: 'move', icon: 'folder-tree', label: 'Move', onClick: this.moveSelection.bind(this) });
    this.addActionButton(buttonsEl, {
      action: 'bookmark',
      icon: 'bookmark',
      isAvailable: () => this.view.tree.selectedDoms.size > 0 && this.app.internalPlugins.getEnabledPluginById('bookmarks') !== null,
      label: 'Bookmark',
      onClick: this.bookmarkSelection.bind(this)
    });
    this.addActionButton(buttonsEl, { action: 'delete', icon: 'trash-2', label: 'Delete', onClick: this.deleteSelection.bind(this) });
    this.addActionButton(buttonsEl, { action: 'more', icon: 'more-horizontal', label: 'More actions', onClick: this.openContextMenu.bind(this) });
    this.addActionButton(buttonsEl, { action: 'select-all', icon: 'check-check', isAvailable: () => true, label: 'Select all', onClick: this.selectAll.bind(this) });
    this.addActionButton(buttonsEl, {
      action: 'invert',
      icon: 'flip-vertical-2',
      isAvailable: () => true,
      label: 'Invert selection',
      onClick: (): void => {
        invertSelection(this.view.tree);
      }
    });
    this.addActionButton(buttonsEl, {
      action: 'clear',
      icon: 'list-x',
      label: 'Clear selection',
      onClick: (): void => {
        // Unlike Done, the mode stays on, so the next taps start a fresh selection.
        this.view.tree.clearSelectedDoms();
      }
    });

    const doneButtonEl = buttonsEl.createEl('button', { cls: 'mod-cta explorer-multi-select-action-bar-done', text: 'Done' });
    doneButtonEl.addEventListener('click', this.exit.bind(this));
  }

  private createToggleButton(): void {
    const navButtonsEl = this.view.containerEl.querySelector('.nav-buttons-container');
    if (!navButtonsEl?.instanceOf(HTMLElement)) {
      return;
    }
    const toggleButtonEl = navButtonsEl.createDiv({ cls: 'clickable-icon nav-action-button explorer-multi-select-toggle-button' });
    setIcon(toggleButtonEl, 'list-checks');
    setTooltip(toggleButtonEl, 'Selection mode');
    toggleButtonEl.addEventListener('click', this.toggle.bind(this));
    this.toggleButtonEl = toggleButtonEl;
  }

  private deleteSelection(mouseEvent: MouseEvent): void {
    if (this.batchDelete.isBatch()) {
      invokeAsyncSafely(() => this.batchDelete.deleteSelection());
    } else {
      this.view.onDeleteSelectedFiles(mouseEvent);
    }
  }

  private getSelectedFiles(): TAbstractFile[] {
    return this.getSelectedItems().map((item) => item.file);
  }

  private getSelectedItems(): ExplorerTreeItem[] {
    return [...this.view.tree.selectedDoms];
  }

  private leave(): void {
    if (!this._isActive) {
      return;
    }
    this._isActive = false;
    this.view.containerEl.removeClass('explorer-multi-select-selection-mode');
    this.toggleButtonEl?.removeClass('is-active');
    this.actionBarEl?.remove();
    this.actionBarEl = null;
    this.countEl = null;
    this.actionButtons.length = 0;
  }

  private moveSelection(mouseEvent: MouseEvent): void {
    const menu = new Menu();
    this.app.workspace.trigger('files-menu', menu, this.getSelectedFiles(), FILE_EXPLORER_MENU_SOURCE, this.view.leaf);
    const moveItem = findMenuItemByIcon(menu, MOVE_MENU_ITEM_ICON_CLASS);
    if (moveItem?.callback) {
      moveItem.callback();
    } else {
      // A later Obsidian may change the icon; the menu still offers the move.
      this.openContextMenu(mouseEvent);
    }
  }

  private onClick(mouseEvent: MouseEvent): void {
    if (!this._isActive || mouseEvent.button !== 0 || mouseEvent.altKey || mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.shiftKey) {
      return;
    }
    const item = getItemFromEvent(this.view, mouseEvent);
    if (!item) {
      return;
    }
    if (isOnCollapseIcon(mouseEvent)) {
      // The arrow still folds the folder, so the mode can reach the rows inside it.
      return;
    }

    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    const tree = this.view.tree;
    if (tree.selectedDoms.has(item)) {
      tree.deselectItem(item);
    } else {
      tree.selectItem(item);
      // Core's Shift-click ranges from `activeDom`.
      tree.activeDom = item;
    }
  }

  private onContextMenu(mouseEvent: MouseEvent): void {
    if (this.isSwallowingContextMenu) {
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      return;
    }
    if (this._isActive || !Platform.isMobile || !this.shouldEnterOnLongPress()) {
      return;
    }
    const item = getItemFromEvent(this.view, mouseEvent);
    if (!item) {
      return;
    }

    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    // Obsidian Mobile dispatches a `contextmenu` of its own when the finger lifts, after the native one
    // That entered the mode; it must not open core's menu on top of the mode.
    this.isSwallowingContextMenu = true;
    this.enter();
    const tree = this.view.tree;
    tree.selectItem(item);
    tree.activeDom = item;
  }

  private onGestureEnd(): void {
    if (!this.isSwallowingContextMenu) {
      return;
    }
    // Obsidian dispatches its `contextmenu` from its own handler of this same event, so it has run by the
    // Next task.
    window.setTimeout(() => {
      this.isSwallowingContextMenu = false;
    }, 0);
  }

  private openContextMenu(mouseEvent: MouseEvent): void {
    // Both buttons that get here are available only while something is selected.
    const firstItem = ensureNonNullable(this.getSelectedItems()[0]);
    // Core builds its menu for the whole selection when the row it opens on is part of it.
    this.view.openFileContextMenu(mouseEvent, firstItem.selfEl);
  }

  private selectAll(): void {
    const tree = this.view.tree;
    for (const item of getVisibleItems(tree.root)) {
      tree.selectItem(item);
    }
  }
}
