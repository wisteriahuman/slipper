import {recipeFor} from '@shared/technique-recipes';
import {techniqueById} from '@shared/techniques';

// Names the technique a proposal uses and says how it works, with where to read more: meeting a
// technique by name is part of what makes a proposal worth seeing.
export function TechniqueNote({id, frames}: {id?: string; frames?: number}) {
  const t = techniqueById(id);
  if (!t) return null;
  const recipe = recipeFor(t.id);
  return (
    <div className="technique">
      <span className="tag">{t.name}</span>{frames && frames > 1 && <span className="tag sequence">連続 {frames}枚</span>}
      <p className="technique-how">{t.how}<span className="muted"> ・ {t.fits}</span></p>
      <details className="small"><summary>使う条件と注意点</summary><p>必要な材料: {recipe.needs}</p><p>成立条件: {recipe.must}</p><p>避けたいこと: {recipe.avoid}</p></details>
      <a className="small" href={t.source.url} onClick={e => { e.preventDefault(); void window.slipper.openExternal(t.source.url); }}>出典: {t.source.title}</a>
    </div>
  );
}
