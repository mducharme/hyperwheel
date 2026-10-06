import { $, el, pickFiles, toast } from './dom';
import type { Session } from './session';
import type { App } from './App';
import { assetUrl, getAsset, putAsset } from '../library/assets';

/** Settings → this wheel's music: upload spin tracks and a win sound. */
export class AudioPanel {
  private preview: HTMLAudioElement | null = null;
  private enabledEl = $<HTMLInputElement>('audio-enabled');

  constructor(
    private app: App,
    private session: Session,
  ) {}

  init() {
    $('add-spin').addEventListener('click', () => void this.add('spin'));
    $('add-win').addEventListener('click', () => void this.add('win'));
    this.enabledEl.addEventListener('change', () => {
      this.session.doc.audio.enabled = this.enabledEl.checked;
      this.session.touch('audio');
    });
    this.session.on((c) => {
      if (c === 'open' || c === 'audio') void this.sync();
    });
  }

  private async add(kind: 'spin' | 'win') {
    const input = $<HTMLInputElement>('file-audio');
    input.multiple = kind === 'spin';
    const files = await pickFiles(input);
    const audio = this.session.doc.audio;
    for (const file of files) {
      try {
        // make sure the browser can actually decode it before keeping it
        const ctx = new OfflineAudioContext(1, 1, 44100);
        await ctx.decodeAudioData(await file.arrayBuffer());
        const asset = await putAsset(file, 'audio', file.name);
        if (kind === 'win') audio.win = asset.id;
        else if (!audio.spin.includes(asset.id)) audio.spin.push(asset.id);
      } catch (err) {
        toast(`${file.name}: ${err instanceof Error && err.message.includes('MB') ? err.message : "can't decode this audio file"}`, 'error');
      }
    }
    if (files.length) {
      audio.enabled = true;
      this.session.touch('audio');
      toast(kind === 'win' ? 'Win sound set' : `${files.length} track${files.length > 1 ? 's' : ''} added`);
    }
  }

  private row(id: string, onRemove: () => void) {
    const name = el('span', { className: 'file-name' }, '…');
    void getAsset(id).then((a) => (name.textContent = a ? a.name : 'missing file'));
    const play = el('button', { className: 'icon-btn', title: 'Preview', ariaLabel: 'Preview' }, '▶');
    play.addEventListener('click', () => void this.togglePreview(id, play));
    const remove = el('button', { className: 'icon-btn', title: 'Remove', ariaLabel: 'Remove' }, '✕');
    remove.addEventListener('click', onRemove);
    return el('li', {}, play, name, remove);
  }

  private async togglePreview(id: string, btn: HTMLButtonElement) {
    const playing = this.preview && !this.preview.paused && this.preview.dataset.id === id;
    this.preview?.pause();
    document.querySelectorAll('.file-list .playing').forEach((b) => {
      b.classList.remove('playing');
      b.textContent = '▶';
    });
    if (playing) return;
    const url = await assetUrl(id);
    if (!url) return;
    this.preview = new Audio(url);
    this.preview.dataset.id = id;
    this.preview.volume = 0.7;
    void this.preview.play();
    btn.classList.add('playing');
    btn.textContent = '■';
    this.preview.onended = () => {
      btn.classList.remove('playing');
      btn.textContent = '▶';
    };
  }

  /** Refresh the lists and hand the decoded files to the music player. */
  private async sync() {
    const audio = this.session.doc.audio;
    this.enabledEl.checked = audio.enabled;
    $('spin-tracks').replaceChildren(
      ...audio.spin.map((id) =>
        this.row(id, () => {
          audio.spin = audio.spin.filter((x) => x !== id);
          this.session.touch('audio');
        }),
      ),
    );
    $('win-track').replaceChildren(
      ...(audio.win
        ? [
            this.row(audio.win, () => {
              audio.win = null;
              this.session.touch('audio');
            }),
          ]
        : []),
    );
    $('add-win').textContent = audio.win ? '⬆ Replace win sound' : '⬆ Set win sound';

    if (!audio.enabled) return this.app.music.setCustom([], null);
    const blobs = await Promise.all(audio.spin.map((id) => getAsset(id).then((a) => a?.blob ?? null)));
    const win = audio.win ? ((await getAsset(audio.win))?.blob ?? null) : null;
    this.app.music.setCustom(
      blobs.filter((b): b is Blob => !!b),
      win,
    );
  }
}
