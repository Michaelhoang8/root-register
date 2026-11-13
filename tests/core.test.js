import test from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  solve,
  polynomial,
  validate,
  example,
  presets,
} from "../core.js";
const close = (a, b, tol = 1e-8) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
test("all methods solve the reference cubic with a small residual", () => {
  for (const run of analyze(example).runs) {
    assert.ok(
      ["exact-zero", "residual-met", "bracket-met"].includes(run.status),
    );
    close(run.rows.at(-1).x, 1.5213797068045676);
    assert.ok(run.calls >= run.rows.length);
  }
});
test("Horner derivative agrees with independent power sums for 500 polynomials", () => {
  let seed = 17;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let n = 0; n < 500; n++) {
    const c = Array.from({ length: 2 + (n % 8) }, () => rand() * 4 - 2),
      x = rand() * 4 - 2;
    const expected = c.reduce((s, v, i) => s + v * x ** i, 0),
      derivative = c.reduce((s, v, i) => s + (i ? i * v * x ** (i - 1) : 0), 0),
      out = polynomial(c, x);
    close(out.value, expected, 1e-10);
    close(out.derivative, derivative, 1e-10);
  }
});
test("bracketed linear roots agree with 300 known solutions", () => {
  for (let n = 0; n < 300; n++) {
    const root = -10 + n / 15.3,
      scale = 1 + (n % 7);
    for (const method of ["bisection", "safeguarded"]) {
      const input = {
        ...example,
        coefficients: [-scale * root, scale],
        left: root - 1.3,
        right: root + 2.7,
        start: root + 0.9,
      };
      const run = solve(input, method);
      close(run.rows.at(-1).x, root, 1e-8);
      for (const row of run.rows) {
        assert.ok(row.left <= root + 1e-12 && row.right >= root - 1e-12);
        assert.ok(row.x >= input.left && row.x <= input.right);
      }
    }
  }
});
test("Newton cycle reports exhausted budget while safeguards converge", () => {
  const r = analyze(presets.cycle);
  assert.equal(r.runs[1].status, "iteration-limit");
  assert.deepEqual(
    r.runs[1].rows.slice(0, 4).map((r) => r.x),
    [0, 1, 0, 1],
  );
  close(r.runs[3].rows.at(-1).x, -1.7692923542386314);
});
test("even multiplicity does not falsely pass the sign bracket gate", () => {
  const r = analyze(presets.double);
  assert.equal(r.runs[0].status, "invalid-bracket");
  assert.equal(r.runs[3].status, "invalid-bracket");
  assert.equal(r.runs[1].status, "residual-met");
});
test("zero derivative and equal secant values have explicit outcomes", () => {
  assert.equal(
    solve({ ...example, start: 0, coefficients: [1, 0, 1] }, "newton").status,
    "zero-derivative",
  );
  assert.equal(
    solve({ ...example, left: -1, right: 1, coefficients: [1, 0, 1] }, "secant")
      .status,
    "zero-denominator",
  );
});
test("endpoint zeros are accepted without requiring opposite signs", () => {
  const r = solve(
    { ...example, coefficients: [-1, 1], left: 1, right: 2 },
    "bisection",
  );
  assert.equal(r.status, "exact-zero");
  assert.equal(r.rows[0].x, 1);
});
test("numerical excursions preserve only finite trace evidence", () => {
  const r = solve({ ...presets.flat, start: 1e-10 }, "newton");
  assert.equal(r.status, "numerical-limit");
  assert.equal(r.rows.length, 1);
  assert.ok(Number.isFinite(r.rows[0].f));
});
test("x-width termination returns midpoint and accurately recorded deltas", () => {
  const r = solve(
    { ...example, xTolerance: 1e-2, fTolerance: 1e-14 },
    "bisection",
  );
  assert.equal(r.status, "bracket-met");
  const last = r.rows.at(-1);
  close(last.x, (last.left + last.right) / 2, 1e-15);
  assert.ok(last.halfWidth <= 1e-2);
  for (let i = 1; i < r.rows.length; i++)
    assert.equal(r.rows[i].step, r.rows[i].x - r.rows[i - 1].x);
});
test("validation rejects degenerate polynomials and unsafe limits", () => {
  for (const edit of [
    { coefficients: [0] },
    { coefficients: [1, 0] },
    { coefficients: [1, Infinity] },
    { left: 2, right: 1 },
    { start: NaN },
    { maxSteps: 201 },
    { xTolerance: 0 },
  ])
    assert.throws(() => validate({ ...example, ...edit }));
  assert.throws(() => solve(example, "brent"));
});
test("input is immutable and exported traces contain no non-finite numbers", () => {
  const original = structuredClone(example);
  const report = analyze(example);
  assert.deepEqual(example, original);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.equal(report.curve.length, 401);
});
