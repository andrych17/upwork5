/* Trivia board game engine (pure functions, no page code). Works in the browser (window.MeetDoTrivia) and in Node/Deno.
 *
 * One game = one JSON "state" per room. Any number of rooms can run at once, because rooms never share anything.
 * Every change goes through apply(state, action, ctx), which checks the rules and returns a new state.
 * Randomness lives inside the state (state.rng), so the same state + action always gives the same result.
 * That is what lets a server run the game for everyone: clients only send actions.
 *
 * Rules as built (numbers are in DEFAULT_CONFIG):
 *   - 2 to 12 players. Each turn: spin (1 to 6), move that many spaces either way around the ring, answer a question
 *     in the colour of the space you land on. Landing on a "Roll again" space gives another spin and no question.
 *   - Correct on a colour's special space earns that colour's badge. Correct also keeps your turn (keepTurnOnCorrect).
 *   - With all badges, your next question is the final question in the middle. Correct wins; wrong, try again next turn.
 *   - Questions have a 60 second hourglass. The Timer (one player who volunteers) can stop and restart the sand, except on their own
 *     question, and stopped time is capped (maxPauseSeconds) so a game can't stall. Spin and move have a 30 second limit.
 *   - Spin, move and answer each have a time limit. A timed-out step is played automatically. After 2 misses in a
 *     row a player is marked away and skipped until they act again.
 *   - Questions don't repeat in a room until every question in that colour has been used.
 *
 * state = { v, room, phase: "lobby"|"spin"|"move"|"question"|"over", players: [{id,name,pos,badges:[bool],color,misses,away,right,points,asked}],
 *           turn, spin, options, q: {id,cat,order,final,badgeSpace,clock:{total,left,running,since,pausedAt,pausedUsed}}|null, deadline, timekeeper (the volunteer Timer's id or null), themes (category ids for a theme night, or []), lastSpin, spins, used:{cat:[id]}, rng, log:[text], last, winner, turns }
 * The engine never stores which answer is right inside a form a page should read: pages use cardFor() to get the
 * choices in display order, and last (the previous answer's reveal) to show what was right afterwards.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MeetDoTrivia = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_CONFIG = {
    maxPlayers: 12, minPlayers: 2,
    spinnerMax: 6,
    actionSeconds: 30,       // time to spin or to choose a direction
    answerSeconds: 60,       // time to answer a question: the hourglass holds this many seconds
    maxPauseSeconds: 60,     // the Timer can stop the sand, but only this long in total per question; then it runs again
    startRunning: true,      // the sand starts running when a question opens; the Timer can stop and restart it
    keepTurnOnCorrect: true,
    pointsPerRight: 1,       // points for every question answered right
    badgeBonus: 2,           // extra points the first time a player earns each colour's badge
    awayAfterMisses: 2,
    spacesPerColour: 6,      // ring length = colours x this
    logLines: 40
  };
  function cfgOf(o) { var c = {}, k; for (k in DEFAULT_CONFIG) c[k] = DEFAULT_CONFIG[k]; if (o) for (k in o) if (k in DEFAULT_CONFIG) c[k] = o[k]; return c; }

  /* ---------- randomness stored in the state ---------- */
  function rnd(s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    var t = s.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(s, n) { return Math.floor(rnd(s) * n); }
  function hash(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }

  /* ---------- the board ----------
   * A ring. Every 6th space is a colour's badge space, every 6th space starting at 3 is "Roll again",
   * the rest are plain spaces whose colour changes as you go round. */
  function board(nCats, cfg) {
    cfg = cfgOf(cfg); var per = cfg.spacesPerColour, n = nCats * per, out = [], i, r;
    for (i = 0; i < n; i++) {
      r = i % per;
      if (r === 0) out.push({ i: i, type: "badge", cat: i / per });
      else if (r === Math.floor(per / 2)) out.push({ i: i, type: "roll", cat: -1 });
      else out.push({ i: i, type: "plain", cat: (Math.floor(i / per) + r) % nCats });
    }
    return out;
  }

  /* ---------- new room ---------- */
  function newRoom(code, nCats, seed) {
    return { v: 1, room: String(code), phase: "lobby", players: [], turn: 0, spin: null, options: [], q: null, deadline: 0, timekeeper: null, themes: [],
      used: {}, rng: seed == null ? hash(code + ":" + Date.now()) : seed | 0, log: [], last: null, winner: null, turns: 0, nCats: nCats };
  }

  /* ---------- helpers ---------- */
  var COLOURS = 12;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function say(s, cfg, t) { s.log.push(t); if (s.log.length > cfg.logLines) s.log.splice(0, s.log.length - cfg.logLines); }
  function cur(s) { return s.players[s.turn]; }
  function find(s, id) { for (var i = 0; i < s.players.length; i++) if (s.players[i].id === id) return s.players[i]; return null; }
  function cleanName(n) { return String(n == null ? "" : n).replace(/[<>&"]/g, "").replace(/\s+/g, " ").trim().slice(0, 20); }
  function uniqueName(s, n) { var base = n || "Player", k = base, i = 2; while (s.players.some(function (p) { return p.name === k; })) k = base + " " + i++; return k; }
  function err(m) { return { ok: false, error: m }; }

  function drawQuestion(s, bank, cat, final) {
    var qs = bank.questions.filter(function (q) { return q.cat === cat; });
    if (!qs.length) { qs = bank.questions.slice(); cat = qs.length ? qs[0].cat : cat; }
    if (!qs.length) return null;
    var used = s.used[cat] || (s.used[cat] = []);
    var avail = qs.filter(function (q) { return used.indexOf(q.id) < 0; });
    if (!avail.length) { s.used[cat] = used = []; avail = qs; }
    var q = avail[rint(s, avail.length)]; used.push(q.id);
    var order = [], i; for (i = 0; i <= q.wrong.length; i++) order.push(i);
    for (i = order.length - 1; i > 0; i--) { var j = rint(s, i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
    return { id: q.id, cat: cat, order: order, final: !!final };
  }
  function qById(bank, id) { for (var i = 0; i < bank.questions.length; i++) if (bank.questions[i].id === id) return bank.questions[i]; return null; }

  /* Scoreboard. A player's score = points: pointsPerRight for each question answered right, plus badgeBonus for each badge earned.
   * Ranked by score, then by badges, then by accuracy; players level on score and badges share a rank (1, 1, 3).
   * The winner is whoever answers the final question right, so they are not always ranked first: the page marks them separately. */
  function scoreboard(state) {
    var nb = state.players.length ? state.players[0].badges.length : 0;
    var rows = state.players.map(function (p, i) {
      var b = p.badges.filter(Boolean).length;
      return { id: p.id, name: p.name, color: p.color, seat: i + 1, score: p.points || 0, right: p.right, asked: p.asked, badges: b, badgesTotal: nb, accuracy: p.asked ? p.right / p.asked : 0, away: !!p.away };
    });
    rows.sort(function (a, b) { return b.score - a.score || b.badges - a.badges || b.accuracy - a.accuracy || a.seat - b.seat; });
    rows.forEach(function (r, i) { var prev = rows[i - 1]; r.rank = prev && prev.score === r.score && prev.badges === r.badges ? prev.rank : i + 1; });
    return rows;
  }

  /* Theme night: a room can use only some of the categories (state.themes = list of category ids; empty = all).
   * view() returns the bank as that room sees it: just those categories (renumbered) and their questions. */
  function view(state, bank) {
    var ids = state && state.themes && state.themes.length ? state.themes : null; if (!ids) return bank;
    var idx = [], map = {};
    bank.categories.forEach(function (c, i) { if (ids.indexOf(c.id) >= 0) idx.push(i); });
    if (!idx.length) return bank;
    idx.forEach(function (oi, ni) { map[oi] = ni; });
    return { categories: idx.map(function (i) { return bank.categories[i]; }),
      questions: bank.questions.filter(function (q) { return q.cat in map; }).map(function (q) { return { id: q.id, cat: map[q.cat], q: q.q, a: q.a, wrong: q.wrong, note: q.note, source: q.source }; }) };
  }

  /* What a player's screen shows for the open question. It never says which choice is right. */
  function cardFor(s, bank) {
    if (!s.q) return null; bank = view(s, bank); var q = qById(bank, s.q.id); if (!q) return null;
    var all = [q.a].concat(q.wrong), cat = bank.categories[s.q.cat] || { name: "", color: "#888" };
    return { id: q.id, cat: s.q.cat, catName: cat.name, color: cat.color, q: q.q, final: s.q.final, clock: s.q.clock, choices: s.q.order.map(function (k) { return all[k]; }) };
  }

  // Opens a question and its hourglass.
  function openQuestion(s, cfg, now, q) {
    var total = cfg.answerSeconds * 1000;
    var run = !!cfg.startRunning || !find(s, s.timekeeper);   // with no Timer the sand always runs
    q.clock = { total: total, left: total, running: run, since: now, pausedAt: run ? 0 : now, pausedUsed: 0 };
    s.q = q; s.phase = "question";
    s.deadline = run ? now + total : now + cfg.maxPauseSeconds * 1000;
  }
  function nextActive(s, from) {
    var n = s.players.length, i, k;
    for (i = 1; i <= n; i++) { k = (from + i) % n; if (!s.players[k].away) return k; }
    return from;
  }
  function startStep(s, cfg, bank, now) {
    // Begin the current player's next step: the final question if they hold every badge, otherwise a spin.
    var p = cur(s), allBadges = p.badges.length > 0 && p.badges.every(Boolean);
    s.spin = null; s.options = [];
    if (allBadges) {
      var fq = drawQuestion(s, bank, rint(s, s.nCats), true);
      if (!fq) { s.q = null; s.phase = "spin"; s.deadline = now + cfg.actionSeconds * 1000; return; }
      openQuestion(s, cfg, now, fq);
      say(s, cfg, p.name + " has every badge and gets the final question!");
    } else { s.q = null; s.phase = "spin"; s.deadline = now + cfg.actionSeconds * 1000; }
  }
  function endTurn(s, cfg, bank, now) {
    s.turns++; s.q = null;
    s.turn = nextActive(s, s.turn);
    startStep(s, cfg, bank, now);
  }
  function landOn(s, cfg, bank, now, space) {
    var p = cur(s);
    if (space.type === "roll") { say(s, cfg, p.name + " landed on Roll again."); s.phase = "spin"; s.spin = null; s.options = []; s.deadline = now + cfg.actionSeconds * 1000; return; }
    var q = drawQuestion(s, bank, space.cat, false);
    if (!q) { say(s, cfg, "No questions available."); endTurn(s, cfg, bank, now); return; }
    q.badgeSpace = space.type === "badge"; openQuestion(s, cfg, now, q);
    s.options = []; s.spin = null;
  }
  function doSpin(s, cfg, bank, now) {
    var p = cur(s), n = 1 + rint(s, cfg.spinnerMax), S = s.nCats * cfg.spacesPerColour;
    var a = (p.pos + n) % S, b = (p.pos - n + S * 4) % S;
    s.spin = n; s.lastSpin = n; s.spins = (s.spins || 0) + 1; s.options = a === b ? [a] : [a, b];
    say(s, cfg, p.name + " spun a " + n + ".");
    if (s.options.length === 1) doMove(s, cfg, bank, now, s.options[0]);
    else { s.phase = "move"; s.deadline = now + cfg.actionSeconds * 1000; }
  }
  function doMove(s, cfg, bank, now, to) {
    var p = cur(s), b = board(s.nCats, cfg);
    p.pos = to; landOn(s, cfg, bank, now, b[to]);
  }
  function doAnswer(s, cfg, bank, now, displayIndex, timedOut) {
    var p = cur(s), q = s.q, bq = qById(bank, q.id), ok = !timedOut && displayIndex >= 0 && q.order[displayIndex] === 0;
    var all = [bq.a].concat(bq.wrong);
    p.asked++; if (ok) { p.right++; p.points = (p.points || 0) + cfg.pointsPerRight; }
    s.last = { player: p.name, q: bq.q, cat: q.cat, ok: ok, timedOut: !!timedOut, correct: bq.a, chosen: displayIndex >= 0 && !timedOut ? all[q.order[displayIndex]] : null, note: bq.note || "", final: q.final };
    if (timedOut) say(s, cfg, p.name + " ran out of time.");
    else say(s, cfg, p.name + (ok ? " got it right." : " got it wrong."));
    if (q.final) {
      if (ok) { s.phase = "over"; s.winner = p.id; s.q = null; s.deadline = 0; say(s, cfg, p.name + " wins the game!"); return; }
      return endTurn(s, cfg, bank, now);
    }
    if (ok) {
      if (q.badgeSpace && !p.badges[q.cat]) { p.badges[q.cat] = true; p.points = (p.points || 0) + cfg.badgeBonus; say(s, cfg, p.name + " earned the " + ((bank.categories[q.cat] || {}).name || "new") + " badge (+" + cfg.badgeBonus + " bonus)."); }
      if (cfg.keepTurnOnCorrect) { s.q = null; return startStep(s, cfg, bank, now); }
    }
    endTurn(s, cfg, bank, now);
  }
  function miss(s, cfg, p) { p.misses++; if (p.misses >= cfg.awayAfterMisses && !p.away) { p.away = true; say(s, cfg, p.name + " is away and will be skipped."); } }

  /* ---------- the one entry point ----------
   * action = { type, id, ... }. ctx = { bank, now, cfg }. Returns { ok, state } or { ok:false, error }. */
  function apply(state, action, ctx) {
    var s = clone(state), cfg = cfgOf(ctx && ctx.cfg), bank = ctx && ctx.bank, now = (ctx && ctx.now) || Date.now(), p, t = action && action.type;
    if (!bank || !bank.questions || !bank.categories) return err("No question bank.");
    var fullBank = bank; bank = view(s, fullBank);
    if (s.nCats && s.nCats !== bank.categories.length) return err("The question set changed while this room was open. Start a new room.");
    s.nCats = bank.categories.length;

    if (t === "join") {
      p = find(s, action.id);
      if (p) { p.away = false; p.misses = 0; return { ok: true, state: s }; }
      if (s.players.length >= cfg.maxPlayers) return err("This room is full (" + cfg.maxPlayers + " players).");
      var name = uniqueName(s, cleanName(action.name));
      var used = s.players.map(function (x) { return x.color; }), c = 0; while (used.indexOf(c) >= 0 && c < COLOURS) c++;
      s.players.push({ id: action.id, name: name, pos: 0, badges: bank.categories.map(function () { return false; }), color: c % COLOURS, misses: 0, away: false, right: 0, points: 0, asked: 0 });
      say(s, cfg, name + " joined."); return { ok: true, state: s };
    }
    if (t === "leave") {
      var idx = -1; s.players.forEach(function (x, i) { if (x.id === action.id) idx = i; });
      if (idx < 0) return { ok: true, state: s };
      var wasTurn = idx === s.turn, nm = s.players[idx].name;
      s.players.splice(idx, 1); say(s, cfg, nm + " left.");
      if (s.timekeeper === action.id) s.timekeeper = null;
      if (!s.players.length) { s.phase = "lobby"; s.q = null; s.turn = 0; return { ok: true, state: s }; }
      if (idx < s.turn) s.turn--;
      if (s.turn >= s.players.length) s.turn = 0;
      if (s.phase !== "lobby" && s.phase !== "over") {
        if (s.players.length < 2) { s.phase = "over"; s.winner = s.players[0].id; s.q = null; s.deadline = 0; say(s, cfg, "Only one player is left, so " + s.players[0].name + " wins."); }
        else if (wasTurn) { s.turn = (s.turn + s.players.length - 1) % s.players.length; endTurn(s, cfg, bank, now); }
      }
      return { ok: true, state: s };
    }
    if (t === "theme") {
      // Theme night: choose which categories this room plays with. Only before the game starts; any player in the room can set it.
      if (s.phase !== "lobby") return err("The theme can only be changed before the game starts.");
      if (!find(s, action.id)) return err("You are not in this room.");
      var ids = [], all = fullBank.categories;
      if (action.random) {
        var pool = all.map(function (c) { return c.id; }), want = Math.max(1, Math.min(+action.random || 3, pool.length)), k;
        while (ids.length < want) { k = rint(s, pool.length); ids.push(pool.splice(k, 1)[0]); }
      } else (action.cats || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
      for (var i = 0; i < ids.length; i++) {
        var ci = -1; all.forEach(function (c, j) { if (c.id === ids[i]) ci = j; });
        if (ci < 0) return err("Unknown category.");
        if (!fullBank.questions.some(function (q) { return q.cat === ci; })) return err("\"" + all[ci].name + "\" has no questions yet.");
      }
      if (ids.length === all.length) ids = [];
      s.themes = ids; var nb = view(s, fullBank); s.nCats = nb.categories.length; s.used = {};
      s.players.forEach(function (x) { x.badges = nb.categories.map(function () { return false; }); x.pos = 0; });
      say(s, cfg, find(s, action.id).name + " set the theme: " + (ids.length ? nb.categories.map(function (c) { return c.name; }).join(", ") : "all categories") + (action.random ? " (picked at random)." : "."));
      return { ok: true, state: s };
    }
    if (t === "start") {
      if (s.phase !== "lobby") return err("The game has already started.");
      if (!find(s, action.id)) return err("You are not in this room.");
      if (s.players.length < cfg.minPlayers) return err("You need at least " + cfg.minPlayers + " players.");
      s.turn = 0; s.turns = 0; say(s, cfg, "The game has started!"); startStep(s, cfg, bank, now); return { ok: true, state: s };
    }
    if (t === "again") {
      if (s.phase !== "over") return err("The game isn't over.");
      if (!find(s, action.id)) return err("You are not in this room.");
      s.players.forEach(function (x) { x.pos = 0; x.badges = x.badges.map(function () { return false; }); x.misses = 0; x.away = false; x.right = 0; x.points = 0; x.asked = 0; });
      s.phase = "lobby"; s.winner = null; s.last = null; s.q = null; s.turn = 0; s.log = []; return { ok: true, state: s };
    }
    if (t === "timeout") {
      if (s.phase === "lobby" || s.phase === "over") return err("Nothing to time out.");
      if (now < s.deadline) return err("Not yet.");
      if (s.phase === "question" && s.q.clock && !s.q.clock.running) {
        // The stopped-time allowance ran out: the sand starts again (this is not a miss).
        var ck = s.q.clock; ck.pausedUsed += now - ck.pausedAt; ck.running = true; ck.since = now; ck.pausedAt = 0; s.deadline = now + ck.left;
        say(s, cfg, "The sand is running again."); return { ok: true, state: s };
      }
      p = cur(s); miss(s, cfg, p);
      if (s.phase === "question") doAnswer(s, cfg, bank, now, -1, true);
      else if (s.phase === "spin") { say(s, cfg, p.name + " ran out of time, so the spinner went for them."); doSpin(s, cfg, bank, now); if (s.phase === "move") { doMove(s, cfg, bank, now, s.options[rint(s, s.options.length)]); } }
      else if (s.phase === "move") { say(s, cfg, p.name + " ran out of time and was moved."); doMove(s, cfg, bank, now, s.options[rint(s, s.options.length)]); }
      return { ok: true, state: s };
    }

    if (t === "timer") {
      // Anyone can volunteer to be the Timer while nobody is, or while the current Timer is away. The Timer can step down.
      p = find(s, action.id); if (!p) return err("You are not in this room.");
      var tk = find(s, s.timekeeper);
      if (action.on === false) { if (s.timekeeper === action.id) { s.timekeeper = null; say(s, cfg, p.name + " is no longer the Timer."); } return { ok: true, state: s }; }
      if (tk && tk.id !== action.id && !tk.away) return err(tk.name + " is already the Timer.");
      s.timekeeper = action.id; p.away = false; p.misses = 0; say(s, cfg, p.name + " is the Timer."); return { ok: true, state: s };
    }
    if (t === "clock") {
      if (s.phase !== "question" || !s.q || !s.q.clock) return err("There is no question open.");
      if (action.id !== s.timekeeper) return err("Only the Timer can start or stop the sand.");
      if (action.id === cur(s).id) return err("The Timer can't stop the sand on their own question.");
      var c = s.q.clock;
      if (action.run === false) {
        if (!c.running) return { ok: true, state: s };
        var left = Math.max(0, s.deadline - now), allow = cfg.maxPauseSeconds * 1000 - c.pausedUsed;
        if (allow <= 0) return err("The stopped time for this question is used up.");
        if (left <= 0) return err("Time is up.");
        c.left = left; c.running = false; c.pausedAt = now; s.deadline = now + allow; say(s, cfg, find(s, action.id).name + " stopped the sand.");
      } else {
        if (c.running) return { ok: true, state: s };
        c.pausedUsed += Math.max(0, now - c.pausedAt); c.running = true; c.since = now; c.pausedAt = 0; s.deadline = now + c.left; say(s, cfg, find(s, action.id).name + " started the sand.");
      }
      return { ok: true, state: s };
    }

    // Player moves from here on.
    p = find(s, action.id);
    if (!p) return err("You are not in this room.");
    if (s.phase === "lobby" || s.phase === "over") return err("The game isn't running.");
    if (cur(s).id !== action.id) return err("It is " + cur(s).name + "'s turn.");
    p.misses = 0; p.away = false;

    if (t === "spin") { if (s.phase !== "spin") return err("Not time to spin."); doSpin(s, cfg, bank, now); return { ok: true, state: s }; }
    if (t === "move") {
      if (s.phase !== "move") return err("Not time to move.");
      if (s.options.indexOf(action.to) < 0) return err("You can't move there.");
      doMove(s, cfg, bank, now, action.to); return { ok: true, state: s };
    }
    if (t === "answer") {
      if (s.phase !== "question") return err("There is no question open.");
      var ci = +action.choice; if (!(ci >= 0 && ci < s.q.order.length)) return err("Choose one of the answers.");
      doAnswer(s, cfg, bank, now, ci, false); return { ok: true, state: s };
    }
    return err("Unknown action.");
  }

  /* ---------- the question bank ----------
   * bank = { categories: [{id,name,color}], questions: [{id,cat (index),q,a,wrong:[..],note?,source?}] }
   * In files and imports a question's category is written by its id (or name); validateBank turns it into an index. */
  function norm(t) { return String(t == null ? "" : t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

  function parseCsv(text) {
    var rows = [], row = [], cell = "", q = false, i, c;
    text = String(text || "").replace(/^﻿/, "");
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(function (x) { return x.trim() !== ""; })) rows.push(row); row = []; }
      else cell += c;
    }
    row.push(cell); if (row.some(function (x) { return x.trim() !== ""; })) rows.push(row);
    return rows;
  }
  // CSV columns, in this order: category, question, correct, wrong1, wrong2, wrong3, note, source. A first row starting with "category" is a header and is skipped.
  function csvToBank(text, categories) {
    var rows = parseCsv(text), out = { categories: categories || [], questions: [] }, errors = [];
    if (rows.length && /^category$/i.test(rows[0][0].trim())) rows.shift();
    rows.forEach(function (r, n) {
      var wrong = [r[3], r[4], r[5]].map(function (x) { return (x || "").trim(); }).filter(Boolean);
      out.questions.push({ cat: (r[0] || "").trim(), q: (r[1] || "").trim(), a: (r[2] || "").trim(), wrong: wrong, note: (r[6] || "").trim(), source: (r[7] || "").trim(), _row: n + 2 });
    });
    return out;
  }
  function csvOf(bank) {
    var esc = function (t) { t = String(t == null ? "" : t); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    var lines = ["category,question,correct,wrong1,wrong2,wrong3,note,source"];
    bank.questions.forEach(function (q) { lines.push([(bank.categories[q.cat] || {}).id || q.cat, q.q, q.a, q.wrong[0], q.wrong[1], q.wrong[2], q.note, q.source].map(esc).join(",")); });
    return lines.join("\n") + "\n";
  }

  /* Checks a bank (from a file, a paste or a CSV). Returns { ok, errors, warnings, bank (clean, cat as index), counts }. */
  function validateBank(input, fallbackCategories) {
    var errors = [], warnings = [], cats = (input && input.categories && input.categories.length) ? input.categories : (fallbackCategories || []);
    var outCats = [], clean = [], seenIds = {}, seenText = {}, counts = [], i;
    if (!cats.length) errors.push("No categories. Add a \"categories\" list, or import into a bank that already has them.");
    cats.forEach(function (c, k) {
      if (!c || !c.name) { errors.push("Category " + (k + 1) + " has no name."); return; }
      outCats.push({ id: String(c.id || norm(c.name).replace(/ /g, "-")), name: String(c.name).trim(), color: String(c.color || "#888888") });
    });
    if (outCats.length && outCats.length < 2) errors.push("Use at least 2 categories (6 is the usual).");
    if (outCats.length > 12) errors.push("Use 12 categories or fewer.");
    var lookup = {}; outCats.forEach(function (c, k) { lookup[norm(c.id)] = k; lookup[norm(c.name)] = k; counts.push(0); });
    var list = (input && input.questions) || [];
    if (!list.length) errors.push("No questions found.");
    list.forEach(function (q, n) {
      var where = "Question " + (q && q._row ? "(row " + q._row + ")" : (n + 1));
      if (!q || typeof q !== "object") { errors.push(where + " is not a question."); return; }
      var cat = typeof q.cat === "number" ? q.cat : lookup[norm(q.cat)];
      var text = String(q.q || "").trim(), a = String(q.a == null ? (q.correct == null ? "" : q.correct) : q.a).trim();
      var wrong = (q.wrong || []).map(function (x) { return String(x).trim(); }).filter(Boolean);
      if (cat == null || !(cat >= 0 && cat < outCats.length)) { errors.push(where + ": unknown category \"" + q.cat + "\"."); return; }
      if (!text) { errors.push(where + ": the question is empty."); return; }
      if (text.length > 220) warnings.push(where + ": very long question (" + text.length + " characters).");
      if (!a) { errors.push(where + ": no correct answer."); return; }
      if (wrong.length < 2) { errors.push(where + ": needs at least 2 wrong answers."); return; }
      if (wrong.length > 5) { errors.push(where + ": use at most 5 wrong answers."); return; }
      var all = [a].concat(wrong).map(norm);
      if (all.some(function (x, k) { return all.indexOf(x) !== k; })) { errors.push(where + ": two answers are the same."); return; }
      var key = norm(text);
      if (seenText[key]) { warnings.push(where + ": same question text as an earlier one; skipped."); return; }
      seenText[key] = 1;
      var id = String(q.id || "").trim() || (outCats[cat].id + "-" + ("000" + (counts[cat] + 1)).slice(-3));
      while (seenIds[id]) id += "x";
      seenIds[id] = 1; counts[cat]++;
      clean.push({ id: id, cat: cat, q: text, a: a, wrong: wrong, note: String(q.note || "").trim(), source: String(q.source || "").trim() });
    });
    outCats.forEach(function (c, k) { if (counts[k] < 5) warnings.push("\"" + c.name + "\" has only " + counts[k] + " questions. Aim for 30 or more so players don't see repeats."); });
    return { ok: errors.length === 0, errors: errors, warnings: warnings, bank: { categories: outCats, questions: clean }, counts: counts };
  }
  // mode "replace" uses the new bank; "add" keeps the old questions and appends new ones whose text isn't already there.
  function mergeBank(oldBank, newBank, mode) {
    if (mode === "replace" || !oldBank) return newBank;
    var seen = {}, out = { categories: oldBank.categories.map(function (c) { return { id: c.id, name: c.name, color: c.color }; }), questions: oldBank.questions.slice() }, added = 0, skipped = 0;
    out.questions.forEach(function (q) { seen[norm(q.q)] = 1; });
    var ids = {}; out.questions.forEach(function (q) { ids[q.id] = 1; });
    newBank.questions.forEach(function (q) {
      var cid = (newBank.categories[q.cat] || {}).id, k = -1;
      out.categories.forEach(function (c, i) { if (c.id === cid || norm(c.name) === norm((newBank.categories[q.cat] || {}).name)) k = i; });
      if (k < 0) { skipped++; return; }
      if (seen[norm(q.q)]) { skipped++; return; }
      var id = q.id; while (ids[id]) id += "x";
      ids[id] = 1; seen[norm(q.q)] = 1; added++;
      out.questions.push({ id: id, cat: k, q: q.q, a: q.a, wrong: q.wrong.slice(), note: q.note, source: q.source });
    });
    out.added = added; out.skipped = skipped; return out;
  }

  return {
    DEFAULT_CONFIG: DEFAULT_CONFIG, cfgOf: cfgOf, board: board, newRoom: newRoom, apply: apply, cardFor: cardFor, view: view, scoreboard: scoreboard, qById: qById,
    parseCsv: parseCsv, csvToBank: csvToBank, csvOf: csvOf, validateBank: validateBank, mergeBank: mergeBank, norm: norm
  };
});
