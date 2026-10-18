export class PluginSettings {
  /**
   * Whether a long-press on a File explorer row turns selection mode on, on mobile. Core uses that
   * long-press to open the context menu, which selection mode still opens on a second long-press.
   */
  public shouldEnterSelectionModeOnLongPress = true;

  /**
   * Whether a plain click on a File explorer row keeps the selection. Core clears it, and clears it again
   * when the click opens a file.
   */
  public shouldKeepSelectionOnClick = false;

  /**
   * Whether a Ctrl/Cmd-click on a File explorer row toggles the row in the selection. Core opens the row in
   * a new tab instead.
   */
  public shouldToggleSelectionOnCtrlOrCommandClick = false;
}
