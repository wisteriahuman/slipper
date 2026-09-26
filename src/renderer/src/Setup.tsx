import {useState} from 'react';
import type {PanelState} from '@shared/ipc';

export function Setup({state}: {state: PanelState}) {
  const [message, setMessage] = useState('');
  const run = async (fn: () => Promise<{message: string}>) => { setMessage('処理中…'); setMessage((await fn()).message); };
  return (
    <section className="setup">
      <h2>準備</h2>
      <ol>
        <li className={state.signedIn ? 'done' : ''}>
          <strong>Google のログインを取り込む</strong>
          <p className="muted">アプリ内では Google にログインできないため、普段のブラウザのログイン状態（google.com の Cookie のみ）を取り込みます。キーチェーンの確認が出たら「許可」を押してください。</p>
          {state.browsers.map(b => <button key={b.id} onClick={() => void run(() => window.slipper.importCookies(b.id))}>{b.label} から取り込む</button>)}
          {state.browsers.length === 0 && <p className="error">対応ブラウザ（Arc / Chrome）が見つかりません</p>}
        </li>
        <li className={state.google.hasClient ? 'done' : ''}>
          <strong>OAuth クライアントを設定する</strong>
          <p className="muted">Google Cloud で作った「デスクトップ アプリ」型の OAuth クライアントの JSON を選びます。Google Slides API を有効にしておいてください。</p>
          <button onClick={() => void run(() => window.slipper.chooseGoogleClient())}>JSON を選ぶ</button>
        </li>
        <li className={state.google.connected ? 'done' : ''}>
          <strong>Google Slides API に接続する</strong>
          <p className="muted">普段のブラウザで Google の許可画面が開きます。ページの読み込みと、資料へのページの追加に使います。</p>
          <button disabled={!state.google.hasClient} onClick={() => void run(() => window.slipper.connectGoogle())}>接続する</button>
        </li>
      </ol>
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
