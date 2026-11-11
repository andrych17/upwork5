/* Invent It ("Yes, and..."): team game engine (pure functions, no page code). Works in the browser (window.MeetDoInventIt) and in Node/Deno.
 *
 * One game = one JSON "state" per room; rooms never share anything. Every change goes through apply(state, action, ctx), which checks
 * the rules and returns a new state. Randomness lives in state.rng. A server can run the same rules; clients only send actions.
 * Everything is spoken out loud in the one video room, so there is no private channel and almost nothing to type.
 *
 * How a game goes (numbers are in DEFAULT_CONFIG):
 *   - 4 to 12 players. At the start the players are put into teams: at random, or each player chooses (teamMode).
 *   - A round: the teams go on stage one at a time, in a random order. First a quick HUDDLE: the team is offered 3 random categories and each
 *     teammate taps one (most taps wins, ties and no taps are settled at random); then the team gets two random items from that category. After a short get-ready pause each team member
 *     speaks for 15 seconds, in turn. The first speaker says what the invention is (combining the two items), each next speaker starts with "Yes, and..."
 *     and adds one feature, and the last speaker gives it a name. A speaker can press Next to finish early, or Pass to skip their turn. A turn that runs out of time counts as spoken; only Pass skips.
 *   - Then every player on the OTHER teams taps one rating from 1 ("No way!") to 5 ("Absolutely!") for "How much would you buy it?".
 *   - A team's score for its turn on stage is the average of the ratings it got, to two decimals. A team's total is the sum of its turn scores.
 *   - After every team has been on stage, the round results show, then a short CHAT BREAK with a conversation prompt, then the next round starts, as long as a full round (every timer at its limit)
 *     still fits before the 60-minute session ends (state.endsAt). Then the highest total wins; teams level on the top total win together.
 *
 * state = { v, room, phase: "lobby"|"stage"|"rate"|"results"|"break"|"over", teamMode: "random"|"choose",
 *           players: [{id,name,team}], teams: [{name,color,total}], round, rounds (0 = no cap), order: [team], idx,
 *           stage: {team, items:[a,b], speakers:[playerId], turn (-2 = category huddle, -1 = get-ready), cats:[category index]|null, votes:{playerId: 0..2}, cat: index|null, spoke, passes, said:[name]} | null,
 *           brk: {prompt} | null,
 *           rate: {team, votes: {playerId: 1..5}} | null, roundData: {team: {items, avg, raters, speakers:[names], passes}}, history: [{round, teams}],
 *           used, deadline, rng, log, created, endsAt, winners, winner }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MeetDoInventIt = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_CONFIG = {
    maxPlayers: 12, minPlayers: 2,       // 2 to 12 players (house rule for every game)
    teamSize: 3,            // random teams aim for this many players per team (always 2 to 6 teams; 2 players = two teams of one; 3 players = 2 + 1)
    rounds: 0,              // 0 = keep playing rounds while a full round fits in the session; a number caps the rounds
    huddleSeconds: 10,      // team picks 1 of 3 categories before getting its items (needs ctx.categories)
    introSeconds: 6,        // get-ready pause when a team goes on stage (any team member can start early)
    turnSeconds: 15,        // each speaker's turn
    rateSeconds: 12,        // time to tap a rating after a team has spoken
    resultsSeconds: 20,     // how long the round results stay up
    breakSeconds: 60,       // chat break after the results, with a conversation prompt (0 = no break)
    sessionMinutes: 60,
    logLines: 40
  };
  var TEAMS = [
    { name: "Red", color: "#E4002B" }, { name: "Blue", color: "#0057E7" }, { name: "Green", color: "#00A651" },
    { name: "Orange", color: "#FF7A00" }, { name: "Purple", color: "#7B2CBF" }, { name: "Yellow", color: "#FFD500" }
  ];
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
  var SCALE = { 1: "No way!", 5: "Absolutely!" };
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
  function r2(x) { return Math.round(x * 100) / 100; }

  function newRoom(code, seed) {
    return { v: 2, room: String(code), phase: "lobby", teamMode: "random", players: [], teams: [], round: 0, rounds: 0, order: [], idx: 0, stage: null, rate: null,
      roundData: {}, history: [], used: [], deadline: 0, rng: seed == null ? hash(code + ":" + Date.now()) : seed | 0,
      log: [], created: Date.now(), endsAt: 0, winners: [], winner: null, brk: null, usedPrompts: [] };
  }

  /* Teams that have at least one player. */
  function activeTeams(s) {
    var out = [];
    s.teams.forEach(function (t, i) { if (s.players.some(function (p) { return p.team === i; })) out.push(i); });
    return out;
  }
  function membersOf(s, ti) { return s.players.filter(function (p) { return p.team === ti; }); }

  /* The team table, highest total first; teams level on total share a rank. Only teams that still have players are listed. */
  function teamBoard(s) {
    var rows = activeTeams(s).map(function (i) { return { team: i, name: s.teams[i].name, color: s.teams[i].color, total: s.teams[i].total || 0, members: membersOf(s, i).map(function (p) { return p.name; }) }; });
    rows.sort(function (a, b) { return b.total - a.total || a.team - b.team; });
    rows.forEach(function (r, i) { var prev = rows[i - 1]; r.rank = prev && prev.total === r.total ? prev.rank : i + 1; });
    return rows;
  }

  /* What the current speaker should do: "start" (say what it is), "and" (Yes, and... add a feature), "name" (give it a name),
   * or "startname" (they are the only one left to speak, so start it and name it). */
  function roleFor(s) {
    var st = s.stage; if (!st || st.turn < 0) return null;
    var last = st.turn >= st.speakers.length - 1;
    if (st.spoke === 0) return last ? "startname" : "start";
    return last ? "name" : "and";
  }
  /* Who is speaking now (or null during the get-ready pause). */
  function speaker(s) { var st = s.stage; return st && st.turn >= 0 && st.turn < st.speakers.length ? find(s, st.speakers[st.turn]) : null; }

  /* Draw two items. pool = indexes into items that may be drawn (default: all). Items don't repeat until the pool has been used up. */
  function drawItems(s, items, pool) {
    var pick = [], k;
    if (!pool) { pool = []; for (k = 0; k < items.length; k++) pool.push(k); }
    var avail = pool.filter(function (x) { return s.used.indexOf(x) < 0; });
    if (avail.length < 2) { s.used = s.used.filter(function (x) { return pool.indexOf(x) < 0; }); avail = pool.slice(); }
    while (pick.length < 2 && avail.length) { var j = rint(s, avail.length); pick.push(avail.splice(j, 1)[0]); }
    pick.forEach(function (x) { s.used.push(x); });
    return pick.map(function (x) { return items[x]; });
  }
  /* The item indexes of a category (categories = [{name, items:[string]}]). */
  function poolOf(cat, items) { return cat.items.map(function (n) { return items.indexOf(n); }).filter(function (i) { return i >= 0; }); }

  /* ---------- timing ---------- */
  /* How long a round can take at most, in ms, with the teams now in the game. */
  /* Seconds for each speaker. A team of 3 or more gets turnSeconds each; a smaller team gets longer turns, so a team of 1 or 2 has about as long on stage as a team of 3. */
  function turnSecs(s, cfg, ti) { return Math.max(cfg.turnSeconds, Math.ceil(3 * cfg.turnSeconds / Math.max(1, membersOf(s, ti).length))); }
  function roundMs(s, cfg) {
    var t = cfg.resultsSeconds;
    activeTeams(s).forEach(function (ti) { t += (cfg.huddleSeconds || 0) + cfg.introSeconds + membersOf(s, ti).length * turnSecs(s, cfg, ti) + cfg.rateSeconds; });
    return t * 1000;
  }
  /* True when another full round can still finish before the session ends. */
  function roomForRound(s, cfg, now, extraSeconds) { return !s.endsAt || now + (extraSeconds || 0) * 1000 + roundMs(s, cfg) <= s.endsAt; }
  /* After the results: is there another round (counting the chat break before it)? */
  function canContinue(s, cfg, now) { return !(s.rounds && s.round >= s.rounds) && roomForRound(s, cfg, now, cfg.breakSeconds); }

  /* ---------- steps ---------- */
  function startRound(s, cfg, items, now) {
    s.round++; s.order = shuffle(s, activeTeams(s)); s.idx = 0; s.roundData = {}; s.rate = null; s.brk = null;
    say(s, cfg, "Round " + s.round + (s.rounds ? " of " + s.rounds : "") + " begins.");
    startStage(s, cfg, items, now);
  }
  function startStage(s, cfg, items, now) {
    var ti = s.order[s.idx], mem = membersOf(s, ti).map(function (p) { return p.id; }), off = (s.round - 1) % Math.max(1, mem.length);
    var speakers = mem.slice(off).concat(mem.slice(0, off));   // a different person starts each round
    s.stage = { team: ti, items: null, speakers: speakers, turn: -2, cats: null, votes: {}, cat: null, spoke: 0, passes: 0, said: [] };
    s.rate = null; s.phase = "stage";
    var cats = cfg.cats;   // set by apply() from ctx.categories
    if (cats && cats.length >= 2 && cfg.huddleSeconds > 0) {
      var all = cats.map(function (c, i) { return i; });
      s.stage.cats = shuffle(s, all).slice(0, 3); s.deadline = now + cfg.huddleSeconds * 1000;
      say(s, cfg, "Team " + s.teams[ti].name + " is on stage and is choosing a category.");
    } else { s.stage.turn = -1; s.stage.items = drawItems(s, items); s.deadline = now + cfg.introSeconds * 1000; say(s, cfg, "Team " + s.teams[ti].name + " is on stage with: " + s.stage.items.join(" + ") + "."); }
  }
  /* The huddle is over: the most-tapped category wins (ties and no taps are settled at random), and the team gets two items from it. */
  function resolveHuddle(s, cfg, items, now) {
    var cats = cfg.cats, st = s.stage, tally = [0, 0, 0], best = 0, top = [];
    Object.keys(st.votes).forEach(function (id) { tally[st.votes[id]]++; });
    tally.slice(0, st.cats.length).forEach(function (n) { if (n > best) best = n; });
    st.cats.forEach(function (c, i) { if (tally[i] === best) top.push(i); });
    var win = top[rint(s, top.length)];
    st.cat = st.cats[win]; st.items = drawItems(s, items, poolOf(cats[st.cat], items)); st.turn = -1; s.deadline = now + cfg.introSeconds * 1000;
    say(s, cfg, "Team " + s.teams[st.team].name + " chose " + cats[st.cat].name + ": " + st.items.join(" + ") + ".");
  }
  /* Move to the next speaker; after the last one, to the rating (or skip it if nobody spoke). */
  function nextTurn(s, cfg, items, now) {
    var st = s.stage;
    do { st.turn++; } while (st.turn < st.speakers.length && !find(s, st.speakers[st.turn]));
    if (st.turn >= st.speakers.length) return toRate(s, cfg, items, now);
    s.deadline = now + turnSecs(s, cfg, s.stage.team) * 1000;
  }
  function toRate(s, cfg, items, now) {
    var st = s.stage;
    if (!st.spoke) { say(s, cfg, "Nobody spoke for Team " + s.teams[st.team].name + ", so there is nothing to rate."); return finishTeam(s, cfg, items, now); }
    s.phase = "rate"; s.rate = { team: st.team, votes: {} }; s.deadline = now + cfg.rateSeconds * 1000;
    if (!raters(s).length) return finishTeam(s, cfg, items, now);
  }
  function raters(s) { return s.players.filter(function (p) { return s.stage && p.team !== s.stage.team; }); }
  /* The team's turn is over: work out its score and move on. */
  function finishTeam(s, cfg, items, now) {
    var st = s.stage, ti = st.team, vals = s.rate ? Object.keys(s.rate.votes).map(function (k) { return s.rate.votes[k]; }) : [];
    var avg = vals.length ? r2(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 0;
    s.roundData[ti] = { items: st.items, avg: avg, raters: vals.length, speakers: st.said.slice(), passes: st.passes };
    s.teams[ti].total = r2((s.teams[ti].total || 0) + avg);
    say(s, cfg, "Team " + s.teams[ti].name + " scored " + avg + (vals.length ? " from " + vals.length + " ratings." : "."));
    s.stage = null; s.rate = null; s.idx++;
    while (s.idx < s.order.length && !membersOf(s, s.order[s.idx]).length) s.idx++;
    if (s.idx < s.order.length) return startStage(s, cfg, items, now);
    s.history.push({ round: s.round, teams: s.roundData });
    s.phase = "results"; s.deadline = now + cfg.resultsSeconds * 1000; say(s, cfg, "Round " + s.round + " results are in.");
  }
  function afterResults(s, cfg, items, now) {
    if (s.rounds && s.round >= s.rounds) return finish(s, cfg, "That was the last round.");
    if (!roomForRound(s, cfg, now, cfg.breakSeconds)) return finish(s, cfg, "There isn't enough time left for another full round.");
    if (cfg.breakSeconds > 0) return startBreak(s, cfg, now);
    startRound(s, cfg, items, now);
  }
  function startBreak(s, cfg, now) {
    var all = BREAK_PROMPTS.map(function (x, i) { return i; }), fresh = all.filter(function (i) { return (s.usedPrompts || []).indexOf(i) < 0; });
    if (!fresh.length) { s.usedPrompts = []; fresh = all; }
    var k = fresh[rint(s, fresh.length)]; s.usedPrompts = (s.usedPrompts || []).concat([k]);
    s.phase = "break"; s.brk = { prompt: BREAK_PROMPTS[k] }; s.deadline = now + cfg.breakSeconds * 1000; say(s, cfg, "Chat break: " + BREAK_PROMPTS[k]);
  }
  function finish(s, cfg, why) {
    var rows = teamBoard(s), top = rows.length ? rows[0].total : 0;
    if (s.roundData && Object.keys(s.roundData).length && (!s.history.length || s.history[s.history.length - 1].round !== s.round)) s.history.push({ round: s.round, teams: s.roundData, partial: true });
    s.phase = "over"; s.deadline = 0; s.stage = null; s.rate = null; s.brk = null;
    var scored = s.history.length || Object.keys(s.roundData || {}).length;
    var w = scored ? rows.filter(function (r) { return r.total === top; }) : [];
    s.winners = w.map(function (r) { return r.team; }); s.winner = s.winners.length ? s.winners[0] : null;
    say(s, cfg, why + " " + (!scored ? "Nothing was scored." : w.length > 1 ? "Team " + w.map(function (r) { return r.name; }).join(" and Team ") + " tie for the win with " + top + " points." : "Team " + w[0].name + " wins with " + top + " points."));
  }
  function smallestTeam(s) {
    var best = -1, bn = 1e9; activeTeams(s).forEach(function (ti) { var n = membersOf(s, ti).length; if (n < bn) { bn = n; best = ti; } }); return best;
  }

  /* ---------- the one entry point ----------
   * action = { type, id, ... }. ctx = { items: [string], now, cfg, endsAt }. Returns { ok, state } or { ok:false, error }. */
  function apply(state, action, ctx) {
    var s = clone(state), cfg = cfgOf(ctx && ctx.cfg), items = (ctx && ctx.items) || [], now = (ctx && ctx.now) || Date.now(), p, t = action && action.type;
    if (items.length < 2) return err("There are not enough items to play.");
    cfg.cats = ((ctx && ctx.categories) || []).filter(function (c) { return c && c.items && poolOf(c, items).length >= 2; });
    if (cfg.cats.length < 2) { cfg.cats = null; cfg.huddleSeconds = 0; }
    if (s.endsAt && s.phase !== "lobby" && s.phase !== "over" && now >= s.endsAt) {
      finish(s, cfg, s.phase === "results" || s.phase === "break" ? "The " + cfg.sessionMinutes + "-minute session is over." : "The " + cfg.sessionMinutes + "-minute session is over. The team on stage is not scored.");
      return { ok: true, state: s };
    }

    if (t === "join") {
      p = find(s, action.id); if (p) return { ok: true, state: s };
      if (s.players.length >= cfg.maxPlayers) return err("This room is full (" + cfg.maxPlayers + " players).");
      var name = uniqueName(s, cleanName(action.name)); p = { id: action.id, name: name, team: null };
      s.players.push(p);
      if (s.phase !== "lobby" && s.phase !== "over") { p.team = smallestTeam(s); say(s, cfg, name + " joined Team " + s.teams[p.team].name + "."); }
      else say(s, cfg, name + " joined.");
      return { ok: true, state: s };
    }
    if (t === "leave") {
      var idx = -1; s.players.forEach(function (x, i) { if (x.id === action.id) idx = i; });
      if (idx < 0) return { ok: true, state: s };
      var gone = s.players[idx]; s.players.splice(idx, 1); say(s, cfg, gone.name + " left.");
      if (!s.players.length) { s.phase = "lobby"; return { ok: true, state: s }; }
      if (s.phase !== "lobby" && s.phase !== "over") {
        if (activeTeams(s).length < 2) { finish(s, cfg, "Fewer than two teams are left."); return { ok: true, state: s }; }
        if (s.phase === "stage") {
          if (!membersOf(s, s.stage.team).length) { s.stage.spoke = 0; finishTeam(s, cfg, items, now); }
          else if (s.stage.turn === -2) { delete s.stage.votes[gone.id]; if (membersOf(s, s.stage.team).every(function (x) { return s.stage.votes[x.id] != null; })) resolveHuddle(s, cfg, items, now); }
          else if (s.stage.turn >= 0 && s.stage.speakers[s.stage.turn] === gone.id) { s.stage.turn--; nextTurn(s, cfg, items, now); }
        } else if (s.phase === "rate") {
          delete s.rate.votes[gone.id];
          var need = raters(s); if (!need.length || need.every(function (x) { return s.rate.votes[x.id] != null; })) finishTeam(s, cfg, items, now);
        }
      }
      return { ok: true, state: s };
    }
    if (t === "mode") {
      if (s.phase !== "lobby") return err("Teams can only be set up before the game starts.");
      if (!find(s, action.id)) return err("You are not in this room.");
      if (action.mode !== "random" && action.mode !== "choose") return err("Unknown team mode.");
      s.teamMode = action.mode; s.players.forEach(function (x) { x.team = null; });
      say(s, cfg, find(s, action.id).name + " set teams to " + (action.mode === "random" ? "random." : "players choose.")); return { ok: true, state: s };
    }
    if (t === "team") {
      if (s.phase !== "lobby") return err("Teams can only be chosen before the game starts.");
      if (s.teamMode !== "choose") return err("Teams are set to random.");
      p = find(s, action.id); if (!p) return err("You are not in this room.");
      if (action.team == null || action.team < 0) { p.team = null; return { ok: true, state: s }; }
      if (!(action.team >= 0 && action.team < TEAMS.length) || action.team !== Math.floor(action.team)) return err("Unknown team.");
      p.team = action.team; return { ok: true, state: s };
    }
    if (t === "start") {
      if (s.phase !== "lobby") return err("The game has already started.");
      if (!find(s, action.id)) return err("You are not in this room.");
      if (s.players.length < cfg.minPlayers) return err("You need at least " + cfg.minPlayers + " players.");
      var slots = [], n = s.players.length, k;
      var chosen = s.teamMode === "choose" && s.players.some(function (x) { return x.team != null; });
      if (!chosen) {
        k = Math.max(2, Math.min(TEAMS.length, n, Math.round(n / cfg.teamSize)));
        shuffle(s, s.players.map(function (x, i) { return i; })).forEach(function (pi, j) { s.players[pi].team = j % k; });
      } else {
        var used = {}; s.players.forEach(function (x) { if (x.team != null) used[x.team] = (used[x.team] || 0) + 1; });
        if (Object.keys(used).length < 2) return err("At least two teams need players. Pick different teams, or switch to random teams.");
        s.players.forEach(function (x) { if (x.team == null) { var best = null; Object.keys(used).forEach(function (q) { if (best === null || used[q] < used[best]) best = q; }); x.team = +best; used[best]++; } });
      }
      var seen = {}; s.players.forEach(function (x) { seen[x.team] = 1; });
      slots = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
      s.teams = slots.map(function (q) { return { name: TEAMS[q].name, color: TEAMS[q].color, total: 0 }; });
      s.players.forEach(function (x) { x.team = slots.indexOf(x.team); });
      s.rounds = cfg.rounds; s.round = 0; s.history = []; s.roundData = {}; s.winners = []; s.winner = null;
      s.endsAt = (ctx && ctx.endsAt) || ((s.created || now) + cfg.sessionMinutes * 60000);
      if (now >= s.endsAt) return err("The " + cfg.sessionMinutes + "-minute session is over.");
      if (!roomForRound(s, cfg, now)) return err("There isn't enough time left in the session for a full round.");
      say(s, cfg, "The game has started! " + s.teams.length + " teams: " + s.teams.map(function (x) { return x.name; }).join(", ") + ".");
      startRound(s, cfg, items, now); return { ok: true, state: s };
    }
    if (t === "again") {
      if (s.phase !== "over") return err("The game isn't over.");
      if (!find(s, action.id)) return err("You are not in this room.");
      s.phase = "lobby"; s.teams = []; s.players.forEach(function (x) { x.team = null; }); s.round = 0; s.history = []; s.roundData = {}; s.order = []; s.idx = 0; s.stage = null; s.rate = null;
      s.winners = []; s.winner = null; s.brk = null; s.created = now; s.endsAt = 0; s.deadline = 0; s.log = []; return { ok: true, state: s };
    }
    if (t === "timeout") {
      if (s.phase === "lobby" || s.phase === "over") return err("Nothing to time out.");
      if (now < s.deadline) return err("Not yet.");
      if (s.phase === "stage") {
        if (s.stage.turn === -2) return resolveHuddle(s, cfg, items, now), { ok: true, state: s };
        if (s.stage.turn >= 0) { var sp0 = find(s, s.stage.speakers[s.stage.turn]); if (sp0) { s.stage.spoke++; s.stage.said.push(sp0.name); } }   // used the whole turn: counts as spoken
        nextTurn(s, cfg, items, now);
      }
      else if (s.phase === "rate") finishTeam(s, cfg, items, now);
      else if (s.phase === "results") afterResults(s, cfg, items, now);
      else if (s.phase === "break") startRound(s, cfg, items, now);
      return { ok: true, state: s };
    }

    // Player moves from here on.
    p = find(s, action.id); if (!p) return err("You are not in this room.");
    if (s.phase === "lobby" || s.phase === "over") return err("The game isn't running.");

    if (t === "next" || t === "pass") {
      if (s.phase !== "stage") return err("Nobody is on stage.");
      var st = s.stage;
      if (st.turn === -2) return err("Your team is still choosing a category.");
      if (st.turn < 0) {   // get-ready pause: any member of the team on stage can start
        if (t === "pass") return err("The turns haven't started.");
        if (p.team !== st.team) return err("Only the team on stage can start.");
        nextTurn(s, cfg, items, now); return { ok: true, state: s };
      }
      if (st.speakers[st.turn] !== p.id) return err("It isn't your turn to speak.");
      if (t === "pass") { st.passes++; say(s, cfg, p.name + " passed."); }
      else { st.spoke++; st.said.push(p.name); }
      nextTurn(s, cfg, items, now); return { ok: true, state: s };
    }
    if (t === "pick") {
      if (s.phase !== "stage" || s.stage.turn !== -2) return err("It isn't time to choose a category.");
      if (p.team !== s.stage.team) return err("Only the team on stage chooses the category.");
      var c = +action.cat; if (!(c >= 0 && c < s.stage.cats.length) || c !== Math.floor(c)) return err("Unknown category.");
      s.stage.votes[p.id] = c;
      if (membersOf(s, s.stage.team).every(function (x) { return s.stage.votes[x.id] != null; })) resolveHuddle(s, cfg, items, now);
      return { ok: true, state: s };
    }
    if (t === "rate") {
      if (s.phase !== "rate") return err("It isn't time to rate.");
      if (p.team === s.rate.team) return err("You can't rate your own team.");
      var v = +action.value; if (!(v >= 1 && v <= 5) || v !== Math.floor(v)) return err("Ratings are whole numbers from 1 to 5.");
      s.rate.votes[p.id] = v;
      if (raters(s).every(function (x) { return s.rate.votes[x.id] != null; })) finishTeam(s, cfg, items, now);
      return { ok: true, state: s };
    }
    if (t === "nextround") {
      if (s.phase === "break") { startRound(s, cfg, items, now); return { ok: true, state: s }; }
      if (s.phase !== "results") return err("The results aren't up.");
      afterResults(s, cfg, items, now); return { ok: true, state: s };
    }
    return err("Unknown action.");
  }
  return { DEFAULT_CONFIG: DEFAULT_CONFIG, TEAMS: TEAMS, SCALE: SCALE, cfgOf: cfgOf, newRoom: newRoom, apply: apply, teamBoard: teamBoard, activeTeams: activeTeams, membersOf: membersOf, roleFor: roleFor, speaker: speaker, raters: raters, roomForRound: roomForRound, canContinue: canContinue, roundMs: roundMs, turnSecs: turnSecs, BREAK_PROMPTS: BREAK_PROMPTS };
});
