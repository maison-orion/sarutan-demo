# さる単 デモ

おさるさん（ちかさんチーム）発案の英単語アプリ「さる単」の動く試作。スマホで開くと全画面のアプリとして動く。
正典＝Googleドキュメント「Home／仕様書」（2026-09-06時点）と、支給された絵コンテ5枚（EXPLORE 2枚・QUALIFIED／RELIABLE／SILLY の6コマ）。

公開URL（非公開リンク・claude.ai Artifact）: https://claude.ai/code/artifact/d70ff154-e59f-48fa-80f1-39e620c06987

## 入っているもの

| 画面 | 仕様書の項目 | デモでの動き |
|---|---|---|
| 起動 | ― | スプラッシュ（さる単のワードマーク）→ Words |
| Test | 単語クイズ・スワイプ4方向・My単語帳に保存・ランダム表示 | カード3枚重ね。タップで意味、上＝覚えた（キラキラをまとって昇天）／右＝全然／左＝もう少し／下＝あとで回す。1つ戻す。結果は端末のlocalStorageに保存 |
| TikTak | TikTokのように時間で次の単語が表示されるフラッシュカード・UIはTikTokオマージュ・動画3秒→自動で次へ | 縦フィード。単語の動画が3秒流れて次の単語へ自動で切り替わる（1.4秒で意味が出る）。タップで一時停止、上下スワイプで前後、右の列に発音／保存／詳しく（単語ページ）。ランダム／頻出順。**確認モード**（左上）を入れると右の列に「覚えた／全然」が出て、タップで My単語帳に入りすぐ次へ |
| Words | 一覧（アルファベット順・頻出順・検索）→単語ページ | 6語収録。A→Zは頭文字の見出しつき、頻出順は順位つき。行をタップで単語ページ |
| 単語ページ | 日本語訳イメージ・発音・類義語・覚え方のTips | 絵コンテどおりの10秒シーケンス（動画タップ→光の軌跡→動画拡大・再生→関連語チップ→単語へ収束→ネットワーク図＋Nuance＋覚え方）。ノードをタップで発音。最後に「全然／もう少し／覚えた」でMy単語帳へ。左右スワイプで前後の単語 |
| Profile | 基本情報・My単語帳（3ラベル）・通知・解説の方言 | 3ラベルの件数＋割合バー。ラベルをタップすると別ページに一覧（Wordsと同じ型・タイトル＝ラベル名・検索と並び替えつき）、行をタップで単語ページ。アカウント4行はダミー。方言（標準語／関西弁／名古屋弁）を切り替えると単語ページの「覚え方」が変わる |

## ダミーのもの

- 「動画 N回」の頻出回数、クリップの時刻表示、ユーザー情報は全部ダミー
- 動画枠の映像は Higgsfield で生成（静止画＝Seedream 4.5、動画＝Seedance 1.5 Pro の image-to-video 4秒・480p）。本番はちかさんの動画クリップに差し替える前提
- 語彙データ6語（chips・ネットワーク・Nuance・方言つきTips）は `index.template.html` の `WORDS` に直書き

## ファイル

| ファイル | 役割 |
|---|---|
| `index.template.html` | **編集はここ**。CSS／データ／ロジック全部入り。画像は `{{IMG:*}}`、動画は `{{VID:*}}` トークン |
| `tools/jev-check.mjs` | 仕様書のハイライト（`tools/spec-highlights-2026-09-21.json`）が実装されているかを Jev（TypeSafe の判定専用モデル）に判定させる。`node tools/jev-check.mjs`（キーは `TYPESAFE_API_KEY`） |
| `tools/build.py` | トークンを data URI に置換して `index.html`（完全な文書）と `artifact.html`（Artifact用の断片）を出力 |
| `assets/clip-*.jpg` | 動画枠のポスター静止画（800px幅） |
| `assets/clip-*.mp4` | 動画クリップ（640px・24fps・音声なし・各90〜210KB） |
| `index.html` / `artifact.html` | ビルド成果物（約1.7MB）。**直接編集しない**（.gitignore 済み） |

```bash
python3 tools/build.py          # ビルド
npx html-validate index.html    # HTML検証（2026-09-07 時点で 0 problems）
```

ローカル確認は `.claude/launch.json` の `sarutan-demo`（port 8643）。

## 公開

- 誰でも開けるURL（GitHub Pages）: https://maison-orion.github.io/sarutan-demo/ 　公開リポジトリ＝https://github.com/maison-orion/sarutan-demo
- 公開リポジトリには `index.html`（ビルド済み）＋正本＋素材をそのまま置く。更新は morn 側でビルドして `sarutan-demo` リポジトリに同じファイルをコミット＋push（Pages は main 直下を配信）

## 更新履歴

- v0.4.1（2026-09-21）TikTak に確認モード（仕様書の備考「テストモードの補足＋確認モード？」）。覚えた／全然をタップ → My単語帳へ保存 → 次の単語へ
- v0.4（2026-09-21）TikTak ページを新設（3秒で次の単語へ流れる縦フィード・TikTok オマージュ）。Test のスワイプ割り当てを仕様書どおりに変更（右＝全然／左＝もう少し／上＝覚えた＋キラキラで昇天／下＝あとで）。仕様との照合は `tools/jev-check.mjs`
- v0.3（2026-09-11）My単語帳のラベルをタップしたとき、同じページの下に伸ばすのをやめて別ページで一覧（仕様書の追記どおり）
- v0.2（2026-09-07）動画クリップ・スプラッシュ・カード重ね・トースト・方言設定
- v0.1（2026-09-06）静止画版

## 実装メモ

- 動画は base64 で埋め込み、開いたときに Blob URL に変換して `<video>` に渡す。失敗したら静止画＋ズームにフォールバック
- 10秒シーケンスは `data-stage`（card → play → chips → converge → network）を2秒刻みで進める。途中タップで先へ進める
- 「ホーム画面に追加」向けの meta（theme-color・apple-mobile-web-app-capable）は JS で head に足している
