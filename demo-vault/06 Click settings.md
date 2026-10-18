# Click settings

Two settings change what a mouse click does in the File explorer. Both are off by default, because each changes a click core already gives a meaning to.

## Ctrl/Cmd-click toggles the selection

Core selects with Alt-click (Option-click on macOS), and opens a new tab on Ctrl-click (Cmd-click). Most file managers use Ctrl/Cmd-click to select. With `shouldToggleSelectionOnCtrlOrCommandClick` on, Ctrl/Cmd-click adds a row to the selection or takes it out, and opens nothing. A middle-click still opens a new tab.

```code-button
---
caption: Turn Ctrl/Cmd-click toggling on
---
await require('/demoSetup.ts').setSetting(app, 'shouldToggleSelectionOnCtrlOrCommandClick', true);
```

Manual equivalent: turn on **Ctrl/Cmd-click toggles the selection** in **Settings → Community plugins → `Explorer Multi-Select`**.

Now Ctrl-click (Cmd-click) **Apple** and **Cherry** in `Materials/01 Selection mode`. Both are selected, and no tab opens.

## Keep the selection when a click opens a file

Core clears the selection on every plain click, so you cannot look at the selected files one by one. With `shouldKeepSelectionOnClick` on, a plain click opens the file and keeps the selection. Click empty space or press `Esc` to clear it.

```code-button
---
caption: Turn the sticky selection on
---
await require('/demoSetup.ts').setSetting(app, 'shouldKeepSelectionOnClick', true);
```

Manual equivalent: turn on **Keep the selection when a click opens a file** in the settings tab.

With **Apple** and **Cherry** still selected, click **Banana**. It opens, and the selection stays.

## Put them back

```code-button
---
caption: Reset both click settings
---
await require('/demoSetup.ts').resetSettings(app);
```

Manual equivalent: turn both toggles off again in the settings tab.
