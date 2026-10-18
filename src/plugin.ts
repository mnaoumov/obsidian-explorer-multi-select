import type { Editor } from 'obsidian';

import { OpenDemoVaultCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsTabComponent } from '@mnaoumov/obsidian-lib/components/plugin-settings-tab-component';
import { PluginDataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import { PluginBase } from '@mnaoumov/obsidian-lib/plugin/plugin';
import { PluginEventSourceImpl } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';
import { Notice } from 'obsidian';

import type { PluginSettings } from './plugin-settings.ts';
import type { SelectByRuleCommandHandlerParams } from './select-by-rule-command-handler.ts';

import { ExplorerSelectionComponent } from './explorer-selection-component.ts';
import { InvertSelectionCommandHandler } from './invert-selection-command-handler.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { SelectByExtensionCommandHandler } from './select-by-extension-command-handler.ts';
import { SelectByGlobPatternCommandHandler } from './select-by-glob-pattern-command-handler.ts';
import { SelectByPropertyValueCommandHandler } from './select-by-property-value-command-handler.ts';
import { SelectFilterMatchesCommandHandler } from './select-filter-matches-command-handler.ts';
import { ToggleSelectionModeCommandHandler } from './toggle-selection-mode-command-handler.ts';

export class Plugin extends PluginBase {
  protected override async onloadImpl(): Promise<void> {
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.pluginSettingsComponent = pluginSettingsComponent;

    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab: new PluginSettingsTab({
          plugin: this,
          pluginSettingsComponent
        })
      })
    );

    const explorerSelectionComponent = this.addChild(
      new ExplorerSelectionComponent({
        app: this.app,
        getSettings: (): PluginSettings => pluginSettingsComponent.settings,
        statusBarItemEl: this.addStatusBarItem()
      })
    );

    this.addCommand({
      callback: this.runSampleCommand.bind(this),
      id: 'sample',
      name: 'Sample'
    });

    this.addCommand({
      editorCallback: this.runSampleEditorCommand.bind(this),
      id: 'sample-editor',
      name: 'Sample editor'
    });

    const selectByRuleParams: SelectByRuleCommandHandlerParams = {
      app: this.app,
      explorerSelectionComponent,
      pluginNoticeComponent: this.pluginNoticeComponent
    };

    // `OpenDemoVaultCommandHandler` is what makes the README's first demo-vault route real: it downloads
    // The `<plugin-id>-demo-vault.zip` attached to the GitHub release and opens it as a vault in
    // A new window. It is not registered automatically -- a demo vault without this command can only be
    // Reached by downloading the asset by hand. It hides itself on mobile, so no platform guard is needed.
    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new ToggleSelectionModeCommandHandler({ explorerSelectionComponent }),
      new SelectByExtensionCommandHandler(selectByRuleParams),
      new SelectByGlobPatternCommandHandler(selectByRuleParams),
      new SelectByPropertyValueCommandHandler(selectByRuleParams),
      new SelectFilterMatchesCommandHandler(selectByRuleParams),
      new InvertSelectionCommandHandler({ explorerSelectionComponent }),
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);
  }

  private runSampleCommand(): void {
    new Notice('Sample command');
  }

  private runSampleEditorCommand(editor: Editor): void {
    editor.replaceSelection('Sample Editor Command');
  }
}
