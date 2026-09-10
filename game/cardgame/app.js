"use strict";
/* ===== 近代史カードパック — 本体 ===== */

// ----- 設定 -----
const RATE = { SSR: 0.03, SR: 0.14, R: 0.33, N: 0.50 };
const TICKET_MAX = 50;
const TICKET_MS = 10 * 1000;     // 10秒で1枚
const PITY_LIMIT = 50;           // 50連天井：SSRが出るまでのカウント
const MAX_LV = 5;
const WIKI_TTL = 7 * 24 * 3600 * 1000;

// ----- 状態（localStorage） -----
const SKEY = "mhc_state_v1";
let state = { owned: {}, seen: {}, tickets: TICKET_MAX, lastTs: Date.now(), packs: 0, pity: 0, muted: false, vip: false };
try {
  const s = JSON.parse(localStorage.getItem(SKEY));
  if (s && typeof s === "object") state = Object.assign(state, s);
} catch (e) {}
function save() { localStorage.setItem(SKEY, JSON.stringify(state)); }

// Wikipediaデータキャッシュ
const WKEY = "mhc_wiki_v1";
let wikiCache = {};
try { wikiCache = JSON.parse(localStorage.getItem(WKEY)) || {}; } catch (e) {}
function saveWiki() { localStorage.setItem(WKEY, JSON.stringify(wikiCache)); }

// ----- サウンド（WebAudioシンセ） -----
let ctx = null;
function beep(freq, dur, type = "square", vol = 0.12, delay = 0) {
  if (state.muted) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) {}
}
const sFlip = () => { beep(700, .07); beep(1050, .08, "square", .1, .05); };
const sPack = () => { beep(220, .12, "sawtooth", .1); beep(440, .1, "sawtooth", .08, .08); };
const sNew  = () => { beep(523, .1); beep(659, .1, "square", .1, .09); beep(784, .12, "square", .1, .18); };
const sSSR  = () => { [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, .16, "triangle", .13, i * .09)); };

