/* Draw and Guess: game engine (pure functions, no page code). Works in the browser (window.MeetDoDrawGuess) and in Node/Deno.
 *
 * Same shape as the other games: one JSON "state" per room, every change through apply(state, action, ctx), randomness in state.rng.
 *
 * OBJECT OF THE GAME: one player draws a secret word on their phone while everyone else watches the drawing appear and shouts guesses OUT LOUD.
 * HOW TO WIN: score the most points. The highest total when the session ends wins; ties share the win.
 *
 * How a game goes (numbers are in DEFAULT_CONFIG):
 *   - 2 to 12 players, everyone for themselves. A round = every player draws once, in a random order.
 *   - A turn: the artist is offered 3 words (from 3 different categories) and picks one (or asks for 3 new ones, once). Then the artist draws for
 *     60 seconds. No letters, numbers, talking or gestures from the artist. Everyone else guesses out loud (no typing).
 *   - When somebody says the right answer, the artist taps that player's name. The guesser scores 5 points in the first third of the time,
 *     3 in the second third and 2 in the last third; the artist scores 2 for every player who guesses it.
 *   - The turn ends when everyone has guessed, the artist gives up, or the time runs out; the word is shown for a few seconds.
 *   - After every player has drawn once: a chat break with a conversation prompt, then the next round, but only if the break and a full round
 *     still fit before the 60-minute session ends (state.endsAt). Nobody draws twice in a round, so everyone gets the same number of turns.
 *
 * ctx = { words: {categories:[{name, words:[string]}]}, now, cfg, endsAt }
 * NOTE: state.turn.word is the secret. This prototype shares the whole state; the server version must send each player viewFor(state, id).
 *
 * state = { v, room, phase: "lobby"|"choose"|"draw"|"reveal"|"break"|"over", players:[{id,name,score,gain}], round, order:[playerId], idx,
 *           turn: {artist, options:[{w,cat}], rerolled, word, cat, start, guessed:[{id,pts}], strokes:[stroke], live:stroke|null, note} | null,
 *           brk, usedWords, usedPrompts, deadline, rng, log, created, endsAt, winners }
 * stroke = { c: colour index 0..5, or 6 for the eraser, w: width index 0..2, p: [x1,y1,x2,y2,...] } with x,y whole numbers 0..1000 (a 1000 x 1000 canvas).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MeetDoDrawGuess = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_CONFIG = {
    maxPlayers: 12, minPlayers: 2,       // 2 to 12 players (house rule for every game)
    chooseSeconds: 12,      // the artist picks a word (a random one is chosen when time runs out)
    drawSeconds: 60,        // drawing and guessing
    revealSeconds: 8,       // the word and the points are shown
    breakSeconds: 60,       // chat break after every round (0 = no break)
    pointsFast: 5, pointsMid: 3, pointsSlow: 2,   // for the guesser: first, second, last third of the drawing time
    artistPoints: 2,        // for the artist, per player who guesses it
    rounds: 0,              // 0 = keep playing rounds while a break and a full round fit in the session; a number caps the rounds
    maxStrokes: 300, maxPoints: 800,
    sessionMinutes: 60,
    logLines: 40
  };
  var COLORS = ["#111111", "#E4002B", "#0057E7", "#00A651", "#FF7A00", "#7B2CBF", "#FFFFFF"];   // index 6 is the ERASER (white, drawn over the picture; Undo takes it back like any line)
  var ERASER = 6;
  var BREAK_PROMPTS = [
    "What is the best thing you ate this week?",
    "What is a small thing that made you smile today?",
    "If you could have any view out your window, what would it be?",
    "What was your first job?",
    "What is something you are looking forward to?",
    "What is a skill you wish you could learn in a weekend?",
    "What is your favorite way to spend a rainy afternoon?",
    "Where is the best place you have ever been for a walk?",
    "What song instantly cheers you up?",
    "What is the most useful thing you own?",
    "What is a tradition from your family that you love?",
    "If you had a free day tomorrow, what would you do?",
    "What is the nicest thing someone did for you recently?",
    "What hobby would you try if you had unlimited time?",
    "What is your go-to comfort meal?",
    "What did you want to be when you were ten?",
    "What is your favorite smell?",
    "What is the best gift you have ever given?",
    "What is a movie you can watch again and again?",
    "What is your favorite season, and why?",
    "What is the best sandwich you have ever had?",
    "Who taught you to cook, or who do you wish had?",
    "What is a place you would love to visit someday?",
    "What is the best weather for you?",
    "What is your favorite childhood game?",
    "What is a book you would hand to a friend?",
    "What is one thing you are good at that surprises people?",
    "What is your favorite sound?",
    "What is the best day trip you have taken?",
    "What is a food you did not like as a kid but love now?",
    "If you could live in any decade, which would you pick?",
    "What is your favorite thing about where you live?",
    "What is the best compliment you have ever received?",
    "What is a small luxury you enjoy?",
    "What is your favorite way to start the morning?",
    "What is a song you know every word to?",
    "What is the best breakfast in the world?",
    "If you could have dinner with anyone from history, who would it be?",
    "What is your favorite board game or card game?",
    "What is something you collect, or used to collect?",
    "What is the best advice you have ever been given?",
    "What is a place that feels like home to you?",
    "What is the most interesting thing you have learned lately?",
    "If you could master any instrument, which would it be?",
    "What is your favorite holiday, and how do you celebrate it?",
    "What is your favorite kind of weather for a walk?",
    "What is a skill you picked up from a parent or grandparent?",
    "What is the best snack for a road trip?",
    "What is your favorite thing to do on a weekend?",
    "What is a TV show you could talk about for hours?",
    "What is the funniest thing you have seen an animal do?",
    "What is a smell that takes you back to childhood?",
    "If you could instantly speak another language, which one?",
    "What is your favorite local spot?",
    "What is something you made with your own hands that you are proud of?",
    "What is the best sunset or sunrise you have ever seen?",
    "What is your favorite kind of pie or cake?",
    "What is a small adventure you would like to have this month?",
    "What is your favorite thing to do outdoors?",
    "If you could add one holiday to the calendar, what would it celebrate?",
    "What is the best bargain you have ever found?",
    "What is a hobby a friend of yours has that you admire?",
    "What is your favorite soup?",
    "What is the best surprise you have ever had?",
    "What is a place you would go back to in a heartbeat?",
    "What is your favorite way to celebrate a birthday?",
    "What would your perfect picnic look like?",
    "What is something you are curious about right now?",
    "What is the best thing about being the age you are?",
    "What is a favorite memory from a school day?",
    "What is something that always makes you laugh?",
    "What game did you play outside as a kid?",
    "What is your dream vacation, with no limits?",
    "What is a gadget you could not live without?",
    "What is the most beautiful place you have seen?",
    "What is a favorite family recipe?",
    "What is something you would like to get better at?",
    "What is the best part of your daily routine?",
    "What was the best class you ever took?",
    "What is a favorite word, and why?",
    "What is something you recently tried for the first time?",
    "If you could be great at any sport, which one?",
    "What is your favorite kind of music to cook to?",
    "What do you like to do when you have a few quiet minutes?",
    "What is the best present you ever received?",
    "What is a place you can always make time for?",
    "What is your favorite story from your own life to tell?",
    "If you opened a small shop, what would it sell?",
    "What is one thing that makes a good friend?",
    "What is your favorite kind of tea, juice or coffee?",
    "What is the best neighborhood or street you have ever walked down?",
    "What invention do you think everyone should have?",
    "What would you name a boat?",
    "What is the best joke you know?",
    "What is a small kindness you want to pass along?",
    "What is your favorite thing about the people in this room?",
    "If you could swap lives for a day with anyone you know, who?",
    "What is the best thing you have ever grown, baked or built?",
    "What is a color you love, and why?",
    "What is something you have always wanted to try?",
    "What is your favorite time of day?",
    "What is the coziest place you have ever been?",
    "What is something on your wish list for this year?"
  ];

  function cfgOf(o) { var c = {}, k; for (k in DEFAULT_CONFIG) c[k] = DEFAULT_CONFIG[k]; if (o) for (k in o) if (k in DEFAULT_CONFIG) c[k] = o[k]; return c; }
  function hash(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
  function rnd(s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    var t = s.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(s, n) { return Math.floor(rnd(s) * n); }
  function shuffle(s, a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rint(s, i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function say(s, cfg, t) { s.log.push(t); if (s.log.length > cfg.logLines) s.log.splice(0, s.log.length - cfg.logLines); }
  function find(s, id) { for (var i = 0; i < s.players.length; i++) if (s.players[i].id === id) return s.players[i]; return null; }
  function err(m) { return { ok: false, error: m }; }
  function cleanName(n) { return String(n == null ? "" : n).replace(/[<>&"]/g, "").replace(/\s+/g, " ").trim().slice(0, 20); }
  function uniqueName(s, n) { var base = n || "Player", k = base, i = 2; while (s.players.some(function (p) { return p.name === k; })) k = base + " " + i++; return k; }

  function newRoom(code, seed) {
    return { v: 1, room: String(code), phase: "lobby", players: [], round: 0, order: [], idx: 0, turn: null, brk: null,
      usedWords: [], usedPrompts: [], deadline: 0, rng: seed == null ? hash(code + ":" + Date.now()) : seed | 0,
      log: [], created: Date.now(), endsAt: 0, winners: [] };
  }

  /* The scoreboard: highest score first; players level on score share a rank. "gain" is what they earned on the latest turn. */
  function scoreboard(s) {
    var rows = s.players.map(function (p) { return { id: p.id, name: p.name, score: p.score || 0, gain: p.gain || 0 }; });
    rows.sort(function (a, b) { return b.score - a.score || (a.name < b.name ? -1 : 1); });
    rows.forEach(function (r, i) { var prev = rows[i - 1]; r.rank = prev && prev.score === r.score ? prev.rank : i + 1; });
    return rows;
  }

  /* What one player may see: only the artist (and everyone, once the turn is over) sees the secret word and the options. */
  function viewFor(s, id) {
    var v = clone(s);
    if (v.turn && !(v.turn.artist === id || s.phase === "reveal" || s.phase === "break" || s.phase === "over")) { v.turn.word = v.turn.word ? "?" : null; v.turn.options = []; v.turn.cat = null; }
    return v;
  }

  function roundMs(s, cfg) { return s.players.length * (cfg.chooseSeconds + cfg.drawSeconds + cfg.revealSeconds) * 1000; }
  function roomForRound(s, cfg, now, extraSeconds) { return !s.endsAt || now + (extraSeconds || 0) * 1000 + roundMs(s, cfg) <= s.endsAt; }
  function canContinue(s, cfg, now) { return !(s.rounds && s.round >= s.rounds) && roomForRound(s, cfg, now, cfg.breakSeconds); }

  /* Offer 3 words from 3 different categories; words don't repeat until they have all been used. */
  function offer(s, words) {
    var cats = words.categories.filter(function (c) { return c.words.length; });
    var free = function (c) { return c.words.filter(function (w) { return s.usedWords.indexOf(w) < 0; }); };
    if (cats.filter(function (c) { return free(c).length; }).length < 3) s.usedWords = [];
    var pick = shuffle(s, cats.filter(function (c) { return free(c).length; })).slice(0, 3), out = [];
    pick.forEach(function (c) { var f = free(c); var w = f[rint(s, f.length)]; out.push({ w: w, cat: c.name }); });
    out.forEach(function (o) { s.usedWords.push(o.w); });
    return out;
  }

  function startRound(s, cfg, words, now) {
    s.round++; s.order = shuffle(s, s.players.map(function (p) { return p.id; })); s.idx = -1; s.brk = null;
    say(s, cfg, "Round " + s.round + " begins. Everyone draws once.");
    nextTurn(s, cfg, words, now);
  }
  function nextTurn(s, cfg, words, now) {
    s.idx++;
    while (s.idx < s.order.length && !find(s, s.order[s.idx])) s.idx++;
    if (s.idx >= s.order.length) return endRound(s, cfg, words, now);
    var a = find(s, s.order[s.idx]);
    s.players.forEach(function (p) { p.gain = 0; });
    s.turn = { artist: a.id, options: offer(s, words), rerolled: false, word: null, cat: null, start: 0, guessed: [], strokes: [], live: null, note: "" };
    s.phase = "choose"; s.deadline = now + cfg.chooseSeconds * 1000;
    say(s, cfg, a.name + " is the artist and is choosing a word.");
  }
  function chooseWord(s, cfg, i, now) {
    var t = s.turn, o = t.options[i]; t.word = o.w; t.cat = o.cat; t.start = now; t.options = [o];
    s.phase = "draw"; s.deadline = now + cfg.drawSeconds * 1000; say(s, cfg, find(s, t.artist).name + " is drawing. Guess out loud!");
  }
  function endTurn(s, cfg, now, note) {
    var t = s.turn; t.note = note || ""; t.live = null; s.phase = "reveal"; s.deadline = now + cfg.revealSeconds * 1000;
    say(s, cfg, "The word was " + (t.word || "(not chosen)") + ". " + (t.guessed.length ? t.guessed.length + " guessed it." : "Nobody guessed it."));
  }
  function endRound(s, cfg, words, now) {
    s.turn = null;
    if (s.rounds && s.round >= s.rounds) return finish(s, cfg, "That was the last round.");
    if (!roomForRound(s, cfg, now, cfg.breakSeconds)) return finish(s, cfg, "There isn't enough time left for another full round.");
    if (cfg.breakSeconds > 0) return startBreak(s, cfg, now);
    startRound(s, cfg, words, now);
  }
  function startBreak(s, cfg, now) {
    var all = BREAK_PROMPTS.map(function (x, i) { return i; }), fresh = all.filter(function (i) { return s.usedPrompts.indexOf(i) < 0; });
    if (!fresh.length) { s.usedPrompts = []; fresh = all; }
    var k = fresh[rint(s, fresh.length)]; s.usedPrompts.push(k);
    s.phase = "break"; s.brk = { prompt: BREAK_PROMPTS[k] }; s.deadline = now + cfg.breakSeconds * 1000; say(s, cfg, "Chat break: " + BREAK_PROMPTS[k]);
  }
  function finish(s, cfg, why) {
    var best = -1; s.players.forEach(function (p) { if ((p.score || 0) > best) best = p.score || 0; });
    s.winners = s.players.filter(function (p) { return (p.score || 0) === best; }).map(function (p) { return p.id; });
    s.phase = "over"; s.deadline = 0; s.turn = null; s.brk = null;
    say(s, cfg, why + " Game over. " + (s.winners.length > 1 ? "Tie for the win: " : "Winner: ") + s.winners.map(function (id) { return find(s, id).name; }).join(" and ") + " with " + best + ".");
  }
  function validStroke(st, cfg) {
    if (!st || typeof st !== "object") return null;
    var c = +st.c, w = +st.w, p = st.p;
    if (!(c >= 0 && c < COLORS.length) || c !== Math.floor(c) || !(w >= 0 && w <= 2) || w !== Math.floor(w) || !Array.isArray(p) || p.length < 2 || p.length % 2 || p.length > cfg.maxPoints * 2) return null;
    var q = []; for (var i = 0; i < p.length; i++) { var n = Math.round(+p[i]); if (!(n >= 0 && n <= 1000)) return null; q.push(n); }
    return { c: c, w: w, p: q };
  }

  function apply(state, action, ctx) {
    var s = clone(state), cfg = cfgOf(ctx && ctx.cfg), words = (ctx && ctx.words) || null, now = (ctx && ctx.now != null) ? ctx.now : Date.now(), t = action && action.type, p, i;
    if (!action || typeof t !== "string") return err("No action.");
    if (!words || !words.categories || words.categories.filter(function (c) { return c.words && c.words.length; }).length < 3) return err("There are not enough words to play.");
    if (s.endsAt && s.phase !== "lobby" && s.phase !== "over" && now >= s.endsAt) { finish(s, cfg, "The " + cfg.sessionMinutes + "-minute session is over."); if (t === "timeout" || t === "nextround") return { ok: true, state: s }; }

    if (t === "join") {
      p = find(s, action.id); if (p) return { ok: true, state: s };
      if (s.players.length >= cfg.maxPlayers) return err("This room is full (" + cfg.maxPlayers + " players).");
      var name = uniqueName(s, cleanName(action.name)); s.players.push({ id: action.id, name: name, score: 0, gain: 0 }); say(s, cfg, name + " joined.");
      return { ok: true, state: s };
    }
    if (t === "leave") {
      var idx = -1; s.players.forEach(function (x, k) { if (x.id === action.id) idx = k; });
      if (idx < 0) return { ok: true, state: s };
      var gone = s.players[idx]; s.players.splice(idx, 1); say(s, cfg, gone.name + " left.");
      if (!s.players.length) { s.phase = "lobby"; return { ok: true, state: s }; }
      if (s.phase !== "lobby" && s.phase !== "over") {
        if (s.players.length < cfg.minPlayers) { finish(s, cfg, "Fewer than " + cfg.minPlayers + " players are left."); return { ok: true, state: s }; }
        if ((s.phase === "choose" || s.phase === "draw") && s.turn.artist === gone.id) { s.turn.word = s.turn.word || "(not chosen)"; endTurn(s, cfg, now, "The artist left."); }
        else if (s.phase === "draw") { s.turn.guessed = s.turn.guessed.filter(function (g) { return g.id !== gone.id; }); if (allGuessed(s)) endTurn(s, cfg, now, "Everyone got it!"); }
      }
      return { ok: true, state: s };
    }
    if (t === "start") {
      if (s.phase !== "lobby") return err("The game has already started.");
      if (!find(s, action.id)) return err("You are not in this room.");
      if (s.players.length < cfg.minPlayers) return err("You need at least " + cfg.minPlayers + " players.");
      s.players.forEach(function (x) { x.score = 0; x.gain = 0; }); s.round = 0; s.winners = []; s.usedWords = [];
      s.endsAt = (ctx && ctx.endsAt) || ((s.created || now) + cfg.sessionMinutes * 60000);
      if (now >= s.endsAt) return err("The " + cfg.sessionMinutes + "-minute session is over.");
      if (!roomForRound(s, cfg, now)) return err("There isn't enough time left in the session for a full round.");
      say(s, cfg, "The game has started! " + s.players.length + " players.");
      startRound(s, cfg, words, now); return { ok: true, state: s };
    }
    if (t === "again") {
      if (s.phase !== "over") return err("The game isn't over.");
      if (!find(s, action.id)) return err("You are not in this room.");
      s.phase = "lobby"; s.round = 0; s.order = []; s.idx = 0; s.turn = null; s.brk = null; s.winners = []; s.endsAt = 0; s.created = now;
      s.players.forEach(function (x) { x.score = 0; x.gain = 0; }); say(s, cfg, "Back in the lobby for another game."); return { ok: true, state: s };
    }
    p = find(s, action.id);
    if (t === "timeout") {
      if (s.phase === "choose") { chooseWord(s, cfg, rint(s, s.turn.options.length), now); }
      else if (s.phase === "draw") { if (now >= s.deadline) endTurn(s, cfg, now, "Time's up!"); }
      else if (s.phase === "reveal") { if (now >= s.deadline) nextTurn(s, cfg, words, now); }
      else if (s.phase === "break") { if (now >= s.deadline) startRound(s, cfg, words, now); }
      return { ok: true, state: s };
    }
    if (!p) return err("You are not in this room.");
    if (t === "nextround") {
      if (s.phase !== "break") return err("There is no break to end.");
      startRound(s, cfg, words, now); return { ok: true, state: s };
    }
    if (t === "choose" || t === "reroll") {
      if (s.phase !== "choose") return err("It isn't time to choose a word.");
      if (s.turn.artist !== p.id) return err("Only the artist chooses the word.");
      if (t === "reroll") { if (s.turn.rerolled) return err("You can only ask for new words once."); s.turn.rerolled = true; s.turn.options = offer(s, words); return { ok: true, state: s }; }
      i = +action.i; if (!(i >= 0 && i < s.turn.options.length) || i !== Math.floor(i)) return err("Unknown word.");
      chooseWord(s, cfg, i, now); return { ok: true, state: s };
    }
    if (t === "stroke" || t === "live" || t === "undo" || t === "clear") {
      if (s.phase !== "draw") return err("It isn't time to draw.");
      if (s.turn.artist !== p.id) return err("Only the artist draws.");
      if (t === "undo") { s.turn.strokes.pop(); s.turn.live = null; return { ok: true, state: s }; }
      if (t === "clear") { s.turn.strokes = []; s.turn.live = null; return { ok: true, state: s }; }
      var st = validStroke(action.stroke, cfg); if (!st) return err("That drawing line isn't valid.");
      if (t === "live") { s.turn.live = st; return { ok: true, state: s }; }
      if (s.turn.strokes.length >= cfg.maxStrokes) return err("That is plenty of lines for one drawing.");
      s.turn.strokes.push(st); s.turn.live = null; return { ok: true, state: s };
    }
    if (t === "guessed") {
      if (s.phase !== "draw") return err("It isn't time to award a guess.");
      if (s.turn.artist !== p.id) return err("Only the artist awards a correct guess.");
      var g = find(s, action.who); if (!g) return err("That player isn't in the room.");
      if (g.id === p.id) return err("The artist can't guess their own drawing.");
      if (s.turn.guessed.some(function (x) { return x.id === g.id; })) return err(g.name + " has already guessed it.");
      var el = now - s.turn.start, third = cfg.drawSeconds * 1000 / 3, pts = el < third ? cfg.pointsFast : el < 2 * third ? cfg.pointsMid : cfg.pointsSlow;
      s.turn.guessed.push({ id: g.id, pts: pts }); g.score = (g.score || 0) + pts; g.gain = (g.gain || 0) + pts; p.score = (p.score || 0) + cfg.artistPoints; p.gain = (p.gain || 0) + cfg.artistPoints;
      say(s, cfg, g.name + " guessed it! +" + pts + " (and +" + cfg.artistPoints + " for " + p.name + ").");
      if (allGuessed(s)) endTurn(s, cfg, now, "Everyone got it!");
      return { ok: true, state: s };
    }
    if (t === "giveup") {
      if (s.phase !== "draw") return err("There is nothing to give up on.");
      if (s.turn.artist !== p.id) return err("Only the artist can end the turn.");
      endTurn(s, cfg, now, "The artist ended the turn."); return { ok: true, state: s };
    }
    return err("Unknown action: " + t);
  }
  function allGuessed(s) { var n = s.players.length - 1; return n > 0 && s.turn.guessed.length >= n; }

  return { DEFAULT_CONFIG: DEFAULT_CONFIG, COLORS: COLORS, ERASER: ERASER, BREAK_PROMPTS: BREAK_PROMPTS, cfgOf: cfgOf, newRoom: newRoom, apply: apply, scoreboard: scoreboard, viewFor: viewFor, roundMs: roundMs, roomForRound: roomForRound, canContinue: canContinue };
});
