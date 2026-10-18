# Batch delete

Core asks once per item when you delete a selection, so deleting thirty notes means thirty dialogs. With two or more rows selected, the plugin asks **once**. The one confirmation lists the paths, says where they go, and warns about a folder that is not empty and about links from notes that stay. Every item then goes through Obsidian's own delete, so the **Deleted files** setting under **Settings → Files and links** still decides between the system trash, the vault's `.trash` folder and a permanent delete.

The single confirmation answers the Delete key (`Cmd+Backspace` on macOS), the **Delete** button of [01 Selection mode](<./01 Selection mode.md>), and the **Delete** item of core's context menu for several items. One selected row keeps core's own dialog.

## Try it

The first button creates three throwaway notes in `Materials/05 Batch delete` and selects them, so you never delete anything you wanted to keep.

```code-button
---
caption: Create three notes to delete and select them
---
await require('/demoSetup.ts').createAndSelectNotesToDelete(app);
```

Manual equivalent: create a few notes in a folder, then Alt-click (Option-click on macOS) each one.

```code-button
---
caption: Delete the selection
---
await require('/demoSetup.ts').deleteSelection(app);
```

Manual equivalent: press `Delete` in the File explorer (`Cmd+Backspace` on macOS), or right-click a selected row and choose **Delete**.

One dialog opens, listing all three notes. Press **Delete** and they go together. Press **Cancel** and nothing changes. Run the first button again to bring them back for another try.

## What the confirmation respects

- **Don't ask again**
  - turns core's **Confirm file deletion** setting off, on desktop, the way core's own dialog does. With it off, a batch is deleted with no dialog.
- **Delete unlinked attachments**
  - core's setting for the attachments only the deleted notes link to. Set to ask, the dialog shows one checkbox for all of them. Set to always, the dialog only mentions them.

The notes inside a selected folder are not listed apart, since the folder takes them with it.
