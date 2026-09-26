import {useRef, useState, type PointerEvent as ReactPointerEvent} from 'react';
import type {SlideElement, Variant} from '@shared/element';
import {recipeFor} from '@shared/technique-recipes';
import {changeElement} from '@shared/geometry';
import type {DecorationView, PageAssetView} from '@shared/ipc';
import type {Palette} from '@shared/palette';
import {CARD_WIDTH} from './App';
import {SlidePreview} from './SlidePreview';

// Hand edits on top of an AI variant. Counts of each kind of edit are kept for the adoption record.
// In a sequence, moving or resizing an element applies to every slide that has it, so the slides
// stay in register; text edits and removals apply to the current slide only.
export function Editor({variant, palette, assets, decorations, pageImage, textBoxes, onClose}: {variant: Variant; palette: Palette; assets: PageAssetView[]; decorations: DecorationView[]; pageImage: string | null; textBoxes: Array<{x: number; y: number; w: number; h: number}>; onClose: () => void}) {
  const initial = variant.frames.map(f => f.elements);
  const [frames, setFrames] = useState<SlideElement[][]>(initial);
  const [current, setCurrent] = useState(0);
  const elements = frames[current] ?? [];
  const multi = frames.length > 1;
  // Geometry follows the element through the sequence; everything else stays on this slide.
  const linkGeometry = (recipeFor(variant.technique ?? 'build-up').continuity ?? 'fixed') === 'fixed';
  const setGeometry = (id: string, patch: Partial<SlideElement>) =>
    setFrames(fs => fs.map((els, i) => (linkGeometry || i === current) && els.some(e => e.id === id) ? changeElement(els, id, patch) : els));
  const setHere = (update: (els: SlideElement[]) => SlideElement[]) =>
    setFrames(fs => fs.map((els, i) => (i === current ? update(els) : els)));
  const [aim, setAim] = useState(variant.aim);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [counts, setCounts] = useState({moved: 0, textChanged: 0, resized: 0});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [addedPageId, setAddedPageId] = useState<string | null>(null);
  const scale = CARD_WIDTH / 960;
  const dragging = useRef(false);
  const selected = elements.find(e => e.id === selectedId) ?? null;

  const edit = (id: string, patch: Partial<SlideElement>, kind: keyof typeof counts) => {
    const {text: newText, size, ...geometry} = patch;
    if (Object.keys(geometry).length) setGeometry(id, geometry);
    if (newText !== undefined || size !== undefined) setHere(els => changeElement(els, id, {...(newText !== undefined ? {text: newText} : {}), ...(size !== undefined ? {size} : {})}));
    setCounts(c => ({...c, [kind]: c[kind] + 1}));
  };

  const onPointerDown = (ev: ReactPointerEvent, el: SlideElement) => {
    ev.preventDefault();
    setSelectedId(el.id);
    if (el.locked) return;
    const start = {x: ev.clientX, y: ev.clientY};
    dragging.current = false;
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - start.x) / scale, dy = (e.clientY - start.y) / scale;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragging.current = true;
      setGeometry(el.id, {x: el.x + dx, y: el.y + dy});
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragging.current) setCounts(c => ({...c, moved: c.moved + 1}));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const adopt = async () => {
    setBusy(true); setStatus('資料に追加しています…');
    const r = await window.slipper.adopt({variantId: variant.id, frames, aim, counts});
    setBusy(false); setStatus(r.message);
    if (r.ok && r.newPageId) setAddedPageId(r.newPageId);
  };

  return (
    <section className="editor">
      <div className="row between">
        <h2>手を入れる</h2>
        <button className="link" onClick={onClose}>案の一覧に戻る</button>
      </div>
      <label>狙い（書き換えられます）<input value={aim} onChange={e => setAim(e.target.value)} /></label>
      {multi && (
        <div className="frame-tabs">
          {frames.map((_, i) => <button key={i} className={i === current ? 'on' : ''} onClick={() => { setCurrent(i); setSelectedId(null); }}>{i + 1}枚目</button>)}
          <span className="muted small">{linkGeometry ? '位置と大きさの変更は全コマに、文字の変更はこのコマだけに効きます' : '変更はこのコマだけに効きます'}</span>
        </div>
      )}
      <SlidePreview elements={elements} palette={palette} assets={assets} decorations={decorations} pageImage={pageImage} textBoxes={textBoxes} width={CARD_WIDTH} showInvented selectedId={selectedId} onPointerDown={onPointerDown} />
      <p className="muted small">要素をドラッグで移動。クリックで選ぶと、下で文字や大きさを直せます。</p>

      {selected && (
        <div className="inspector">
          <div className="row between">
            <strong>{selected.type === 'text' ? '文字' : selected.type === 'asset' ? '素材' : '図形'}{selected.invented && <span className="tag warn">元の資料にない内容</span>}</strong>
            <button onClick={() => setFrames(fs => fs.map(els => els.map(e => e.id === selected.id ? {...e, locked: !selected.locked} : e)))}>{selected.locked ? '固定を外す' : '固定する'}</button>
          </div>
          {selected.type === 'text' && (
            <textarea rows={3} value={selected.text ?? ''} disabled={selected.locked} onChange={e => edit(selected.id, {text: e.target.value}, 'textChanged')} />
          )}
          <div className="row">
            <button disabled={selected.locked} onClick={() => edit(selected.id, {w: selected.w * 1.1, h: selected.h * 1.1, ...(selected.size ? {size: Math.min(120, Math.round(selected.size * 1.1))} : {})}, 'resized')}>大きく</button>
            <button disabled={selected.locked} onClick={() => edit(selected.id, {w: selected.w / 1.1, h: selected.h / 1.1, ...(selected.size ? {size: Math.max(8, Math.round(selected.size / 1.1))} : {})}, 'resized')}>小さく</button>
            <button disabled={selected.locked} onClick={() => { setHere(els => els.filter(e => e.id !== selected.id)); setSelectedId(null); setCounts(c => ({...c, textChanged: c.textChanged + 1})); }}>取り除く</button>
          </div>
        </div>
      )}

      <div className="row between adopt">
        <button className="link" onClick={() => { setFrames(initial); setAim(variant.aim); setCounts({moved: 0, textChanged: 0, resized: 0}); }}>AI の案に戻す</button>
        <button className="primary" disabled={busy} onClick={() => void adopt()}>{multi ? `資料に追加（元のページの直後に${frames.length}枚）` : '資料に追加（元のページの直後）'}</button>
      </div>
      {status && <p className="muted">{status}</p>}
      {addedPageId && (
        <div className="row">
          <button onClick={() => void window.slipper.showPage(addedPageId)}>追加したページを見る</button>
          <button className="link" onClick={onClose}>案の一覧に戻る</button>
        </div>
      )}
    </section>
  );
}
