'use client';

import { useEffect, useState } from 'react';
import { game } from '@/lib/gameState';
import type { OperatorState, Settings } from '@/lib/types';
import type { Act } from './ShowTab';
import { ShowTitle } from '@/components/ShowTitle';

export function SetupTab({ state, act }: { state: OperatorState; act: Act }) {
  const [title, setTitle] = useState(state.title);
  const [saved, setSaved] = useState(false);

  // Pick up changes made from another operator tab.
  useEffect(() => setTitle(state.title), [state.title]);

  const s = state.settings;
  const setSetting = (patch: Partial<Settings>) => act(game.setSettings(patch));

  const saveTitle = async () => {
    if (await act(game.setTitle(title.trim() || 'Made Up or Not'))) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
      <section className="panel space-y-4 p-5">
        <h2 className="label">Show</h2>
        <div>
          <label className="label">Show title (big screen)</label>
          <input className="input mt-1" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          <p className="mt-1 text-[11px] text-muted">
            Used when there is no title image, and as the image&apos;s alt text.
          </p>
        </div>
        <button className="btn btn-gold w-full" onClick={saveTitle}>
          {saved ? 'Saved ✓' : 'Save title'}
        </button>
        <TitleImageField state={state} act={act} />
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="label">Display</h2>
        <Toggle label="Sound effects" hint="Played on the display (the screen with the speakers)" value={s.sounds ?? true} onChange={(v) => setSetting({ sounds: v })} />
      </section>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} hint={hint}>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? 'bg-gold' : 'bg-white/15'}`}
        aria-pressed={value}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </Row>
  );
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Title artwork: a wide PNG (transparent background works best) shown in place
 * of the title text on the big screen.
 */
function TitleImageField({ state, act }: { state: OperatorState; act: Act }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const image = state.titleImage;

  const upload = async (file: File) => {
    setError('');
    if (file.type !== 'image/png') return setError('Use a PNG file.');
    if (file.size > MAX_IMAGE_BYTES) return setError('That PNG is over 5 MB — export it smaller.');
    let dataUrl: string;
    try {
      dataUrl = await trimTransparentEdges(file);
    } catch {
      return setError('Could not read that PNG.');
    }
    // Trimming re-encodes the PNG, which can occasionally come out larger.
    if (dataUrl.length * 0.75 > MAX_IMAGE_BYTES) return setError('That PNG is over 5 MB once trimmed — export it smaller.');
    setBusy(true);
    await act(game.setTitleImage(dataUrl));
    setBusy(false);
  };

  return (
    <div>
      <label className="label">Title image (optional PNG — replaces the title text)</label>
      <div className="mt-1 rounded-xl border border-dashed border-white/15 bg-[repeating-conic-gradient(#ffffff0d_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3">
        {image ? (
          <ShowTitle title={state.title} image={image} imageClassName="mx-auto h-20 max-w-full" />
        ) : (
          <p className="py-5 text-center text-xs text-muted">No image — the title text is shown.</p>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className={`btn btn-sm cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          {busy ? 'Uploading…' : image ? 'Replace PNG…' : 'Upload PNG…'}
          <input
            type="file"
            accept="image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void upload(f);
            }}
          />
        </label>
        {image && (
          <>
            <button
              className="btn btn-sm btn-bad"
              onClick={() => confirm('Remove the title image? The title text will show instead.') && act(game.setTitleImage(null))}
            >
              Remove
            </button>
            <span className="ml-auto text-[11px] text-muted">
              {image.width}×{image.height}px
            </span>
          </>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      <p className="mt-1 text-[11px] text-muted">A wide rectangle with a transparent background works best. Max 5 MB.</p>
    </div>
  );
}

/**
 * Crop away fully transparent margins, so a logo exported on a big empty canvas
 * fills its slot on the big screen instead of shrinking to a fraction of it.
 * An image with no transparent margin comes back unchanged.
 */
async function trimTransparentEdges(file: File): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('decode'));
    el.src = original;
  });
  const { naturalWidth: w, naturalHeight: h } = img;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  let top = h, left = w, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return original; // fully transparent — leave it to the server to accept or not
  // A small breathing margin so shadows and torn edges are not clipped.
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.01);
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(w - 1, right + pad);
  bottom = Math.min(h - 1, bottom + pad);
  const cw = right - left + 1;
  const ch = bottom - top + 1;
  if (cw === w && ch === h) return original;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  out.getContext('2d')!.drawImage(canvas, left, top, cw, ch, 0, 0, cw, ch);
  return out.toDataURL('image/png');
}
