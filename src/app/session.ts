import { newWheel, readShareLink, wheels, DEFAULT_SETTINGS, type WheelDoc } from '../library/wheels';
import { DEFAULT_NAMES, legacy, persist, store } from './store';

export type Change = 'open' | 'entries' | 'settings' | 'audio' | 'title' | 'results';

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

  /** Boot: a share link, else the last wheel, else migrate the pre-library state. */
  async load(): Promise<{ fromLink: boolean }> {
    const shared = readShareLink();
    if (shared) {
      history.replaceState(null, '', location.pathname + location.search);
      await wheels.save(shared);
      this.open(shared);
      return { fromLink: true };
    }
    let doc = store.currentWheel ? await wheels.get(store.currentWheel) : undefined;
    doc ??= (await wheels.list())[0];
    if (!doc) {
      doc = newWheel('My wheel', legacy?.text ? legacy.text.split('\n').map((s) => s.trim()).filter(Boolean) : DEFAULT_NAMES);
      if (legacy) {
        doc.settings = {
          ...DEFAULT_SETTINGS,
          theme: legacy.theme ?? DEFAULT_SETTINGS.theme,
          duration: legacy.duration ?? DEFAULT_SETTINGS.duration,
          removeWinner: legacy.removeWinner ?? legacy.autoremove ?? false,
          autoSwitch: legacy.autoSwitch ?? true,
          switchMode: legacy.switchMode ?? 'random',
        };
        doc.results = legacy.results ?? [];
      }
      await wheels.save(doc);
    }
    this.open(doc);
    return { fromLink: false };
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
