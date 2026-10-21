# Start here

This is an [Obsidian](https://obsidian.md/) vault that documents the [Explorer Multi-Select](https://github.com/mnaoumov/obsidian-explorer-multi-select/) plugin by demonstrating it. Every feature has a note that says what it does and why you would want it, and a button you can press to watch it happen.

Selecting several files and folders in Obsidian's File explorer is hard: core offers Alt-click and Shift-click on desktop, no Select all, a Shift+Up/Down range that never shrinks, and nothing at all on mobile. `Explorer Multi-Select` fixes that inside the File explorer you already use. It adds a touch selection mode, keyboard selection, commands that select by rule, a count in the status bar, and one confirmation for deleting many items at once.

## Your first minute

Below this paragraph is a **code button** — a captioned rectangle. It is not a picture of a button: **clicking it runs the code**, and the result appears underneath it. The `</>` toggle beside the caption reveals the code it runs, so nothing here is a black box.

```code-button
---
caption: Select everything in the fruit folder
---
await require('/demoSetup.ts').selectAllInFolder(app, 'Materials/01 Selection mode');
```

The File explorer on the left now has four rows highlighted in `Materials/01 Selection mode`, and the status bar at the bottom of the window says **3 files, 1 folder**. That is what `Ctrl+A` (`Cmd+A` on macOS) does in the File explorer with this plugin: it selects every row in the focused row's folder. Right-click any highlighted row to see core's menu for several items.

Every button in this vault also states its **manual equivalent**, so you learn the real steps rather than depending on the buttons.

```code-button
---
caption: Clear the selection
---
await require('/demoSetup.ts').clearSelection(app);
```

Manual equivalent: click empty space in the File explorer, or press `Esc` there.

## Features

| Note | What it covers |
| --- | --- |
| [01 Selection mode](<./01 Selection mode.md>) | Checkboxes and an action bar, for touch and for the mouse. |
| [02 Keyboard](<./02 Keyboard.md>) | Select all, Space to toggle, Shift+Space to clear, and a Shift+Up/Down range that shrinks. |
| [03 Selection count](<./03 Selection count.md>) | The status bar count, such as `3 files, 1 folder`. |
| [04 Select by rule](<./04 Select by rule.md>) | Select by extension, glob pattern, property value or the explorer's filter, and invert. |
| [05 Batch delete](<./05 Batch delete.md>) | One confirmation for deleting many items. |
| [06 Click settings](<./06 Click settings.md>) | Ctrl/Cmd-click to toggle, and a selection that survives a click. |
| [07 Settings](<./07 Settings.md>) | Every setting, by the key it is stored under in `data.json`. |

## Materials

`Materials/` holds the notes the walkthroughs operate on, so you never have to build a fixture to see a feature working.