// ----- 国別裏面SVG -----
function starD(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const R = i % 2 ? r * 0.4 : r;
    const a = (i * 36 - 90) * Math.PI / 180;
    pts.push((cx + R * Math.cos(a)).toFixed(1) + "," + (cy + R * Math.sin(a)).toFixed(1));
  }
  return "M" + pts.join(" L") + " Z";
}
const DE_CROSS_D = "M44.2,44.2a95,95 0 0 0-8.45-34.35h28.55a95,95 0 0 0-8.45,34.35a95,95 0 0 0 34.35-8.45v28.55a95,95 0 0 0-34.35-8.45a95,95 0 0 0 8.45,34.35h-28.55a95,95 0 0 0 8.45-34.35a95,95 0 0 0-34.35,8.45v-28.55a95,95 0 0 0 34.35,8.45z";
function backSVG(code) {
  const s = BACK_STYLE[code] || "xx";
  let body = "";
  if (s === "jp") {
    // 旭日旗（画像をカードサイズにcut）
    return '<div class="backpat backimg" style="background-image:url(\'assets/jp_back.jpg\')"></div>';
  } else if (s === "de") {
    // ドイツ十字（Deutsches Kreuz）
    body = '<rect width="100" height="150" fill="#1a1f38"/>' +
      '<g transform="translate(0,25)">' +
      '<path d="' + DE_CROSS_D + '" stroke="#e8e8f0" stroke-width="19.7" fill="none"/>' +
      '<path d="' + DE_CROSS_D + '" stroke="#0c0e14" stroke-width="10.7" fill="none"/>' +
      '<path d="' + DE_CROSS_D + '" stroke="#e8e8f0" stroke-width="5.1" fill="none"/>' +
      '<path d="' + DE_CROSS_D + '" fill="#0c0e14"/>' +
      "</g>";
  } else if (s === "kp") {
    // 北朝鮮の軍旗（画像をカードサイズにcover）
    return '<div class="backpat backimg" style="background-image:url(\'assets/kp_back.jpg\')"></div>';
  } else if (s === "ru") {
    // ソビエトの星（画像をcontainで中央配置）
    return '<div class="backpat" style="background:#8a1c28"><div class="backimg-contain" style="background-image:url(\'assets/su_star.png\')"></div></div>';
  } else if (s === "cn") {
    // 中華蘇維埃共和国の紋章（画像をcontainで中央配置）
    return '<div class="backpat" style="background:#8a1c28"><div class="backimg-contain" style="background-image:url(\'assets/cn_emblem.png\')"></div></div>';
  } else if (s === "us") {
    // 星条
    body = '<rect width="100" height="150" fill="#232b4e"/>' +
      '<rect y="115" width="100" height="9" fill="#b03a3a"/>' +
      '<rect y="124" width="100" height="9" fill="#d8dade"/>' +
      '<rect y="133" width="100" height="9" fill="#b03a3a"/>' +
      '<rect y="142" width="100" height="8" fill="#d8dade"/>' +
      '<path d="' + starD(28, 45, 10) + '" fill="#d8dade"/>' +
      '<path d="' + starD(50, 45, 10) + '" fill="#d8dade"/>' +
      '<path d="' + starD(72, 45, 10) + '" fill="#d8dade"/>';
  } else if (s === "uk") {
    // ユニオンジャック風
    body = '<rect width="100" height="150" fill="#1c2850"/>' +
      '<line x1="0" y1="0" x2="100" y2="150" stroke="#d8dade" stroke-width="20"/>' +
      '<line x1="100" y1="0" x2="0" y2="150" stroke="#d8dade" stroke-width="20"/>' +
      '<line x1="0" y1="0" x2="100" y2="150" stroke="#a83a3a" stroke-width="9"/>' +
      '<line x1="100" y1="0" x2="0" y2="150" stroke="#a83a3a" stroke-width="9"/>' +
      '<rect x="38" y="0" width="24" height="150" fill="#d8dade"/>' +
      '<rect x="0" y="63" width="100" height="24" fill="#d8dade"/>' +
      '<rect x="42" y="0" width="16" height="150" fill="#a83a3a"/>' +
      '<rect x="0" y="67" width="100" height="16" fill="#a83a3a"/>';
  } else if (s === "fr" || s === "it") {
    // トリコロール
    const c1 = s === "fr" ? "#3a4a8a" : "#3a7a4a";
    body = '<rect width="100" height="150" fill="' + c1 + '"/>' +
      '<rect x="34" width="33" height="150" fill="#d8dade"/>' +
      '<rect x="67" width="33" height="150" fill="#a83a3a"/>' +
      '<rect width="100" height="150" fill="#12141c" opacity=".25"/>' +
      '<circle cx="50" cy="75" r="17" fill="#1a1f38" opacity=".85"/>' +
      '<circle cx="50" cy="75" r="17" fill="none" stroke="#e8c25a" stroke-width="1.5" opacity=".7"/>';
  } else {
    // 汎用
    let hatch = "";
    for (let i = -150; i < 200; i += 18) hatch += '<line x1="' + i + '" y1="0" x2="' + (i + 150) + '" y2="150" stroke="#2c3350" stroke-width="3"/>';
    body = '<rect width="100" height="150" fill="#1c213e"/><g>' + hatch + '</g>' +
      '<path d="M50 45 L80 75 L50 105 L20 75 Z" fill="none" stroke="#4a5490" stroke-width="2"/>' +
      '<circle cx="50" cy="75" r="10" fill="#2c3350"/>';
  }
  return '<svg class="backpat" viewBox="0 0 100 150" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' + body + "</svg>";
}
function countryOf(id) { return COUNTRY[id] || "xx"; }
function countryName(id) { return COUNTRY_NAME[countryOf(id)] || ""; }

// ----- Wikipedia API -----
function resolveTitle(title, q) {
  const map = {};
  (q.normalized || []).forEach(n => { map[n.from] = n.to; });
  const rd = {};
  (q.redirects || []).forEach(r => { rd[r.from] = r.to; });
  let t = title;
  for (let i = 0; i < 4; i++) { t = map[t] || t; t = rd[t] || t; }
  return t;
}
async function fetchWiki(cardIds) {
  const need = cardIds.filter(id => {
    const c = wikiCache[id];
    return !c || !c.ts || (Date.now() - c.ts > WIKI_TTL && !(c.th || c.ex || c.t));
  });
  if (!need.length) return;
  const chunks = [];
  for (let i = 0; i < need.length; i += 30) chunks.push(need.slice(i, i + 30));
  for (const chunk of chunks) {
    const titles = chunk.map(id => CARD_BY_ID[id].w).join("|");
    const url = "https://ja.wikipedia.org/w/api.php?action=query&format=json&formatversion=2" +
      "&redirects=1&prop=pageimages|extracts&piprop=thumbnail&pithumbsize=400" +
      "&exintro=1&explaintext=1&exchars=200&titles=" + encodeURIComponent(titles) + "&origin=*";
    try {
      const res = await fetch(url);
      const data = await res.json();
      const q = data.query || {};
      const pages = {};
      (q.pages || []).forEach(p => { pages[p.title] = p; });
      chunk.forEach(id => {
        const card = CARD_BY_ID[id];
        const t = resolveTitle(card.w, q);
        const p = pages[t];
        const entry = { ts: Date.now() };
        if (p) {
          entry.t = p.title;
          if (p.thumbnail) entry.th = p.thumbnail.source;
          if (p.extract) entry.ex = p.extract.trim();
        } else {
          entry.tried = true; // ページが見つからなかった: 再試行しない
        }
        wikiCache[id] = entry;
      });
      saveWiki();
    } catch (e) { /* オフラインでも名前とレアリティで遊べる */ }
  }
}

