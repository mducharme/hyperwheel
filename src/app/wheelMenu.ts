import { $, download, el, pickFiles, timeAgo, toast, wireDialog } from './dom';
import type { Session } from './session';
import { exportWheel, importWheel, newWheel, shareLink, wheels, type WheelDoc } from '../library/wheels';

/** Title field + ⋯ menu: new, open, duplicate, export/import, share, delete. */
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
          await session.save();
          await this.showList();
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
          toast(dropped ? `Link copied — uploaded models/audio aren't included (${dropped}). Use Export for those.` : 'Share link copied!');
          break;
        }
        case 'delete': {
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

  private async showList() {
    const list = $('wheel-list');
    const all = await wheels.list();
    list.replaceChildren(...all.map((w) => this.row(w)));
    this.dialog.showModal();
  }

  private row(w: WheelDoc) {
    const current = w.id === this.session.doc.id;
    const thumb = w.thumb ? el('img', { src: w.thumb, alt: '' }) : el('span', { className: 'thumb-empty' }, '🎡');
    const del = el('button', { className: 'icon-btn', title: 'Delete', ariaLabel: `Delete ${w.title}` }, '🗑');
    const open = el(
      'button',
      { className: `wheel-row${current ? ' current' : ''}` },
      thumb,
      el(
        'span',
        { className: 'meta' },
        el('strong', {}, w.title),
        el('small', {}, `${w.entries.length} names · ${timeAgo(w.updatedAt)}${current ? ' · open' : ''}`),
      ),
    );
    open.addEventListener('click', () => {
      this.dialog.close();
      if (!current) this.session.open(w);
    });
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
