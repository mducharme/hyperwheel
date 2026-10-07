import { $, el, pickFiles, toast, wireDialog } from './dom';
import type { Session } from './session';
import type { App } from './App';
import { BUILTINS, builtin, defaultCharacterFor, enabledPacks, isKnownCharacter } from '../characters/catalog';
// portraits and model inspection pull in the model loaders, so load them on demand
const thumbnails = () => import('../characters/thumbnails');
const loader = () => import('../characters/loader');
import { deleteAsset, listAssets, putAsset, type Asset } from '../library/assets';

/** "alex-rigged.compressed.glb" → "Alex" */
const stripExt = (n: string) => {
  const base = n
    .replace(/\.(glb|gltf|fbx)$/i, '')
    .replace(/[._-]?(compressed|draco|optimi[sz]ed|rigged|rig|final|v\d+)\b/gi, '')
    .replace(/[._-]+/g, ' ')
    .trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : n;
};

/** Entries tab: names ↔ characters view, the per-name character picker and model uploads. */
export class EntriesView {
  private list = $<HTMLUListElement>('entry-list');
  private picker = $<HTMLDialogElement>('picker');
  private grid = $('picker-grid');
  /** Entry being assigned in the picker, or null when browsing the library. */
  private target: number | null = null;
  private uploads: Asset[] = [];

  constructor(
    private app: App,
    private session: Session,
  ) {}

