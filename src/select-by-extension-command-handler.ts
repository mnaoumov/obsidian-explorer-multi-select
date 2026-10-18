import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';

import type { ExplorerTreeItem } from './explorer-tree-items.ts';
import type { SelectByRuleCommandHandlerParams } from './select-by-rule-command-handler.ts';

import { SelectByRuleCommandHandler } from './select-by-rule-command-handler.ts';
import { createExtensionRule } from './select-by-rule.ts';

type SelectByExtensionCommandHandlerConstructorParams = SelectByRuleCommandHandlerParams;

/**
 * The "Select by extension" command: selects the files with the given extensions in the focused folder.
 */
export class SelectByExtensionCommandHandler extends SelectByRuleCommandHandler {
  public constructor(params: SelectByExtensionCommandHandlerConstructorParams) {
    super({ ...params, icon: 'file-type', id: 'select-by-extension', name: 'Select by extension' });
  }

  protected override async findItems(view: FileExplorerView): Promise<ExplorerTreeItem[] | null> {
    return this.promptForRule({
      createRule: createExtensionRule,
      invalidMessage: 'Enter at least one extension.',
      placeholder: 'md, png',
      title: 'Select files by extension',
      view
    });
  }
}
