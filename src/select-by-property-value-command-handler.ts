import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';

import { selectItem } from '@mnaoumov/obsidian-lib/modals/select-item';

import type { ExplorerTreeItem } from './explorer-tree-items.ts';
import type { SelectByRuleCommandHandlerParams } from './select-by-rule-command-handler.ts';

import { SelectByRuleCommandHandler } from './select-by-rule-command-handler.ts';
import { createPropertyRule } from './select-by-rule.ts';

type SelectByPropertyValueCommandHandlerConstructorParams = SelectByRuleCommandHandlerParams;

/**
 * The "Select by property value" command: asks for a property and a value, then selects the notes in the
 * focused folder whose property has that value.
 */
export class SelectByPropertyValueCommandHandler extends SelectByRuleCommandHandler {
  public constructor(params: SelectByPropertyValueCommandHandlerConstructorParams) {
    super({ ...params, icon: 'list', id: 'select-by-property-value', name: 'Select by property value' });
  }

  protected override async findItems(view: FileExplorerView): Promise<ExplorerTreeItem[] | null> {
    const metadataCache = this.app.metadataCache;
    const propertyNames = Object.values(metadataCache.getAllPropertyInfos())
      .map((propertyInfo) => propertyInfo.name)
      .sort((a, b) => a.localeCompare(b));
    const key = await selectItem({
      app: this.app,
      items: propertyNames,
      itemTextFunction: (propertyName) => propertyName,
      placeholder: 'Property'
    });
    if (key === null) {
      return null;
    }
    return this.promptForRule({
      createRule: (value) => createPropertyRule((file) => metadataCache.getFileCache(file)?.frontmatter, key, value),
      invalidMessage: '',
      placeholder: 'Leave empty to match every note that has the property',
      title: `Select notes whose ${key} is`,
      view
    });
  }
}