  init() {
    wireDialog(this.picker);
    const search = $<HTMLInputElement>('picker-search');
    search.addEventListener('input', () => this.filter(search.value));
    const views = $('entries-view');
    views.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        views.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        const chars = b.dataset.view === 'characters';
        document.querySelector<HTMLElement>('.view-names')!.hidden = chars;
        document.querySelector<HTMLElement>('.view-characters')!.hidden = !chars;
        if (chars) void this.render();
      }),
    );
    $('chars-upload').addEventListener('click', () => void this.upload(null));
    $('chars-random').addEventListener('click', () => void this.randomize());
    $('chars-clear').addEventListener('click', () => {
      for (const e of this.session.doc.entries) delete e.character;
      this.session.touch('entries');
      void this.render();
      toast('Back to automatic characters');
    });
    this.session.on((c) => {
      if ((c === 'open' || c === 'entries') && !document.querySelector<HTMLElement>('.view-characters')!.hidden) void this.render();
    });
  }

  private async refreshUploads() {
    this.uploads = await listAssets();
  }

  private label(id: string) {
    return builtin(id)?.name ?? stripExt(this.uploads.find((u) => u.id === id)?.name ?? 'Missing model');
  }

  private thumb(id: string, className = 'avatar') {
    const img = el('img', { className, alt: '', loading: 'lazy' });
    void thumbnails()
      .then((t) => t.characterThumb(this.app.stage.renderer, id))
      .then((url) => {
      if (url) img.src = url;
      else img.classList.add('empty');
    });
    return img;
  }

  async render() {
    await this.refreshUploads();
    const entries = this.session.doc.entries;
    if (!entries.length) {
      this.list.replaceChildren(el('li', { className: 'empty-note' }, 'Add names in the Names view first.'));
      return;
    }
    this.list.replaceChildren(
      ...entries.map((entry, i) => {
        // characters from retired packs fall back to automatic
        if (entry.character && !isKnownCharacter(entry.character)) delete entry.character;
        const id = entry.character ?? defaultCharacterFor(entry.name);
        const row = el(
          'button',
          { className: 'entry-row', title: 'Choose a character' },
          this.thumb(id),
          el('span', { className: 'entry-name' }, entry.name),
          el('span', { className: `entry-char${entry.character ? '' : ' auto'}` }, entry.character ? this.label(id) : `Auto · ${this.label(id)}`),
        );
        row.addEventListener('click', () => void this.openPicker(i));
        return el('li', {}, row);
      }),
    );
  }

  private async openPicker(index: number | null) {
    this.target = index;
    await this.refreshUploads();
    const entry = index !== null ? this.session.doc.entries[index] : null;
    $('picker-title').textContent = entry ? `Character for ${entry.name}` : 'Character library';

    const tile = (id: string | null, name: string, media: HTMLElement, opts: { selected?: boolean; removable?: Asset } = {}) => {
      const b = el('button', { className: `char-tile${opts.selected ? ' selected' : ''}` }, media, el('span', {}, name));
      b.addEventListener('click', () => this.choose(id));
      if (!opts.removable) return b;
      const x = el('button', { className: 'tile-remove', title: 'Delete from library', ariaLabel: `Delete ${name}` }, '✕');
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete “${name}” from your library? Names using it go back to automatic.`)) return;
        await deleteAsset(opts.removable!.id);
        for (const en of this.session.doc.entries) if (en.character === opts.removable!.id) delete en.character;
        this.session.touch('entries');
        void this.openPicker(this.target);
      });
      return el('div', { className: 'tile-wrap' }, b, x);
    };

    const auto = entry ? defaultCharacterFor(entry.name) : null;
    const upload = el('button', { className: 'char-tile upload' }, el('span', { className: 'big' }, '⬆'), el('span', {}, 'Upload .glb / .fbx'));
    upload.addEventListener('click', () => void this.upload(this.target));

    const header = (title: string, note?: string) =>
      el('h4', { className: 'picker-section' }, title, note ? el('small', {}, note) : null);
    const packs = enabledPacks();
    this.grid.replaceChildren(
      ...(entry && auto ? [tile(null, `Auto (${this.label(auto)})`, this.thumb(auto), { selected: !entry.character })] : []),
      upload,
      ...(this.uploads.length ? [header('Your uploads')] : []),
      ...this.uploads.map((u) => tile(u.id, stripExt(u.name), this.thumb(u.id), { selected: entry?.character === u.id, removable: u })),
      ...packs.flatMap((p) => [
        header(p.name, p.credit),
        ...p.characters.map((b) => tile(b.id, b.name, this.thumb(b.id), { selected: entry?.character === b.id })),
      ]),
      header('More packs', packs.length < 3 ? 'Turn on more character packs in Settings' : undefined),
    );
    const search = $<HTMLInputElement>('picker-search');
    if (!this.picker.open) {
      search.value = '';
      this.picker.showModal();
      search.focus();
    } else this.filter(search.value);
  }

  /** Hide tiles (and empty section headers) that don't match the search. */
  private filter(query: string) {
    const q = query.trim().toLowerCase();
    let header: HTMLElement | null = null;
    let visible = 0;
    const flush = () => {
      if (header) header.hidden = visible === 0 && !!q;
    };
    for (const child of [...this.grid.children] as HTMLElement[]) {
      if (child.classList.contains('picker-section')) {
        flush();
        header = child;
        visible = 0;
        continue;
      }
      const label = child.textContent?.toLowerCase() ?? '';
      const keep = !q || label.includes(q) || child.classList.contains('upload');
      child.hidden = !keep;
      if (keep) visible++;
    }
    flush();
  }

  private choose(id: string | null) {
    if (this.target === null) return;
    const entry = this.session.doc.entries[this.target];
    if (!entry) return;
    if (id) entry.character = id;
    else delete entry.character;
    this.session.touch('entries');
    this.picker.close();
    void this.render();
  }

  /** Upload one or more models; when picking for a name, assign the first to it. */
  async upload(assignTo: number | null) {
    const files = await pickFiles($<HTMLInputElement>('file-models'));
    if (!files.length) return;
    let first: string | null = null;
    for (const file of files) {
      try {
        toast(`Loading ${file.name}…`);
        const asset = await putAsset(file, file.name);
        const info = await (await loader()).inspect(asset.id);
        first ??= asset.id;
        const rig = info.family === 'mixamo' ? 'Mixamo rig' : info.family === 'kenney' ? 'blocky rig' : info.humanoid ? 'humanoid rig' : 'no humanoid rig found (it will bounce instead)';
        const dances = info.dances.length ? `, dances: ${info.dances.join(', ')}` : ', no dance clips (procedural moves)';
        toast(`${stripExt(file.name)} — ${rig}${dances}`, info.humanoid ? 'info' : 'error');
      } catch (err) {
        console.error(err);
        toast(`${file.name}: ${err instanceof Error ? err.message : 'could not load this model'}`, 'error');
      }
    }
    if (first && assignTo !== null) {
      this.target = assignTo;
      this.choose(first);
    } else if (this.picker.open) {
      void this.openPicker(this.target);
    } else {
      void this.render();
    }
  }

  private async randomize() {
    await this.refreshUploads();
    const packChars = enabledPacks().flatMap((p) => p.characters.map((c) => c.id));
    const pool = [...this.uploads.map((u) => u.id), ...(packChars.length ? packChars : BUILTINS.map((b) => b.id))];
    // deal from a shuffled deck so neighbours rarely repeat
    let deck: string[] = [];
    for (const e of this.session.doc.entries) {
      if (!deck.length) deck = [...pool].sort(() => Math.random() - 0.5);
      e.character = deck.pop();
    }
    this.session.touch('entries');
    void this.render();
    toast('🎲 Characters shuffled');
  }
}
