import {useState} from 'react';
import {MAX_POOL_SELECTION, type AssetPoolState} from '@shared/asset-pool';

// Images, charts and whole pages from elsewhere in the deck that variants of this page may use.
// Selections belong to the presentation; each variant keeps a copy of the assets it used.
export function AssetPool({pool, busy}: {pool: AssetPoolState; busy: boolean}) {
  const [message, setMessage] = useState('');
  const selected = pool.items.filter(x => x.selected).length;
  const disabled = busy || pool.loading;
  const run = async (f: () => Promise<{ok: boolean; message: string}>) => { setMessage(''); const r = await f(); if (!r.ok) setMessage(r.message); };
  return (
    <details className="pool">
      <summary>資料内の素材を使う {selected > 0 && <span className="count">{selected}件選択中</span>}</summary>
      <p className="muted small">選んだ画像・グラフ・ページは、このページの案でも使えるようになります。複雑な図や表は、ラベルごと見せるためにページ全体を選んでください（最大{MAX_POOL_SELECTION}件）。</p>
      <div className="row">
        <button disabled={disabled} onClick={() => void run(() => window.slipper.scanAssets())}>{pool.items.length ? '読み込み直す' : '素材を読み込む'}</button>
        {pool.loading && <span className="muted small">読み込んでいます…</span>}
      </div>
      {pool.error && <div className="error">{pool.error}</div>}
      {message && <p className="notice-inline">{message}</p>}
      {pool.items.length > 0 && (
        <ul className="pool-items">
          {pool.items.map(item => (
            <li key={item.id}>
              <label className={item.selected ? 'on' : ''}>
                <input type="checkbox" checked={item.selected} disabled={disabled || (!item.selected && selected >= MAX_POOL_SELECTION)}
                  onChange={e => void run(() => window.slipper.selectAsset(item.id, e.target.checked))} />
                <span className="pool-image">{item.previewUrl ? <img src={item.previewUrl} alt="" /> : <span className="muted small">画像なし</span>}</span>
                <span className="pool-text"><span className="label">{item.pageNumber}枚目・{KIND[item.kind]}</span>{item.description}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

const KIND = {page: 'ページ全体', image: '画像', chart: 'グラフ'} as const;
