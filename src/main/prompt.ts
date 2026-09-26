// Builds the request sent to Claude Code for one variant.
import {CANVAS} from '@shared/element';
import {allowedColors, MAX_ACCENT_USES, needsMeaning, type Palette} from '@shared/palette';
import type {Decoration, PageContent} from './google/convert';
import type {Brief, FlowRole} from './store';
import type {DeckReading} from '@shared/reading';
import {scenesFor} from '@shared/scenes';
import {recipeFor} from '@shared/technique-recipes';
import type {ProposalPlan} from '@shared/proposal-plan';
import {AI_CHOICE, FLOW_TECHNIQUES, PAGE_TECHNIQUES, techniqueById} from '@shared/techniques';

// The audience is who hears the presentation; the subject is who the content is about. They often
// differ (a hackathon pitch about a student app is heard by judges), and the AI must not confuse them.
export function briefBlock(b: Brief): string {
  return [
    b.context ? `場面: ${b.context}` : null,
    `誰に（プレゼンの聞き手）: ${b.audience}`,
    `何を: ${b.message}`,
    b.subject ? `題材の対象（プロダクトのユーザーなど）: ${b.subject}` : null,
    '※ プレゼンの聞き手と題材の対象は別のことが多い（例: 学生向けアプリを審査員に発表する）。資料は聞き手に向けて作る。',
    ...scenesFor(b.context).map(s => `\n# 場面の知識: ${s.label}（聞き手が判断に使うこと。守る規則ではなく参考）\n${s.notes.map(n => `- ${n}`).join('\n')}`)
  ].filter(Boolean).join('\n');
}

// Wording guidance for any text the AI writes, condensed from consulting-pptx-skill's
// ai-smell-lexicon.md (MIT License, Copyright (c) 2026 Carnot AI Inc.; see README). Only the parts that apply to
// any presentation are kept; it concerns word choice, not how a slide is composed.
export const WRITING_GUIDE = `# 言葉の選び方（AIが書いた感を消す）
- 空虚な強調を使わない: 非常に／極めて／圧倒的／画期的／革新的／次世代の など
- カタカナの盛りを使わない: ソリューション／シナジー／シームレス／バリュー など
- 名詞化したビジネス語を素の動詞に戻す: 活用して→使って、実現する→できる、〜することが可能→〜できる
- スローガンや自己美化を書かない: 寄り添う／伴走する／〜な世界を目指す など
- 「ポイントは3つ」「まず・次に・最後に」のような型の枠や、同じ文型の繰り返しを避ける
- 接続詞を毎文の頭に置かない。一文を短くし、主語と述語を近づける
- 根拠より強く言い切らない。主張の広さは資料にある根拠に合わせる`;

// Which technique a request should use: an assigned one from the catalog, or the AI's own pick.
// For the AI's pick it gets the whole catalog for the level, minus the techniques assigned elsewhere
// in the same round, and is steered away from the obvious choice.
export function techniqueBlock(level: 'page' | 'flow', id: string, excluded: string[]): string {
  const pool = level === 'page' ? PAGE_TECHNIQUES : FLOW_TECHNIQUES;
  if (id !== AI_CHOICE) {
    const t = techniqueById(id);
    if (!t) throw new Error(`不明な手法です: ${id}`);
    return `# 使う手法: ${t.name}（technique: "${t.id}"）
仕組み: ${t.how}${t.steps ? `\n段: ${t.steps.join(' → ')}（すべての段を、どれかのページの step で担う。担う元のページがなければ new で作る）` : ''}
合う場面: ${t.fits}${t.slides === '2-3' ? '\nこの手法は連続したスライド（2〜3枚）で見せる。' : ''}
必要な材料: ${recipeFor(t.id).needs}
成立条件: ${recipeFor(t.id).must}
避ける失敗: ${recipeFor(t.id).avoid}
この手法で作り、technique に "${t.id}" を書く。`;
  }
  const options = pool.filter(t => !excluded.includes(t.id) && recipeFor(t.id).available).map(t => ({id: t.id, name: t.name, how: t.how, fits: t.fits, ...(t.slides ? {slides: t.slides} : {}), ...(t.steps ? {steps: t.steps} : {})}));
  return `# 使う手法: カタログから選ぶ
次の手法の中から、この${level === 'page' ? 'ページ' : '資料'}と聞き手に最もよく効くものを1つ選び、technique にその id を書く。
内容と聞き手に合うことを優先し、同じ程度に効くなら未使用の手法も探す。珍しさのために内容を歪めない。${level === 'flow' ? '\n選んだ手法の steps は、すべての段をどれかのページの step で担う。担う元のページがなければ new で作る。' : ''}
${JSON.stringify(options)}`;
}

