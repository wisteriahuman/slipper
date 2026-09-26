# Slipper

思いつかなかった伝え方を探して、Google Slides の資料を育てる制作支援アプリ（macOS・Electron）。

左に本物の Google Slides、右に Slipper のパネルを置きます。表示中のページについて、AI に**伝え方の異なる案**を3つ出してもらい、狙いと捨てたもので比べ、手を入れて、元のページの直後に新しいページとして追加します。元のページは変更しません。

設計（要件定義・ペルソナ・業務フロー・システム構成・MCP ツール仕様・ER 図・ADR）は、Touchstone の設計プロジェクト「slipper（スライド制作支援）」にあります。

## 必要なもの

- macOS、Node.js 22 以上
- ログイン済みの [Claude Code](https://claude.com/claude-code)（`claude` コマンド）。AI の API キーは使いません
- 普段のブラウザ（Arc か Google Chrome）で Google にログインしていること
- Google Cloud の「デスクトップ アプリ」型の OAuth クライアント（下記）

## 起動

```sh
npm install
npm run dev
```

右パネルの「準備」に沿って進めます。

1. **Google のログインを取り込む**：アプリ内では Google にログインできないため、普段のブラウザから google.com の Cookie だけを取り込みます。キーチェーンの確認で「許可」を押します
2. **OAuth クライアントを設定する**：下記で作った JSON を選びます
3. **Google Slides API に接続する**：普段のブラウザで許可画面が開きます

## Google Cloud の設定

1. Slipper 用のプロジェクトを作り、Google Slides API を有効にします
2. Google Auth Platform で同意画面を設定し、テストユーザーに自分を追加します
3. OAuth クライアントを「デスクトップ アプリ」で作り、JSON をダウンロードします

権限の範囲は `https://www.googleapis.com/auth/presentations`（自分の資料の読み書き）です。選んだファイルだけに絞る `drive.file` では、左で開いている資料を読めない（Google Picker で選んだファイルか、アプリが作ったファイルに限られる）ため、資料ごとに選び直す手間を避けてこちらにしました。

OAuth アプリが「テスト」公開のままだと、Google の仕様でリフレッシュトークンが7日で失効します。その場合は「接続する」をもう一度押してください。

## AI の呼び方

「別の伝え方を見る」を押すと、画面なしの Claude Code（`claude -p`）を使い、次の順に進めます。

1. 元の画像と内容、「誰に・何を」から、狙い・根拠・具体的な見せ方の異なる3案をまとめて考えます。手法は内容に合わせて選びます。
2. 選んだ3案を並行して作ります。主な手法に、補助の手法を最大2つ組み合わせられます。
3. `preview_variant` でパネルと同じ React コンポーネントを画像にし、文字切れを測定します。AI は画像を見て必要な修正を行います。
4. 提出前に別の Claude Code 呼び出しが、画像・元の材料・狙いを照合します。明確な不一致があれば作成側へ戻します。見直しは1案につき最大3回です。

描画した内容を変更すると、提出用の確認番号は無効になります。描画・見直しを省略した案は受け取りません。これは品質の保証や聞き手による評価ではありません。Google Slides 側のフォント・改行との完全一致も保証しません。

AI は組み込みのツールを持たず（`--tools ""`）、Slipper の MCP サーバー（`127.0.0.1`、起動ごとのトークンで認証）を使います。Google Slides への書き込みは利用者の採用操作で行います。

「標準」は思考量 medium、「じっくり」は high です。計画と画像の見直しが入るため、従来の15秒という目安は使いません。待ち時間・AI利用量は増えます。

## 手法と連続の扱い

カタログはページ用25種類・流れ用13種類です。原理・視覚表現・連続演出・話の構造・発表形式を区別し、必要な材料、成立条件、避ける失敗、組み合わせ候補を持ちます。ペチャクチャは20枚×20秒の形式として記載し、時間制御がない現状では自動選択しません。

- 段階的に足す・注目を移す：共通要素の位置と大きさを固定
- 寄る・引く：同じ対象を追跡し、縦横比を保って拡大縮小
- Lessig・区切って見せる・問いと答え：場面転換を許可
- データを動かす：共通要素を残し、データの移動を許可。尺度の妥当性は画像の見直しで確認

手直しでも固定する連続だけ位置・大きさを全コマへ反映します。流れの案は段の存在と順序、既存の連続の分断を検査します。

## 流れの採用範囲

「この流れで構成の下書きを作る」は、元の資料を複製して並べ替えます。新規ページは制作指示を置き、統合ページは最初の元ページを土台として使います。完成した新規・統合ページの自動制作はまだ行いません。

## 生成の評価

`npm run evaluate:generation` は合成した4題材をローカルで描画し、文字切れの検出を確認します。Googleへの接続や書き込みは行いません。

実際の Claude Code で生成まで評価する場合（利用量を消費します）：

```sh
SLIPPER_EVAL_LIVE=1 npm run evaluate:generation
# 題材を選んで再実行
SLIPPER_EVAL_LIVE=1 SLIPPER_EVAL_CASES=operation,proposal npm run evaluate:generation
```

出力先は `/tmp/slipper-generation-eval`。`SLIPPER_EVAL_OUTPUT` で変更できます。実施した範囲と残る問題は [生成の評価記録](docs/generation-review.md) を参照してください。

## 色の扱い

色は資料のテーマ色を名前で参照します。**意味が決まっていない強調色は使わせません**。「誰に・何を」の画面で強調色に意味（例：「いま空いている」）を書くと、AI はその意味の場所にだけ、その色を使います。決めていない間は、文字の大きさ・太さ・余白で強調します。

## 開発

```sh
npm test          # vitest
npm run typecheck
npm run build
```

- `src/main`：メインプロセス（アプリ内ブラウザ、Cookie の取り込み、OAuth、Slides API、MCP サーバー、Claude Code の起動、SQLite）
- `src/preload`：パネルに渡す呼び出しの一覧
- `src/renderer`：右パネル（React）
- `src/shared`：要素の形・検査・座標・色の規則
- `prototype/`：最初の試作（事前に用意した案を比べる版）
- `spikes/`：技術検証（アプリ内ブラウザ、Claude Code と MCP）

## 参考にしたもの

- **場面の知識**（`src/shared/scenes.ts`）：ハッカソンと就活の聞き手について、公開記事の要点を書き直したもの。文章は複製していません。出典はファイル内とパネルに表示しています
- **言葉の選び方**（`src/main/prompt.ts` の `WRITING_GUIDE`）：[consulting-pptx-skill](https://github.com/carnot-tech/consulting-pptx-skill) の `references/ai-smell-lexicon.md` から、場面を問わない部分を要約したもの。同リポジトリは MIT License（Copyright (c) 2026 Carnot AI Inc.）です