// ----- チケット -----
function syncTickets() {
  const now = Date.now();
  const elapsed = now - state.lastTs;
  if (state.tickets < TICKET_MAX && elapsed >= TICKET_MS) {
    const gained = Math.floor(elapsed / TICKET_MS);
    state.tickets = Math.min(TICKET_MAX, state.tickets + gained);
    state.lastTs = state.tickets >= TICKET_MAX ? now : state.lastTs + gained * TICKET_MS;
    save();
  } else if (state.tickets >= TICKET_MAX) {
    state.lastTs = now;
  }
  renderTickets();
}
function renderTickets() {
  document.getElementById("ticket-count").textContent = "🎫 ×" + state.tickets;
  const timer = document.getElementById("ticket-timer");
  if (state.tickets >= TICKET_MAX) {
    timer.textContent = "満タン！";
  } else {
    const remain = TICKET_MS - (Date.now() - state.lastTs);
    const s = Math.max(0, Math.ceil(remain / 1000));
    timer.textContent = "次まで 0:" + String(s).padStart(2, "0");
  }
  document.getElementById("draw1").disabled = state.tickets < 1;
  document.getElementById("draw10").disabled = state.tickets < 2;
  renderVIPButtons();
}
// 伝説の開封ボタンの表示（ロック中は正体を伏せる）
let vipShown = null;
function renderVIPButtons() {
  const unlocked = vipUnlocked();
  if (unlocked !== vipShown) {
    vipShown = unlocked;
    $("draw-ssr1").innerHTML = unlocked
      ? "SSR確定 1枚<br><small>チケット25枚／SSR1枚確定</small>"
      : "🔒 ？？？<br><small>ある人物を引くと解放される</small>";
    $("draw-ssr10").innerHTML = unlocked
      ? "SSR確定 10連<br><small>チケット50枚／SSR10枚確定</small>"
      : "🔒 ？？？<br><small>？？？を引くと解放される</small>";
  }
  $("draw-ssr1").disabled = !unlocked || state.tickets < 25;
  $("draw-ssr10").disabled = !unlocked || state.tickets < 50;
}

// ----- ガチャ -----
function rollRarity(forceSSR) {
  if (forceSSR) return "SSR";
  const x = Math.random();
  if (x < RATE.SSR) return "SSR";
  if (x < RATE.SSR + RATE.SR) return "SR";
  if (x < RATE.SSR + RATE.SR + RATE.R) return "R";
  return "N";
}
function drawOne(forceSSR) {
  let r = rollRarity(forceSSR);
  // USSR（スターリン）はSSRと同じ排出枠から出る
  const pool = r === "SSR" ? BY_RARITY.SSR.concat(BY_RARITY.USSR || []) : BY_RARITY[r];
  return pool[Math.floor(Math.random() * pool.length)];
}
function drawPack(n, forceAllSSR) {
  // 天井は1枚ごとに判定: パック内でSSR/USSRが出たらリセット、
  // 49連目を超えた1枚だけが強制SSRになる（10連で全部SSRになるバグ修正）
  // forceAllSSR（伝説の開封）は全カードSSR枠から強制排出
  const cards = [];
  let pity = state.pity;
  for (let i = 0; i < n; i++) {
    const c = drawOne(!!forceAllSSR || pity + 1 >= PITY_LIMIT);
    pity = (c.r === "SSR" || c.r === "USSR") ? 0 : pity + 1;
    cards.push(c);
  }
  if (n >= 10 && !cards.some(c => c.r === "SSR" || c.r === "USSR" || c.r === "SR")) {
    const pool = BY_RARITY.SR;
    cards[n - 1] = pool[Math.floor(Math.random() * pool.length)];
  }
  state.pity = pity;
  return cards;
}
// ----- 伝説の開封（エンドコンテンツ） -----
// 金一族（3代）かスターリンを引くと解放される。図鑑/ボタンでは正体を隠す
const VIP_IDS = { kimilsung: true, kimjongil: true, kimjongun: true, stalin: true };
function vipUnlocked() {
  if (state.vip) return true;
  for (const id in VIP_IDS) if (state.owned[id]) { state.vip = true; return true; }
  return false;
}
function acquire(card) {
  const cur = state.owned[card.id] || 0;
  const isNew = !cur;
  state.owned[card.id] = Math.min(MAX_LV, cur + 1);
  if (VIP_IDS[card.id]) state.vip = true; // 伝説の開封 解放
  return isNew;
}

// ----- DOM -----
const $ = id => document.getElementById(id);
function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }

