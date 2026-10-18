import { GlobalCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/global-command-handler';

import type { ExplorerSelectionComponent } from './explorer-selection-component.ts';

interface ToggleSelectionModeCommandHandlerConstructorParams {
  readonly explorerSelectionComponent: ExplorerSelectionComponent;
}

/**
 * The "Toggle selection mode" command: shows the File explorer and turns its touch selection mode on or off.
 */
export class ToggleSelectionModeCommandHandler extends GlobalCommandHandler {
  private readonly explorerSelectionComponent: ExplorerSelectionComponent;

  public constructor(params: ToggleSelectionModeCommandHandlerConstructorParams) {
    super({
      icon: 'list-checks',
      id: 'toggle-selection-mode',
      name: 'Toggle selection mode'
    });
    this.explorerSelectionComponent = params.explorerSelectionComponent;
  }

  protected override canExecute(): boolean {
    return this.explorerSelectionComponent.hasExplorer();
  }

  protected override async execute(): Promise<void> {
    await this.explorerSelectionComponent.toggleSelectionMode();
  }
}
