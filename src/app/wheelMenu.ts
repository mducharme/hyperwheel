import { $, download, el, pickFiles, timeAgo, toast, wireDialog } from './dom';
import type { Session } from './session';
import { exportWheel, importWheel, newWheel, shareLink, wheels, type WheelDoc } from '../library/wheels';
import { listPresets, openPreset, type Preset } from '../library/presets';

/** Title field + ⋯ menu: new, open, duplicate, export/import, share, delete; and the Your wheels list. */
export class WheelMenu {
  private menu = $('wheel-menu');
  private titleEl = $<HTMLInputElement>('wheel-title');
  private dialog = $<HTMLDialogElement>('open-dialog');

  constructor(
    private session: Session,
    /** Whether switching wheels is allowed right now (not mid-spin). */
    private canSwitch: () => boolean,
  ) {}

  init() {
    wireDialog(this.dialog);
    this.titleEl.addEventListener('input', () => {
      this.session.doc.title = this.titleEl.value.trim() || 'Untitled wheel';
      this.session.touch('title');
    });
    this.titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.titleEl.blur();
    });

    $('wheel-menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.menu.hidden = !this.menu.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!this.menu.contains(e.target as Node)) this.menu.hidden = true;
    });
    this.menu.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((b) =>
      b.addEventListener('click', () => {
        this.menu.hidden = true;
        void this.run(b.dataset.action!);
      }),
    );
    this.session.on((c) => {
      if (c === 'open') this.titleEl.value = this.session.doc.title;
    });
  }

  private async run(action: string) {
    const { session } = this;
    const switching = ['new', 'open', 'duplicate', 'import', 'delete'].includes(action);
    if (switching && !this.canSwitch()) return toast('Wait for the wheel to stop first.');
    try {
      switch (action) {
        case 'new': {
          await session.save();
          const w = newWheel('New wheel', []);
          w.settings = { ...session.doc.settings };
          await wheels.save(w);
          session.open(w);
          toast('New wheel — add some names!');
          break;
        }
        case 'open':
          await this.open();
          break;
        case 'duplicate': {
          await session.save();
          const copy = wheels.duplicate(session.doc);
          await wheels.save(copy);
          session.open(copy);
          toast(`Saved a copy: “${copy.title}”`);
          break;
        }
        case 'export': {
          await session.save();
          toast('Packing wheel…');
          const blob = await exportWheel(session.doc);
          download(blob, `${session.doc.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'wheel'}.hyperwheel`);
          toast(`Exported (${(blob.size / 1e6).toFixed(1)} MB)`);
          break;
        }
        case 'import': {
          const [file] = await pickFiles($<HTMLInputElement>('file-wheel'));
          if (!file) return;
          await session.save();
          const { wheel: w, skipped } = await importWheel(file);
          session.open(w);
          toast(skipped ? `Imported “${w.title}” — ${skipped} bundled file${skipped > 1 ? 's were' : ' was'} skipped` : `Imported “${w.title}”`);
          break;
        }
        case 'share': {
          const { url, dropped } = await shareLink(session.doc);
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            // clipboard can be refused (no user gesture, Safari permissions): let them copy it by hand
            prompt('Copy this share link:', url);
            return;
          }
          toast(dropped ? `Link copied — uploaded models aren't included (${dropped}). Use Export for those.` : 'Share link copied!');
          break;
        }
        case 'delete': {
          if (session.doc.preset) return toast('Preset wheels can’t be deleted.');
          if (!confirm(`Delete “${session.doc.title}”? This can't be undone.`)) return;
          await wheels.remove(session.doc.id);
          const rest = await wheels.list();
          const next = rest[0] ?? newWheel('My wheel', []);
          if (!rest.length) await wheels.save(next);
          session.open(next);
          toast('Wheel deleted');
          break;
        }
      }
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  /** The Your wheels list: bundled presets first (pinned, never deletable), then the user's own wheels. */
  async open() {
    await this.session.save();
    const [all, presets] = await Promise.all([wheels.list(), listPresets()]);
    const presetFiles = new Set(presets.map((p) => p.file));
    const rows = presets.map((p) => this.presetRow(p, all.find((w) => w.preset === p.file)));
    // working copies show on their preset's row; a copy whose preset is gone is just a wheel now
    rows.push(...all.filter((w) => !w.preset || !presetFiles.has(w.preset)).map((w) => this.row(w)));
    $('wheel-list').replaceChildren(...rows);
    this.dialog.showModal();
  }

  /** A clickable row: thumbnail, title and a line of details. */
  private rowButton(title: string, details: string, thumb: string | undefined, current: boolean, onOpen: () => Promise<void> | void) {
    const pic = thumb ? el('img', { src: thumb, alt: '' }) : el('span', { className: 'thumb-empty' }, '🎡');
    const open = el('button', { className: `wheel-row${current ? ' current' : ''}` }, pic, el('span', { className: 'meta' }, el('strong', {}, title), el('small', {}, details)));
    open.addEventListener('click', async () => {
      if (current) return this.dialog.close();
      if (!this.canSwitch()) return toast('Wait for the wheel to stop first.');
      this.dialog.close();
      try {
        await onOpen();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
      }
    });
    return open;
  }

  private presetRow(p: Preset, copy: WheelDoc | undefined) {
    const current = !!copy && copy.id === this.session.doc.id;
    const details = copy ? `${copy.entries.length} names · ${timeAgo(copy.updatedAt)}${current ? ' · open' : ''}` : `${p.names} names`;
    const open = this.rowButton(copy?.title ?? p.title, `📌 Preset · ${details}`, copy?.thumb, current, async () => {
      await this.session.save();
      this.session.open(await openPreset(p));
    });
    return el('li', { className: 'preset' }, open);
  }

  private row(w: WheelDoc) {
    const current = w.id === this.session.doc.id;
    const open = this.rowButton(w.title, `${w.entries.length} names · ${timeAgo(w.updatedAt)}${current ? ' · open' : ''}`, w.thumb, current, () => this.session.open(w));
    const del = el('button', { className: 'icon-btn', title: 'Delete', ariaLabel: `Delete ${w.title}` }, '🗑');
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (current) return toast('That wheel is open — use Delete in the menu.');
      if (!confirm(`Delete “${w.title}”?`)) return;
      await wheels.remove(w.id);
      li.remove();
    });
    const li = el('li', {}, open, del);
    return li;
  }
}