const tone = (hex: string | undefined) => {
  if (!hex) return '';
  const v = parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  return v < 3 * 128 ? '暗い' : '明るい';
};

export function colorGuide(palette: Palette): string {
  const allowed = allowedColors(palette);
  const meaningful = palette.meanings.filter(m => m.meaning.trim() && needsMeaning(palette, m.ref));
  const neutral = allowed.filter(ref => !needsMeaning(palette, ref));
  const lines = [
    `使える色（テーマ色の名前で指定）: ${allowed.join(', ')}`,
    `無彩色: ${neutral.map(ref => `${ref}${palette.hex[ref] ? `（${palette.hex[ref]}、${tone(palette.hex[ref])}）` : ''}`).join(', ')}。本文・背景・補足・面には、これらを明暗で使い分ける。`
  ];
  if (meaningful.length) {
    lines.push(...meaningful.map(m => `${m.ref}${palette.hex[m.ref] ? `（${palette.hex[m.ref]}）` : ''} は「${m.meaning}」だけを表す。その意味に当たる場所にだけ使う（1ページ${MAX_ACCENT_USES}か所まで）。`));
    lines.push('それ以外の色味のある色は、意味が決まっていないため使えない。');
  } else {
    lines.push('この資料では色味のある色の意味が決まっていないため、色味のある色は使えない。強調は文字の大きさ・太さ・余白で表す。');
  }
  return lines.join('\n');
}

export function buildVariantPrompt(o: {requestId: string; brief: Brief; palette: Palette; page: PageContent; decorations?: Decoration[]; flowRole?: FlowRole | null; technique: string; excluded?: string[]; direction?: string; plan?: ProposalPlan}): string {
  const page = {
    texts: o.page.texts.map(t => ({id: t.id, text: t.text})),
    assets: o.page.assets.map(a => ({assetId: a.id, kind: a.kind, description: a.description, x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h)}))
  };
  return `あなたはスライドの伝え方を提案するデザイナーです。次のページを、指定の方針で別の伝え方にしたスライド案を1つ作り、Slipper の submit_variant（requestId "${o.requestId}"）で送ってください。
まず Slipper の get_page_images（requestId "${o.requestId}"）でページの画像を見て、文字だけでは分からない図・グラフ・強調・前後のページの連続も踏まえてください。

# 資料全体
${briefBlock(o.brief)}

# このページ
${JSON.stringify(page)}
${o.flowRole ? `
# 流れの中でのこのページの役割（${o.flowRole.total}枚中${o.flowRole.position}枚目）
役割: ${o.flowRole.role}${o.flowRole.note ? `\n見せること: ${o.flowRole.note}` : ''}
この役割を果たすページにする。ページの内容が少ない、または空の場合は、役割と見せることをもとに中身を作り、その要素は invented: true にする。
` : ''}
${o.decorations?.length ? `# レイアウトの飾り（追加するページにも残る。動かせない）
${JSON.stringify(o.decorations.map(d => ({kind: d.kind, x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.w), h: Math.round(d.h)})))}
文字や素材がこれらと重ならないように配置する。

