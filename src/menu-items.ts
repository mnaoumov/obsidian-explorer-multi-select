import type {
  Menu,
  MenuItem,
  MenuSeparator
} from 'obsidian';

/**
 * The `source` core passes with the File explorer's own menus, so a `files-menu` listener adds the items
 * it adds there.
 */
export const FILE_EXPLORER_MENU_SOURCE = 'file-explorer-context-menu';

/**
 * Finds the first item of a menu that matches, skipping the separators.
 *
 * @param menu - The menu.
 * @param isMatch - Tells the item to find.
 * @returns The item, or `undefined` when none matches.
 */
export function findMenuItem(menu: Menu, isMatch: (item: MenuItem) => boolean): MenuItem | undefined {
  return menu.items.find((item): item is MenuItem => isMenuItem(item) && isMatch(item));
}

/**
 * Finds the first item of a menu that shows the given icon. Core's items are told apart by their icon,
 * because their titles are translated.
 *
 * @param menu - The menu.
 * @param iconClass - The icon's class, such as `lucide-trash-2`.
 * @returns The item, or `undefined` when none shows the icon.
 */
export function findMenuItemByIcon(menu: Menu, iconClass: string): MenuItem | undefined {
  return findMenuItem(menu, (item) => item.iconEl.querySelector(`.${iconClass}`) !== null);
}

function isMenuItem(item: MenuItem | MenuSeparator): item is MenuItem {
  return 'iconEl' in item;
}
