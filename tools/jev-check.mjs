#!/usr/bin/env node
/**
 * さる単デモ 仕様照合（Jev 判定）
 *
 * 仕様書のハイライト（tools/spec-highlights-2026-09-21.json）が index.template.html に
 * 実装されているかを、TypeSafe の Jev（判定専用・入力 $0.042/Mtok・出力無料）に判定させる。
 * 人（Claude）のトークンで読み直す代わりに、抜粋＋型付き質問（Noul＝この記述は正しいか 0〜1）を投げる。
 * 逆の割り当て（旧仕様）や別の秒数も同時に聞き、「書いたとおりに読む」Jev がちゃんと区別しているかを確かめる。
 *
 * 使い方:
 *   node tools/jev-check.mjs             # キーは環境変数 TYPESAFE_API_KEY か .env（この repo → 本体 checkout の順）
 *   node tools/jev-check.mjs --dry-run   # 送る抜粋と質問だけ表示
 *   node tools/jev-check.mjs --json      # 結果を JSON でも出す
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const TEMPLATE = path.join(APP, "index.template.html");
const SPEC = path.join(HERE, "spec-highlights-2026-09-21.json");
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const USD_PER_MTOK = 0.042;
const THRESHOLD = 0.5;
const argv = process.argv.slice(2);

function envKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  const roots = [];
  try { roots.push(execSync("git rev-parse --show-toplevel", { cwd: APP, stdio: ["ignore", "pipe", "ignore"] }).toString().trim()); } catch { /* not git */ }
  try { roots.push(path.resolve(execSync("git rev-parse --git-common-dir", { cwd: APP, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(), "..")); } catch { /* not git */ }
  for (const r of roots) {
    try {
      const m = readFileSync(path.join(r, ".env"), "utf8").match(/^\s*TYPESAFE_API_KEY\s*=\s*(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch { /* no .env here */ }
  }
  return undefined;
}

/** 開始マーカーと終了マーカーの間を抜く（終了マーカーは含めない） */
function slice(src, from, to, label) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(`${label}: 開始マーカーが見つからない: ${from}`);
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(`${label}: 終了マーカーが見つからない: ${to}`);
  return src.slice(a, b);
}

const html = readFileSync(TEMPLATE, "utf8");
const spec = JSON.parse(readFileSync(SPEC, "utf8"));
const parts = {
  "Test ページの CSS（スタンプの位置と昇天の演出）": html.split("\n").filter((l) => /\.stamp\.|\.tcard\.ascend|\.sparkles|@keyframes sparkle/.test(l)).join("\n"),
  "TikTak ページの CSS（確認モード）": html.split("\n").filter((l) => /\.tk-act\.rate|\.tk-check|\.tk-stamp|\.view\.tiktak\.check/.test(l)).join("\n"),
  "タブバーの HTML": slice(html, '<nav class="tabbar"', "</nav>", "tabbar"),
  "TikTak ページの HTML": slice(html, "<!-- TikTak", "<!-- Words -->", "tiktak html"),
  "Test ページの JS": slice(html, "/* ---------- Test (swipe) ---------- */", "/* ---------- Word detail", "test js"),
  "TikTak ページの JS": slice(html, "/* ---------- TikTak", "\n  renderWords();", "tiktak js"),
};
const state =
  "以下は英単語アプリ「さる単」デモ（1枚の HTML）からの抜粋です。仕様書の要求が実装されているかを、抜粋に書かれている内容だけから判定してください。" +
  "Test ページでは、カードをドラッグして離したときに dx（右が正）と dy（下が正）から仕分けラベルを決め、flyOut(dx, dy, label) で確定します。ラベルは 'ok'＝覚えた、'warn'＝もう少しで覚えられそう、'no'＝全然覚えてない、'later'＝あとで です。\n\n" +
  Object.entries(parts).map(([k, v]) => `===== ${k} =====\n${v.trim()}`).join("\n\n");

/** key → { ask, expect, spec(段落番号) } */
const Q = {
  right_no:    { ask: "Test ページの JS で、右へ 90px より大きく水平ドラッグして離す（horiz かつ dx > 90）と、ラベル 'no'（全然覚えてない）で確定する。", expect: true, spec: 32 },
  right_ok:    { ask: "Test ページの JS で、右へ 90px より大きく水平ドラッグして離す（horiz かつ dx > 90）と、ラベル 'ok'（覚えた）で確定する。", expect: false, spec: 32 },
  left_warn:   { ask: "Test ページの JS で、左へ 90px より大きく水平ドラッグして離す（horiz かつ dx < -90）と、ラベル 'warn'（もう少しで覚えられそう）で確定する。", expect: true, spec: 33 },
  left_no:     { ask: "Test ページの JS で、左へ 90px より大きく水平ドラッグして離す（horiz かつ dx < -90）と、ラベル 'no'（全然覚えてない）で確定する。", expect: false, spec: 33 },
  up_ok:       { ask: "Test ページの JS で、上へ 90px より大きく垂直ドラッグして離す（!horiz かつ dy < -90）と、ラベル 'ok'（覚えた）で確定する。", expect: true, spec: 34 },
  up_warn:     { ask: "Test ページの JS で、上へ 90px より大きく垂直ドラッグして離す（!horiz かつ dy < -90）と、ラベル 'warn'（もう少し）で確定する。", expect: false, spec: 34 },
  up_sparkle:  { ask: "Test ページで、ラベル 'ok'（覚えた）で確定したときだけ、キラキラの粒（sparkles）を生成してカードが上へ昇っていく演出（ascend）が付く。", expect: true, spec: 34 },
  down_later:  { ask: "Test ページの JS で、下へ 90px より大きく垂直ドラッグして離す（!horiz かつ dy > 90）と、ラベル 'later'（あとで）で確定する。", expect: true, spec: 35 },
  stamps:      { ask: "Test ページの CSS で、'no' のスタンプは右上、'warn' のスタンプは左上、'ok' のスタンプは上中央に置かれている。", expect: true, spec: 32 },
  buttons_ok:  { ask: "Test ページの下のボタン（data-rate）で 'ok' を押すと、カードは上（dy が負）へ飛ぶ。", expect: true, spec: 34 },
  tk_page:     { ask: "TikTak は Test ページ（id=\"view-test\"）の中に組み込まれておらず、独立した view（id=\"view-tiktak\"）と、タブバーの専用タブ（data-tab=\"tiktak\"）を持つ。", expect: true, spec: 39 },
  tk_in_test:  { ask: "TikTak の要素は Test ページ（id=\"view-test\"）の中に置かれている。", expect: false, spec: 39 },
  tk_ui:       { ask: "TikTak ページの HTML/JS は、全画面の縦動画の上に、右側に縦に並ぶ丸いアクションボタン列（発音・保存・詳しく）と、左下のキャプション（@ユーザー名・単語・意味・例文・ハッシュタグ）を重ねる、TikTok 風の構成である。", expect: true, spec: 40 },
  tk_video:    { ask: "TikTak ページでは、表示中の単語のイメージ動画（video 要素）を再生する。", expect: true, spec: 41 },
  tk_3s:       { ask: "TikTak ページでは、表示から 3000 ミリ秒（3秒）経つと自動的に次の単語へ切り替わる。", expect: true, spec: 42 },
  tk_5s:       { ask: "TikTak ページでは、表示から 5000 ミリ秒（5秒）経つと自動的に次の単語へ切り替わる。", expect: false, spec: 42 },
  tk_next_down:{ ask: "TikTak ページで自動的に切り替わる先は、リスト上で次（下）の単語（tk.i + 1）である。", expect: true, spec: 42 },
  tk_swipe:    { ask: "TikTak ページでは、上へスワイプすると次の単語、下へスワイプすると前の単語へ手動でも移れる。", expect: true, spec: 39 },
  tk_check_toggle: { ask: "TikTak ページには「確認モード」の切り替えボタン（id=\"tk-check\"）があり、押すと view に class 'check' が付いたり外れたりする。", expect: true, spec: 24 },
  tk_check_rate:   { ask: "確認モードで「覚えた」または「全然」のボタン（data-act=\"rate\"）を押すと、その単語の判定が state.ratings（My単語帳）に保存され、スタンプを見せてから次の単語へ進む。", expect: true, spec: 24 },
  tk_check_hidden: { ask: "TikTak ページの CSS で、「覚えた」「全然」のボタン（.tk-act.rate）は確認モードが OFF のとき表示されない（display: none）。", expect: true, spec: 24 },
  tk_check_always: { ask: "「覚えた」「全然」のボタン（.tk-act.rate）は確認モードの ON／OFF に関わらず常に表示される。", expect: false, spec: 24 },
  tk_pause:    { ask: "TikTak ページでは、画面をタップすると自動切り替えと動画が一時停止し、もう一度タップすると再開する。", expect: true, spec: 39 },
};
const questions = Object.fromEntries(Object.entries(Q).map(([k, q]) => [k, { type: "noul", instructions: q.ask }]));

if (argv.includes("--dry-run")) {
  console.log(state);
  console.log("\n===== 質問 =====");
  for (const [k, q] of Object.entries(Q)) console.log(`${k} (期待=${q.expect}) ${q.ask}`);
  console.log(`\n抜粋 ${state.length.toLocaleString()} 文字 ／ 質問 ${Object.keys(Q).length} 件`);
  process.exit(0);
}

const key = envKey();
if (!key) { console.error("TYPESAFE_API_KEY が環境変数にも .env にも無い"); process.exit(2); }

let json;
for (let attempt = 0; attempt < 4; attempt++) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state, model: "jev-latest", questions }),
  });
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt));
    continue;
  }
  if (!res.ok) { console.error(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(2); }
  json = await res.json();
  break;
}
if (!json) { console.error("Jev が混み合っていて応答しませんでした"); process.exit(2); }

const rows = [];
let fails = 0;
for (const [k, q] of Object.entries(Q)) {
  const v = json?.answers?.[k]?.noul;
  const got = typeof v === "number" ? v > THRESHOLD : null;
  const pass = got === q.expect;
  if (!pass) fails++;
  rows.push({ key: k, spec: q.spec, expect: q.expect, noul: v, pass });
}
const tokens = json?.usage?.input_tokens ?? 0;
console.log("| 判定 | 質問 | 仕様書の段落 | 期待 | Jev(noul) |");
console.log("|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.pass ? "✅" : "❌"} | ${r.key} | ${r.spec} | ${r.expect} | ${typeof r.noul === "number" ? r.noul.toFixed(3) : "—"} |`);
console.log(`\n${rows.length - fails}/${rows.length} 一致 ／ 入力 ${tokens.toLocaleString()} トークン ／ $${((tokens / 1e6) * USD_PER_MTOK).toFixed(5)}`);
console.log(`ハイライト ${spec.highlights.length} 件（段落 ${spec.highlights.map((h) => h.para).join(", ")}）を対象にした`);
if (argv.includes("--json")) console.log(JSON.stringify({ rows, usage: json.usage }, null, 2));
process.exit(fails ? 1 : 0);
