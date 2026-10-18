import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';

import type { ExplorerTreeItem } from './explorer-tree-items.ts';
import type { SelectByRuleCommandHandlerParams } from './select-by-rule-command-handler.ts';

import { SelectByRuleCommandHandler } from './select-by-rule-command-handler.ts';
import {
  getFilterMatchingItems,
  hasActiveFilter
} from './select-by-rule.ts';

type SelectFilterMatchesCommandHandlerConstructorParams = SelectByRuleCommandHandlerParams;

/**
 * The "Select files matching the filter" command: selects every file the File explorer's filter shows,
 * inside collapsed folders too. It is available only while the filter is set.
 */
export class SelectFilterMatchesCommandHandler extends SelectByRuleCommandHandler {
  public constructor(params: SelectFilterMatchesCommandHandlerConstructorParams) {
    super({ ...params, icon: 'filter', id: 'select-filter-matches', name: 'Select files matching the filter' });
  }

  protected override canExecute(): boolean {
    const view = this.explorerSelectionComponent.getExplorerView();
    return !!view && hasActiveFilter(view);
  }

  protected override findItems(view: FileExplorerView): ExplorerTreeItem[] {
    return getFilterMatchingItems(view);
  }
}
