import { GlobalCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/global-command-handler';

import type { ExplorerSelectionComponent } from '../selection-core/explorer-selection-component.ts';

interface InvertSelectionCommandHandlerConstructorParams {
  readonly explorerSelectionComponent: ExplorerSelectionComponent;
}

/**
 * The "Invert selection" command: in the File explorer, deselects every selected visible row and selects
 * every other one.
 */
export class InvertSelectionCommandHandler extends GlobalCommandHandler {
  private readonly explorerSelectionComponent: ExplorerSelectionComponent;

  public constructor(params: InvertSelectionCommandHandlerConstructorParams) {
    super({
      icon: 'flip-vertical-2',
      id: 'invert-selection',
      name: 'Invert selection'
    });
    this.explorerSelectionComponent = params.explorerSelectionComponent;
  }

  protected override canExecute(): boolean {
    return this.explorerSelectionComponent.hasExplorer();
  }

  protected override async execute(): Promise<void> {
    const view = await this.explorerSelectionComponent.revealExplorer();
    if (view) {
      this.explorerSelectionComponent.invertSelection(view);
    }
  }
}