function cardHTML(card, isNew) {
  const wc = wikiCache[card.id] || {};
  const img = wc.th
    ? '<img loading="lazy" alt="" src="' + esc(wc.th) + '"><div class="holo"></div>'
    : '<div class="noimg">' + esc(card.n.slice(0, 1)) + "</div>";
  return '<div class="card r-' + card.r + (isNew ? " new-badge" : "") + '" data-id="' + card.id + '">' +
    '<div class="inner">' +
    '<div class="face back">' + backSVG(countryOf(card.id)) + '<div class="q">？</div></div>' +
    '<div class="face front">' +
    '<div class="rarity-badge">' + card.r + "</div>" +
    '<div class="portrait">' + img + "</div>" +
    '<div class="card-name">' + esc(card.n) + "</div>" +
    '<div class="card-tag">' + esc(card.t) + "／" + esc(countryName(card.id)) + "</div>" +
    "</div></div></div>";
}

async function openPack(n, vip) {
  const cost = vip ? (n >= 10 ? 50 : 25) : (n >= 10 ? 2 : 1);
  if (state.tickets < cost) return;
  if (vip && !vipUnlocked()) return;
  state.tickets -= cost;
  state.packs += 1;
  save();
  sPack();
  const pack = document.querySelector(".pack-body");
  pack.classList.remove("shake"); void pack.offsetWidth; pack.classList.add("shake");

  const cards = drawPack(n, vip);
  const results = cards.map(c => ({ card: c, isNew: acquire(c) }));
  save(); // state.pity は drawPack 内で1枚ごとに更新済み
  renderTickets(); renderStats();

  // 先にWikipediaから肖像を取得
  $("overlay-title").textContent = vip ? (n >= 10 ? "SSR10枚確定 結果" : "SSR確定 結果") : (n >= 10 ? "10連 結果" : "開封結果");
  const area = $("cards-area");
  area.innerHTML = results.map(r => cardHTML(r.card, r.isNew)).join("");
  bindCards(); // Wikipedia応答を待たずにめくれるように
  $("overlay").classList.remove("hidden");
  await fetchWiki(cards.map(c => c.id));
  // 取得後: 肖像が無いカードの .portrait だけ差し替え。
  // 要素を作り直さないので「すべてめくる」のタイマー・NEWバッジ・flip状態は維持され、
  // 同パック内の重複カードが誤ったisNewで再描画される問題も起きない
  area.querySelectorAll(".card").forEach(el => {
    const wc = wikiCache[el.dataset.id] || {};
    const p = el.querySelector(".face.front .portrait");
    if (p && wc.th && !p.querySelector("img")) {
      p.innerHTML = '<img loading="lazy" alt="" src="' + esc(wc.th) + '"><div class="holo"></div>';
    }
  });
}

function bindCards() {
  document.querySelectorAll("#cards-area .card").forEach(el => {
    el.onclick = () => flip(el);
  });
}
// 確定演出（カードが画面中央へ移動する演出）
//  - スターリン：20秒映像を背景に流し、15秒の時点でカードを出し、終わったら最終フレームで静止
//  - レーニン・トロツキー：15秒映像を全面再生→終わったらカード表面をフェードイン
//  - 一般SSR: 映像なしで中央へバーンと登場（ミサイル発射映像は北朝鮮カード専用）
//  - 北朝鮮3代（大当たり）: ミサイル発射→地球滅亡（assets/kp_doom.mp4）の連続シークエンス。滅亡の曲（assets/kongyo.mp3）を閉じるまでループ
const SOVIET_STAR = { stalin: true, lenin: true, trotsky: true };
const CHINA_STAR = { mao: true, xijinping: true };
const GERMANY_STAR = { hitler: true, himmler: true };
const JAPAN_STAR = { showa: true }; // 昭和天皇: 観閲式映像を25秒地点までフルで流し、その時点でカードを出す
const NK_STAR = { kimilsung: true, kimjongil: true, kimjongun: true }; // 北朝鮮3代: コンギョ＋ミサイル映像（後日素材追加）
const NK_MISS = { hwang: true }; // 黄長燁（N）: キム一族じゃないのにミサイルだけで期待させるハズレ枠
const STALIN_HERO = { stalin: true };
const CONFIRM_SCALE = 1.9;
// スマホはカード自体が小さい分、中央登場時は大きく拡大する
const confirmScale = () => window.innerWidth <= 600 ? 2.4 : CONFIRM_SCALE;
let bgVideoEl = null;
let jingleTimer = null; // エーリカ等の開始を遅らせるタイマー（カード登場と同時に鳴らす用）
let bgShowTimer = null;

function playSovietJingle() {
  if (state.muted) return;
  const a = $("soviet-jingle");
  try { a.currentTime = 0; a.play(); } catch (e) {}
}

function playChinaJingle() {
  if (state.muted) return;
  const a = $("china-jingle");
  try { a.currentTime = 0; a.play(); } catch (e) {}
}