` : ''}${techniqueBlock('page', o.technique, o.excluded ?? [])}${planBlock(o.plan)}${o.direction ? `\n利用者からの一言: ${o.direction}` : ''}

# 色
${colorGuide(o.palette)}

${WRITING_GUIDE}

# 守ること
- キャンバスは ${CANVAS.width}×${CANVAS.height} px。要素はすべてこの中に収める。
- 色違いや配置違いではなく、手法に沿って見せ方そのものを変える。
- 素材（assets）を使うときは type "asset" と assetId で参照し、中身は変えない。x・y・w・h は元のページでの位置と大きさで、同じ値にすれば元の場所に残る。縦横比は保つ。使わない素材は入れなくてよい。
- 元のページの図（グラフの線や点、図形の組み合わせ）は、描き直さずに素材として再利用する。描き直すと元の図の形（曲線の形など）が失われる。図の一部だけを見せたいときも、該当する素材だけを使う。
- 元のページにない内容（架空の場面・例の数値・新しい言い回しの主張など）を加えた要素は invented: true にする。
- frames にスライドを並べる。連続の手法なら2〜3枚、そうでなければ1枚にする（1枚で足りない内容なら2枚にしてもよい）。
- 連続の規則: ${continuityGuide(o.technique)}
- 画面を覆うときは、全面の図形（type "shape"、shape "rect"）に opacity（0.5〜0.7）を付け、その上に一言を置く。
- technique には、使った手法の id を書く。
- aim には、この案が聞き手に何をしようとしているかを1行で、gaveUp には、この案が諦めたことを1行で書く。
- 提出の前に preview_variant へ案の全体を渡す。返された画像を実際に見て、文字切れ・重なり・注目先・狙いと手法の成立・元資料の意味を確認する。主張と図から読める事実を照合し、比較だけから因果を言っていないかも確認する。
- 問題があれば内容を直して preview_variant を再度呼ぶ。文字サイズを小さくするだけで逃げず、文を削る・枠を広げる・分けることを検討する。
- 最後に描画した案をそのまま submit_variant に渡し、previewToken と visualReview（画像のどの箇所で狙いが成立するか、直した点を具体的に記載）を添える。変更後は必ず再描画する。
- エラーが返ったら直して送り直す。
送り終えたら「完了」とだけ答えてください。`;
}

// continuesPrevious: this page keeps the previous page's layout and adds to it (a deliberate sequence).
export type DeckPage = {pageId: string; texts: string[]; assets: string[]; continuesPrevious?: boolean};

export function buildStorylinePrompt(o: {requestId: string; brief: Brief; pages: DeckPage[]; reading?: DeckReading | null; technique: string; excluded?: string[]; direction?: string; plan?: ProposalPlan}): string {
  const pages = o.pages.map((p, i) => ({n: i + 1, pageId: p.pageId, texts: p.texts, assets: p.assets, ...(p.continuesPrevious ? {continuesPrevious: true} : {})}));
  return `あなたはプレゼンテーションの構成を考えるディレクターです。次の資料全体を、指定の方針で語り直す「流れの案」を1つ作り、Slipper の submit_storyline（requestId "${o.requestId}"）で送ってください。
まず Slipper の get_page_images（requestId "${o.requestId}"）でページの画像を見て、文字だけでは分からない図・グラフ・強調・前後のページの連続も踏まえてください。

# 資料全体
${briefBlock(o.brief)}

# 今の資料（ページ順）
${JSON.stringify(pages)}
${o.reading ? `
# 今の流れの読み解き
狙い: ${o.reading.aim}
捨てているもの: ${o.reading.gaveUp}
「誰に・何を」との関係: ${o.reading.relation}
まとまり: ${JSON.stringify(o.reading.sections.map(s => ({role: s.role, pages: s.pageIds.map(id => o.pages.findIndex(p => p.pageId === id) + 1)})))}
` : ''}
${techniqueBlock('flow', o.technique, o.excluded ?? [])}${planBlock(o.plan)}${o.direction ? `\n利用者からの一言: ${o.direction}` : ''}

${WRITING_GUIDE}

# 守ること
- 狙いを実現する順番を選ぶ。元の順番が合う部分は保ち、変える理由のある部分を組み直す。手法の各段にあたるページが今の資料になければ、new で作る。ページを削る・まとめる・新しく作ることをためらわない。
- 並べ替えだけで狙いを実現できる場合は、そのままでよい。方針を実現するために足りないページは new で作る。連続の手法（段階的に足す・注目を移す・覆って言い切る・問いを置いてから答える）を使うときは、new のページを続けて複数並べ、それぞれの note に手法と、そのページで足す・変えるものを書く。
- continuesPrevious が true のページは、前のページと同じ版面に要素を足した意図的な連続（段階的に見せる・注目させる・覆って言い切るなど）。重複ではないので、まとめたり削ったりしない。
- 連続の途中だけを残したり、順番を入れ替えたりしない。連続は、前後をそろえて keep する。
- 各ページは source で、元のページをそのまま使う（keep）、複数をまとめる（merge）、新しく作る（new）のどれかにする。pageId は上の一覧のものだけを使う。
- role には、流れの中でそのページが果たす役割を1行で書く。note には、そのページで見せることを1〜2行で書く（merge と new では必須）。
- 元の資料にない事実や数値を作らない。新しいページで必要な中身は、元の資料から取る。
- aim には、この流れが聞き手に何をしようとしているかを1行で、gaveUp には、この流れが諦めたことを1行で書く。
- fromCurrent には、今の流れから何が変わるかを1行で具体的に書く（例: メンバー紹介を削り、感情のグラフを冒頭に移す）。
- エラーが返ったら直して送り直す。
送り終えたら「完了」とだけ答えてください。`;
}

