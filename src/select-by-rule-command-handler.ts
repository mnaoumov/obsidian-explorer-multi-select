import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  IconName
} from 'obsidian';

import { GlobalCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/global-command-handler';
import { ModalCommandBuilder } from '@mnaoumov/obsidian-lib/modals/modal-command-builder';
import { prompt } from '@mnaoumov/obsidian-lib/modals/prompt';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

import type { ExplorerSelectionComponent } from './explorer-selection-component.ts';
import type { ExplorerTreeItem } from './explorer-tree-items.ts';
import type { ItemRule } from './select-by-rule.ts';

import {
  countItems,
  formatSelectionCount
} from './explorer-tree-items.ts';
import {
  getCandidateItems,
  getRelativePath,
  getRuleFolder,
  getRuleFolderLabel
} from './select-by-rule.ts';

/**
 * What every select-by-rule command needs.
 */
export interface SelectByRuleCommandHandlerParams {
  readonly app: App;
  readonly explorerSelectionComponent: ExplorerSelectionComponent;
  readonly pluginNoticeComponent: PluginNoticeComponent;
}

interface SelectByRuleCommandHandlerConstructorParams extends SelectByRuleCommandHandlerParams {
  readonly icon: IconName;
  readonly id: string;
  readonly name: string;
}

/**
 * What {@link SelectByRuleCommandHandler.promptForRule} asks for.
 */
interface SelectByRuleCommandHandlerPromptForRuleParams {
  readonly createRule: (input: string) => ItemRule | null;
  readonly invalidMessage: string;
  readonly placeholder: string;
  readonly title: string;
  readonly view: FileExplorerView;
}

/**
 * A command that adds rows of the File explorer to its selection: it finds them, selects them, and says how
 * many it added.
 */
export abstract class SelectByRuleCommandHandler extends GlobalCommandHandler {
  protected readonly app: App;
  protected readonly explorerSelectionComponent: ExplorerSelectionComponent;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  /**
   * The `Include subfolders` choice, remembered from the last prompt.
   */
  private shouldIncludeSubfolders = false;

  public constructor(params: SelectByRuleCommandHandlerConstructorParams) {
    super({ icon: params.icon, id: params.id, name: params.name });
    this.app = params.app;
    this.explorerSelectionComponent = params.explorerSelectionComponent;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
  }

  protected override canExecute(): boolean {
    return this.explorerSelectionComponent.hasExplorer();
  }

  protected override async execute(): Promise<void> {
    const view = await this.explorerSelectionComponent.revealExplorer();
    if (!view) {
      return;
    }
    const items = await this.findItems(view);
    if (!items) {
      return;
    }
    const newItems = this.explorerSelectionComponent.selectItems(view, items);
    this.pluginNoticeComponent.showNotice(formatResult(items, newItems));
  }

  /**
   * Finds the rows to select.
   *
   * @param view - The File explorer.
   * @returns The rows, or `null` when the user cancelled.
   */
  protected abstract findItems(view: FileExplorerView): ExplorerTreeItem[] | null | Promise<ExplorerTreeItem[] | null>;

  /**
   * Asks for a rule in the folder the rule applies to, with an `Include subfolders` checkbox, and returns
   * the rows it matches.
   *
   * @param params - What to ask.
   * @returns The rows, or `null` when the user cancelled.
   */
  protected async promptForRule(params: SelectByRuleCommandHandlerPromptForRuleParams): Promise<ExplorerTreeItem[] | null> {
    const folder = getRuleFolder(params.view);
    const commandBuilder = new ModalCommandBuilder().addCheckbox({
      key: '1',
      modifiers: ['Alt'],
      onChange: (isChecked) => {
        this.shouldIncludeSubfolders = isChecked;
      },
      onInit: (checkboxEl) => {
        checkboxEl.checked = this.shouldIncludeSubfolders;
      },
      purpose: 'Include subfolders'
    });
    const input = await prompt({
      app: this.app,
      commandBuilder,
      okButtonText: 'Select',
      placeholder: params.placeholder,
      title: `${params.title} in ${getRuleFolderLabel(folder)}`,
      valueValidator: (value) => params.createRule(value) ? undefined : params.invalidMessage
    });
    if (input === null) {
      return null;
    }
    // The validator accepted the input, so it builds a rule.
    const rule = ensureNonNullable(params.createRule(input));
    return getCandidateItems(folder, this.shouldIncludeSubfolders).filter((item) => rule(item, getRelativePath(item, folder)));
  }
}

function formatResult(items: readonly ExplorerTreeItem[], newItems: readonly ExplorerTreeItem[]): string {
  if (newItems.length > 0) {
    return `Selected ${formatSelectionCount(countItems(newItems))}.`;
  }
  return items.length > 0 ? 'Everything that matches is selected already.' : 'Nothing matches.';
}
