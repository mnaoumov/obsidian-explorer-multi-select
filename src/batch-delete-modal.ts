import type { App } from 'obsidian';

import {
  Modal,
  Platform
} from 'obsidian';

import type { BatchDeletePlan } from './batch-delete.ts';

import { countFiles } from './batch-delete.ts';
import { formatSelectionCount } from './explorer-tree-items.ts';

/**
 * How many paths the confirmation lists before it sums up the rest.
 */
const MAX_LISTED_PATHS = 10;

/**
 * Where the deleted items go, by core's `Deleted files` setting.
 */
const TRASH_OPTION_TEXTS = {
  local: 'They will be moved to the ".trash" folder of your vault.',
  none: 'They will be deleted permanently.',
  system: 'They will be moved to your system trash.'
} as const;

/**
 * What the user chose in the batch delete confirmation.
 */
export interface BatchDeleteChoice {
  /**
   * Whether to delete the attachments only the deleted notes link to.
   */
  readonly shouldDeleteAttachments: boolean;
  /**
   * Whether the user asked not to be asked again, which turns core's `Confirm file deletion` setting off.
   */
  readonly shouldNotAskAgain: boolean;
}

/**
 * What {@link BatchDeleteModal} asks about.
 */
export interface BatchDeleteModalConstructorParams {
  readonly app: App;
  /**
   * Whether to offer the attachments only these notes link to as a checkbox, as core does when its
   * `Delete unlinked attachments` setting is `ask`. Otherwise they are only mentioned when they are deleted.
   */
  readonly attachmentMode: 'always' | 'ask' | 'never';
  readonly plan: BatchDeletePlan;
  readonly trashOption: 'local' | 'none' | 'system';
}

/**
 * The one confirmation for a batch delete: what goes, where it goes, and what breaks.
 */
export class BatchDeleteModal extends Modal {
  private isConfirmed = false;
  private readonly params: BatchDeleteModalConstructorParams;
  private resolve: ((choice: BatchDeleteChoice | null) => void) | null = null;
  private shouldDeleteAttachments = true;
  private shouldNotAskAgain = false;

  public constructor(params: BatchDeleteModalConstructorParams) {
    super(params.app);
    this.params = params;
  }

  public override onClose(): void {
    this.contentEl.empty();
    this.resolve?.(this.isConfirmed ? { shouldDeleteAttachments: this.shouldDeleteAttachments, shouldNotAskAgain: this.shouldNotAskAgain } : null);
    this.resolve = null;
  }

  public override onOpen(): void {
    const { attachmentMode, plan, trashOption } = this.params;
    this.setTitle(`Delete ${formatSelectionCount(countFiles(plan.files))}?`);
    const contentEl = this.contentEl;
    contentEl.addClass('explorer-multi-select-batch-delete');

    const listEl = contentEl.createEl('ul', { cls: 'explorer-multi-select-batch-delete-list' });
    for (const file of plan.files.slice(0, MAX_LISTED_PATHS)) {
      listEl.createEl('li', { cls: 'u-break-word', text: file.path });
    }
    if (plan.files.length > MAX_LISTED_PATHS) {
      listEl.createEl('li', { text: `and ${String(plan.files.length - MAX_LISTED_PATHS)} more` });
    }

    contentEl.createEl('p', { cls: trashOption === 'none' ? ['mod-warning'] : [], text: TRASH_OPTION_TEXTS[trashOption] });
    if (plan.nonEmptyFolderCount > 0) {
      contentEl.createEl('p', {
        cls: 'mod-warning',
        text: plan.nonEmptyFolderCount === 1
          ? 'A folder is not empty. Everything inside it is deleted too.'
          : `${String(plan.nonEmptyFolderCount)} folders are not empty. Everything inside them is deleted too.`
      });
    }
    if (plan.brokenLinkCount > 0) {
      contentEl.createEl('p', {
        cls: 'mod-warning',
        text: plan.brokenLinkCount === 1
          ? 'A link from another note points here and will break.'
          : `${String(plan.brokenLinkCount)} links from other notes point here and will break.`
      });
    }

    const attachmentCountText = plan.attachments.length === 1 ? 'the attachment' : `the ${String(plan.attachments.length)} attachments`;
    if (attachmentMode === 'ask' && plan.attachments.length > 0) {
      this.addCheckbox(`Also delete ${attachmentCountText} only these notes link to`, true, (isChecked) => {
        this.shouldDeleteAttachments = isChecked;
      });
    } else if (attachmentMode === 'always' && plan.attachments.length > 0) {
      contentEl.createEl('p', { text: `${capitalize(attachmentCountText)} only these notes link to will be deleted too.` });
    }

    if (!Platform.isMobile) {
      this.addCheckbox('Don\'t ask again', false, (isChecked) => {
        this.shouldNotAskAgain = isChecked;
      });
    }

    const buttonsEl = contentEl.createDiv({ cls: 'modal-button-container' });
    const confirmButtonEl = buttonsEl.createEl('button', { cls: 'mod-warning', text: 'Delete' });
    confirmButtonEl.addEventListener('click', () => {
      this.isConfirmed = true;
      this.close();
    });
    buttonsEl.createEl('button', { cls: 'mod-cancel', text: 'Cancel' }).addEventListener('click', () => {
      this.close();
    });
    confirmButtonEl.focus();
  }

  /**
   * Opens the modal and waits for the user.
   *
   * @returns The choice, or `null` when the user cancelled.
   */
  public async prompt(): Promise<BatchDeleteChoice | null> {
    return await new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  private addCheckbox(text: string, isChecked: boolean, onChange: (isChecked: boolean) => void): void {
    const labelEl = this.contentEl.createEl('label', { cls: 'explorer-multi-select-batch-delete-checkbox' });
    const checkboxEl = labelEl.createEl('input', { type: 'checkbox' });
    checkboxEl.checked = isChecked;
    checkboxEl.addEventListener('change', () => {
      onChange(checkboxEl.checked);
    });
    labelEl.appendText(` ${text}`);
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