const READING_RULES = `- 良し悪しや点数は書かない。欠点を指摘するのではなく、何を選び、その裏で何を諦めているかを書く。
- 推測で事実を足さない。資料に書かれていることだけから読む。`;

export function buildDeckReadingPrompt(o: {requestId: string; brief: Brief; pages: DeckPage[]}): string {
  const pages = o.pages.map((p, i) => ({n: i + 1, pageId: p.pageId, texts: p.texts, assets: p.assets, ...(p.continuesPrevious ? {continuesPrevious: true} : {})}));
  return `あなたはプレゼンテーションの構成を読み解く編集者です。次の資料の「今の流れ」を読み解き、Slipper の submit_deck_reading（requestId "${o.requestId}"）で送ってください。
まず Slipper の get_page_images（requestId "${o.requestId}"）でページの画像を見て、文字だけでは分からない図・グラフ・強調・前後のページの連続も踏まえてください。

# 資料全体
${briefBlock(o.brief)}

# 今の資料（ページ順）
${JSON.stringify(pages)}

# 書くこと
- aim: 今の流れが聞き手に何をしようとしているか（1行）
- gaveUp: 今の流れが諦めている、または後回しにしていること（1行）
- relation: 聞き手がこの流れから何を受け取り、何を判断できるか（1〜2行）。聞き手と題材の対象が違うのは普通なので、それ自体を指摘しない（例: 審査員が判断に使う根拠は後半のデモまで出てこない）
- sections: 流れをいくつかのまとまりに分け、それぞれの役割を書く。すべてのページを、資料の順番どおりに、ちょうど1つのまとまりに入れる
- なお、continuesPrevious が true のページは、前のページと同じ版面に要素を足した意図的な連続（段階的に見せる・注目させる・覆って言い切るなど）。重複ではないので、まとめたり削ったりしない。

${WRITING_GUIDE}

# 守ること
${READING_RULES}
- エラーが返ったら直して送り直す。
送り終えたら「完了」とだけ答えてください。`;
}

export function buildPageReadingPrompt(o: {requestId: string; brief: Brief; page: PageContent; flowRole?: FlowRole | null}): string {
  const page = {texts: o.page.texts.map(t => t.text), assets: o.page.assets.map(a => `${a.kind}: ${a.description}`)};
  return `あなたはスライドを読み解く編集者です。次のページが「今」何をしているかを読み解き、Slipper の submit_page_reading（requestId "${o.requestId}"）で送ってください。
まず Slipper の get_page_images（requestId "${o.requestId}"）でページの画像を見て、文字だけでは分からない図・グラフ・強調・前後のページの連続も踏まえてください。

# 資料全体
${briefBlock(o.brief)}

# このページ
${JSON.stringify(page)}${o.flowRole ? `\n流れの中での役割（${o.flowRole.total}枚中${o.flowRole.position}枚目）: ${o.flowRole.role}` : ''}

# 書くこと
- aim: 今のこのページが聞き手に何をしようとしているか（1行）
- gaveUp: 今のこのページが諦めていること（1行）

${WRITING_GUIDE}

# 守ること
${READING_RULES}
送り終えたら「完了」とだけ答えてください。`;
}

