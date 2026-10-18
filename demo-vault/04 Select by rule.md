# Select by rule

Picking forty files out of four hundred by hand is slow and easy to get wrong. These commands select rows by a rule instead: by extension, by glob pattern, by property value, or everything the File explorer's filter shows. A rule adds to the selection, so rules combine, and **Invert selection** turns any of them into its opposite.

A rule applies to the **focused folder**: the focused row when it is a folder, otherwise that row's folder, and the vault root when nothing has the focus. Each prompt names the folder it will look in. Tick **Include subfolders** (`Alt+1`) to look at everything under it, not only its own children.

The buttons below focus `Materials/04 Select by rule` and run the command, so the prompt opens for you to fill in. That folder holds [Alpha](<./Materials/04 Select by rule/Alpha.md>) (`status: active`), [Beta](<./Materials/04 Select by rule/Beta.md>) (`status: done`), [Gamma](<./Materials/04 Select by rule/Gamma.md>) (no `status`), a `Roadmap` canvas, and an `Archive` folder with [Delta](<./Materials/04 Select by rule/Archive/Delta.md>) (`status: done`) and an `Old roadmap` canvas in it.

## By extension

```code-button
---
caption: Select by extension in the rule folder
---
await require('/demoSetup.ts').runCommandInFolder(app, 'Materials/04 Select by rule', 'select-by-extension');
```

Manual equivalent: click a row in `Materials/04 Select by rule`, then run **`Explorer Multi-Select`: Select by extension** from the Command Palette (`Ctrl+P` / `Cmd+P`).

Type `canvas` and press **Select**: only **Roadmap** is selected. Run it again with **Include subfolders** ticked and **Old roadmap** joins it. Several extensions go in one line, such as `md, canvas`. This rule selects files only.

## By glob pattern

```code-button
---
caption: Select by glob pattern in the rule folder
---
await require('/demoSetup.ts').runCommandInFolder(app, 'Materials/04 Select by rule', 'select-by-glob-pattern');
```

Manual equivalent: run **`Explorer Multi-Select`: Select by glob pattern** with a row of the folder focused.

A pattern without a `/` matches the name, so `*a*` selects every row whose name contains an `a`, folders included. A pattern with a `/` matches the path relative to the folder, so `Archive/*` with **Include subfolders** ticked selects what is in `Archive`. Matching ignores case.

## By property value

```code-button
---
caption: Select by property value in the rule folder
---
await require('/demoSetup.ts').runCommandInFolder(app, 'Materials/04 Select by rule', 'select-by-property-value');
```

Manual equivalent: run **`Explorer Multi-Select`: Select by property value** with a row of the folder focused.

Pick `status` from the list, then type `done`: **Beta** is selected, and **Delta** too with **Include subfolders** ticked. Leave the value empty to select every note that has the property, which leaves out **Gamma**. This rule selects files only.

## Everything the filter shows

The File explorer can filter its rows. **Select files matching the filter** selects every file the filter shows, those inside collapsed folders included. It is available only while the filter is set.

```code-button
---
caption: Filter the File explorer to roadmap
---
await require('/demoSetup.ts').filterExplorer(app, 'roadmap');
```

Manual equivalent: type `roadmap` into the filter field at the top of the File explorer.

```code-button
---
caption: Select the files matching the filter
---
require('/demoSetup.ts').runCommand(app, 'select-filter-matches');
```

Manual equivalent: run **`Explorer Multi-Select`: Select files matching the filter** from the Command Palette.

**Roadmap** and **Old roadmap** are now selected. Clear the filter and they stay selected:

```code-button
---
caption: Clear the filter
---
await require('/demoSetup.ts').clearExplorerFilter(app);
```

Manual equivalent: empty the filter field.

## Invert

```code-button
---
caption: Invert the selection
---
require('/demoSetup.ts').runCommand(app, 'invert-selection');
```

Manual equivalent: run **`Explorer Multi-Select`: Invert selection** from the Command Palette, or press **Invert selection** in the action bar of [01 Selection mode](<./01 Selection mode.md>).

Every row the File explorer shows that was not selected now is, and the rows that were selected are not.

```code-button
---
caption: Clear the rule selection
---
await require('/demoSetup.ts').clearSelection(app);
```

Manual equivalent: click empty space in the File explorer.

On mobile, a command that leaves something selected also turns [01 Selection mode](<./01 Selection mode.md>) on, so the action bar is there to act on the result.
