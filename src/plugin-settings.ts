export class PluginSettings {
  /**
   * Whether a long-press on a File explorer row turns selection mode on, on mobile. Core uses that
   * long-press to open the context menu, which selection mode still opens on a second long-press.
   */
  public shouldEnterSelectionModeOnLongPress = true;
}
