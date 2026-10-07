import { newWheel, readShareLink, wheels, type WheelDoc } from '../library/wheels';
import { DEFAULT_NAMES, persist, store } from './store';

export type Change = 'open' | 'entries' | 'settings' | 'title' | 'results';

/**
 * The wheel being edited. Every change autosaves (debounced), so there's no
 * "unsaved changes" state — Duplicate is "save as".
 */
export class Session {
  doc!: WheelDoc;
  private listeners = new Set<(c: Change) => void>();
  private saveTimer = 0;
  /** Supplies a thumbnail of the current frame when saving. */
  thumbnail: () => Promise<string | null> = async () => null;

  on(fn: (c: Change) => void) {
    this.listeners.add(fn);
  }

  private emit(c: Change) {
    this.listeners.forEach((fn) => fn(c));
  }

  /** Boot: a share link, else the last wheel, else a fresh one. */
  async load(): Promise<{ fromLink: boolean; linkError?: string }> {
    const shared = await readShareLink();
    let linkError: string | undefined;
    if (shared) history.replaceState(null, '', location.pathname + location.search);
    if (shared && 'wheel' in shared) {
      await wheels.save(shared.wheel);
      this.open(shared.wheel);
      return { fromLink: true };
    }
    if (shared) linkError = shared.error;
    let doc = store.currentWheel ? await wheels.get(store.currentWheel) : undefined;
    doc ??= (await wheels.list())[0];
    if (!doc) {
      doc = newWheel('My wheel', DEFAULT_NAMES);
      await wheels.save(doc);
    }
    this.open(doc);
    return { fromLink: false, linkError };
  }

  open(doc: WheelDoc) {
    this.flush();
    this.doc = doc;
    store.currentWheel = doc.id;
    persist();
    this.emit('open');
  }

  /** Record a change: notifies listeners and schedules a save. */
  touch(change: Exclude<Change, 'open'>) {
    this.emit(change);
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.save(), 400);
  }

  async save() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    const thumb = await this.thumbnail();
    if (thumb) this.doc.thumb = thumb;
    await wheels.save(this.doc);
  }

  /** Save immediately if a save is pending (before switching wheels). */
  flush() {
    if (this.saveTimer && this.doc) void this.save();
  }
}