function continuityGuide(id: string): string {
  const mode = recipeFor(id).continuity;
  if (mode === 'zoom-in' || mode === 'zoom-out') return `同じ図・画像を同じ id で追跡し、縦横比を保って${mode === 'zoom-in' ? '拡大' : '縮小'}する。位置と大きさを変えてよい。対応する対象を見失わないようにする。`;
  if (mode === 'scene') return '理解の区切り・発話の拍に合わせて場面を切り替える。同じ要素を半分残す必要はない。問いと答えや前後の意味をつなぐ。';
  if (mode === 'data') return '軸と尺度を固定し、同じ対象を同じ id で追跡してデータの位置を変える。値を創作しない。';
  return '同じ id・同じ位置・同じ大きさで残し、変える部分だけを足す・強調する。';
}
function planBlock(plan: ProposalPlan | undefined): string {
  return plan ? `\n# 先に選んだ狙いと構成\n${JSON.stringify(plan)}\naim はこの狙いを保ち、見直しで根拠より強いと分かった表現は弱めてよい。補助の手法は supportingTechniques に記録する。根拠にない事実を足して狙いを成立させない。\n` : '';
}
export function buildPlanPrompt(o: {requestId: string; level: 'page' | 'flow'; brief: Brief; material: unknown; used: string[]; direction?: string}): string {
  const catalog = (o.level === 'page' ? PAGE_TECHNIQUES : FLOW_TECHNIQUES).filter(t => recipeFor(t.id).available).map(t => ({...t, recipe: recipeFor(t.id)}));
  return `あなたは伝え方を設計する編集者です。まず get_page_images（requestId "${o.requestId}"）で実物を見てください。
${briefBlock(o.brief)}
材料（根拠のidを含む）: ${JSON.stringify(o.material)}
利用者の方向: ${o.direction ?? '指定なし'}
これまで試した手法: ${JSON.stringify(o.used)}
カタログ: ${JSON.stringify(catalog)}
${o.level === 'flow' ? `補助に使えるページ手法: ${JSON.stringify(PAGE_TECHNIQUES.map(t => ({id:t.id, how:t.how, recipe:recipeFor(t.id)})))}` : ''}
submit_proposal_plan（requestId "${o.requestId}"）で、狙いの異なる3案をまとめて送ってください。
1. この聞き手が理解・判断するために何を受け取る必要があるか、材料から考える。
2. 説明・比較・場面への共感・意外な事実など、内容に合う異なる狙いを3つ選ぶ。固定の3分類を埋める必要はない。
3. それぞれの狙いを実現できる手法を選ぶ。必要な数値・画像・関係が材料に存在するか確かめ、evidence にそのidを書く。写真がないなら写真が前提の案にしない。
4. 同じ内容の色・配置違い、手法名だけ違う3案にしない。未使用や意外な手法も検討するが、内容との適合を優先する。補助の手法を最大2つ組み合わせてよい。
5. aim 自体も資料の根拠に合わせる。比較結果だけから「理由が分かる」「原因を示す」と約束しない。方法の違いと効果の因果が未検証なら、違いを見せる狙いにする。reason に材料との対応、treatment に具体的な見せ方を書く。発表の形式・認知原理・表現手法を混同しない。
${WRITING_GUIDE}
エラーなら修正する。送り終えたら「完了」とだけ答えてください。`;
}

export function buildVariantReviewPrompt(o: {requestId: string; brief: Brief; source: PageContent; variant: import('@shared/element').VariantInput; plan?: ProposalPlan}): string {
  return `あなたはスライド案の検証者です。作成者とは別の立場で、明確な不一致だけを確認します。
get_page_images（requestId "${o.requestId}"）で元の画像と案の全コマを見てください。
${briefBlock(o.brief)}
元の材料: ${JSON.stringify(o.source)}
設計意図: ${JSON.stringify(o.plan ?? null)}
案: ${JSON.stringify(o.variant)}
主な手法の成立条件: ${JSON.stringify(recipeFor(o.variant.technique))}
submit_variant_review（requestId "${o.requestId}"）へ verdict、issues、evidence を送ってください。
- 狙いに対して実際に見せているものが一致するか。例: 一段ずつ明かす狙いなのに最初からすべて見えている、拡大する狙いなのに拡大していない。
- 元資料にない事実・因果・数値を断定していないか。invented の印だけでは、不正確な事実を発表してよいことにならない。計算した値は元の値から検算する。
- 図の尺度と数値の対応、文字の重なり、主張を読むための十分な明暗差を確認する。
- 文字主体の表現が適切な場合もある。装飾不足、好み、珍しくないこと、元資料と同じ部分があることだけを理由に修正させない。
- 明確な問題があれば revise とし、どのコマの何をどう直す必要があるかを最大5点書く。問題がなければ accept、issues は空にする。
- evidence に画像と資料の具体的な対応を書く。効果を実証したという表現や点数は使わない。
送り終えたら「完了」とだけ答えてください。`;
}
