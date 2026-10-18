import type { SettingDefinitionItem } from 'obsidian';

import { PluginSettingsTabBase } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

/**
 * The settings tab is declarative: return one definition per row from `getSettingDefinitionItems()` and
 * Obsidian renders them. `bind` wires a component to a settings property in both directions, so there is
 * no read/write plumbing to maintain.
 */
export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      this.settingEx({
        desc: 'On mobile, a long-press on a row in the File explorer turns selection mode on and selects that row. '
          + 'A second long-press then opens the context menu. Turn this off to keep the long-press for the context menu.',
        name: 'Long-press enters selection mode',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({ propertyName: 'shouldEnterSelectionModeOnLongPress', valueComponent: toggle });
          });
        }
      }),
      this.settingEx({
        desc: 'In the File explorer, Ctrl-click (Cmd-click on macOS) adds a row to the selection, or takes it out. '
          + 'Core opens the row in a new tab instead, so with this on, use a middle-click for that.',
        name: 'Ctrl/Cmd-click toggles the selection',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({ propertyName: 'shouldToggleSelectionOnCtrlOrCommandClick', valueComponent: toggle });
          });
        }
      }),
      this.settingEx({
        desc: 'In the File explorer, a plain click opens the file and keeps the selection, '
          + 'so you can look at the selected files one by one. Click empty space or press Esc to clear the selection.',
        name: 'Keep the selection when a click opens a file',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({ propertyName: 'shouldKeepSelectionOnClick', valueComponent: toggle });
          });
        }
      })
    ];
  }
}
