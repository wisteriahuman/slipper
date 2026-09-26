# 技術検証：Electron の中で Google Slides を開く

Slipper の画面の中で本物の Google Slides を開き、横に自前のパネルを置けるかを確かめる検証です。製品のコードではありません。

## 動かし方

```sh
npm install
npm start
```

右のパネルで「Arc から取り込む」または「Google Chrome から取り込む」を押します。macOS のキーチェーンの確認で「許可」を押すと、左側が Google Slides の資料一覧になります。

`SLIPPER_DEBUG_PORT=9344 npm start` で起動すると、DevTools プロトコルで外から状態を確認できます。ログイン状態を消すには `~/Library/Application Support/slipper-spike-electron-google-slides` を削除します。

## 結果（2026-09-26）

| 問い | 結果 |
|---|---|
| アプリ内で Google にログインできるか | できない。通信とページ内の両方の識別情報を Firefox に揃えても、`/signin/rejected` に飛ばされる |
| 普段のブラウザのログイン状態を取り込めば使えるか | 使える。Arc から google.com の Cookie を97件取り込み、資料一覧と編集画面が開いた |
| 表示中のページを特定できるか | できる。編集画面の URL の `#slide=id.<ページID>` が、ページを移動するたびに更新される |

決定の経緯は、Touchstone の ADR「slipper — Google Slidesをアプリ内で開く方式」にあります。

## 仕組み

- `main.js`：左右2つの `WebContentsView` を並べる。Google 側には preload もアプリの権限も渡さない（許可はクリップボードのみ）
- `cookie-import.js`：Arc / Chrome の Cookie データベースの写しから google.com の Cookie だけを読み、キーチェーンの鍵で復号して、セッションに直接入れる。復号した値はディスクに書かない
- `panel-*`：右のパネル。決めた数個の呼び出しだけを使う

Orca（MIT、`github.com/stablyai/orca`）の方式を参考にしています。コードは流用していません。
