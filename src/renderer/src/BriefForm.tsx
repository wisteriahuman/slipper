import {useState} from 'react';
import {coloredSlots} from '@shared/palette';
import type {PanelState} from '@shared/ipc';

type Deck = NonNullable<PanelState['deck']>;

// "Who and what" is required; accent meanings are optional. Until an accent has a meaning,
// variants emphasize with size, weight and space instead of color.
export function BriefForm({deck, onDone}: {deck: Deck; onDone: () => void}) {
  const [audience, setAudience] = useState(deck.brief?.audience ?? '');
  const [message, setMessage] = useState(deck.brief?.message ?? '');
  const [context, setContext] = useState(deck.brief?.context ?? '');
  const [subject, setSubject] = useState(deck.brief?.subject ?? '');
  const [meanings, setMeanings] = useState<Record<string, string>>(Object.fromEntries(deck.palette.meanings.map(m => [m.ref, m.meaning])));
  const [status, setStatus] = useState('');
  const save = async () => {
    const r = await window.slipper.saveBrief({audience, message, context, subject, colors: Object.entries(meanings).map(([ref, meaning]) => ({ref, meaning}))});
    setStatus(r.message);
    if (r.ok) onDone();
  };
  return (
    <section className="brief">
      <h2>この資料で、誰に何を伝えるか</h2>
      <p className="muted">資料ごとに最初の1回だけ書きます。作りながら書き換えて構いません。案はこれをもとに考えられます。</p>
      <label>場面（任意）<input value={context} onChange={e => setContext(e.target.value)} placeholder="例: ハッカソンの最終発表（5分）／就活の面接／社内LT" /></label>
      <label>誰に（プレゼンの聞き手）<textarea rows={2} value={audience} onChange={e => setAudience(e.target.value)} placeholder="例: 審査員（IT企業のエンジニアや企画職）" /></label>
      <label>何を<textarea rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="例: 誘う前のためらいを減らす仕組みとして、実際に使われる見込みがあると分かってほしい" /></label>
      <label>題材の対象（任意）<input value={subject} onChange={e => setSubject(e.target.value)} placeholder="例: プロダクトのユーザー＝大学生活を始めたばかりの学生" /></label>
      <p className="muted small">聞き手と題材の対象は、別のことがよくあります（学生向けのアプリを、審査員に発表する など）。</p>
      <details open={deck.palette.meanings.length > 0}>
        <summary>色の意味（任意）</summary>
        <p className="muted">この資料のテーマにある、色味のある色です。意味を決めた色だけが案に使われます。決めていない間は、色ではなく文字の大きさ・太さ・余白で強調します。灰色系の色は意味がなくても使われます。</p>
        <div className="accents">
          {coloredSlots(deck.palette).map(ref => (
            <label key={ref} className="accent">
              <i style={{background: deck.palette.hex[ref] ?? '#ccc'}} />
              <input value={meanings[ref] ?? ''} onChange={e => setMeanings({...meanings, [ref]: e.target.value})} placeholder={`${deck.palette.hex[ref] ?? ref} が表すこと（例: いま空いている）`} />
            </label>
          ))}
        </div>
      </details>
      <div className="row">
        <button className="primary" disabled={!audience.trim() || !message.trim()} onClick={() => void save()}>保存</button>
        {deck.brief && <button className="link" onClick={onDone}>やめる</button>}
        <span className="muted">{status}</span>
      </div>
    </section>
  );
}
