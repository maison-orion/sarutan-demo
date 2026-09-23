#!/usr/bin/env node
/**
 * さる単デモ 仕様照合（Jev 判定）
 *
 * 仕様書のハイライト（tools/spec-highlights-2026-09-23.json）が index.template.html に実装されているかを、
 * TypeSafe の Jev（判定専用・入力 $0.042/Mtok・出力無料）に判定させる。抜粋＋型付き質問（Noul＝この記述は正しいか 0〜1）。
 * 逆の割り当て・旧仕様・別の秒数も同時に聞き、Jev が区別できているか（＝質問が効いているか）も確かめる。
 * Jev の state は 32k トークンまでなので、Test 側と TikTak・単語ページ側の2回に分けて送る。
 *
 * --facts を付けると、単語データ（品詞の違い・類義語・コアイメージの例文と訳）の正しさも Jev に聞く。
 * 低い値の行は「人が確かめる候補」であって、Jev の判定をそのまま正解とはしない。
 *
 * 使い方:
 *   node tools/jev-check.mjs             # 仕様照合（キーは環境変数 TYPESAFE_API_KEY か .env）
 *   node tools/jev-check.mjs --facts     # 仕様照合＋単語データの点検
 *   node tools/jev-check.mjs --dry-run   # 送る量と質問だけ表示
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const html = readFileSync(path.join(APP, "index.template.html"), "utf8");
const spec = JSON.parse(readFileSync(path.join(HERE, "spec-highlights-2026-09-23.json"), "utf8"));
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const USD_PER_MTOK = 0.042;
const THRESHOLD = 0.5;
const argv = process.argv.slice(2);

function envKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  const roots = [];
  for (const cmd of ["git rev-parse --show-toplevel", "git rev-parse --git-common-dir"]) {
    try {
      const out = execSync(cmd, { cwd: APP, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      roots.push(cmd.includes("common") ? path.resolve(APP, out, "..") : out);
    } catch { /* not git */ }
  }
  for (const r of roots) {
    try {
      const m = readFileSync(path.join(r, ".env"), "utf8").match(/^\s*TYPESAFE_API_KEY\s*=\s*(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch { /* no .env here */ }
  }
  return undefined;
}
const slice = (from, to) => {
  const a = html.indexOf(from); if (a < 0) throw new Error(`開始マーカーが無い: ${from}`);
  const b = html.indexOf(to, a + from.length); if (b < 0) throw new Error(`終了マーカーが無い: ${to}`);
  return html.slice(a, b);
};
const lines = (re) => html.split("\n").filter((l) => re.test(l)).join("\n");
const intro = "以下は英単語アプリ「さる単」デモ（1枚の HTML）からの抜粋です。仕様書の要求が実装されているかを、抜粋に書かれている内容だけから判定してください。\n\n";
const stateOf = (parts) => intro + Object.entries(parts).map(([k, v]) => `===== ${k} =====\n${v.trim()}`).join("\n\n");

const GROUPS = [
  {
    name: "タブ順・Test",
    parts: {
      "タブバーの HTML": slice('<nav class="tabbar"', "</nav>"),
      "Test ページの HTML": slice("<!-- Test -->", "<!-- TikTak"),
      "Test ページの CSS（スタンプ・十字キー・昇天）": lines(/\.stamp\.|\.dpad|\.tcard\.ascend|\.sparkles|\.t-syn|\.ipa-s/),
      "Test ページの JS（ラベル: 'ok'＝覚えた、'warn'＝もう少し、'no'＝全然覚えてない。flyOut(dx, dy, label) で仕分けを確定）": slice("/* ---------- Test (swipe) ---------- */", "const detailEl = $('#detail');"),
    },
    Q: {
      tabs_order: ["タブバーのボタンは左から Words、TikTak、Test、Profile の順に並んでいる。", true, 53],
      tabs_old: ["タブバーのボタンは左から Test、TikTak、Words、Profile の順に並んでいる。", false, 53],
      right_info: ["Test で右へ 90px より大きく水平ドラッグして離すと、flyOut を呼ばずに（仕分けせずに）カードを元に戻し、「解説」のシート（openSheet('kaisetsu', …)）を開く。", true, 83],
      right_no: ["Test で右へ 90px より大きく水平ドラッグして離すと、ラベル 'no'（全然覚えてない）で仕分けが確定する。", false, 83],
      left_warn: ["Test で左へ 90px より大きく水平ドラッグして離すと、ラベル 'warn'（もう少し）で確定する。", true, 84],
      up_ok: ["Test で上へ 90px より大きく垂直ドラッグして離すと、ラベル 'ok'（覚えた）で確定し、キラキラ（sparkles）と上へ昇る演出（ascend）が付く。", true, 85],
      down_no: ["Test で下へ 90px より大きく垂直ドラッグして離すと、ラベル 'no'（全然覚えてない）で確定する。", true, 86],
      down_later: ["Test で下へドラッグすると、ラベル 'later'（あとで）で確定する。", false, 86],
      dpad: ["Test ページのカードの下に十字キーの形をしたアイコン（class=\"dpad\"）があり、上＝覚えた、左＝もう少し、下＝全然、右＝解説 と表示している。", true, 87],
      no_buttons: ["Test ページの HTML には、押して仕分けする「全然／もう少し／覚えた」のボタン（class=\"tbtn\" や data-rate）が無い。", true, 87],
      front_ipa: ["Test のカード表面では、発音記号（id=\"t-ipa\"）が単語（id=\"t-word\"）より上に置かれている。", true, 0],
      back_syn: ["Test のカード裏面に類義語の欄（id=\"t-syn\"）があり、単語の類義語を並べて表示する。", true, 0],
    },
  },
  {
    name: "TikTak・単語ページ",
    parts: {
      "TikTak ページの HTML": slice("<!-- TikTak", "<!-- Words -->"),
      "TikTak ページの CSS（右の列）": lines(/\.tk-act|\.tk-rail|\.tk-check/),
      "TikTak ページの JS": slice("/* ---------- TikTak: 5秒で", "\n  renderWords();"),
      "単語ページ・コアイメージ・ポップアップの HTML": slice("<!-- 単語ページ", "<!-- /単語ページ -->") + "\n" + slice("<!-- コアイメージ（別ページ） -->", "    </div>\n  </div>\n</div>"),
      "単語ページの JS": slice("const detailEl = $('#detail');", "/* ---------- TikTak: 5秒で"),  // CSS にも同じ見出しがあるので JS の1行目から抜く
    },
    Q: {
      tk_5s: ["TikTak では、表示から 5000 ミリ秒（5秒）経つと自動的に次（下）の単語へ切り替わる。", true, 78],
      tk_3s: ["TikTak では、表示から 3000 ミリ秒（3秒）経つと自動的に次の単語へ切り替わる。", false, 78],
      tk_video3: ["TikTak では、単語のイメージ動画を 3000 ミリ秒（3秒）再生したところで止める。", true, 77],
      tk_rate_always: ["TikTak の「覚えた」「全然」のボタン（data-act=\"rate\"）は常に表示され、確認モードの切り替えボタン（tk-check）は存在しない。", true, 79],
      tk_check: ["TikTak に確認モードの切り替えボタンがあり、押したときだけ「覚えた」「全然」のボタンが表示される。", false, 79],
      fav_none: ["TikTak と単語ページには、お気に入り・保存のボタン（data-act=\"fav\" やハートのアイコン）が無い。", true, 54],
      wp_center: ["単語ページの中央（d-center）に、動画、発音記号と発音ボタン、単語、意味、例文（英語と日本語訳）がある。", true, 66],
      wp_tl: ["単語ページの左上の角（data-corner=\"tl\"）は「品詞の違い」で、押すと品詞ごとの派生形の一覧（forms）がポップアップで出る。", true, 68],
      wp_tr: ["単語ページの右上の角（data-corner=\"tr\"）は「類義語」で、押すと類義語の一覧（syn）がポップアップで出る。", true, 67],
      wp_bl: ["単語ページの左下の角（data-corner=\"bl\"）は「コアイメージ」で、押すとポップアップではなく別ページ（id=\"sphere\"）が開き、中央に単語とコアイメージ、周りに意味ごとの例文が並ぶ。", true, 70],
      wp_br: ["単語ページの右下の角（data-corner=\"br\"）は「解説」で、押すと解説（kaisetsu）がポップアップで出る。", true, 69],
      wp_swap: ["単語ページの左上の角は「類義語」、右上の角は「品詞の違い」である。", false, 67],
      wp_monkey: ["単語ページのサルのアイコン（#i-monkey）のボタン（data-act=\"tips\"）を押すと openSheet('tips', …) が呼ばれ、「おさるさんの覚え方」のシートに w.tips[state.dialect]（方言設定に合わせた覚え方）が表示される。", true, 71],
      wp_twofinger: ["単語ページでは、2本の指が同時に触れている（detail.pts.size が 2）ときに指を動かして離すと、動いた向き（dx, dy）から cornerFor で四隅の1つを決め、openCorner でその角のポップアップか別ページを開く。", true, 64],
      wp_onefinger_corner: ["単語ページでは、1本指で左右にスワイプすると四隅のどれかが開く。", false, 64],
    },
  },
];

async function askJev(key, state, questions) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state, model: "jev-latest", questions }),
    });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
  throw new Error("Jev が混み合っていて応答しませんでした");
}

