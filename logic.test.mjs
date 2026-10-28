import test from "node:test";
import assert from "node:assert/strict";
import { draw, win, clear, champ, board, clean, okNum, MAX } from "./logic.mjs";

const mk = n => {
  const t = { id: "t1", name: "T", type: "team", size: 1, teams: Array.from({ length: n }, (_, i) => ({ n: "P" + i, m: [], o: 0 })) };
  draw(t);
  return t;
};

test("draw pads to a power of two and never pairs two byes", () => {
  for (const n of [2, 3, 5, 8, 11]) {
    const t = mk(n);
    assert.equal(t.pairs.length * 2, 2 ** Math.ceil(Math.log2(n)));
    assert.ok(t.pairs.every(([a, b]) => a != null || b != null));
  }
});

test("a bye advances automatically", () => {
  const t = mk(3), i = t.pairs.findIndex(([a, b]) => a == null || b == null);
  assert.notEqual(win(t, 0, i), null);
});

test("a champion exists once the final has a score", () => {
  const t = mk(2);
  assert.equal(champ(t), null);
  t.sc[0][0] = [3, 1];
  assert.equal(champ(t), t.pairs[0][0]);
});

test("clear removes only later-round results", () => {
  const t = mk(4);
  t.sc[0][0] = [2, 0]; t.sc[0][1] = [2, 0]; t.sc[1][0] = [1, 0];
  clear(t, 0, 0);
  assert.equal(t.sc[1][0], null);
  assert.deepEqual(t.sc[0][1], [2, 0]);
});

test("okNum accepts non-negative numbers only", () => {
  assert.ok(okNum("3") && okNum(0));
  assert.ok(!okNum(-1) && !okNum("abc") && !okNum(""));
});

test("clean survives junk and caps the tournament count", () => {
  assert.deepEqual(clean(null), { T: [] });
  assert.deepEqual(clean({ T: [{ id: "<script>", teams: [] }] }), { T: [] });
  const one = i => ({ id: "a" + i, name: "x", type: "team", teams: [{ n: "a" }, { n: "b" }] });
  assert.equal(clean({ T: Array.from({ length: MAX + 3 }, (_, i) => one(i)) }).T.length, MAX);
});

test("clean redraws a bracket whose saved shape is invalid", () => {
  const t = clean({ T: [{ id: "z", name: "x", type: "team", teams: [{ n: "a" }, { n: "b" }], pairs: "bad", sc: 1 }] }).T[0];
  assert.equal(t.pairs.length, 1);
});

test("ffa board ranks by total points", () => {
  const rows = board({ pl: ["A", "B"], pts: { 0: [5], 1: [9] } });
  assert.equal(rows[0].n, "B");
});