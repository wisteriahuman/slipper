// What audiences in common presentation settings judge by. This is knowledge about the audience,
// passed to the AI as reference, not rules the slides must follow. Each note is paraphrased from
// the listed sources (no text copied); see README for credits.
export type Scene = {id: string; label: string; match: RegExp; notes: string[]; sources: Array<{title: string; url: string}>};

export const SCENES: Scene[] = [
  {
    id: 'hackathon',
    label: 'ハッカソン',
    match: /ハッカソン|hackathon|ピッチ|pitch/i,
    notes: [
      '審査の観点は、アイデアの独自性・実装の出来・デザイン・与えるインパクトが基本で、同じ重みのことが多い。国内ではユーザー価値とプレゼン自体の配点が技術より高い傾向もある',
      '冒頭の30秒ほどで「誰の、どんな課題か」が伝わり、解決策は一文で言えると、審査員は残りの時間を判断に使える',
      '審査員が確かめたいのは動くものなので、デモが主役になる。起業家風の説明に時間を使ってデモが最後の1分になるのは、よくある失敗',
      'デモは一人のユーザーが最初から最後まで使う流れを1つ見せると伝わりやすい。当日の不具合に備えて録画を用意しておく',
      'できていることと今後の計画が混ざると、審査員は実装の範囲を判断できない',
      '持ち時間が短い（3〜5分）ことが多く、枚数は時間から逆算して削る'
    ],
    sources: [
      {title: 'Devpost: Understanding hackathon submission and judging criteria', url: 'https://info.devpost.com/blog/understanding-hackathon-submission-and-judging-criteria'},
      {title: 'アプリ開発団体jack: ハッカソンでうまいプレゼンをすぐ作る方法', url: 'https://www.jackapp.jp/blog/2b9f301f-f175-80f9-a855-f4c2d47c9c00'},
      {title: 'hacktribe: How to Build a Hackathon Pitch Deck', url: 'https://hacktribe.co/blog/how-to-build-a-hackathon-pitch-deck-practical-5-minute-structure'},
      {title: 'dabit3: How to Give a Killer Pitch or Hackathon Demo', url: 'https://gist.github.com/dabit3/caef5eee4753dd7d23767bc31e70da28'},
      {title: 'SlideModel: How to Make a Presentation for a Hackathon', url: 'https://slidemodel.com/hackathon-presentation/'},
      {title: 'たこてん: 勝つためのハッカソンプレゼン分析', url: 'https://note.com/shabom_takoten/n/nf38e9610c2a9'}
    ]
  },
  {
    id: 'job',
    label: '就活・面接',
    match: /就活|就職|面接|選考|インターン|転職|自己PR|ジョブ/,
    notes: [
      '面接官が見ているのは発表内容そのものより人物で、課題をどう捉え、どう考えを進めたかが評価の中心になる',
      '研究や活動の概要を話す場合も、成果の細部より、直面した課題とそれへの向き合い方に時間を割くと人物が伝わる',
      '論理的に考える力・情報を集める力・資料を作る力・伝える力・独自性が見られる',
      'スライドは話の補助で、話す内容と役割を分ける。文字で埋めると、話し手を見てもらえない',
      '質疑への受け答えも評価の対象になる'
    ],
    sources: [
      {title: 'Presenuniv: 就活・研究概要プレゼンの構成と枚数／時間', url: 'https://presenuniv.com/job-interview2/'},
      {title: 'マイナビ転職: プレゼン面接対策', url: 'https://tenshoku.mynavi.jp/knowhow/mensetsu/guide/51/'},
      {title: 'somalico: 自己PRプレゼン資料の例', url: 'https://somali.co.jp/somalico/method/p5155/'}
    ]
  }
];

export function scenesFor(context: string | undefined): Scene[] {
  return context ? SCENES.filter(s => s.match.test(context)) : [];
}
