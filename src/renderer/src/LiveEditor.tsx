import {useEffect, useRef, useState, type PointerEvent} from 'react';
import {arrangeElements, cleanPatches, resolveConflicts, type Arrangement, type EditConflict, type ElementPatch, type LivePage, type ApplyLiveResult, type LiveDraft} from '@shared/live-edit';
import type {TextOption} from '@shared/text-refinement';

// The in-memory copy keeps tab changes instant; the main process also saves drafts locally.
const drafts = new Map<string, LiveDraft>();
const history = new Map<string, string>();
const LABELS = {x: '横位置', y: '縦位置', w: '幅', h: '高さ'};

export function LiveEditor({presentationId, pageId}: {presentationId: string; pageId: string}) {
  const key = `${presentationId}/${pageId}`;
  const saved = drafts.get(key);
  const [base, setBase] = useState<LivePage | null>(saved?.base ?? null);
  const [latest, setLatest] = useState<LivePage | null>(null);
  const [patches, setPatches] = useState<ElementPatch[]>(saved?.patches ?? []);
  const [hydrated, setHydrated] = useState(!!saved), [saveError, setSaveError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [undoId, setUndoId] = useState<string | undefined>(history.get(key));
  const [conflict, setConflict] = useState<{page: LivePage; items: EditConflict[]} | null>(null);
  const [choices, setChoices] = useState<Record<string, 'mine' | 'theirs'>>({});
  const [direction, setDirection] = useState('条件を残して、短く読みやすく');
  const [refining, setRefining] = useState(false);
  const [suggestions, setSuggestions] = useState<{id: string; source: string; options: TextOption[]} | null>(null);
  const refineEpoch = useRef(0);
  const undoDraft = useRef<LiveDraft[]>([]);
  const active = useRef(true), loading = useRef(false), applying = useRef(false), epoch = useRef(0);
  const refs = useRef({base, latest, patches});
  refs.current = {base, latest, patches};
  useEffect(() => {
    if (!base || !hydrated) return;
    if (patches.length) drafts.set(key, {base, patches}); else drafts.delete(key);
    void window.slipper.saveLiveDraft(base.snapshotId, patches).then(r => { if (active.current) setSaveError(r.ok ? '' : r.message ?? '下書きを保存できませんでした'); }).catch(e => { if (active.current) setSaveError(String(e)); });
  }, [key, base, patches, hydrated]);

  const refresh = async () => {
    if (loading.current || applying.current) return;
    loading.current = true; setRefreshing(true);
    const generation = epoch.current;
    try {
      const r = await window.slipper.readLivePage({presentationId, pageId, knownVersion: refs.current.latest?.version});
      if (!active.current || applying.current || generation !== epoch.current) return;
      if (!r.ok) { setError(r.message ?? '最新のページを取得できませんでした'); return; }
      setError('');
      if (r.page) {
        setLatest(r.page);
        if (!refs.current.patches.length) setBase(r.page);
      }
    } catch (e) { if (active.current) setError(String(e)); }
    finally { loading.current = false; if (active.current) setRefreshing(false); }
  };
  useEffect(() => {
    active.current = true;
    void (async () => {
      if (!saved) {
        try {
          const r = await window.slipper.loadLiveDraft(presentationId, pageId);
          if (!active.current) return;
          if (r.ok && r.draft) { refs.current = {...refs.current, ...r.draft}; setBase(r.draft.base); setPatches(r.draft.patches); setMessage('保存していた下書きを復元しました'); }
          else if (!r.ok) setSaveError(r.message ?? '下書きを読み込めませんでした');
        } catch (e) { if (active.current) setSaveError(String(e)); }
      }
      if (!active.current) return;
      setHydrated(true); void refresh();
    })();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 8000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => { active.current = false; refineEpoch.current++; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [key]);

  const change = (next: ElementPatch[], checkpoint = true) => {
    if (!base || busy || conflict) return;
    if (checkpoint) undoDraft.current = [...undoDraft.current.slice(-29), {base, patches}];
    setPatches(cleanPatches(base, next)); setMessage('');
  };
  const patch = (id: string, fields: Partial<ElementPatch>, checkpoint = true) => {
    const next = new Map(refs.current.patches.map(p => [p.id, p]));
    next.set(id, {...next.get(id), id, ...fields}); change([...next.values()], checkpoint);
  };
  const acceptResult = (r: ApplyLiveResult) => {
    if (!active.current) return;
    setMessage(r.message);
    if (r.page) setLatest(r.page);
    if (r.ok) {
      setPatches([]); setConflict(null); setChoices({}); undoDraft.current = [];
      if (r.page) setBase(r.page);
      setUndoId(r.undoId);
      if (r.undoId) history.set(key, r.undoId); else history.delete(key);
      drafts.delete(key);
    } else if (r.conflicts?.length && r.page) { setConflict({page: r.page, items: r.conflicts}); setChoices({}); }
  };
  const commit = async (input = patches, baseline = base) => {
    if (!baseline || !input.length || applying.current) return;
    epoch.current++; applying.current = true; setBusy(true); setError(''); setMessage('変更した箇所を反映しています…');
    try { acceptResult(await window.slipper.applyLiveEdit({snapshotId: baseline.snapshotId, patches: input})); }
    catch (e) { if (active.current) setError(String(e)); }
    finally { applying.current = false; if (active.current) setBusy(false); }
  };
  const resolve = () => {
    if (!conflict || !base) return;
    const next = resolveConflicts(conflict.page, patches, choices);
    setBase(conflict.page); setPatches(next); setConflict(null); setChoices({}); undoDraft.current = [];
    if (!next.length) setMessage('Google Slides 側の内容を残しました');
    // Resolution is staged so the user sees exactly what the next Apply will change.
    else setMessage('選んだ内容を下書きに反映しました。「同じページに反映」で確定します');
  };
  const undo = async () => {
    if (!undoId || applying.current) return;
    epoch.current++; applying.current = true; setBusy(true);
    try { acceptResult(await window.slipper.undoLiveEdit(undoId)); }
    catch (e) { if (active.current) setError(String(e)); }
    finally { applying.current = false; if (active.current) setBusy(false); }
  };
  const page = latest ?? base;
  const current = page?.elements.find(e => e.id === selected[0]);
  const pending = patches.find(p => p.id === current?.id);
  const currentBox = current ? pending?.box ?? current.box : null;
  const selectedText = pending?.text ?? current?.text;
  const refine = async () => {
    if (!page || !current || !selectedText?.trim()) return;
    const generation = ++refineEpoch.current;
    const id = current.id, source = selectedText;
    setRefining(true); setSuggestions(null); setMessage('選んだ文章の伝え方を考えています…');
    try {
      const r = await window.slipper.refineLiveText({snapshotId: page.snapshotId, elementId: id, text: source, direction});
      if (!active.current || generation !== refineEpoch.current) return;
      if (r.ok && r.options) setSuggestions({id, source, options: r.options});
      setMessage(r.message);
    } catch (e) { if (active.current) setError(String(e)); }
    finally { if (active.current && generation === refineEpoch.current) setRefining(false); }
  };
  const changedRemotely = !!base && !!latest && base.version !== latest.version && patches.length > 0;
  const choose = (id: string, multiple: boolean) => setSelected(ids => multiple ? ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] : [id]);

  const drag = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (!page || busy || conflict) return;
    choose(id, e.shiftKey || e.metaKey);
    if (e.shiftKey || e.metaKey) return;
    const el = page.elements.find(x => x.id === id)!;
    if (!el.movable) return;
    const initial = refs.current.patches.find(p => p.id === id)?.box ?? el.box;
    const startX = e.clientX, startY = e.clientY, scale = e.currentTarget.parentElement!.getBoundingClientRect().width / page.width;
    const target = e.currentTarget; target.setPointerCapture(e.pointerId);
    let moved = false;
    const startPatches = refs.current.patches;
    const move = (ev: globalThis.PointerEvent) => {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 3 && !moved) return;
      if (!moved && base) { undoDraft.current = [...undoDraft.current.slice(-29), {base, patches: startPatches}]; moved = true; }
      patch(id, {box: {...initial, x: Math.max(-initial.w + 1, Math.min(page.width - 1, initial.x + (ev.clientX - startX) / scale)), y: Math.max(-initial.h + 1, Math.min(page.height - 1, initial.y + (ev.clientY - startY) / scale))}}, false);
    };
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  };

  return <section className="live-editor" aria-label="同じページを編集">
    <div className="row between"><div><span className="tag">共有資料を編集</span><h2>ここで直して、そのまま一緒に作る</h2></div><button onClick={() => void refresh()} disabled={refreshing || busy}>{refreshing ? '確認中…' : '最新を確認'}</button></div>
    <p className="muted small">文字や図を選択して編集できます。変更は「同じページに反映」を押すまで下書きです。</p>
    {error && <p className="error" role="alert">{error}</p>}
    {saveError && <p className="error" role="alert">下書きの保存: {saveError}</p>}
    {!page && <p className="muted">Google Slides のページを読み込んでいます…</p>}
    {page && <>
      <div className="live-canvas" style={{aspectRatio: `${page.width} / ${page.height}`}}>
        {page.image ? <img src={page.image} alt="Google Slides の現在のページ" draggable={false} /> : <p className="muted">画像を取得できません。一覧から要素を選べます。</p>}
        {page.image && page.elements.filter(el => el.box.w > 0 && el.box.h > 0).map(el => <button key={el.id} type="button" className={`live-hit ${selected.includes(el.id) ? 'selected' : ''}`} aria-label={`選択: ${el.label}`} aria-pressed={selected.includes(el.id)} title={el.label}
          style={{left: `${el.box.x / page.width * 100}%`, top: `${el.box.y / page.height * 100}%`, width: `${el.box.w / page.width * 100}%`, height: `${el.box.h / page.height * 100}%`}}
          onPointerDown={e => drag(e, el.id)} onClick={e => { if (e.detail === 0) choose(el.id, e.shiftKey || e.metaKey); }} disabled={busy || !!conflict} />)}
        {patches.filter(p => p.box).map(p => <div key={p.id} className="live-proposed" style={{left: `${p.box!.x / page.width * 100}%`, top: `${p.box!.y / page.height * 100}%`, width: `${p.box!.w / page.width * 100}%`, height: `${p.box!.h / page.height * 100}%`}}><span>変更後</span></div>)}
      </div>
      <p className="muted small">画像はGoogle側の現在の表示。点線は変更後の配置です。文字の下書きは下で確認できます。</p>
      {changedRemotely && <p className="notice-inline">Google Slides 側の変更を読み込みました。あなたの下書きも残しています。反映時に同じ箇所の変更を確認します。</p>}
      <details className="live-layers" open={!selected.length}><summary>要素を選ぶ · {page.elements.length}件</summary><div>
        {page.elements.map(el => <label className="check" key={el.id}><input type="checkbox" checked={selected.includes(el.id)} disabled={busy || !!conflict} onChange={() => choose(el.id, true)} /><span><small>{el.kind}</small>{el.label}</span></label>)}
      </div></details>
      {selected.length > 1 && <div className="live-inspector"><strong>{selected.length}件をまとめて整える</strong><div className="row">{([['left', '左を揃える'], ['top', '上を揃える'], ['horizontal', '横に等間隔'], ['vertical', '縦に等間隔']] as [Arrangement, string][]).map(([kind, label]) => <button key={kind} disabled={busy || !!conflict} onClick={() => change(arrangeElements(page.elements, patches, selected, kind))}>{label}</button>)}</div><p className="muted small">配置を編集できる要素に適用します。⇧クリックで複数選択できます。</p></div>}
      {current && selected.length === 1 && <div className="live-inspector">
        <div className="row between"><strong>{current.kind}</strong><button className="link" onClick={() => setSelected([])}>選択を解除</button></div>
        {current.text !== undefined && <label>文字<textarea rows={4} value={pending?.text ?? current.text} disabled={busy || !!conflict} onChange={e => patch(current.id, {text: e.target.value})} /></label>}
        {current.text !== undefined && <div className="live-refine"><label>この文章をどう伝えるか<input value={direction} maxLength={300} onChange={e => setDirection(e.target.value)} placeholder="例: 結論を先に、条件は残す" /></label><div className="row">{['条件を残して、短く読みやすく', '結論を先に伝える', '専門用語をやさしく説明する'].map(d => <button className="refine-intent" key={d} onClick={() => setDirection(d)} disabled={refining}>{d}</button>)}</div><div className="row between"><small className="muted">選択文章とページの文章を Claude Code に送ります。</small>{refining ? <button onClick={() => { refineEpoch.current++; setRefining(false); setMessage('文章の作成を中止しました'); void window.slipper.cancelLiveRefinement(); }}>中止</button> : <button disabled={busy || !!conflict || !direction.trim() || !selectedText?.trim()} onClick={() => void refine()}>この文章の別案を見る</button>}</div>
          {suggestions?.id === current.id && <div className="text-options">{suggestions.options.map((o, i) => <article key={i}><strong>{o.label}</strong><p>{o.text}</p><small className="muted">{o.reason}</small><button disabled={busy || !!conflict || selectedText !== suggestions.source} onClick={() => { patch(current.id, {text: o.text}); setSuggestions(null); }}>この文章を下書きに使う</button></article>)}{selectedText !== suggestions.source && <p className="notice-inline">元の文章が変わりました。現在の文章で別案を作り直してください。</p>}</div>}
        </div>}
        {current.movable && currentBox ? <div className="live-dimensions">{(['x', 'y', 'w', 'h'] as const).map(k => <label key={`${current.id}-${k}`}>{LABELS[k]}<input type="number" step="1" value={Math.round(currentBox[k] * 10) / 10} disabled={busy || !!conflict || ((k === 'w' || k === 'h') && !current.resizable)} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n) && (!(k === 'w' || k === 'h') || n >= 1)) patch(current.id, {box: {...currentBox, [k]: n}}); }} /></label>)}</div> : <p className="muted small">この要素の配置・詳細は Google Slides 側で編集できます。</p>}
      </div>}
      {patches.length > 0 && <div className="live-changes"><strong>反映する変更 · {patches.length}件</strong>{patches.map(p => <div key={p.id}><span>{base?.elements.find(e => e.id === p.id)?.label ?? p.id}</span>{p.text !== undefined && <p className="live-diff"><del>{base?.elements.find(e => e.id === p.id)?.text || '（空）'}</del><ins>{p.text || '（空）'}</ins></p>}{p.box && <small>配置・大きさを変更</small>}</div>)}</div>}
      {conflict && <div className="live-conflicts" role="region" aria-label="変更の比較"><h3>同じ箇所が変更されています</h3>{conflict.items.map(c => { const id = `${c.id}:${c.field}`; return <div className="live-conflict" key={id}><strong>{c.label} · {c.field === 'text' ? '文字' : c.field === 'box' ? '配置' : '削除'}</strong><details><summary>編集開始時</summary><p>{c.before}</p></details><div className="live-compare"><div><small>Google Slides の現在</small><p>{c.current}</p><button aria-pressed={choices[id] === 'theirs'} onClick={() => setChoices({...choices, [id]: 'theirs'})}>こちらを残す</button></div><div><small>あなたの下書き</small><p>{c.proposed}</p>{c.field !== 'deleted' && <button aria-pressed={choices[id] === 'mine'} onClick={() => setChoices({...choices, [id]: 'mine'})}>こちらを残す</button>}</div></div></div>; })}<button className="primary" disabled={conflict.items.some(c => !choices[`${c.id}:${c.field}`])} onClick={resolve}>選んだ内容で下書きを更新</button></div>}
      <div className="row between live-actions"><div className="row">
        <button disabled={busy || !!conflict || !undoDraft.current.length} onClick={() => { const prev = undoDraft.current.pop(); if (prev) { setBase(prev.base); setPatches(prev.patches); } }}>一つ戻す</button>
        <button disabled={busy || !patches.length} onClick={() => { if (base) undoDraft.current = [...undoDraft.current, {base, patches}]; setPatches([]); if (latest) setBase(latest); setConflict(null); setChoices({}); setMessage('下書きを取り消しました'); }}>下書きを取り消す</button>
      </div><button className="primary" disabled={busy || !!conflict || !patches.length || !latest} onClick={() => void commit()}>{busy ? '反映中…' : '同じページに反映'}</button></div>
      {message && <p className="notice-inline" role="status">{message}</p>}
      {undoId && !patches.length && <button className="link" disabled={busy} onClick={() => void undo()}>直前の反映を取り消す</button>}
      {patches.length > 0 && !saveError && <p className="muted small">下書きはこの端末に保存されます。共有資料への反映はまだ行っていません。</p>}
    </>}
  </section>;
}
