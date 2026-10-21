import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { Component } from 'obsidian';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  getEventTargetElement,
  getItemFromEvent,
  isOnCollapseIcon,
  registerWindowCaptureClick
} from './explorer-window-click.ts';
import { FakeExplorerView } from './test-helpers/fake-explorer-tree.test.helper.ts';

describe('getEventTargetElement', () => {
  it('returns the element an event happened on, and null for any other target', () => {
    const el = createDiv();
    const spanEl = el.createSpan();
    const textNode = document.createTextNode('text');
    spanEl.append(textNode);
    let elementTarget: Element | null | undefined;
    let textTarget: Element | null | undefined;
    el.addEventListener('click', (event_) => {
      if (event_.target === el) {
        elementTarget = getEventTargetElement(event_);
      } else {
        textTarget = getEventTargetElement(event_);
      }
    });

    el.dispatchEvent(new MouseEvent('click'));
    textNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(elementTarget).toBe(el);
    expect(textTarget).toBeNull();
    expect(getEventTargetElement(new MouseEvent('click'))).toBeNull();
  });
});

describe('getItemFromEvent', () => {
  function eventOn(el: Element): MouseEvent {
    let captured: MouseEvent | undefined;
    el.addEventListener('click', (event_) => {
      captured = castTo<MouseEvent>(event_);
    }, { once: true });
    el.dispatchEvent(new MouseEvent('click'));
    return castTo<MouseEvent>(captured);
  }

  it('returns the row an event happened on, and null off the explorer\'s rows', () => {
    const view = new FakeExplorerView();
    const folder = view.tree.addFolder('folder');
    const otherView = new FakeExplorerView();
    const otherFile = otherView.tree.addFile('other.md');

    expect(getItemFromEvent(view.asView(), eventOn(folder.selfEl))).toBe(folder);
    expect(getItemFromEvent(view.asView(), eventOn(view.containerEl))).toBeNull();
    expect(getItemFromEvent(view.asView(), eventOn(otherFile.selfEl))).toBeNull();

    view.files.delete(folder.el);
    expect(getItemFromEvent(view.asView(), eventOn(folder.selfEl))).toBeNull();
  });

  it('tells a folder\'s arrow from the rest of its row', () => {
    const view = new FakeExplorerView();
    const folder = view.tree.addFolder('folder');
    const collapseIconEl = folder.selfEl.querySelector('.collapse-icon');

    expect(isOnCollapseIcon(eventOn(castTo<Element>(collapseIconEl)))).toBe(true);
    expect(isOnCollapseIcon(eventOn(folder.selfEl))).toBe(false);
  });
});

describe('registerWindowCaptureClick', () => {
  it('follows the explorer to another window, and stops listening on unload', () => {
    const view = new FakeExplorerView();
    let onMigrated: ((win: Window) => unknown) | undefined;
    const offMigrated = vi.fn();
    vi.spyOn(view.containerEl, 'onWindowMigrated').mockImplementation((listener) => {
      onMigrated = listener;
      return offMigrated;
    });
    const otherWin = castTo<Window>(new EventTarget());
    const addSpy = vi.spyOn(otherWin, 'addEventListener');
    const removeSpy = vi.spyOn(otherWin, 'removeEventListener');
    const listener = vi.fn();
    const component = new Component();
    component.load();
    registerWindowCaptureClick(component, view.asView(), listener);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);

    onMigrated?.(otherWin);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(addSpy).toHaveBeenCalledWith('click', listener, { capture: true });

    component.unload();
    expect(offMigrated).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('click', listener, { capture: true });
  });
});
