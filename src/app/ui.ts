import { debug } from '../debug';
import type { QualityLevel, QualityPref } from '../engine/quality';
import type { App } from './App';
import { parseNames, persist, store } from './store';
import { $, el } from './dom';
import { Session } from './session';
import { WheelMenu } from './wheelMenu';
import { EntriesView } from './entriesView';
import { reconcile } from '../library/wheels';
import { THEMES, getTheme, type ThemeEntry } from '../themes';
import { DEFAULT_PACKS, PACKS, setEnabledPacks } from '../characters/catalog';

/** DOM side of the app: panel, scene picker, settings and the winner dialog. */
export class UI {
  readonly session = new Session();
  private namesEl = $<HTMLTextAreaElement>('names');
  private panel = $('panel');
  private winnerEl = $('winner');
  private removeEl = $<HTMLInputElement>('w-remove');
  private spinBtn = $<HTMLButtonElement>('spin');
  private pending: { name: string; index: number } | null = null;
  private rebuildTimer = 0;
  private revealTimer = 0;
  private opening: Promise<void> = Promise.resolve();
  /** Scene chosen at spin start for the auto-switch after this result. */
  private upcoming: ThemeEntry | null = null;

  constructor(private app: App) {}

  /** Wire up the DOM and open the last (or shared) wheel. */
  async init() {
    this.app.insets = () => this.insets();
    this.session.thumbnail = () => (this.app.spin.spinning ? Promise.resolve(null) : this.app.captureThumbnail());

    this.namesEl.addEventListener('input', () => this.onNamesChanged());
    this.namesEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.app.startSpin();
      }
    });
    this.spinBtn.addEventListener('click', () => this.app.startSpin());
    $('shuffle').addEventListener('click', () => {
      const list = parseNames(this.namesEl.value);
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      this.setNames(list);
    });
    $('sort').addEventListener('click', () => this.setNames(parseNames(this.namesEl.value).sort((a, b) => a.localeCompare(b))));
    $('dedupe').addEventListener('click', () => this.setNames([...new Set(parseNames(this.namesEl.value))]));
    $('clear-results').addEventListener('click', () => {
      this.session.doc.results = [];
      this.session.touch('results');
    });

    this.initTabs();
    this.initPrefs();
    this.initWheelSettings();
    this.initScenes();
    this.initWinner();
    new WheelMenu(this.session, () => !this.app.spin.spinning && this.winnerEl.hidden === true).init();
    new EntriesView(this.app, this.session).init();

    window.addEventListener('keydown', (e) => {
      if (!this.winnerEl.hidden) {
        if (e.key === 'Escape') void this.dismissWinner(false);
        return;
      }
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (e.code === 'Space' && !['textarea', 'input', 'button'].includes(tag)) {
        e.preventDefault();
        this.app.startSpin();
      }
    });
    window.addEventListener('beforeunload', () => this.session.flush());

    this.session.on((c) => {
      if (c === 'open') this.opening = this.onOpen();
      if (c === 'results') this.renderResults();
      if (c === 'entries') this.syncEntries();
    });
    const loaded = await this.session.load();
    await this.opening;
    return loaded;
  }

  /** A wheel was opened: refresh every control from its document. */
  private async onOpen() {
    const doc = this.session.doc;
    this.namesEl.value = doc.entries.map((e) => e.name).join('\n');
    this.syncEntries();
    this.renderResults();
    this.syncWheelSettings();
    const theme = getTheme(doc.settings.theme);
    if (this.app.theme?.id !== theme.id) {
      this.markTheme(theme);
      await this.app.setTheme(await theme.load());
      this.renderPreviews();
    }
  }

  private syncEntries() {
    const doc = this.session.doc;
    this.app.setEntries(doc.entries);
    $('count').textContent = String(doc.entries.length);
    if (!this.app.spin.spinning && !this.app.locked) this.spinBtn.disabled = doc.entries.length === 0;
  }

  // ------------------------------------------------------------------ app events

  onSpinStart() {
    $('hint').classList.add('gone');
    this.spinBtn.disabled = true;
    // the next scene is decided now and built while the wheel turns
    const next = (this.upcoming = this.pickNextTheme());
    void next.load().then((theme) => {
      if (this.upcoming === next) this.app.prepareTheme(theme);
    });
  }

  onResult(name: string, index: number, celebration: string) {
    const doc = this.session.doc;
    doc.results.unshift({ name, at: Date.now() });
    doc.results = doc.results.slice(0, 200);
    this.session.touch('results');

    this.pending = { name, index };
    this.app.locked = true;
    window.clearTimeout(this.revealTimer);
    this.revealTimer = window.setTimeout(() => {
      $('winner-name').textContent = name;
      $('w-remove-name').textContent = name;
      $('winner-celebration').textContent = celebration ? `✦ ${celebration} ✦` : '';
      this.removeEl.checked = doc.settings.removeWinner;
      // laid out for the character; falls back to centred if the model can't load
      this.winnerEl.classList.add('with-character');
      this.winnerEl.hidden = false;
      $('w-again').focus();
    }, 450);
  }

  onCharacter(info: { name: string; description: string } | null) {
    if (!info) this.winnerEl.classList.remove('with-character');
  }

  /** Shows which level Auto settled on. */
  onQuality(level: QualityLevel) {
    const name = level[0].toUpperCase() + level.slice(1);
    $('graphics-note').textContent = store.graphics === 'auto' ? `using ${name}` : 'lower is smoother on slow devices';
  }

  onFps(fps: number | null) {
    $('fps').textContent = fps === null ? 'idle' : `${fps} fps`;
  }

  setBackend(isWebGPU: boolean) {
    const b = $('backend');
    b.textContent = isWebGPU ? 'WebGPU' : 'WebGL2 fallback';
    b.classList.toggle('warn', !isWebGPU);
  }

  // ------------------------------------------------------------------ winner dialog

  private initWinner() {
    this.removeEl.addEventListener('change', () => {
      this.session.doc.settings.removeWinner = this.removeEl.checked;
      this.session.touch('settings');
    });
    $('w-close').addEventListener('click', () => void this.dismissWinner(false));
    $('w-again').addEventListener('click', () => void this.dismissWinner(true));
    this.winnerEl.addEventListener('click', (e) => {
      if (e.target === this.winnerEl) void this.dismissWinner(false);
    });
  }

  /** Close the dialog, removing the winner first if the checkbox is ticked. */
  private async dismissWinner(spinAgain: boolean) {
    if (this.winnerEl.hidden) return;
    this.winnerEl.hidden = true;
    this.app.dismissCharacter();
    if (this.removeEl.checked && this.pending) this.removeEntry(this.pending);
    this.pending = null;
    // stay locked while the next scene loads so a stray Space can't spin mid-switch
    await this.selectTheme(this.upcoming ?? this.pickNextTheme());
    this.upcoming = null;
    this.app.locked = false;
    this.spinBtn.disabled = this.app.names.length === 0;
    if (spinAgain) {
      window.clearTimeout(this.rebuildTimer);
      this.applyNames();
      this.app.startSpin();
    }
  }

  private removeEntry({ name, index }: { name: string; index: number }) {
    const entries = this.session.doc.entries;
    // prefer the exact slot, fall back to the first matching name
    const i = entries[index]?.name === name ? index : entries.findIndex((e) => e.name === name);
    if (i < 0) return;
    entries.splice(i, 1);
    this.namesEl.value = entries.map((e) => e.name).join('\n');
    this.session.touch('entries');
  }

  // ------------------------------------------------------------------ names

  private onNamesChanged() {
    $('count').textContent = String(parseNames(this.namesEl.value).length);
    window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => this.applyNames(), 150);
  }

  /** Push the textarea into the wheel document (keeping characters attached to names). */
  private applyNames() {
    const doc = this.session.doc;
    doc.entries = reconcile(doc.entries, parseNames(this.namesEl.value));
    this.session.touch('entries');
  }

  private setNames(list: string[]) {
    this.namesEl.value = list.join('\n');
    this.onNamesChanged();
  }

  private renderResults() {
    const results = this.session.doc.results;
    $('results').replaceChildren(
      ...results.map((r) =>
        el('li', {}, r.name, el('time', {}, new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))),
      ),
    );
    $('result-count').textContent = String(results.length);
  }

  // ------------------------------------------------------------------ panel

  private initTabs() {
    document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
        document
          .querySelectorAll<HTMLElement>('.tab-body')
          .forEach((b) => b.classList.toggle('active', b.dataset.body === tab.dataset.tab));
        this.panel.classList.remove('collapsed');
      }),
    );
    $('panel-toggle').addEventListener('click', () => this.panel.classList.toggle('collapsed'));
  }

  private insets() {
    const w = innerWidth;
    const h = innerHeight;
    if (w > 760) return { x: 380, y: 0 };
    // mobile: bottom sheet below, header strip above; y is the net upward shift
    const sheet = this.panel.classList.contains('collapsed') ? 64 : Math.round(h * 0.46) + 8;
    const header = 128; // logo + badges + scene dock
    return { x: 0, y: sheet - header, used: sheet + header };
  }

  /** Device-wide preferences (not saved with wheels). */
  private initPrefs() {
    const toggle = (id: string, key: 'sound' | 'music' | 'debug', apply: (on: boolean) => void) => {
      const input = $<HTMLInputElement>(id);
      input.checked = store[key];
      apply(store[key]);
      input.addEventListener('change', () => {
        store[key] = input.checked;
        apply(input.checked);
        persist();
      });
    };
    toggle('sound', 'sound', (on) => (this.app.sfx.enabled = on));
    toggle('music', 'music', (on) => {
      this.app.music.enabled = on;
      if (!on) this.app.music.stop(0.2);
    });
    toggle('debug', 'debug', (on) => {
      debug.enabled = on;
      document.body.classList.toggle('debug', on);
    });

    const graphics = $('graphics');
    const syncGraphics = () => {
      graphics.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        const on = b.dataset.q === store.graphics;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
      });
      this.onQuality(this.app.quality);
    };
    graphics.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        store.graphics = b.dataset.q as QualityPref;
        this.app.setQualityPref(store.graphics);
        persist();
        syncGraphics();
      }),
    );
    this.app.setQualityPref(store.graphics);
    syncGraphics();

    this.initPacks();
  }

  /** Built-in character packs: which ones feed automatic characters and the picker. */
  private initPacks() {
    // saved choices that mention retired packs start over from the defaults
    if (store.packs?.some((id) => !PACKS.some((p) => p.id === id))) store.packs = null;
    const active = new Set(store.packs ?? DEFAULT_PACKS);
    setEnabledPacks([...active]);
    $('pack-list').replaceChildren(
      ...PACKS.map((p) => {
        const input = el('input', { type: 'checkbox', checked: active.has(p.id) });
        input.addEventListener('change', () => {
          if (input.checked) active.add(p.id);
          else active.delete(p.id);
          store.packs = [...active];
          setEnabledPacks(store.packs);
          persist();
          // automatic characters come from the enabled packs, so refresh the lists
          this.session.touch('entries');
        });
        const credit = el('a', { href: p.link, target: '_blank', rel: 'noopener' }, p.credit);
        return el(
          'label',
          { className: 'pack-row' },
          input,
          el('span', {}, el('strong', {}, `${p.name} · ${p.characters.length}`), el('small', {}, p.description), credit),
        );
      }),
    );
  }

  /** Settings that belong to the wheel document. */
  private initWheelSettings() {
    const duration = $<HTMLInputElement>('duration');
    duration.addEventListener('input', () => {
      this.session.doc.settings.duration = Number(duration.value);
      this.syncWheelSettings();
      this.session.touch('settings');
    });
  }

  private syncWheelSettings() {
    const s = this.session.doc.settings;
    const duration = $<HTMLInputElement>('duration');
    duration.value = String(s.duration);
    $('duration-out').textContent = `${s.duration}s`;
    this.app.duration = s.duration;
  }

  // ------------------------------------------------------------------ scenes

  private initScenes() {
    const dock = $('scenes');
    const list = $('scene-list');
    for (const t of THEMES) {
      const b = el('button', { title: `${t.name} — ${t.tagline}` }, t.emoji);
      b.dataset.id = t.id;
      b.addEventListener('click', () => void this.selectTheme(t));
      dock.append(b);

      const swatch = el('span', { className: 'swatch' }, ...t.palette.map((c) => {
        const i = el('i');
        i.style.background = c;
        return i;
      }));
      const card = el('button', { className: 'scene-card' }, swatch, el('strong', {}, `${t.emoji} ${t.name}`), el('small', {}, t.tagline));
      card.dataset.id = t.id;
      card.addEventListener('click', () => void this.selectTheme(t));
      list.append(card);
    }
  }

  /** The scene to load after a spin: a random different one. */
  private pickNextTheme(): ThemeEntry {
    const others = THEMES.filter((t) => t.id !== this.app.theme?.id);
    return others.length ? others[Math.floor(Math.random() * others.length)] : THEMES[0];
  }

  async selectTheme(theme: ThemeEntry) {
    if (this.app.theme?.id === theme.id || this.app.spin.spinning) return;
    this.session.doc.settings.theme = theme.id;
    this.session.touch('settings');
    this.markTheme(theme);
    await this.app.setTheme(await theme.load());
    this.renderPreviews();
  }

  private markTheme(theme: ThemeEntry) {
    if (store.lastTheme !== theme.id) {
      store.lastTheme = theme.id;
      persist();
    }
    document.querySelectorAll<HTMLElement>('#scenes button, #scene-list button').forEach((b) => {
      b.classList.toggle('active', b.dataset.id === theme.id);
    });
    const root = document.documentElement.style;
    root.setProperty('--accent', theme.ui.accent);
    root.setProperty('--accent-2', theme.ui.accent2);
    root.setProperty('--accent-3', theme.ui.accent3);
    $('scene-name').textContent = theme.name;
  }

  /** Buttons to preview each celebration of the current scene. */
  private renderPreviews() {
    $('previews').replaceChildren(
      ...this.app.celebrationNames.map((name, i) => {
        const b = el('button', {}, name);
        b.addEventListener('click', () => {
          this.app.bus.unlock();
          this.app.celebrate(i);
        });
        return b;
      }),
    );
  }
}
