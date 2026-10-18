import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';

import type { ExplorerTreeItem } from './explorer-tree-items.ts';
import type { SelectByRuleCommandHandlerParams } from './select-by-rule-command-handler.ts';

import { SelectByRuleCommandHandler } from './select-by-rule-command-handler.ts';
import { createGlobRule } from './select-by-rule.ts';

type SelectByGlobPatternCommandHandlerConstructorParams = SelectByRuleCommandHandlerParams;

/**
 * The "Select by glob pattern" command: selects the files and folders matching a glob pattern in the
 * focused folder.
 */
export class SelectByGlobPatternCommandHandler extends SelectByRuleCommandHandler {
  public constructor(params: SelectByGlobPatternCommandHandlerConstructorParams) {
    super({ ...params, icon: 'asterisk', id: 'select-by-glob-pattern', name: 'Select by glob pattern' });
  }

  protected override async findItems(view: FileExplorerView): Promise<ExplorerTreeItem[] | null> {
    return this.promptForRule({
      createRule: createGlobRule,
      invalidMessage: 'Enter a glob pattern.',
      placeholder: '*.png, draft-*, archive/**',
      title: 'Select by glob pattern',
      view
    });
  }
}
