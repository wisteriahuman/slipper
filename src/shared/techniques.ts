// Named techniques Slipper draws on when proposing how to show a page or tell a deck.
// Each entry is described in Slipper's own words and points to where the technique is documented,
// so a proposal can teach its name: many "brilliant" slides are known techniques the maker hadn't met.
// Source URLs were checked to resolve (2026-09-26).

export type Technique = {
  id: string;
  name: string;
  // page: how a single page (or a short run of pages) shows something. flow: how a whole talk is ordered.
  level: 'page' | 'flow';
  // For page techniques: how many consecutive slides it uses.
  slides?: '1' | '2-3';
  // For flow techniques: the stages a talk must pass through for the structure to be real.
  steps?: string[];
  how: string;
  fits: string;
  source: {title: string; url: string};
};

const W = (path: string) => `https://en.wikipedia.org/wiki/${path}`;

export const TECHNIQUES: Technique[] = [
  // --- One page ------------------------------------------------------------------------------
  {id: 'takahashi', name: '高橋メソッド', level: 'page', slides: '1', how: '画面いっぱいの大きな文字だけで、一つの言葉を見せる', fits: '聞き手に言葉そのものを覚えてほしいとき', source: {title: 'Wikipedia: 高橋メソッド', url: 'https://ja.wikipedia.org/wiki/%E9%AB%98%E6%A9%8B%E3%83%A1%E3%82%BD%E3%83%83%E3%83%89'}},
  {id: 'picture-superiority', name: '画像優位性', level: 'page', slides: '1', how: '説明の文章を減らし、場面や実物の写真・絵を主役にする', fits: '言葉より絵のほうが記憶に残る内容のとき', source: {title: 'Wikipedia: Picture superiority effect', url: W('Picture_superiority_effect')}},
  {id: 'von-restorff', name: '一つだけ違う（フォン・レストルフ効果）', level: 'page', slides: '1', how: '同じものを並べ、伝えたい一つだけを他と違う見た目（大きさ・太さ・位置）にする', fits: '多くの中から一つを覚えてほしいとき', source: {title: 'Wikipedia: Von Restorff effect', url: W('Von_Restorff_effect')}},
  {id: 'preattentive', name: '注目の誘導（前注意的特徴）', level: 'page', slides: '1', how: '大きさ・太さ・位置・囲みで、目が最初に向かう場所を一か所に決める', fits: '図や表の中の一点を読ませたいとき', source: {title: 'Wikipedia: Pre-attentive processing', url: W('Pre-attentive_processing')}},
  {id: 'isotype', name: '単位グラフ（アイソタイプ）', level: 'page', slides: '1', how: '一つの記号を一人・一件として並べ、量を数えられる形で見せる', fits: '割合や人数を実感してほしいとき', source: {title: 'Wikipedia: Isotype (picture language)', url: W('Isotype_(picture_language)')}},
  {id: 'small-multiples', name: 'スモールマルチプル', level: 'page', slides: '1', how: '同じ形の小さな図を並べ、違いだけを比べさせる', fits: '複数の場合や時期を比べたいとき', source: {title: 'Wikipedia: Small multiple', url: W('Small_multiple')}},
  {id: 'juxtaposition', name: '並置（ジャクスタポジション）', level: 'page', slides: '1', how: '性質の違う二つを説明なしに隣に置き、その差から意味を読ませる', fits: '言葉で比べるより、並べたほうが伝わるとき', source: {title: 'Wikipedia: Juxtaposition', url: W('Juxtaposition')}},
  {id: 'negative-space', name: '余白で語る（ネガティブスペース）', level: 'page', slides: '1', how: '一つの要素だけを置き、残りを大きな余白にして重みを持たせる', fits: '一つの言葉や数字に間を持たせたいとき', source: {title: 'Wikipedia: Negative space', url: W('Negative_space')}},
  {id: 'show-dont-tell', name: '説明せず見せる（Show, don\'t tell）', level: 'page', slides: '1', how: '結論を言葉で書かず、起きている場面や実物を見せて聞き手に気づかせる', fits: '聞き手自身に感じてほしいとき', source: {title: 'Wikipedia: Show, don\'t tell', url: W('Show,_don%27t_tell')}},
  {id: 'rule-of-three', name: '三つにまとめる（三の法則）', level: 'page', slides: '1', how: '要点を三つに絞り、同じ形で並べる', fits: '要点が多く、覚えてほしい数を絞りたいとき', source: {title: 'Wikipedia: Rule of three (writing)', url: W('Rule_of_three_(writing)')}},
  {id: 'anchoring', name: '基準を先に置く（アンカリング）', level: 'page', slides: '1', how: '比べる基準の数字を先に見せ、その横に伝えたい数字を置く', fits: '数字の大きさ・小ささを実感してほしいとき', source: {title: 'Wikipedia: Anchoring effect', url: W('Anchoring_effect')}},
  {id: 'split-screen', name: '分割画面', level: 'page', slides: '1', how: '画面を分け、同じ時間に別の場所で起きていることを並べる', fits: '二人の立場や、同時に起きる出来事を見せたいとき', source: {title: 'Wikipedia: Split screen', url: W('Split_screen_(video_production)')}},
  {id: 'montage', name: 'モンタージュ', level: 'page', slides: '1', how: '短い場面をいくつも並べ、全体で一つの印象をつくる', fits: '「よくあること」だと感じてほしいとき', source: {title: 'Wikipedia: Montage (filmmaking)', url: W('Montage_(filmmaking)')}},
  {id: 'annotated-chart', name: '図に結論を書き込む', level: 'page', slides: '1', how: 'グラフの該当箇所に、読み取ってほしい結論を直接書き込む', fits: 'グラフの意味を聞き手に取り違えてほしくないとき', source: {title: 'Storytelling with Data（Cole Nussbaumer Knaflic）', url: 'https://www.storytellingwithdata.com/books'}},
  {id: 'tufte-before-after', name: '前後を線で結ぶ（スロープグラフ）', level: 'page', slides: '1', how: '前と後の二点だけを線で結び、上がったか下がったかを一目で見せる', fits: '変化の向きと大きさだけを伝えたいとき', source: {title: 'Wikipedia: Edward Tufte', url: W('Edward_Tufte')}},

  // --- A short run of consecutive pages ---------------------------------------------------------
  {id: 'build-up', name: '段階的に足す', level: 'page', slides: '2-3', how: '同じ版面のまま要素を一つずつ足し、話す順に見せる', fits: '一度に見せると読み切れない図や論点のとき', source: {title: 'consulting-pptx-skill slide-rules §4.34（MIT）', url: 'https://github.com/carnot-tech/consulting-pptx-skill'}},
  {id: 'segmenting', name: '区切って見せる（マイヤーの分割の原則）', level: 'page', slides: '2-3', how: '詰まった一枚を、聞き手が理解できる単位に分けて順に見せる', fits: '情報が多く、一枚では追いきれないとき', source: {title: 'Wikipedia: Richard E. Mayer', url: W('Richard_E._Mayer')}},
  {id: 'lessig', name: 'Lessig メソッド', level: 'page', slides: '2-3', how: '一枚に一語・一枚の絵だけを置き、話に合わせてテンポよく切り替える', fits: '話し手の言葉にリズムを持たせたいとき', source: {title: 'Presentation Zen: The "Lessig Method"', url: 'https://www.presentationzen.com/presentationzen/2006/01/the_lessig_meth.html'}},
  {id: 'zoom-out', name: '引いて全体を明かす（Powers of Ten）', level: 'page', slides: '2-3', how: '一部分を大きく見せてから、同じものを引いて全体の中の位置を明かす', fits: '小さな事例が大きな全体の一部だと気づかせたいとき', source: {title: 'Wikipedia: Powers of Ten (film)', url: W('Powers_of_Ten_(film)')}},
  {id: 'establish-then-close', name: '全体から寄る（状況設定ショット→クローズアップ）', level: 'page', slides: '2-3', how: '最初に全体の状況を見せ、次に同じ画面の一部へ寄って詳しく見せる', fits: '全体の中のどこが問題かを示したいとき', source: {title: 'Wikipedia: Establishing shot', url: W('Establishing_shot')}},
  {id: 'focus-shift', name: '注目を移す', level: 'page', slides: '2-3', how: '同じ図のまま、強調する箇所だけを話の進みに合わせて移していく', fits: '一つの図の中で順に話したいとき', source: {title: 'Storytelling with Data（Cole Nussbaumer Knaflic）', url: 'https://www.storytellingwithdata.com/books'}},
  {id: 'chiaroscuro', name: '暗くして一点を浮かべる（キアロスクーロ）', level: 'page', slides: '2-3', how: '同じ画面を暗く覆い、一か所だけ明るく残すか、一言を重ねて言い切る', fits: '見せたものの中から結論を一つ取り出したいとき', source: {title: 'Wikipedia: Chiaroscuro', url: W('Chiaroscuro')}},
  {id: 'open-loop', name: '問いを開けておく（ツァイガルニク効果）', level: 'page', slides: '2-3', how: '一枚目で問いや空欄を見せて答えを保留し、次のページで埋める', fits: '聞き手に答えを予想させてから示したいとき', source: {title: 'Wikipedia: Zeigarnik effect', url: W('Zeigarnik_effect')}},
  {id: 'data-in-motion', name: 'データを動かして語る（ロスリング）', level: 'page', slides: '2-3', how: '同じグラフの時点を一枚ずつ進め、変化を目の前で起こす', fits: '時間とともに変わるデータを語りたいとき', source: {title: 'Wikipedia: Hans Rosling', url: W('Hans_Rosling')}},
  {id: 'same-frame', name: '同じ枠で前後を見せる', level: 'page', slides: '2-3', how: '同じ配置のまま、使う前と使った後で変わった部分だけを見せる', fits: '変化そのものを伝えたいとき', source: {title: 'Wikipedia: Juxtaposition', url: W('Juxtaposition')}},

  // --- How a whole talk is ordered ------------------------------------------------------------
  {id: 'scqa', name: 'SCQA（ピラミッド原則）', level: 'flow', how: '状況→複雑化→問い→答えの順に進め、答えを軸に根拠を並べる', fits: '結論と根拠を筋道立てて納得させたいとき', steps: ['状況', '複雑化', '問い', '答え'], source: {title: 'Wikipedia: Barbara Minto', url: W('Barbara_Minto')}},
  {id: 'abt', name: 'ABT（And, But, Therefore）', level: 'flow', how: '「〜で、〜だ。しかし〜。だから〜」の三拍子で、前提・転換・帰結を語る', fits: '短い時間で課題と解決を一本の話にしたいとき', steps: ['前提（And）', '転換（But）', '帰結（Therefore）'], source: {title: 'Wikipedia: Randy Olson', url: W('Randy_Olson')}},
  {id: 'sparkline', name: 'スパークライン（今ある姿とありうる姿）', level: 'flow', how: '「今はこう」と「こうなれる」を何度も往復し、最後に新しい姿を示す', fits: '聞き手に変化を望ませたいとき', steps: ['今ある姿', 'ありうる姿', '今ある姿（二度目）', 'ありうる姿（二度目）', '新しい姿'], source: {title: 'Duarte: Resonate', url: 'https://www.duarte.com/resources/books/resonate/'}},
  {id: 'heros-journey', name: '英雄の旅', level: 'flow', how: '一人の主人公が壁にぶつかり、助けを得て変わるまでを追う', fits: '利用者の物語として共感してほしいとき', steps: ['日常', '壁にぶつかる', '助けを得る', '変わった姿'], source: {title: 'Wikipedia: Hero\'s journey', url: W('Hero%27s_journey')}},
  {id: 'in-medias-res', name: 'In medias res（山場から始める）', level: 'flow', how: 'いちばん劇的な場面から始め、そこに至った経緯を遡って語る', fits: '冒頭で一気に引き込みたいとき', steps: ['山場', '遡った経緯', '山場の続き'], source: {title: 'Wikipedia: In medias res', url: W('In_medias_res')}},
  {id: 'cold-open', name: 'コールドオープン', level: 'flow', how: '挨拶や目次の前に、いきなりデモや場面を見せる', fits: '実物を見せるのが一番強いとき（ハッカソンのデモなど）', steps: ['いきなりの実物', '何者かの紹介', 'なぜ要るか', 'これから'], source: {title: 'Wikipedia: Cold open', url: W('Cold_open')}},
  {id: 'kishotenketsu', name: '起承転結', level: 'flow', how: '前提を置いて広げたあと、「転」で視点を変え、結びで全体を結び直す', fits: '対立ではなく視点の転換で気づかせたいとき', steps: ['起', '承', '転', '結'], source: {title: 'Wikipedia: 起承転結', url: 'https://ja.wikipedia.org/wiki/%E8%B5%B7%E6%89%BF%E8%BB%A2%E7%B5%90'}},
  {id: 'monroe', name: 'モンローの動機づけの順序', level: 'flow', how: '注意→必要性→解決→実現した姿の想像→行動の五段で進める', fits: '最後に聞き手の行動を引き出したいとき', steps: ['注意', '必要性', '解決', '実現した姿の想像', '行動'], source: {title: 'Wikipedia: Monroe\'s motivated sequence', url: W('Monroe%27s_motivated_sequence')}},
  {id: 'chekhov', name: '伏線と回収（チェーホフの銃）', level: 'flow', how: '冒頭に何気なく置いたものを、終盤で意味のあるものとして回収する', fits: '終盤に「あれはこういうことか」と感じてほしいとき', steps: ['伏線を置く', '本論', '伏線の回収'], source: {title: 'Wikipedia: Chekhov\'s gun', url: W('Chekhov%27s_gun')}},
  {id: 'callback', name: '冒頭への回帰（コールバック）', level: 'flow', how: '最初に見せた場面や言葉に、最後にもう一度戻って結ぶ', fits: '話の始まりと終わりを一つの輪にしたいとき', steps: ['冒頭の場面や言葉', '本論', '冒頭への回帰'], source: {title: 'Wikipedia: Callback (comedy)', url: W('Callback_(comedy)')}},
  {id: 'cliffhanger', name: 'クリフハンガー', level: 'flow', how: '区切りごとに次へ続く問いを残し、答えを次の区切りで出す', fits: '長めの発表で注意を保ちたいとき', steps: ['問いを残す区切り', '答えと次の問い', '最後の答え'], source: {title: 'Wikipedia: Cliffhanger', url: W('Cliffhanger')}},
  {id: 'pechakucha', name: 'ペチャクチャ（20枚×20秒）', level: 'flow', how: '20枚を各20秒で自動送りし、6分40秒で語る', fits: '短い持ち時間で多くを見せるとき', steps: ['一定のテンポの一枚一要点'], source: {title: 'Wikipedia: PechaKucha', url: 'https://pechakucha.zendesk.com/hc/en-us/articles/360003419212-The-PechaKucha-20x20-Format'}},
  {id: 'three-pillars', name: '三本柱', level: 'flow', how: '本論を三つの柱に分け、各柱を同じ型で語る', fits: '伝えることが多く、聞き手に構造を持たせたいとき', steps: ['全体の予告', '柱1', '柱2', '柱3', 'まとめ'], source: {title: 'Wikipedia: Rule of three (writing)', url: W('Rule_of_three_(writing)')}}
];

export const techniqueById = (id: string | undefined) => TECHNIQUES.find(t => t.id === id);
export const PAGE_TECHNIQUES = TECHNIQUES.filter(t => t.level === 'page');
export const FLOW_TECHNIQUES = TECHNIQUES.filter(t => t.level === 'flow');

// Marks the third proposal in a round, where the AI picks the technique itself from the catalog.
export const AI_CHOICE = 'ai-choice';

// Proposal planning now chooses techniques from the material, audience and intended effect.