// spec.audio = { id, start } : 指定音声をstart秒から鳴らす（エーリカ等）
function playCardJingle(audioSpec) {
  if (state.muted || !audioSpec) return;
  const a = $(audioSpec.id);
  try { a.currentTime = audioSpec.start || 0; a.play(); } catch (e) {}
}

// カードごとの確定演出設定
//  china: 映像はソ連のを使い回し（消音）、代わりにassets/china.mp3を鳴らす
function confirmSpecFor(card) {
  if (STALIN_HERO[card.id]) return { src: "assets/stalin.mp4", bg: true, revealAt: 15000, soviet: true };
  // ヒトラー：33秒映像を背景に流し、終了5秒前(28秒)にカードを出し、最終フレームで静止（スターリンと同じ型）
  // 映像は消音。エーリカ（assets/erika.mp3）は曲の1:10から、カード登場（28秒地点）と同じタイミングで鳴らし始める
  if (card.id === "hitler") return { src: "assets/hitler.mp4", bg: true, revealAt: 28000, soviet: false, audio: { id: "erika-jingle", start: 70, delay: 28000 } };
  // ヒムラー：21秒映像（末尾フェードアウト）を全面再生→終わったらカード表面をフェードイン
  if (card.id === "himmler") return { src: "assets/himmler.mp4", bg: false, soviet: false };
  // 昭和天皇：37.6秒の観閲式映像を背景に全部流し、25秒地点でカードを出す（元の音声はそのまま残す）
  if (JAPAN_STAR[card.id]) return { src: "assets/showa.mp4", bg: true, revealAt: 25000, soviet: false };
  if (CHINA_STAR[card.id]) return { src: "assets/confirm.mp4", bg: false, china: true };
  if (SOVIET_STAR[card.id]) return { src: "assets/confirm.mp4", bg: false, soviet: true };
  // 北朝鮮3代（大当たり）: 発射（全面15秒）→滅亡開始でカード＋閉じるボタン登場、滅亡映像は背景で流す。曲は閉じるまでループ
  if (NK_STAR[card.id]) return { src: "assets/kp_confirm.mp4", nextSrc: "assets/kp_doom.mp4", bg: false, kp: true, audio: { id: "kongyo-jingle", start: 0 } };
  // 黄長燁（ハズレ）: ミサイル発射映像だけ。SSRジングルも鳴らして極限まで期待させる
  if (NK_MISS[card.id]) return { src: "assets/kp_confirm.mp4", bg: false, soviet: false };
  // 一般SSRは映像なし: 中央へバーンと登場するだけ（ミサイルは北朝鮮カード専用演出）
  return null;
}

// カードを画面中央へ移動＋拡大
function triggerConfirmReveal(el) {
  const area = $("cards-area");
  area.classList.add("confirm-active");
  el.classList.add("confirm-hero");
  const rect = el.getBoundingClientRect();
  el.style.position = "fixed";
  el.style.left = rect.left + "px";
  el.style.top = rect.top + "px";
  el.style.width = rect.width + "px";
  el.style.height = rect.height + "px";
  el.style.margin = "0";
  el.style.zIndex = "90";
  el.getBoundingClientRect(); // 強制リフロー

  requestAnimationFrame(() => {
    const s = confirmScale();
    const newW = rect.width * s;
    const newH = rect.height * s;
    el.style.transition = "left .55s cubic-bezier(.2,.8,.2,1), top .55s cubic-bezier(.2,.8,.2,1), width .55s cubic-bezier(.2,.8,.2,1), height .55s cubic-bezier(.2,.8,.2,1)";
    el.style.left = ((window.innerWidth - newW) / 2) + "px";
    el.style.top = ((window.innerHeight - newH) / 2) + "px";
    el.style.width = newW + "px";
    el.style.height = newH + "px";
  });

  tryPlayConfirmVideo(el, confirmSpecFor(CARD_BY_ID[el.dataset.id]));
}

