import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

import type { ExplorerTreeItem } from '../selection-core/explorer-tree-items.ts';
import type {
  BatchDeleteChoice,
  BatchDeleteModalConstructorParams
} from './batch-delete-modal.ts';
import type { BatchDeletePlan } from './batch-delete.ts';

import { getVisibleItems } from '../selection-core/explorer-tree-items.ts';
import { BatchDeleteModal } from './batch-delete-modal.ts';
import {
  deleteByPlan,
  planBatchDelete
} from './batch-delete.ts';

/**
 * Asks the user about a batch delete.
 */
export type ConfirmBatchDelete = (params: BatchDeleteModalConstructorParams) => Promise<BatchDeleteChoice | null>;

interface ExplorerBatchDeleteConstructorParams {
  readonly app: App;
  readonly confirmBatchDelete?: ConfirmBatchDelete;
  readonly view: FileExplorerView;
}

/**
 * Deletes a File explorer's selection of two or more rows with one confirmation, where core asks once per
 * row. Every row goes through `FileManager.trashFile`, so the user's `Deleted files` setting holds.
 */
export class ExplorerBatchDelete {
  private readonly app: App;
  private readonly confirmBatchDelete: ConfirmBatchDelete;
  private readonly view: FileExplorerView;

  public constructor(params: ExplorerBatchDeleteConstructorParams) {
    this.app = params.app;
    this.confirmBatchDelete = params.confirmBatchDelete ?? (async (modalParams): Promise<BatchDeleteChoice | null> => await new BatchDeleteModal(modalParams).prompt());
    this.view = params.view;
  }

  /**
   * Deletes the selection: once confirmed, every selected row, then the attachments only the deleted notes
   * link to when core's `Delete unlinked attachments` setting asks for that. The focus moves to the row
   * after the deleted ones, as core's own delete does.
   */
  public async deleteSelection(): Promise<void> {
    const tree = this.view.tree;
    const selectedItems = [...tree.selectedDoms];
    const plan = planBatchDelete(this.app, selectedItems.map((item) => item.file));
    if (plan.files.length === 0) {
      return;
    }

    const vault = this.app.vault;
    const attachmentMode = vault.getConfig('deleteUnlinkedAttachments') ?? 'ask';
    const shouldAskAboutAttachments = attachmentMode === 'ask' && plan.attachments.length > 0;
    let shouldDeleteAttachments = attachmentMode === 'always';
    if (vault.getConfig('promptDelete') !== false || shouldAskAboutAttachments) {
      const choice = await this.confirmBatchDelete({
        app: this.app,
        attachmentMode,
        plan,
        trashOption: vault.getConfig('trashOption') ?? 'system'
      });
      if (!choice) {
        return;
      }
      if (choice.shouldNotAskAgain) {
        vault.setConfig('promptDelete', false);
      }
      shouldDeleteAttachments ||= choice.shouldDeleteAttachments && shouldAskAboutAttachments;
    }

    const nextFocusedItem = this.findNextFocusedItem(selectedItems, plan);
    await deleteByPlan(this.app, plan, shouldDeleteAttachments);
    for (const item of selectedItems) {
      if (plan.isDeleted(item.file.path)) {
        tree.deselectItem(item);
      }
    }
    if (nextFocusedItem) {
      tree.setFocusedItem(nextFocusedItem, true);
    }
  }

  /**
   * Tells whether the selection is a batch, which this class deletes; core's own prompt handles one row.
   *
   * @returns Whether two or more rows are selected.
   */
  public isBatch(): boolean {
    return this.view.tree.selectedDoms.size > 1;
  }

  private findNextFocusedItem(selectedItems: readonly ExplorerTreeItem[], plan: BatchDeletePlan): ExplorerTreeItem | null {
    const tree = this.view.tree;
    const visibleItems = getVisibleItems(tree.root);
    // Like core, start from the focused row, or from the first selected row when the focus is elsewhere.
    // Something is selected: an empty selection plans nothing to delete.
    const startItem = tree.focusedItem && visibleItems.includes(tree.focusedItem) ? tree.focusedItem : ensureNonNullable(selectedItems[0]);
    const startIndex = visibleItems.indexOf(startItem);
    // The first row that stays from there on, or else the nearest one before it.
    const candidates = startIndex === -1 ? [] : [...visibleItems.slice(startIndex), ...visibleItems.slice(0, startIndex).reverse()];
    return candidates.find((item) => isKept(item, plan)) ?? null;
  }
}

function isKept(item: ExplorerTreeItem, plan: BatchDeletePlan): boolean {
  return !plan.isDeleted(item.file.path);
}
