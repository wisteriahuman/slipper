// Operational guidance for applying the catalog. These are Slipper's adaptations, not claims
// that an effect guarantees a good presentation. Keep source definitions in techniques.ts.
export type Continuity = 'fixed' | 'zoom-in' | 'zoom-out' | 'scene' | 'data';
export type Recipe = {family: 'principle' | 'visual' | 'sequence' | 'structure' | 'format'; needs: string; must: string; avoid: string; pairs: string[]; continuity?: Continuity; available: boolean};
type Entry = [Recipe['family'], string, string, string, string[], Continuity?];
const entries: Record<string, Entry> = {
  takahashi: ['visual', '一言へ絞れる主張', '主張を大きくし、声で補う内容は画面から外す', '短縮のために条件や根拠を歪める', ['negative-space']],
  'picture-superiority': ['principle', '内容を直接示す画像が元資料にある', '画像から何を読み取るかが明確', '関係のない写真を飾る。素材がないのに画像を要求する', ['annotated-chart']],
  'von-restorff': ['principle', '比較する同種の要素が複数ある', '同じものの中の一つだけが違って見える', 'すべてを強調する', ['small-multiples']],
  preattentive: ['principle', '注目すべき一点を持つ図や表', '結論に対応する箇所へ最初に目が向く', '大きな帯で複数の箇所を一緒に囲む', ['annotated-chart']],
  isotype: ['visual', '単位と数量が明記されたデータ', '一記号の数量と全体の対応を示す', '実数のない内容を架空の個数に置き換える', ['von-restorff']],
  'small-multiples': ['visual', '同じ尺度で比較できる複数の事例・データ', '図の尺度と配置をそろえて違いを見せる', '尺度を変えて差を誇張する', ['preattentive']],
  juxtaposition: ['visual', '比較する二つの対象と比較軸', '両者の差を見て読み取れる', '文章を左右に分けただけにする', ['annotated-chart']],
  'negative-space': ['visual', '一つに絞れる主役', '余白が主役を引き立てる', '必要な意味や根拠まで削る', ['takahashi']],
  'show-dont-tell': ['principle', '主張を裏付ける実物・場面・操作の素材', '主張の根拠を見て確かめられる', '説明文の言い換えだけで済ませる', ['split-screen']],
  'rule-of-three': ['structure', '無理なく整理できる三つの要点', '三つの関係と区別が分かる', '数合わせのために重要事項を捨てる', ['negative-space']],
  anchoring: ['principle', '出典と条件の揃った基準値・対象値', '比較の基準と条件を明示', '都合のよい基準で大きさを誤認させる', ['juxtaposition']],
  'split-screen': ['visual', '同時に起きる場面・異なる立場を示す素材', '同時性や立場の違いが見える', '関係のない二項をただ並べる', ['show-dont-tell']],
  montage: ['visual', '印象を形作る複数の場面の画像・具体的描写', '場面の組み合わせで一つの意味が生まれる', '見出しと説明だけの均等なカード表', ['negative-space']],
  'annotated-chart': ['visual', '読み取る結論のある図と根拠', '図の該当点と注釈を直接結ぶ', '図から読めない因果を主張する', ['preattentive']],
  'tufte-before-after': ['visual', '同じ対象について前後の数値がある', '共通尺度の二点と対応する線を使う', '中間過程を隠すと意味が変わるデータへの適用', ['preattentive']],
  'build-up': ['sequence', '段階的に説明する図や論点', '既存要素を固定し、必要な部分を順に足す', '毎ページで全体を並べ替える', ['preattentive'], 'fixed'],
  segmenting: ['principle', '複数の理解単位に分けられる内容', '各区切りで理解できるまとまりを作る。学習者ペースの研究原理を発表に応用する', '単に文章を均等に切る', ['negative-space'], 'scene'],
  lessig: ['sequence', '話す言葉と対応する短い語・画像', '一画面一拍で切り替える。発表の一節への応用', '文字カードを一度に全部並べる', ['takahashi'], 'scene'],
  'zoom-out': ['sequence', '部分と全体が対応する図・画像', '同一対象を最初に大きく、次に小さくして全体内の位置を明かす', '大きさを変えず周囲を足すだけ', ['annotated-chart'], 'zoom-out'],
  'establish-then-close': ['sequence', '全体と注目する部分を持つ図・画像', '同一対象の位置関係を保ち、次の画面で拡大する', '無関係な別の図への切り替え', ['preattentive'], 'zoom-in'],
  'focus-shift': ['sequence', '説明する箇所が複数ある図', '図を固定し、注目先だけを移す', '図の位置も同時に動かす', ['annotated-chart'], 'fixed'],
  chiaroscuro: ['sequence', '先に見せた図と取り出す結論', '同じ画面を覆い、結論が読める明暗差を作る。明暗法の発表への応用', '暗い面の上に暗い文字を置く', ['takahashi'], 'fixed'],
  'open-loop': ['sequence', '資料内で答えられる問い', '問いと答えが対応する。心理効果による注意の保証はしない', '答えを先に画面で明かす', ['negative-space'], 'scene'],
  'data-in-motion': ['sequence', '複数時点の値と共通尺度', '軸を保ち、データの位置を時点ごとに変える', '実数のない物語を測定データに見せる', ['annotated-chart'], 'data'],
  'same-frame': ['sequence', '同じ対象の前後の状態', '共通の枠と配置で変わった箇所が分かる', '比較対象と尺度を途中で変える', ['preattentive'], 'fixed'],
  scqa: ['structure', '状況・問題・問いに対する根拠付きの答え', '問いに答え、その答えを根拠で支える', '段名を付けただけで問いと答えが噛み合わない', ['annotated-chart']],
  abt: ['structure', '前提、それを変える事実、そこから導く帰結', 'しかし・だからのつながりが資料内の事実で成立する', '関係のない課題と解決を接続詞でつなぐ', ['juxtaposition']],
  sparkline: ['structure', '現状と目指す姿の具体的な対比', '現状と可能性を往復し、最後に到達する姿へ結ぶ', '理想の数値を実績として語る', ['juxtaposition']],
  'heros-journey': ['structure', '主人公の状況、障害、変化の材料', '同じ主人公の変化を追う', '製品を主人公にして利用者の根拠を失う', ['show-dont-tell']],
  'in-medias-res': ['structure', '意味のある山場と経緯', '冒頭の山場へ経緯をつなぎ、その先まで進む', '刺激的だが本論と無関係な冒頭', ['show-dont-tell']],
  'cold-open': ['structure', '説明前に見ても意味を掴める実物・デモ', '実物から入り、その意味と必要性を説明する', '前提知識がないと読めない画面を冒頭に置く', ['show-dont-tell']],
  kishotenketsu: ['structure', '後から意味が変わる視点・事実', '転の発見が結で前半と結びつく', '脈絡のない話題転換', ['juxtaposition']],
  monroe: ['structure', '課題、実行可能な解決、聞き手が取れる行動', '最後に具体的な行動へつながる', '恐怖や誇張で必要性を作る', ['show-dont-tell']],
  chekhov: ['structure', '後半の説明で意味を持つ冒頭の要素', '同一の要素を根拠を伴って回収する', '無関係なモチーフで装飾する', ['negative-space']],
  callback: ['structure', '冒頭と結びをつなぐ言葉・場面', '戻ったときの意味の変化を見せる', '同じページを繰り返すだけ', ['takahashi']],
  cliffhanger: ['structure', '資料内で解決する一連の問い', '前の問いに答えてから次を開き、最後に閉じる', '未解決の問いを残して終える', ['open-loop']],
  pechakucha: ['format', '20枚・各20秒の自動送りと発話の設計', '20×20の形式を守る', '一定テンポだけをペチャクチャと呼ぶ', []],
  'three-pillars': ['structure', '三つの柱で説明できる主張と根拠', '各柱が同じ主張を異なる側面から支える', '関連のない三項を数合わせで置く', ['small-multiples']]
};
export function recipeFor(id: string): Recipe {
  const e = entries[id];
  if (!e) return {family: 'visual', needs: '', must: '', avoid: '', pairs: [], available: false};
  return {family: e[0], needs: e[1], must: e[2], avoid: e[3], pairs: e[4], continuity: e[5], available: id !== 'pechakucha'};
}
