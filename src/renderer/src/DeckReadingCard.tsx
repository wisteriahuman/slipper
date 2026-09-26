import type {PanelState} from '@shared/ipc';

type Props = {deckReading: NonNullable<PanelState['deckReading']>; thumbnails: Record<string, string>; busy: boolean};

// The current flow, described in the same terms as the proposals below it, so each proposal can be
// read as a change from here. It describes choices; it does not score them.
export function DeckReadingCard({deckReading, thumbnails, busy}: Props) {
  const {reading, stale} = deckReading;
  const position = (id: string) => reading.pageIds.indexOf(id) + 1;
  return (
    <article className="variant reading">
      <div className="row between"><span className="tag neutral">今の流れ</span>
        <button className="link" disabled={busy} onClick={() => void window.slipper.rereadDeck()}>読み解き直す</button></div>
      {stale && <p className="notice-inline">この読み解きのあと、ページが増減・入れ替わっています。「読み解き直す」で更新できます。</p>}
      <p className="aim">{reading.aim}</p>
      <p className="gave-up"><span className="label">捨てているもの</span>{reading.gaveUp}</p>
      <p className="gave-up"><span className="label">誰に・何を</span>{reading.relation}</p>
      <ol className="sections">
        {reading.sections.map((s, i) => {
          const first = position(s.pageIds[0]!), last = position(s.pageIds[s.pageIds.length - 1]!);
          return (
            <li key={i}>
              <div className="section-head"><strong>{s.role}</strong><span className="muted small">{first === last ? `${first}枚目` : `${first}〜${last}枚目`}</span></div>
              <div className="section-thumbs">
                {s.pageIds.slice(0, 4).map(id => thumbnails[id] ? <img key={id} src={thumbnails[id]} alt="" /> : <span key={id} className="thumb-loading">…</span>)}
                {s.pageIds.length > 4 && <span className="muted small">ほか{s.pageIds.length - 4}枚</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </article>
  );
}