// spec.src の映像を再生し、終わったらカードをフェードイン。映像が無い/再生不可なら即カードを見せる。
// spec.bg（スターリン）のみ背景モード: カードは15秒の時点で登場し、映像は最終フレームで静止。
function tryPlayConfirmVideo(heroEl, spec) {
  const v = $("confirm-video");

  // 映像なし/再生要素が無い: カードは見えたまま中央にバーン
  if (!spec || !spec.src || !v) {
    heroEl.style.opacity = "1";
    if (spec && spec.soviet) fallbackReveal(heroEl); // ソ連3人は赤背景＋ジングルにフォールバック
    return;
  }

  if (spec.bg) {
    // スターリン/ヒトラー型：映像を全面に流し、revealAt(ms)の時点でカードを出す。終了後は最終フレームで静止。
    bgVideoEl = v.cloneNode();
    bgVideoEl.removeAttribute("id");
    bgVideoEl.classList.remove("hidden");
    bgVideoEl.classList.add("confirm-video-bg");
    bgVideoEl.src = spec.src;
    $("overlay").appendChild(bgVideoEl);
    heroEl.style.opacity = "0"; // revealAtまでは映像を全面に見せる

    bgShowTimer = setTimeout(() => {
      heroEl.style.transition = "opacity .6s ease"; // revealAtの時点でカードを出す
      heroEl.style.opacity = "1";
    }, spec.revealAt || 0);

    const finishBg = () => {
      bgVideoEl.removeEventListener("ended", finishBg);
      try { bgVideoEl.pause(); } catch (e) {} // 最終フレームでそのまま停止
    };
    bgVideoEl.addEventListener("ended", finishBg);
    if (spec.audio) {
      // 映像の元音声（演説等）は消さない。エーリカはカード登場のタイミングで重ねて鳴らす
      if (spec.audio.delay) jingleTimer = setTimeout(() => playCardJingle(spec.audio), spec.audio.delay); // カード登場と同じタイミングで鳴らし始める
      else playCardJingle(spec.audio);
    }
    const p2 = bgVideoEl.play();
    if (p2 && p2.catch) p2.catch(() => {
      bgVideoEl.removeEventListener("ended", finishBg);
      clearTimeout(bgShowTimer);
      bgVideoEl.remove(); bgVideoEl = null;
      if (spec.china) fallbackReveal(heroEl, true);
      else if (spec.soviet) fallbackReveal(heroEl);
      else fallbackReveal(heroEl, false, spec.audio); // 赤背景＋指定音声
    });
    return;
  }

  // 全面再生モード（レーニン等 / SSR / 中国の2人）
  heroEl.style.opacity = "0"; // 映像が終わるまでカードは隠す
  v.src = spec.src;
  v.muted = !!(spec.china || spec.kp); // 中国・北朝鮮は動画の音を消して専用mp3を鳴らす
  v.classList.add("hidden"); // 実際に再生が始まるまで全面には出さない（404などで一瞬黒くならないように）
  v.currentTime = 0;

  const onPlaying = () => v.classList.remove("hidden");
  const finish = () => {
    v.removeEventListener("playing", onPlaying);
    v.removeEventListener("ended", onEnded);
    v.classList.add("hidden");
    heroEl.style.transition = "opacity .6s ease";
    heroEl.style.opacity = "1";
  };
  // 金族は「発射」の後に「地球滅亡」を続けて流す（大当たりシークエンス）
  const onEnded = () => {
    if (spec.nextSrc) {
      const next = spec.nextSrc;
      spec.nextSrc = null;

      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("ended", onEnded);
      v.classList.add("hidden");

      // カードを表示
      heroEl.style.transition = "opacity .6s ease";
      heroEl.style.opacity = "1";

      // 地球滅亡動画を背景として開始
      bgVideoEl = v.cloneNode();
      bgVideoEl.removeAttribute("id");
      bgVideoEl.classList.remove("hidden");
      bgVideoEl.classList.add("confirm-video-bg");
      bgVideoEl.muted = true;
      bgVideoEl.src = next;

      const freezeDoom = () => {
        try { bgVideoEl.pause(); } catch (e) {}
      };

      bgVideoEl.addEventListener("ended", freezeDoom);

      // ★ kp_doom.mp4 の再生開始と同時に音源を開始
      if (spec.audio) {
        playCardJingle(spec.audio);
      }

      const pd = bgVideoEl.play();
  
      if (pd && pd.catch) {
        pd.catch(() => {
          try { bgVideoEl.remove(); } catch (e) {}
          bgVideoEl = null;
        });
      }
  
      return;
    }
    finish();
  };
  v.addEventListener("playing", onPlaying);
  v.addEventListener("ended", onEnded);

  if (spec.china) playChinaJingle(); // 映像と一緒に中国のmp3を鳴らす（映像終了後も「閉じる」まで流れ続ける）

  const p = v.play();
  if (p && p.catch) {
    p.catch(() => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("ended", onEnded);
      v.classList.add("hidden");
      heroEl.style.opacity = "1";
      if (spec.soviet) fallbackReveal(heroEl);
      else if (spec.china) fallbackReveal(heroEl, true); // 赤背景＋mp3はそのまま
      else if (spec.kp) fallbackReveal(heroEl, false, spec.audio); // 赤背景＋コンギョ
    });
  }
}

function fallbackReveal(heroEl, useChina, audioSpec) {
  heroEl.style.opacity = "1";
  if (useChina) playChinaJingle();
  else if (audioSpec) playCardJingle(audioSpec);
  else playSovietJingle();
  $("overlay").classList.add("soviet"); // 赤背景は共通
}

