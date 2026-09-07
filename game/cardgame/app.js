"use strict";
/* ===== 近代史カードパック — 本体 ===== */

// ----- 設定 -----
const RATE = { SSR: 0.03, SR: 0.14, R: 0.33, N: 0.50 };
const TICKET_MAX = 5;
const TICKET_MS = 3 * 60 * 1000; // 3分で1枚
const PITY_LIMIT = 50;           // 50連天井：SSRが出るまでのカウント
const MAX_LV = 5;
const WIKI_TTL = 7 * 24 * 3600 * 1000;

// ----- 状態（localStorage） -----
const SKEY = "mhc_state_v1";
let state = { owned: {}, tickets: TICKET_MAX, lastTs: Date.now(), packs: 0, pity: 0, muted: false };
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
    return !c || !c.ts || (Date.now() - c.ts > WIKI_TTL && !c.tried);
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
        const entry = { ts: Date.now(), tried: true };
        if (p) {
          entry.t = p.title;
          if (p.thumbnail) entry.th = p.thumbnail.source;
          if (p.extract) entry.ex = p.extract.trim();
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
    timer.textContent = "次まで " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  document.getElementById("draw1").disabled = state.tickets < 1;
  document.getElementById("draw10").disabled = state.tickets < 2;
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
function drawOne() {
  let r = rollRarity(state.pity + 1 >= PITY_LIMIT);
  const pool = BY_RARITY[r];
  return pool[Math.floor(Math.random() * pool.length)];
}
function drawPack(n) {
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(drawOne());
  if (n >= 10 && !cards.some(c => c.r === "SSR" || c.r === "SR")) {
    const pool = BY_RARITY.SR;
    cards[n - 1] = pool[Math.floor(Math.random() * pool.length)];
  }
  return cards;
}
function acquire(card) {
  const cur = state.owned[card.id] || 0;
  const isNew = !cur;
  state.owned[card.id] = Math.min(MAX_LV, cur + 1);
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
    '<div class="face back"><div class="q">？</div></div>' +
    '<div class="face front">' +
    '<div class="rarity-badge">' + card.r + "</div>" +
    '<div class="portrait">' + img + "</div>" +
    '<div class="card-name">' + esc(card.n) + "</div>" +
    '<div class="card-tag">' + esc(card.t) + "</div>" +
    "</div></div></div>";
}

let currentDraw = [];
async function openPack(n) {
  const cost = n >= 10 ? 2 : 1;
  if (state.tickets < cost) return;
  state.tickets -= cost;
  state.packs += 1;
  save();
  sPack();
  const pack = document.querySelector(".pack-body");
  pack.classList.remove("shake"); void pack.offsetWidth; pack.classList.add("shake");

  const cards = drawPack(n);
  const results = cards.map(c => ({ card: c, isNew: acquire(c) }));
  const gotSSR = cards.some(c => c.r === "SSR");
  state.pity = gotSSR ? 0 : state.pity + n;
  save();
  currentDraw = results;
  renderTickets(); renderStats();

  // 先にWikipediaから肖像を取得
  $("overlay-title").textContent = n >= 10 ? "10連 結果" : "開封結果";
  const area = $("cards-area");
  area.innerHTML = results.map(r => cardHTML(r.card, r.isNew)).join("");
  $("overlay").classList.remove("hidden");
  await fetchWiki(cards.map(c => c.id));
  // 取得後に描画し直し（めくってないものだけ）
  area.querySelectorAll(".card:not(.flipped)").forEach(el => {
    const r = results.find(x => x.card.id === el.dataset.id);
    if (r) el.outerHTML = cardHTML(r.card, r.isNew);
  });
  bindCards();
}

function bindCards() {
  document.querySelectorAll("#cards-area .card").forEach(el => {
    el.onclick = () => flip(el);
  });
}
function flip(el) {
  if (el.classList.contains("flipped")) return;
  const card = CARD_BY_ID[el.dataset.id];
  el.classList.add("flipped");
  sFlip();
  if (card.r === "SSR") {
    el.classList.add("ssr-burst");
    setTimeout(sSSR, 150);
  } else if (card.r === "SR") {
    setTimeout(sNew, 100);
  }
  if (el.classList.contains("new-badge")) setTimeout(sNew, 80);
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
  const list = CARDS.filter(c => filter === "全て" || c.t === filter);
  const grid = $("dex-grid");
  grid.innerHTML = list.map(c => {
    const lv = state.owned[c.id] || 0;
    const owned = lv > 0;
    const wc = wikiCache[c.id] || {};
    const inner = wc.th
      ? '<img class="thumb" loading="lazy" src="' + esc(wc.th) + '" alt="">'
      : '<img class="thumb" alt="" src="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>') + '">';
    return '<div class="dex-card' + (owned ? "" : " locked") + '" data-id="' + c.id + '">' +
      (owned && lv > 1 ? '<span class="lv">Lv' + lv + "</span>" : "") +
      (owned ? '<span class="badge-mini ' + c.r + '">' + c.r + "</span>" : "") +
      inner +
      '<div class="cname">' + (owned ? esc(c.n) : "？？？") + "</div></div>";
  }).join("");
  grid.querySelectorAll(".dex-card").forEach(el => {
    el.onclick = () => showDetail(el.dataset.id);
  });
  // 未取得でも薄くキャッシュ取得（表示は黒のまま）
  fetchWiki(list.filter(c => state.owned[c.id]).map(c => c.id));
}

function showDetail(id) {
  const c = CARD_BY_ID[id];
  const lv = state.owned[id] || 0;
  const wc = wikiCache[id] || {};
  if (!lv) {
    $("detail-box").innerHTML =
      '<img class="dphoto" alt="" src="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>') + '">' +
      '<div class="dinfo"><h2>？？？</h2><div class="dmeta">未取得 — ' + esc(c.r) + "／" + esc(c.t) +
      '</div><div class="ddesc">パックを開けてこの人物を手に入れよう。</div></div>';
  } else {
    $("detail-box").innerHTML =
      (wc.th ? '<img class="dphoto" src="' + esc(wc.th) + '" alt="">' : "") +
      '<div class="dinfo"><h2>' + esc(c.n) + "</h2>" +
      '<div class="dmeta">' + c.r + " ／ " + esc(c.t) + " ／ Lv" + lv + (lv >= MAX_LV ? "（最大）" : "") + "</div>" +
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
$("open-all").onclick = () => document.querySelectorAll("#cards-area .card:not(.flipped)").forEach((el, i) => setTimeout(() => flip(el), i * 130));
$("close-overlay").onclick = () => { $("overlay").classList.add("hidden"); renderDex(); };
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
setInterval(() => { syncTickets(); }, 1000);
