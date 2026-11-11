/* Guess Who's Story: individual party game engine (pure functions, no page code). Works in the browser (window.MeetDoGuessWhosStory) and in Node/Deno.
 *
 * One game = one JSON "state" per room. Every change goes through apply(state, action, ctx). Randomness lives in state.rng.
 * Everything is talked over out loud in the one video room. Nothing is typed: players tap Yes or No, then tap a name.
 *
 * How a game goes (numbers are in DEFAULT_CONFIG):
 *   - 2 to 12 players, everyone for themselves. Rounds are 6 prompts long.
 *   - A prompt: a question about you ("Have you ever ridden a horse?") is shown. Everyone SECRETLY taps Yes or No (8 s).
 *   - 3 or more players ("who" mode): the game picks ONE person who said Yes, the MYSTERY PERSON (people who have been picked least go first).
 *     Everyone sees how many people said Yes, and talks it over out loud for 40 s. The mystery person stays cool. Then everyone else taps
 *     who they think it is (12 s). Right guess = 3 points. The mystery person gets 1 point for being picked, plus 1 for every wrong guess (up to 5).
 *     Then the STORY: the mystery person tells the story behind the Yes out loud (30 s, anyone can tap Next to move on).
 *   - Exactly 2 players ("spot" mode): both tap Yes or No in secret, talk, then each taps what they think the OTHER one answered.
 *     A right guess is 3 points; each of you also gets 1 point if the other guess wrong. Then you both share the story.
 *   - If nobody says Yes in "who" mode, the prompt is skipped quickly.
 *   - After 6 prompts: round results (15 s), a 60-second CHAT BREAK with a conversation prompt, then the next round, while a full round still
 *     fits before the 60-minute session ends (state.endsAt). A prompt in progress when time runs out is not scored.
 *   - Highest score wins; players level on top score win together.
 *
 * Secrets: cur.yes (everyone's answers), cur.mystery and cur.votes. A real server must send each client viewFor(state, playerId), which hides them
 * until the reveal (you still see your own answer, and the mystery person is told they were picked).
 *
 * state = { v, room, phase: "lobby"|"answer"|"talk"|"vote"|"reveal"|"results"|"break"|"over", players:[{id,name,score,myst}], round, rounds, n,
 *           cur: {c,p,cat,text,mode,part:[ids],yes:{id:bool},yesCount,mystery,votes:{id:target},result|null} | null,
 *           roundPts:{id:points}, history:[{round,pts:{id:points}}], used:["c.p"], lastCat, brk, usedPrompts, deadline, rng, log, created, endsAt, winners, scored }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MeetDoGuessWhosStory = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_CONFIG = {
    maxPlayers: 12, minPlayers: 2,
    promptsPerRound: 6, rounds: 0,
    answerSeconds: 8, talkSeconds: 40, voteSeconds: 12, revealSeconds: 30,
    resultsSeconds: 15, breakSeconds: 60, sessionMinutes: 60,
    correctPoints: 3, storyPoints: 1, foolPoints: 1, foolCap: 5,
    logLines: 40
  };
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
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function say(s, cfg, t) { s.log.push(t); if (s.log.length > cfg.logLines) s.log.splice(0, s.log.length - cfg.logLines); }
  function find(s, id) { for (var i = 0; i < s.players.length; i++) if (s.players[i].id === id) return s.players[i]; return null; }
  function err(m) { return { ok: false, error: m }; }
  function cleanName(n) { return String(n == null ? "" : n).replace(/[<>&"]/g, "").replace(/\s+/g, " ").trim().slice(0, 20); }
  function uniqueName(s, n) { var base = n || "Player", k = base, i = 2; while (s.players.some(function (p) { return p.name === k; })) k = base + " " + i++; return k; }

  function newRoom(code, seed) {
    return { v: 1, room: String(code), phase: "lobby", players: [], round: 0, rounds: 0, n: 0, cur: null, roundPts: {}, history: [], used: [], lastCat: -1,
      brk: null, usedPrompts: [], deadline: 0, rng: seed == null ? hash(code + ":" + Date.now()) : seed | 0, log: [], created: Date.now(), endsAt: 0, winners: [], scored: false };
  }
  function scoreboard(s) {
    var rows = s.players.map(function (p) { return { id: p.id, name: p.name, score: p.score || 0, picked: p.myst || 0 }; });
    rows.sort(function (a, b) { return b.score - a.score || (a.name < b.name ? -1 : 1); });
    rows.forEach(function (r, i) { var prev = rows[i - 1]; r.rank = prev && prev.score === r.score ? prev.rank : i + 1; });
    return rows;
  }
  /* What one player may see. Answers, the mystery person and votes stay hidden until the reveal. */
  function viewFor(state, id) {
    var v = clone(state), c = v.cur;
    if (c && !c.result && (v.phase === "answer" || v.phase === "talk" || v.phase === "vote")) {
      var mine = c.yes[id], mv = c.votes[id];
      c.yes = {}; if (mine != null) c.yes[id] = mine;
      c.votes = {}; if (mv != null) c.votes[id] = mv;
      c.isMystery = c.mystery === id; if (c.mystery !== id) c.mystery = null;
    }
    return v;
  }
  function voters(s) {
    var c = s.cur; if (!c) return [];
    return c.part.filter(function (id) { return c.mode === "spot" || id !== c.mystery; });
  }

  /* ---------- timing ---------- */
  function promptMs(cfg) { return (cfg.answerSeconds + cfg.talkSeconds + cfg.voteSeconds + cfg.revealSeconds) * 1000; }
  function roundMs(s, cfg) { return cfg.promptsPerRound * promptMs(cfg) + cfg.resultsSeconds * 1000; }
  function roomForRound(s, cfg, now, extraSeconds) { return !s.endsAt || now + (extraSeconds || 0) * 1000 + roundMs(s, cfg) <= s.endsAt; }
  function canContinue(s, cfg, now) { return !(s.rounds && s.round >= s.rounds) && roomForRound(s, cfg, now, cfg.breakSeconds); }

  /* ---------- steps ---------- */
  function pickPrompt(s, data) {
    var avail = [], all = [], c, p;
    for (c = 0; c < data.categories.length; c++) for (p = 0; p < data.categories[c].prompts.length; p++) { all.push([c, p]); if (s.used.indexOf(c + "." + p) < 0) avail.push([c, p]); }
    if (!avail.length) { s.used = []; avail = all; }
    var other = avail.filter(function (x) { return x[0] !== s.lastCat; }); if (other.length) avail = other;
    var pick = avail[rint(s, avail.length)]; s.used.push(pick[0] + "." + pick[1]); s.lastCat = pick[0];
    return pick;
  }
  function startRound(s, cfg, data, now) {
    s.round++; s.n = 0; s.roundPts = {}; s.brk = null;
    say(s, cfg, "Round " + s.round + (s.rounds ? " of " + s.rounds : "") + " begins.");
    startPrompt(s, cfg, data, now);
  }
  function startPrompt(s, cfg, data, now) {
    if (s.players.length < 2) return finish(s, cfg, "Fewer than two players are left.");
    s.n++;
    var pk = pickPrompt(s, data), cat = data.categories[pk[0]];
    s.cur = { c: pk[0], p: pk[1], cat: cat.name, text: cat.prompts[pk[1]], mode: s.players.length >= 3 ? "who" : "spot", part: s.players.map(function (x) { return x.id; }), yes: {}, yesCount: null, mystery: null, votes: {}, result: null };
    s.phase = "answer"; s.deadline = now + cfg.answerSeconds * 1000;
  }
  function nextPrompt(s, cfg, data, now) {
    s.cur = null;
    if (s.n >= cfg.promptsPerRound) return endRound(s, cfg, now);
    startPrompt(s, cfg, data, now);
  }
  function resolveAnswers(s, cfg, data, now) {
    var c = s.cur, yes = [];
    c.part.forEach(function (id) { if (c.yes[id] == null) c.yes[id] = false; if (c.yes[id]) yes.push(id); });
    c.yesCount = yes.length;
    if (c.mode === "who") {
      if (!yes.length) { say(s, cfg, "Nobody said yes to that one, so on to the next."); return nextPrompt(s, cfg, data, now); }
      var least = 1e9; yes.forEach(function (id) { var m = find(s, id).myst || 0; if (m < least) least = m; });
      var pool = yes.filter(function (id) { return (find(s, id).myst || 0) === least; });
      c.mystery = pool[rint(s, pool.length)]; find(s, c.mystery).myst = (find(s, c.mystery).myst || 0) + 1;
      say(s, cfg, c.yesCount + " of " + c.part.length + " players said yes. Who is the mystery person?");
    } else say(s, cfg, "Both players have answered. Time to talk!");
    s.phase = "talk"; s.deadline = now + cfg.talkSeconds * 1000;
  }
  function toVote(s, cfg, now) { s.phase = "vote"; s.deadline = now + cfg.voteSeconds * 1000; }
  function award(s, id, pts) { var p = find(s, id); if (!p || !pts) return; p.score = (p.score || 0) + pts; s.roundPts[id] = (s.roundPts[id] || 0) + pts; s.scored = true; }
  function resolveVotes(s, cfg, now) {
    var c = s.cur, pts = {}, right = [], wrong = [], none = [], vs = voters(s);
    function add(id, n) { pts[id] = (pts[id] || 0) + n; }
    if (c.mode === "who") {
      vs.forEach(function (id) { var t = c.votes[id]; if (t == null) none.push(id); else if (t === c.mystery) { right.push(id); add(id, cfg.correctPoints); } else wrong.push(id); });
      add(c.mystery, cfg.storyPoints + Math.min(cfg.foolCap, wrong.length));
    } else {
      vs.forEach(function (id) {
        var other = c.part.filter(function (x) { return x !== id; })[0], t = c.votes[id];
        if (t == null) { none.push(id); return; }
        if ((t === "y") === !!c.yes[other]) { right.push(id); add(id, cfg.correctPoints); } else { wrong.push(id); add(other, cfg.foolPoints); }
      });
    }
    Object.keys(pts).forEach(function (id) { award(s, id, pts[id]); });
    c.result = { mystery: c.mystery, right: right, wrong: wrong, none: none, pts: pts, yes: clone(c.yes), votes: clone(c.votes) };
    if (c.mode === "who") say(s, cfg, find(s, c.mystery).name + " was the mystery person. " + right.length + " guessed right.");
    else say(s, cfg, "Guesses are in: " + right.length + " right.");
    s.phase = "reveal"; s.deadline = now + cfg.revealSeconds * 1000;
  }
  function endRound(s, cfg, now) {
    var names = {}; s.players.forEach(function (p) { names[p.id] = p.name; });
    s.history.push({ round: s.round, pts: clone(s.roundPts), names: names });
    s.phase = "results"; s.deadline = now + cfg.resultsSeconds * 1000; say(s, cfg, "Round " + s.round + " results are in.");
  }
  function afterResults(s, cfg, data, now) {
    if (s.rounds && s.round >= s.rounds) return finish(s, cfg, "That was the last round.");
    if (!roomForRound(s, cfg, now, cfg.breakSeconds)) return finish(s, cfg, "There isn't enough time left for another full round.");
    if (cfg.breakSeconds > 0) return startBreak(s, cfg, now);
    startRound(s, cfg, data, now);
  }
  function startBreak(s, cfg, now) {
    var all = BREAK_PROMPTS.map(function (x, i) { return i; }), fresh = all.filter(function (i) { return (s.usedPrompts || []).indexOf(i) < 0; });
    if (!fresh.length) { s.usedPrompts = []; fresh = all; }
    var k = fresh[rint(s, fresh.length)]; s.usedPrompts = (s.usedPrompts || []).concat([k]);
    s.phase = "break"; s.brk = { prompt: BREAK_PROMPTS[k] }; s.deadline = now + cfg.breakSeconds * 1000; say(s, cfg, "Chat break: " + BREAK_PROMPTS[k]);
  }
  function finish(s, cfg, why) {
    if (Object.keys(s.roundPts || {}).length && (!s.history.length || s.history[s.history.length - 1].round !== s.round)) {
      var names = {}; s.players.forEach(function (p) { names[p.id] = p.name; });
      s.history.push({ round: s.round, pts: clone(s.roundPts), names: names, partial: true });
    }
    s.phase = "over"; s.deadline = 0; s.cur = null; s.brk = null;
    var rows = scoreboard(s), top = rows.length ? rows[0].score : 0, w = s.scored ? rows.filter(function (r) { return r.score === top; }) : [];
    s.winners = w.map(function (r) { return r.id; });
    say(s, cfg, why + " " + (!s.scored ? "Nothing was scored." : w.length > 1 ? w.map(function (r) { return r.name; }).join(" and ") + " tie for the win with " + top + " points." : w[0].name + " wins with " + top + " points."));
  }
  function dataOk(d) { return d && d.categories && d.categories.length >= 1 && d.categories.every(function (c) { return c.prompts && c.prompts.length && c.prompts.every(function (t) { return typeof t === "string" && t; }); }); }
  function checkResolved(s, cfg, data, now) {
    var c = s.cur; if (!c) return;
    if (s.phase === "answer" && c.part.every(function (id) { return c.yes[id] != null; })) resolveAnswers(s, cfg, data, now);
    else if (s.phase === "vote" && voters(s).every(function (id) { return c.votes[id] != null; })) resolveVotes(s, cfg, now);
  }

  /* action = { type, id, ... }. ctx = { data:{categories:[{name,prompts:[text]}]}, now, cfg, endsAt }. */
  function apply(state, action, ctx) {
    var s = clone(state), cfg = cfgOf(ctx && ctx.cfg), data = ctx && ctx.data, now = (ctx && ctx.now) || Date.now(), p, t = action && action.type;
    if (!dataOk(data)) return err("There are not enough prompts to play.");
    if (s.endsAt && s.phase !== "lobby" && s.phase !== "over" && now >= s.endsAt) {
      finish(s, cfg, "The " + cfg.sessionMinutes + "-minute session is over." + (s.phase === "answer" || s.phase === "talk" || s.phase === "vote" ? " The prompt in progress is not scored." : ""));
      return { ok: true, state: s };
    }

    if (t === "join") {
      p = find(s, action.id); if (p) return { ok: true, state: s };
      if (s.players.length >= cfg.maxPlayers) return err("This room is full (" + cfg.maxPlayers + " players).");
      var name = uniqueName(s, cleanName(action.name)); s.players.push({ id: action.id, name: name, score: 0, myst: 0 });
      say(s, cfg, name + " joined" + (s.phase !== "lobby" && s.phase !== "over" ? " and will take part from the next prompt." : "."));
      return { ok: true, state: s };
    }
    if (t === "leave") {
      var idx = -1; s.players.forEach(function (x, i) { if (x.id === action.id) idx = i; });
      if (idx < 0) return { ok: true, state: s };
      var gone = s.players[idx]; s.players.splice(idx, 1); say(s, cfg, gone.name + " left.");
      if (!s.players.length) { s.phase = "lobby"; s.cur = null; return { ok: true, state: s }; }
      if (s.phase !== "lobby" && s.phase !== "over") {
        if (s.players.length < 2) { finish(s, cfg, "Fewer than two players are left."); return { ok: true, state: s }; }
        var c = s.cur;
        if (c && !c.result) {
          c.part = c.part.filter(function (id) { return id !== gone.id; }); delete c.yes[gone.id]; delete c.votes[gone.id];
          Object.keys(c.votes).forEach(function (k) { if (c.votes[k] === gone.id) delete c.votes[k]; });
          if (c.mystery === gone.id || (c.mode === "who" && c.part.length < 3) || (c.mode === "spot" && c.part.length < 2)) { say(s, cfg, "That prompt is skipped."); nextPrompt(s, cfg, data, now); }
          else checkResolved(s, cfg, data, now);
        }
      }
      return { ok: true, state: s };
    }
    if (t === "start") {
      if (s.phase !== "lobby") return err("The game has already started.");
      if (!find(s, action.id)) return err("You are not in this room.");
      if (s.players.length < cfg.minPlayers) return err("You need at least " + cfg.minPlayers + " players.");
      s.rounds = cfg.rounds; s.round = 0; s.history = []; s.roundPts = {}; s.winners = []; s.scored = false; s.used = []; s.lastCat = -1;
      s.players.forEach(function (x) { x.score = 0; x.myst = 0; });
      s.endsAt = (ctx && ctx.endsAt) || ((s.created || now) + cfg.sessionMinutes * 60000);
      if (now >= s.endsAt) return err("The " + cfg.sessionMinutes + "-minute session is over.");
      if (!roomForRound(s, cfg, now)) return err("There isn't enough time left in the session for a full round.");
      say(s, cfg, "The game has started!");
      startRound(s, cfg, data, now); return { ok: true, state: s };
    }
    if (t === "again") {
      if (s.phase !== "over") return err("The game isn't over.");
      if (!find(s, action.id)) return err("You are not in this room.");
      s.phase = "lobby"; s.players.forEach(function (x) { x.score = 0; x.myst = 0; }); s.round = 0; s.n = 0; s.history = []; s.roundPts = {}; s.cur = null; s.winners = []; s.scored = false;
      s.brk = null; s.created = now; s.endsAt = 0; s.deadline = 0; s.log = []; return { ok: true, state: s };
    }
    if (t === "timeout") {
      if (s.phase === "lobby" || s.phase === "over") return err("Nothing to time out.");
      if (now < s.deadline) return err("Not yet.");
      if (s.phase === "answer") resolveAnswers(s, cfg, data, now);
      else if (s.phase === "talk") toVote(s, cfg, now);
      else if (s.phase === "vote") resolveVotes(s, cfg, now);
      else if (s.phase === "reveal") nextPrompt(s, cfg, data, now);
      else if (s.phase === "results") afterResults(s, cfg, data, now);
      else if (s.phase === "break") startRound(s, cfg, data, now);
      return { ok: true, state: s };
    }

    p = find(s, action.id); if (!p) return err("You are not in this room.");
    if (s.phase === "lobby" || s.phase === "over") return err("The game isn't running.");
    var cur = s.cur;

    if (t === "answer") {
      if (s.phase !== "answer") return err("It isn't time to answer.");
      if (cur.part.indexOf(p.id) < 0) return err("You'll join in from the next prompt.");
      if (cur.yes[p.id] != null) return err("You have already answered.");
      cur.yes[p.id] = !!action.value; checkResolved(s, cfg, data, now); return { ok: true, state: s };
    }
    if (t === "next") {
      if (s.phase === "talk") { if (cur.part.indexOf(p.id) < 0) return err("You'll join in from the next prompt."); toVote(s, cfg, now); return { ok: true, state: s }; }
      if (s.phase === "reveal") { nextPrompt(s, cfg, data, now); return { ok: true, state: s }; }
      return err("Nothing to skip right now.");
    }
    if (t === "vote") {
      if (s.phase !== "vote") return err("It isn't time to guess.");
      if (voters(s).indexOf(p.id) < 0) return err(cur.mode === "who" && cur.mystery === p.id ? "You are the mystery person, so you don't guess. Sit back and enjoy!" : "You'll join in from the next prompt.");
      if (cur.votes[p.id] != null) return err("You have already guessed.");
      if (cur.mode === "who") {
        if (cur.part.indexOf(action.target) < 0 || action.target === p.id) return err("Pick one of the other players.");
      } else if (action.target !== "y" && action.target !== "n") return err("Pick Yes or No.");
      cur.votes[p.id] = action.target; checkResolved(s, cfg, data, now); return { ok: true, state: s };
    }
    if (t === "nextround") {
      if (s.phase === "break") { startRound(s, cfg, data, now); return { ok: true, state: s }; }
      if (s.phase !== "results") return err("The results aren't up.");
      afterResults(s, cfg, data, now); return { ok: true, state: s };
    }
    return err("Unknown action.");
  }
  return { DEFAULT_CONFIG: DEFAULT_CONFIG, cfgOf: cfgOf, newRoom: newRoom, apply: apply, scoreboard: scoreboard, viewFor: viewFor, voters: voters,
    roundMs: roundMs, roomForRound: roomForRound, canContinue: canContinue, BREAK_PROMPTS: BREAK_PROMPTS };
});