// 確定演出を解除してカードを元の位置へ戻す（オーバーレイは閉じない）
function endConfirmReveal() {
  const hero = document.querySelector(".confirm-hero");
  const first = hero ? hero.getBoundingClientRect() : null;
  const wasHidden = !!hero && hero.style.opacity === "0";
  if (bgShowTimer) { clearTimeout(bgShowTimer); bgShowTimer = null; }
  if (jingleTimer) { clearTimeout(jingleTimer); jingleTimer = null; }
  if (bgVideoEl) {
    try { bgVideoEl.pause(); } catch (e) {}
    bgVideoEl.remove();
    bgVideoEl = null;
  }
  const v = $("confirm-video");
  if (v) { try { v.pause(); } catch (e) {} v.classList.add("hidden"); }
  try { $("soviet-jingle").pause(); } catch (e) {}
  try { $("china-jingle").pause(); } catch (e) {}
  try { $("erika-jingle").pause(); } catch (e) {}
  try { $("kongyo-jingle").pause(); } catch (e) {}
  $("cards-area").classList.remove("confirm-active");
  $("overlay").classList.remove("soviet");
  if (!hero) return;

  hero.classList.remove("confirm-hero");
  hero.style.position = ""; hero.style.left = ""; hero.style.top = "";
  hero.style.width = ""; hero.style.height = ""; hero.style.margin = "";
  hero.style.zIndex = ""; hero.style.transition = ""; hero.style.opacity = "";
  hero.getBoundingClientRect(); // ここでグリッド上の元位置に戻る

  if (first) {
    // FLIP: 今見えている位置（中央）から元の位置へ滑らかにアニメーション
    const last = hero.getBoundingClientRect();
    const dx = first.left - last.left, dy = first.top - last.top;
    const sx = last.width ? (first.width / last.width) : 1;
    const sy = last.height ? (first.height / last.height) : 1;
    hero.style.transformOrigin = "top left";
    hero.style.transform = "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")";
    if (wasHidden) hero.style.opacity = "0";
    hero.getBoundingClientRect();
    hero.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1), opacity .4s ease";
    hero.style.transform = "";
    hero.style.opacity = "1";
    const done = () => {
      hero.style.transition = ""; hero.style.transform = ""; hero.style.transformOrigin = "";
    };
    hero.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 700);
  }
}

function flip(el) {
  if (el.classList.contains("flipped")) { showDetail(el.dataset.id); return; }
  const card = CARD_BY_ID[el.dataset.id];
  el.classList.add("flipped");
  sFlip();
  const isConfirmChar = SOVIET_STAR[card.id] || CHINA_STAR[card.id] || GERMANY_STAR[card.id] || NK_MISS[card.id] || card.r === "SSR";
  if (isConfirmChar && !state.seen[card.id]) {
    // 確定演出は各キャラ初回のみ。見たらstate.seenに記録し、次回から自動スキップ
    el.classList.add("ssr-burst");
    if (!SOVIET_STAR[card.id] && !CHINA_STAR[card.id] && !GERMANY_STAR[card.id] && !NK_STAR[card.id] && !JAPAN_STAR[card.id]) setTimeout(sSSR, 150);
    state.seen[card.id] = 1; save();
    if (!document.querySelector(".confirm-hero")) triggerConfirmReveal(el);
  } else if (isConfirmChar) {
    // 一度見たキャラ: 演出スキップ、バースト＋音のみ
    el.classList.add("ssr-burst");
    if (!SOVIET_STAR[card.id] && !CHINA_STAR[card.id] && !GERMANY_STAR[card.id] && !NK_STAR[card.id] && !JAPAN_STAR[card.id]) setTimeout(sSSR, 150);
  } else if (card.r === "SR") {
    setTimeout(sNew, 100);
  }
  if (el.classList.contains("new-badge") && card.r !== "SR" && !SOVIET_STAR[card.id]) setTimeout(sNew, 80);
}

