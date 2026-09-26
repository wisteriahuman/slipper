import {useState} from 'react';
import type {Storyline} from '@shared/storyline';
import {TechniqueNote} from './TechniqueNote';

// A storyline as a storyboard: kept pages as Google renders them, new pages as a short description.
// Leads with the aim and what was given up, like page variants.
export function StoryboardCard({storyline, thumbnails}: {storyline: Storyline; thumbnails: Record<string, string>}) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [builtId, setBuiltId] = useState<string | null>(null);
  const counts = {keep: 0, merge: 0, new: 0};
  for (const s of storyline.slides) counts[s.source.kind]++;
  const thumb = (id: string) => thumbnails[id]
    ? <img src={thumbnails[id]} alt="" />
    : <span className="thumb-loading">読み込み中</span>;
  const build = async () => {
    setBusy(true); setStatus('資料を複製して構成の下書きを作っています…');
    const r = await window.slipper.adoptStoryline(storyline.id);
    setBusy(false); setStatus(r.message);
    if (r.ok && r.newPresentationId) setBuiltId(r.newPresentationId);
  };
  return (
    <article className="variant storyline">
      {storyline.technique ? <><TechniqueNote id={storyline.technique} />{storyline.supportingTechniques?.map(id => <TechniqueNote key={id} id={id} />)}</> : storyline.approach && <span className="tag">{storyline.approach.replace(/（.*$/, '')}</span>}
      <p className="aim">{storyline.aim}</p>
      {storyline.fromCurrent && <p className="from-current"><span className="label">今から変わる</span>{storyline.fromCurrent}</p>}
      <p className="gave-up"><span className="label">捨てたもの</span>{storyline.gaveUp}</p>
      <p className="muted small">{storyline.slides.length}枚 ・ 元のまま {counts.keep} ・ まとめる {counts.merge} ・ 新しく作る {counts.new}</p>
      <ol className="storyboard">
        {storyline.slides.map((s, i) => (
          <li key={i} className={`frame frame-${s.source.kind}`}>
            <div className="frame-image">
              {s.source.kind === 'keep' && thumb(s.source.pageId)}
              {s.source.kind === 'merge' && <div className="stack">{s.source.pageIds.slice(0, 3).map(id => <div key={id}>{thumb(id)}</div>)}</div>}
              {s.source.kind === 'new' && <span className="new-note">{s.note}</span>}
            </div>
            {s.step && <p className="frame-step">{s.step}</p>}
            <p className="frame-role"><span>{i + 1}</span>{s.role}</p>
            {s.source.kind === 'merge' && <p className="frame-note">{s.source.pageIds.length}枚をまとめる: {s.note}</p>}
          </li>
        ))}
      </ol>
      <div className="row between">
        <span className="muted small">複製して構成の下書きを作ります。新規・統合ページの中身は、その後に仕上げます。</span>
        {builtId
          ? <button onClick={() => void window.slipper.openPresentation(builtId)}>作った資料を開く</button>
          : <button className="primary" disabled={busy} onClick={() => void build()}>この流れで構成の下書きを作る</button>}
      </div>
      {status && <p className="muted">{status}</p>}
    </article>
  );
}
