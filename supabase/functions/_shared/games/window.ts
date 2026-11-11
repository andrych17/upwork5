// Kelly's data files (inventit-items.js, PuzzleRoom-data.js, ...) are written for a browser page and assign to
// `window`. Deno 2 has no `window`, so it points at globalThis before they load. Import this module first.
const g = globalThis as { window?: unknown };
g.window ??= globalThis;
