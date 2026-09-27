import {useState, type MouseEvent} from 'react';
import type {LibraryItemView, LibraryKind, LibraryState} from '@shared/library';

const KIND: Record<LibraryKind, string> = {icon: 'アイコン', illustration: 'イラスト', photo: '写真'};
const open = (url: string) => (e: MouseEvent) => { e.preventDefault(); void window.slipper.openExternal(url); };

// App-wide assets. Imported images are offered to the AI only after their terms are recorded.
export function LibraryPanel({library}: {library: LibraryState}) {
  const [message, setMessage] = useState('');
  const unconfirmed = library.imported.filter(i => i.license.status !== 'confirmed').length;
  return (
    <section>
      <h2>素材ライブラリ</h2>
      <p className="muted small">どの資料の案でも使える素材です。AI は案を作るときに、ここから内容に合う素材を探します。</p>
      <ul className="library-bundled">
        {library.bundled.map(b => <li key={b.name}><strong>{b.name}</strong> {b.count}点 <span className="muted small">（{b.license}・同梱・クレジット不要） <a href={b.sourceUrl} onClick={open(b.sourceUrl)}>出典</a></span></li>)}
      </ul>
      <h2>取り込んだ素材 {library.imported.length > 0 && <span className="count">{library.imported.length}点</span>}</h2>
      <p className="muted small">素材サイトなどから自分でダウンロードした画像を取り込めます。出典と利用条件を記録するまで、AI の候補には入りません。取り込んだ画像は、Google Slides に追加する数秒の間だけリンク共有でアップロードされるため、機密の画像は取り込まないでください。</p>
      <div className="row">
        <button onClick={async () => { setMessage(''); const r = await window.slipper.importLibraryFiles(); setMessage(r.message); }}>画像を取り込む</button>
        {unconfirmed > 0 && <span className="notice-inline">利用条件が未確認の素材が {unconfirmed} 点あります</span>}
      </div>
      {message && <p className="notice-inline" style={{whiteSpace: 'pre-line'}}>{message}</p>}
      {library.imported.map(item => <ImportedItem key={item.key} item={item} />)}
    </section>
  );
}

function ImportedItem({item}: {item: LibraryItemView}) {
  const [draft, setDraft] = useState(item);
  const [message, setMessage] = useState('');
  const l = draft.license;
  const set = (patch: Partial<LibraryItemView>) => setDraft({...draft, ...patch});
  const setLicense = (patch: Partial<LibraryItemView['license']>) => setDraft({...draft, license: {...draft.license, ...patch}});
  const save = async (status: 'confirmed' | 'unconfirmed') => {
    const r = await window.slipper.updateLibraryItem(item.key, {kind: draft.kind, title: draft.title, description: draft.description, tags: draft.tags, license: {...draft.license, status}});
    setMessage(r.message);
  };
  const confirmed = item.license.status === 'confirmed';
  return (
    <article className="variant library-item">
      <div className="library-head">
        <span className="pool-image">{item.previewUrl ? <img src={item.previewUrl} alt="" /> : <span className="muted small">画像なし</span>}</span>
        <div>
          <span className={`tag ${confirmed ? '' : 'neutral'}`}>{confirmed ? '案に使える' : '利用条件が未確認'}</span>
          <label>名前<input value={draft.title} onChange={e => set({title: e.target.value})} /></label>
          <label>種類<select value={draft.kind} onChange={e => set({kind: e.target.value as LibraryKind})}>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        </div>
      </div>
      <label>何が写っているか（AI が選ぶときに使います）<textarea rows={2} value={draft.description} onChange={e => set({description: e.target.value})} /></label>
      <label>探すときの言葉（空白区切り）<input value={draft.tags.join(' ')} onChange={e => set({tags: e.target.value.split(/\s+/).filter(Boolean)})} /></label>
      <fieldset className="license">
        <legend>出典と利用条件</legend>
        <label>出典のURL<input value={l.sourceUrl} placeholder="https://…" onChange={e => setLicense({sourceUrl: e.target.value})} /></label>
        <label>ライセンス・利用規約<input value={l.name} placeholder="例: いらすとや利用規約" onChange={e => setLicense({name: e.target.value})} /></label>
        <label className="check"><input type="checkbox" checked={l.creditRequired} onChange={e => setLicense({creditRequired: e.target.checked})} />クレジット表記が必要</label>
        {l.creditRequired && <>
          <label>表記する文<input value={l.creditText ?? ''} placeholder="例: Designed by Freepik" onChange={e => setLicense({creditText: e.target.value})} /></label>
          <label className="check"><input type="checkbox" checked={!!l.nearUse} onChange={e => setLicense({nearUse: e.target.checked})} />使ったページにも表記する（規約が求める場合）</label>
        </>}
        <label>点数制限などのメモ<input value={l.limitNote ?? ''} placeholder="例: 商用で21点以上は有償" onChange={e => setLicense({limitNote: e.target.value})} /></label>
        <p className="muted small">資料末尾の「クレジット」ページに、クレジットが必要な素材の表記をまとめて追記します。</p>
      </fieldset>
      <div className="row between">
        <button className="link" onClick={async () => { if (confirm('この素材をライブラリから削除しますか？')) await window.slipper.removeLibraryItem(item.key); }}>削除</button>
        <div className="row">
          {confirmed && <button onClick={() => void save('unconfirmed')}>候補から外す</button>}
          <button className="primary" onClick={() => void save('confirmed')}>{confirmed ? '保存' : '利用条件を確認して保存'}</button>
        </div>
      </div>
      {message && <p className="notice-inline" style={{whiteSpace: 'pre-line'}}>{message}</p>}
    </article>
  );
}
