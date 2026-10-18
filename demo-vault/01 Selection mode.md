# Selection mode

Selection mode puts a checkbox on every row of the File explorer and an action bar under it. A plain tap or click then toggles a row instead of opening it. It is the way to select many items on a phone or a tablet, where core has no multi-select at all, and it works the same with a mouse.

## Turn it on

```code-button
---
caption: Turn selection mode on
---
await require('/demoSetup.ts').runCommandInFolder(app, 'Materials/01 Selection mode', 'toggle-selection-mode');
```

Manual equivalent: click the **Selection mode** button in the File explorer's header, or run **`Explorer Multi-Select`: Toggle selection mode** from the Command Palette (`Ctrl+P` / `Cmd+P`).

Every row now has a checkbox. Click [Apple](<./Materials/01 Selection mode/Apple.md>) and [Cherry](<./Materials/01 Selection mode/Cherry.md>) in `Materials/01 Selection mode`, which also holds [Banana](<./Materials/01 Selection mode/Banana.md>) and a **Fruit basket** folder with [Date](<./Materials/01 Selection mode/Fruit basket/Date.md>) in it: each click ticks the row and opens nothing. The bar under the tree counts what is selected and offers:

- **Move**
  - core's own "Move N items to..." picker.
- **Bookmark**
  - bookmarks the selected items.
- **Delete**
  - deletes them, with one confirmation for two or more (see [05 Batch delete](<./05 Batch delete.md>)).
- **More actions**
  - core's context menu for the selected items.
- **Select all**
  - selects every row the File explorer shows, inside expanded folders too.
- **Invert selection**
  - selects every row that is not selected, and deselects the rest.
- **Done**
  - clears the selection and leaves selection mode.

## On mobile

A long-press on a row turns selection mode on with that row selected. A second long-press then opens core's context menu as before. The `shouldEnterSelectionModeOnLongPress` setting turns this off, for anyone who wants the first long-press to open the menu (see [07 Settings](<./07 Settings.md>)).

## Turn it off

```code-button
---
caption: Turn selection mode off
---
require('/demoSetup.ts').runCommand(app, 'toggle-selection-mode');
```

Manual equivalent: press **Done** in the action bar, or run **`Explorer Multi-Select`: Toggle selection mode** again.
