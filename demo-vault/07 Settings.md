# Settings

Every setting `Explorer Multi-Select` stores, listed by the **key it is written under in `data.json`** rather than by its display label — that is what you see when you open the file, hit a sync conflict, or read a support thread.

Find them in Obsidian under **Settings → Community plugins → `Explorer Multi-Select`**.

## General

- `shouldEnterSelectionModeOnLongPress`
  - shown in the settings tab as **Long-press enters selection mode**. On mobile, a long-press on a row turns [01 Selection mode](<./01 Selection mode.md>) on with that row selected, and a second long-press opens the context menu. Turn it off to keep the first long-press for the context menu. On by default.
- `shouldToggleSelectionOnCtrlOrCommandClick`
  - shown as **Ctrl/Cmd-click toggles the selection**. Ctrl-click (Cmd-click on macOS) adds a row to the selection or takes it out, where core opens a new tab. Off by default. See [06 Click settings](<./06 Click settings.md>).
- `shouldKeepSelectionOnClick`
  - shown as **Keep the selection when a click opens a file**. A plain click opens the file and keeps the selection. Off by default. See [06 Click settings](<./06 Click settings.md>).

## Try it

Turn the long-press off without leaving this note. The change applies live, so there is no reload.

```code-button
---
caption: Turn the long-press off
---
await require('/demoSetup.ts').setSetting(app, 'shouldEnterSelectionModeOnLongPress', false);
```

Manual equivalent: turn off **Long-press enters selection mode** in the settings tab.

When you are done, put every setting back:

```code-button
---
caption: Reset every setting
---
await require('/demoSetup.ts').resetSettings(app);
```

Manual equivalent: set each toggle back to the default listed above.
