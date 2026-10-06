export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c): c is Node | string => c != null));
  return node;
}

let toastTimer = 0;
/** Brief status message at the bottom of the screen. */
export function toast(message: string, kind: 'info' | 'error' = 'info') {
  const t = $('toast');
  t.textContent = message;
  t.className = `toast show ${kind}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.className = 'toast'), kind === 'error' ? 5000 : 2600);
}

/** Open a hidden file input and resolve with the chosen files. */
export function pickFiles(input: HTMLInputElement): Promise<File[]> {
  return new Promise((resolve) => {
    input.value = '';
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Close dialogs with their ✕ button or a click on the backdrop. */
export function wireDialog(d: HTMLDialogElement) {
  d.querySelector('[data-close]')?.addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
}

export const timeAgo = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};