/** 単語データ（WORDS）から、辞書的に正しいかを聞く文を作る */
function factQuestions() {
  const src = slice("const WORDS = [", "\n  ];") + "\n  ]";
  const WORDS = new Function(`return ${src.replace(/^const WORDS = /, "")}`)();
  const Q = {};
  for (const w of WORDS) {
    w.forms.forEach((f, k) => { Q[`f_${w.id}_${k}`] = [`英語の「${f[0]}」は${f[1]}で、「${f[2]}」という意味で使われる。`, true, w.word]; });
    w.syn.forEach((x, k) => { Q[`s_${w.id}_${k}`] = [`英語の「${x[0]}」は「${x[1]}」という意味で、「${w.word}（${w.meaning}）」の類義語・言い換えとして挙げてよい。`, true, w.word]; });
    w.core.senses.forEach((x, k) => {
      const en = x[1].replace(/[[\]]/g, "");
      Q[`e_${w.id}_${k}`] = [`英文「${en}」は自然で文法的に正しい英語で、その日本語訳として「${x[2]}」は正しい。`, true, w.word];
      Q[`m_${w.id}_${k}`] = [`英文「${en}」の中の「${w.word}」の形は「${x[0]}」という意味で使われている。`, true, w.word];
    });
  }
  return Q;
}

