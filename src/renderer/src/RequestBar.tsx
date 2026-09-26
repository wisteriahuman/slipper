import {useEffect, useState} from 'react';
import type {PanelState} from '@shared/ipc';

type Props = {
  running: PanelState['running'];
  kind: 'page' | 'flow';
  onAsk: (input: {direction: string; deep: boolean}) => Promise<{ok: boolean; message: string}>;
};

const TEXT = {
  page: {button: '別の伝え方を見る', placeholder: '一言の方向（任意）例: 数字より場面で', fast: '標準', deep: 'じっくり',
    waiting: '3つの見せ方を考えています', sending: 'このページの内容と「誰に・何を」'},
  flow: {button: '流れの案を見る', placeholder: '一言の方向（任意）例: 5分で話せる長さに', fast: '標準', deep: 'じっくり',
    waiting: '3つの語り方を考えています', sending: '資料全体の文字と画像の説明、「誰に・何を」'}
};

export function RequestBar({running, kind, onAsk}: Props) {
  const t = TEXT[kind];
  const [direction, setDirection] = useState('');
  const [deep, setDeep] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!running) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [running]);
  const mine = running?.kind === kind ? running : null;
  const ask = async () => { setMessage(''); const r = await onAsk({direction, deep}); if (!r.ok) setMessage(r.message); };
  return (
    <section className="request">
      <input value={direction} onChange={e => setDirection(e.target.value)} placeholder={t.placeholder} disabled={!!running} />
      <div className="row">
        <div className="toggle" role="radiogroup" aria-label="考える深さ">
          <button role="radio" aria-checked={!deep} className={!deep ? 'on' : ''} onClick={() => setDeep(false)} disabled={!!running}>{t.fast}</button>
          <button role="radio" aria-checked={deep} className={deep ? 'on' : ''} onClick={() => setDeep(true)} disabled={!!running}>{t.deep}</button>
        </div>
        {mine
          ? <button onClick={() => void window.slipper.cancelRequests()}>やめる</button>
          : <button className="primary" disabled={!!running} onClick={() => void ask()}>{t.button}</button>}
      </div>
      {mine && <p className="muted">{t.waiting}…（{Math.round((now - mine.startedAt) / 1000)}秒 ・ 残り{mine.pending}案）できた案から下に表示します。</p>}
      {mine?.status && <p className="notice-inline">{mine.status}</p>}
      {running && !mine && <p className="muted small">もう一方の依頼を処理中です。</p>}
      {message && <p className="error">{message}</p>}
      <p className="muted small">{t.sending}を、Claude Code（あなたのログイン）経由で AI に送ります。</p>
    </section>
  );
}
