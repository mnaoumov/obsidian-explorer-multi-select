import type {
  App as AppOriginal,
  TAbstractFile
} from 'obsidian';

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  App,
  Platform
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import type {
  BatchDeleteChoice,
  BatchDeleteModalConstructorParams
} from './batch-delete-modal.ts';
import type { BatchDeletePlan } from './batch-delete.ts';

import { BatchDeleteModal } from './batch-delete-modal.ts';

describe('BatchDeleteModal', () => {
  let app: AppOriginal;
  let isMobile: boolean;

  beforeEach(() => {
    app = App.createConfigured__({ files: { 'a.md': '', 'b.md': '', 'folder/c.md': '', 'image.png': '' } }).asOriginalType__();
    isMobile = Platform.isMobile;
    Platform.isMobile = false;
  });

  afterEach(() => {
    Platform.isMobile = isMobile;
  });

  function get(path: string): TAbstractFile {
    return ensureNonNullable(app.vault.getAbstractFileByPath(path));
  }

  function createPlan(overrides: Partial<BatchDeletePlan> = {}): BatchDeletePlan {
    return {
      attachments: [],
      brokenLinkCount: 0,
      files: [get('a.md'), get('b.md')],
      isDeleted: (): boolean => false,
      nonEmptyFolderCount: 0,
      ...overrides
    };
  }

  interface OpenResult {
    readonly choicePromise: Promise<BatchDeleteChoice | null>;
    readonly modal: BatchDeleteModal;
  }

  function open(overrides: Partial<BatchDeleteModalConstructorParams> = {}): OpenResult {
    const modal = new BatchDeleteModal({ app, attachmentMode: 'never', plan: createPlan(), trashOption: 'system', ...overrides });
    return { choicePromise: modal.prompt(), modal };
  }

  function texts(modal: BatchDeleteModal, selector: string): string[] {
    return [...modal.contentEl.querySelectorAll(selector)].map((el) => el.textContent);
  }

  function button(modal: BatchDeleteModal, text: string): HTMLElement {
    return ensureNonNullable([...modal.contentEl.querySelectorAll('button')].find((el) => el.textContent === text));
  }

  function checkbox(modal: BatchDeleteModal, text: string): HTMLInputElement {
    const labelEl = ensureNonNullable([...modal.contentEl.querySelectorAll('label')].find((el) => el.textContent.includes(text)));
    return ensureNonNullable(labelEl.querySelector('input'));
  }

  function toggle(checkboxEl: HTMLInputElement): void {
    checkboxEl.checked = !checkboxEl.checked;
    checkboxEl.dispatchEvent(new Event('change'));
  }

  it('lists what goes and where, and resolves the choice on Delete', async () => {
    const { choicePromise, modal } = open();

    expect(modal.titleEl.textContent).toBe('Delete 2 files?');
    expect(texts(modal, 'li')).toEqual(['a.md', 'b.md']);
    expect(texts(modal, 'p')).toEqual(['They will be moved to your system trash.']);

    toggle(checkbox(modal, 'Don\'t ask again'));
    button(modal, 'Delete').click();
    expect(await choicePromise).toEqual({ shouldDeleteAttachments: true, shouldNotAskAgain: true });
  });

  it('resolves null on Cancel', async () => {
    const { choicePromise, modal } = open();
    button(modal, 'Cancel').click();
    expect(await choicePromise).toBeNull();
  });

  it('sums up a long list, and names the vault trash and a permanent delete', () => {
    const files = Array.from({ length: 12 }, () => get('a.md'));
    const { modal } = open({ plan: createPlan({ files }), trashOption: 'local' });
    expect(texts(modal, 'li')).toHaveLength(11);
    expect(texts(modal, 'li').at(-1)).toBe('and 2 more');
    expect(texts(modal, 'p')).toEqual(['They will be moved to the ".trash" folder of your vault.']);

    const { modal: permanentModal } = open({ trashOption: 'none' });
    expect(texts(permanentModal, 'p.mod-warning')).toEqual(['They will be deleted permanently.']);
  });

  it('warns about non-empty folders and broken links', () => {
    const { modal } = open({ plan: createPlan({ brokenLinkCount: 1, files: [get('folder'), get('a.md')], nonEmptyFolderCount: 1 }) });
    expect(modal.titleEl.textContent).toBe('Delete 1 file, 1 folder?');
    expect(texts(modal, 'p.mod-warning')).toEqual([
      'A folder is not empty. Everything inside it is deleted too.',
      'A link from another note points here and will break.'
    ]);

    const { modal: pluralModal } = open({ plan: createPlan({ brokenLinkCount: 3, nonEmptyFolderCount: 2 }) });
    expect(texts(pluralModal, 'p.mod-warning')).toEqual([
      '2 folders are not empty. Everything inside them is deleted too.',
      '3 links from other notes point here and will break.'
    ]);
  });

  it('asks about the attachments only these notes link to', async () => {
    const image = ensureNonNullable(app.vault.getFileByPath('image.png'));
    const { choicePromise, modal } = open({ attachmentMode: 'ask', plan: createPlan({ attachments: [image] }) });
    const attachmentCheckbox = checkbox(modal, 'Also delete the attachment only these notes link to');
    expect(attachmentCheckbox.checked).toBe(true);

    toggle(attachmentCheckbox);
    button(modal, 'Delete').click();
    expect(await choicePromise).toEqual({ shouldDeleteAttachments: false, shouldNotAskAgain: false });

    const { modal: pluralModal } = open({ attachmentMode: 'ask', plan: createPlan({ attachments: [image, image] }) });
    expect(checkbox(pluralModal, 'Also delete the 2 attachments only these notes link to').checked).toBe(true);
  });

  it('says that the attachments go too when the setting deletes them always, and offers no checkbox for them', () => {
    const image = ensureNonNullable(app.vault.getFileByPath('image.png'));
    const { modal } = open({ attachmentMode: 'always', plan: createPlan({ attachments: [image] }) });
    expect(texts(modal, 'p')).toContain('The attachment only these notes link to will be deleted too.');
    expect(modal.contentEl.querySelectorAll('label')).toHaveLength(1);

    const { modal: neverModal } = open({ attachmentMode: 'never', plan: createPlan({ attachments: [image] }) });
    expect(texts(neverModal, 'p')).toEqual(['They will be moved to your system trash.']);
  });

  it('offers no "Don\'t ask again" on mobile, as core does not', () => {
    Platform.isMobile = true;
    const { modal } = open();
    expect(modal.contentEl.querySelectorAll('label')).toHaveLength(0);
  });
});