const run = async () => {
  const groups = GROUPS.map((g) => ({ ...g, state: stateOf(g.parts) }));
  if (argv.includes("--facts")) groups.push({ name: "単語データ", state: "英語学習アプリ「さる単」の単語データを点検します。一般的な英和・英英辞書の知識で、各文が正しいかを判定してください。", Q: factQuestions(), facts: true });
  if (argv.includes("--dry-run")) {
    for (const g of groups) console.log(`${g.name}: state ${g.state.length.toLocaleString()} 文字 ／ 質問 ${Object.keys(g.Q).length} 件`);
    return 0;
  }
  const key = envKey();
  if (!key) { console.error("TYPESAFE_API_KEY が環境変数にも .env にも無い"); return 2; }
  let tokens = 0; let fails = 0; let total = 0;
  for (const g of groups) {
    const questions = Object.fromEntries(Object.entries(g.Q).map(([k, q]) => [k, { type: "noul", instructions: q[0] }]));
    const json = await askJev(key, g.state, questions);
    tokens += json?.usage?.input_tokens ?? 0;
    console.log(`\n## ${g.name}\n`);
    console.log(g.facts ? "| 判定 | 質問 | 単語 | Jev(noul) | 文 |\n|---|---|---|---|---|" : "| 判定 | 質問 | 仕様書の段落 | 期待 | Jev(noul) |\n|---|---|---|---|---|");
    for (const [k, q] of Object.entries(g.Q)) {
      const v = json?.answers?.[k]?.noul;
      const pass = typeof v === "number" && (v > THRESHOLD) === q[1];
      total++; if (!pass) fails++;
      if (g.facts) { if (!pass || argv.includes("--all")) console.log(`| ${pass ? "✅" : "⚠️"} | ${k} | ${q[2]} | ${typeof v === "number" ? v.toFixed(3) : "—"} | ${q[0]} |`); }
      else console.log(`| ${pass ? "✅" : "❌"} | ${k} | ${q[2] || "9/22メモ"} | ${q[1]} | ${typeof v === "number" ? v.toFixed(3) : "—"} |`);
    }
  }
  console.log(`\n${total - fails}/${total} 一致 ／ 入力 ${tokens.toLocaleString()} トークン ／ $${((tokens / 1e6) * USD_PER_MTOK).toFixed(5)}`);
  console.log(`ハイライト ${spec.highlights.length} 件（段落 ${spec.highlights.map((h) => h.para).join(", ")}）を対象にした`);
  return fails ? 1 : 0;
};
process.exit(await run());