// ----- 図鑑 -----
let filter = "全て";
function renderFilters() {
  $("filters").innerHTML = TAGS.map(t =>
    '<button class="filter-btn' + (t === filter ? " active" : "") + '" data-tag="' + esc(t) + '">' + esc(t) + "</button>"
  ).join("");
  $("filters").querySelectorAll(".filter-btn").forEach(b => {
    b.onclick = () => { filter = b.dataset.tag; renderFilters(); renderDex(); };
  });
}
function renderDex() {
  const ownedCount = Object.keys(state.owned).length;
  const pct = CARDS.length ? Math.round(ownedCount / CARDS.length * 100) : 0;
  $("progress-bar").style.width = pct + "%";
  $("progress-text").textContent = ownedCount + " / " + CARDS.length + "（" + pct + "%）";
  $("dex-pct").textContent = pct + "%";
  // 完全シークレット国（北朝鮮）は未所持だと図鑑にすら載らない
  const list = CARDS.filter(c => (filter === "全て" || c.t === filter) && (state.owned[c.id] || !SECRET_COUNTRY[countryOf(c.id)]));
  const grid = $("dex-grid");
  grid.innerHTML = list.map(c => {
    const lv = state.owned[c.id] || 0;
    const owned = lv > 0;
    const wc = wikiCache[c.id] || {};
    const thumb = (owned && wc.th)
      ? '<img class="thumb" loading="lazy" src="' + esc(wc.th) + '" alt="">'
      : '<div class="thumbwrap">' + backSVG(countryOf(c.id)) + "</div>";
    return '<div class="dex-card' + (owned ? "" : " locked") + '" data-id="' + c.id + '">' +
      (owned && lv > 1 ? '<span class="lv">Lv' + lv + "</span>" : "") +
      (owned ? '<span class="badge-mini ' + c.r + '">' + c.r + "</span>" : "") +
      thumb +
      '<div class="cname">' + (owned ? esc(c.n) : "？？？") + "</div></div>";
  }).join("");
  grid.querySelectorAll(".dex-card").forEach(el => {
    el.onclick = () => showDetail(el.dataset.id);
  });
  fetchWiki(list.filter(c => state.owned[c.id]).map(c => c.id));
}

function showDetail(id) {
  const c = CARD_BY_ID[id];
  const lv = state.owned[id] || 0;
  const wc = wikiCache[id] || {};
  if (!lv) {
    $("detail-box").innerHTML =
      '<div class="dphotowrap">' + backSVG(countryOf(id)) + "</div>" +
      '<div class="dinfo"><h2>？？？</h2>' +
      '<div class="dmeta">未取得 — ' + esc(c.r) + "／" + esc(c.t) + "／" + esc(countryName(id)) +
      '</div><div class="ddesc">パックを開けてこの人物を手に入れよう。裏面の模様がヒント。</div></div>';
  } else {
    $("detail-box").innerHTML =
      (wc.th ? '<img class="dphoto" src="' + esc(wc.th) + '" alt="">' : '<div class="dphotowrap">' + backSVG(countryOf(id)) + "</div>") +
      '<div class="dinfo"><h2>' + esc(c.n) + "</h2>" +
      '<div class="dmeta">' + c.r + " ／ " + esc(c.t) + " ／ " + esc(countryName(id)) + " ／ Lv" + lv + (lv >= MAX_LV ? "（最大）" : "") + "</div>" +
      '<div class="ddesc">' + esc(c.d) + "</div>" +
      (wc.ex ? '<div class="dextract">' + esc(wc.ex) + "</div>" : "") +
      (wc.t ? '<a class="dlink" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(wc.t) + '" target="_blank" rel="noopener">Wikipediaで読む →</a>' : "") +
      "</div>";
  }
  $("detail").classList.remove("hidden");
}

function renderStats() {
  $("stat-packs").textContent = state.packs;
  $("stat-pity").textContent = Math.max(0, PITY_LIMIT - state.pity);
}

// ----- タブ -----
document.querySelectorAll(".tab").forEach(t => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    $(t.dataset.tab).classList.add("active");
    if (t.dataset.tab === "dex") { renderDex(); fetchWiki(CARDS.map(c => c.id)); }
  };
});

// ----- イベント -----
$("draw1").onclick = () => openPack(1);
$("draw10").onclick = () => openPack(10);
$("draw-ssr1").onclick = () => openPack(1, true);
$("draw-ssr10").onclick = () => openPack(10, true);
$("open-all").onclick = () => document.querySelectorAll("#cards-area .card:not(.flipped)").forEach((el, i) => setTimeout(() => flip(el), i * 130));
$("close-overlay").onclick = () => {
  // 確定演出中/終了後は全部閉じず、まずカードを元の位置に戻す（もう一度押すと閉じる）
  if (document.querySelector(".confirm-hero")) { endConfirmReveal(); return; }
  $("overlay").classList.add("hidden");
  try { $("soviet-jingle").pause(); } catch (e) {}
  try { $("china-jingle").pause(); } catch (e) {}
  try { $("erika-jingle").pause(); } catch (e) {}
  try { $("kongyo-jingle").pause(); } catch (e) {}
  $("overlay").classList.remove("soviet");
  renderDex();
};
$("detail").onclick = () => $("detail").classList.add("hidden");
$("mute").onclick = () => {
  state.muted = !state.muted; save();
  $("mute").textContent = state.muted ? "🔇" : "🔊";
  if (!state.muted) sFlip();
};
$("reset").onclick = () => {
  if (confirm("コレクションとチケットをすべて削除します。よろしいですか？")) {
    localStorage.removeItem(SKEY); location.reload();
  }
};

// ----- 初期化 -----
$("mute").textContent = state.muted ? "🔇" : "🔊";
syncTickets();
renderStats();
renderFilters();
renderDex();
setInterval(() => { syncTickets(); }, 500);
