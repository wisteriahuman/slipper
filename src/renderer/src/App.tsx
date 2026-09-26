import {useEffect, useState} from 'react';
import type {Variant} from '@shared/element';
import type {PanelState} from '@shared/ipc';
import {BriefForm} from './BriefForm';
import {Editor} from './Editor';
import {RequestBar} from './RequestBar';
import {Setup} from './Setup';
import {SlidePreview} from './SlidePreview';
import {VariantCard} from './VariantCard';
import {StoryboardCard} from './StoryboardCard';
import {DeckReadingCard} from './DeckReadingCard';
import {scenesFor} from '@shared/scenes';

// Panel 560px − panel padding 22×2 − card padding 12×2 − borders 2 = 490px available inside a card.
export const CARD_WIDTH = 488;

export function App() {
  const [state, setState] = useState<PanelState | null>(null);
  const [editing, setEditing] = useState<Variant | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [mode, setMode] = useState<'page' | 'flow'>('page');

  useEffect(() => {
    void window.slipper.getState().then(setState);
    return window.slipper.onState(setState);
  }, []);
  // Leaving the page closes the editor for its variants.
  useEffect(() => { setEditing(null); }, [state?.location.pageId]);

  if (!state) return null;
  const {deck, page} = state;
  const ready = state.signedIn && state.google.connected;

  return (
    <div className="panel">
      <header className="top">
        <strong className="logo">Slipper</strong>
        <span className="where">{deck?.title || (state.location.presentationId ? '資料を読み込み中…' : '左で資料を開いてください')}{page ? ' ・ ページを表示中' : ''}</span>
      </header>

      {state.notices.map((n, i) => (
        <div key={i} className="notice"><span>{n}</span><button className="link" onClick={() => void window.slipper.dismissNotice(i)}>閉じる</button></div>
      ))}

      {!ready && <Setup state={state} />}
      {ready && state.google.needsReconnect && (
        <div className="notice"><span>流れの案から資料を作るには、Drive の権限を追加で許可する必要があります。</span>
          <button onClick={() => void window.slipper.connectGoogle()}>Google に接続し直す</button></div>
      )}

      {ready && deck && (!deck.brief || briefOpen
        ? <BriefForm deck={deck} onDone={() => setBriefOpen(false)} />
        : <section className="brief-summary">
            {deck.brief.context && <div><span className="label">場面</span>{deck.brief.context}</div>}
            <div><span className="label">誰に</span>{deck.brief.audience}</div>
            <div><span className="label">何を</span>{deck.brief.message}</div>
            {deck.brief.subject && <div><span className="label">題材</span>{deck.brief.subject}</div>}
            {scenesFor(deck.brief.context).map(s => (
              <details key={s.id} className="scene"><summary>「{s.label}」の聞き手についての知識を案に使います</summary>
                <ul>{s.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                <p className="muted small">出典: {s.sources.map((src, i) => <span key={i}>{i > 0 && '／'}<a href={src.url} onClick={e => { e.preventDefault(); void window.slipper.openExternal(src.url); }}>{src.title}</a></span>)}</p>
              </details>
            ))}
            <button className="link" onClick={() => setBriefOpen(true)}>書き換える</button>
          </section>)}

      {state.pageError && <div className="error">{state.pageError}</div>}

      {ready && deck?.brief && !editing && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'page'} className={mode === 'page' ? 'on' : ''} onClick={() => setMode('page')}>このページ</button>
          <button role="tab" aria-selected={mode === 'flow'} className={mode === 'flow' ? 'on' : ''} onClick={() => setMode('flow')}>資料全体の流れ</button>
        </div>
      )}

      {ready && deck?.brief && mode === 'flow' && !editing && (
        <>
          <RequestBar kind="flow" running={state.running} onAsk={input => window.slipper.requestStorylines(input)} />
          <section>
            {state.deckReading
              ? <DeckReadingCard deckReading={state.deckReading} thumbnails={state.thumbnails} busy={!!state.running} />
              : <p className="muted">流れの案を頼むと、まず今の流れを読み解き、案と並べて比べられるようにします。</p>}
            <h2>流れの案 {state.storylines.length > 0 && <span className="count">{state.storylines.length}案</span>}</h2>
            {state.storylines.length === 0 && state.running?.kind !== 'flow' && <p className="muted">まだ流れの案はありません。上のボタンで、資料全体の語り方の別案を頼めます。</p>}
            {state.storylines.map(s => <StoryboardCard key={s.id} storyline={s} thumbnails={state.thumbnails} />)}
          </section>
        </>
      )}

      {ready && deck?.brief && page && mode === 'page' && !editing && (
        <>
          <RequestBar kind="page" running={state.running} onAsk={input => window.slipper.requestVariants(input)} />
          <section>
            <h2>元のページ</h2>
            {page.thumbnailUrl
              ? <img className="thumbnail" src={page.thumbnailUrl} alt="元のページ" width={CARD_WIDTH} />
              : <p className="muted">ページの画像を読み込めませんでした。</p>}
            {page.reading
              ? <div className="page-reading"><span className="tag neutral">今のページ</span>
                  <p className="aim">{page.reading.aim}</p>
                  <p className="gave-up"><span className="label">捨てているもの</span>{page.reading.gaveUp}</p></div>
              : <p className="muted small">「別の伝え方を見る」を押すと、今のページの狙いも一緒に読み解きます。</p>}
          </section>
          <section>
            <h2>別の伝え方 {state.variants.length > 0 && <span className="count">{state.variants.length}案</span>}</h2>
            {state.variants.length === 0 && !state.running && <p className="muted">まだ案はありません。上のボタンで頼んでみてください。</p>}
            {state.variants.map(v => <VariantCard key={v.id} variant={v} palette={deck.palette} assets={page.assets} decorations={page.decorations} pageImage={page.thumbnailUrl} textBoxes={page.textBoxes} onEdit={() => setEditing(v)} />)}
          </section>
        </>
      )}

      {editing && deck && page && <Editor variant={editing} palette={deck.palette} assets={page.assets} decorations={page.decorations} pageImage={page.thumbnailUrl} textBoxes={page.textBoxes} onClose={() => setEditing(null)} />}

      {state.mcp && ready && (
        <details className="mcp">
          <summary>会話から頼む（普段の Claude Code）</summary>
          <p className="muted">Slipper の起動中だけ使えます。次のコマンドを実行し、Claude Code に「Slipper で今のページの別案を出して」と頼みます。合言葉は起動のたびに変わります。</p>
          <code>claude mcp add --transport http slipper {state.mcp.url} --header "Authorization: Bearer …"</code>
        </details>
      )}
    </div>
  );
}
