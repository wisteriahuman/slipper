import type {Variant} from '@shared/element';
import type {DecorationView, PageAssetView} from '@shared/ipc';
import {needsMeaning, type Palette} from '@shared/palette';
import {CARD_WIDTH} from './App';
import {SlidePreview} from './SlidePreview';
import {TechniqueNote} from './TechniqueNote';

// Leads with the aim and what was given up, so variants are chosen by what they do for the
// audience rather than by how they look. Sequences are shown slide by slide, top to bottom.
export function VariantCard({variant, palette, assets, decorations, pageImage, textBoxes, onEdit}: {variant: Variant; palette: Palette; assets: PageAssetView[]; decorations: DecorationView[]; pageImage: string | null; textBoxes: Array<{x: number; y: number; w: number; h: number}>; onEdit: () => void}) {
  const all = variant.frames.flatMap(f => f.elements);
  const invented = new Set(all.filter(e => e.invented).map(e => e.id)).size;
  const usesAccent = all.some(e => [e.color, e.fill].some(ref => ref && needsMeaning(palette, ref)));
  const noMeaning = !palette.meanings.some(m => m.meaning.trim() && needsMeaning(palette, m.ref));
  const multi = variant.frames.length > 1;
  return (
    <article className="variant">
      {variant.technique
        ? <><TechniqueNote id={variant.technique} frames={variant.frames.length} />{variant.supportingTechniques?.map(id => <TechniqueNote key={id} id={id} />)}</>
        : multi && <span className="tag sequence">連続 {variant.frames.length}枚</span>}
      <p className="aim">{variant.aim}</p>
      {variant.plan && <details className="small"><summary>この見せ方を選んだ理由</summary><p>{variant.plan.reason}</p><p>{variant.plan.treatment}</p></details>}
      <p className="gave-up"><span className="label">捨てたもの</span>{variant.gaveUp}</p>
      {variant.frames.map((f, i) => (
        <div key={i} className="frame-block">
          {multi && <span className="frame-no">{i + 1} / {variant.frames.length}</span>}
          <SlidePreview elements={f.elements} palette={palette} assets={assets} decorations={decorations} pageImage={pageImage} textBoxes={textBoxes} width={CARD_WIDTH} showInvented />
        </div>
      ))}
      <div className="row between">
        <span className="muted small">
          {invented > 0 && <><i className="dash" /> 元の資料にない内容 {invented}か所</>}
          {noMeaning && !usesAccent && <>{invented > 0 ? ' ・ ' : ''}色の意味が未設定のため、色では強調していません</>}
        </span>
        <button onClick={onEdit}>この案に手を入れる</button>
      </div>
    </article>
  );
}
