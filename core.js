export const example = {
  coefficients: [-2, -1, 0, 1],
  left: 1,
  right: 2,
  start: 1,
  maxSteps: 80,
  xTolerance: 1e-10,
  fTolerance: 1e-10,
};
export const presets = {
  cubic: example,
  cycle: {
    ...example,
    coefficients: [2, -2, 0, 1],
    left: -2,
    right: 0,
    start: 0,
  },
  double: {
    ...example,
    coefficients: [1, -2, 1],
    left: 0,
    right: 2,
    start: 1.8,
  },
  flat: {
    ...example,
    coefficients: [-1, 0, 0, 0, 0, 0, 0, 0, 1],
    left: 0,
    right: 2,
    start: 0.1,
  },
};
export function validate(raw) {
  if (
    !raw ||
    !Array.isArray(raw.coefficients) ||
    raw.coefficients.length < 2 ||
    raw.coefficients.length > 9 ||
    raw.coefficients.some((x) => !Number.isFinite(x) || Math.abs(x) > 1e6) ||
    raw.coefficients.at(-1) === 0
  )
    throw Error(
      "Use 2–9 finite coefficients, constant first, within ±1000000, with a nonzero leading coefficient.",
    );
  for (const k of ["left", "right", "start"])
    if (!Number.isFinite(raw[k]) || Math.abs(raw[k]) > 1000)
      throw Error("Endpoints and start must be finite and within ±1000.");
  if (raw.left >= raw.right)
    throw Error("Left endpoint must be less than right endpoint.");
  if (!Number.isInteger(raw.maxSteps) || raw.maxSteps < 1 || raw.maxSteps > 200)
    throw Error("Use 1–200 iterations.");
  for (const k of ["xTolerance", "fTolerance"])
    if (!Number.isFinite(raw[k]) || raw[k] < 1e-14 || raw[k] > 1e-2)
      throw Error("Tolerances must be between 1e-14 and 0.01.");
  return {
    coefficients: [...raw.coefficients],
    left: raw.left,
    right: raw.right,
    start: raw.start,
    maxSteps: raw.maxSteps,
    xTolerance: raw.xTolerance,
    fTolerance: raw.fTolerance,
  };
}
export function polynomial(coefficients, x) {
  let value = coefficients.at(-1),
    derivative = 0;
  for (let i = coefficients.length - 2; i >= 0; i--) {
    derivative = derivative * x + value;
    value = value * x + coefficients[i];
  }
  return { value, derivative };
}
const opposite = (a, b) => (a < 0 && b > 0) || (a > 0 && b < 0);
export function solve(raw, method) {
  const input = validate(raw);
  if (!["bisection", "newton", "secant", "safeguarded"].includes(method))
    throw Error("Unknown method.");
  let calls = 0;
  const evaluate = (x) => {
    calls++;
    const out = polynomial(input.coefficients, x);
    if (
      !Number.isFinite(x) ||
      Math.abs(x) > 1e12 ||
      !Number.isFinite(out.value) ||
      !Number.isFinite(out.derivative)
    )
      throw Error("Numerical range exceeded (|x| ≤ 1e12).");
    return out;
  };
  const rows = [];
  let status = "iteration-limit",
    reason = "Iteration budget exhausted.",
    a = input.left,
    b = input.right,
    fa,
    fb,
    x = input.start,
    previous = null,
    previousF = null;
  const bracketed = ["bisection", "safeguarded"].includes(method);
  const finish = (s, r) => {
    status = s;
    reason = r;
  };
  let nextKind;
  function record(x, out, stepKind) {
    const row = {
      iteration: rows.length,
      x,
      f: out.value,
      derivative: out.derivative,
      step: rows.length ? x - rows.at(-1).x : null,
      stepKind,
      left: bracketed ? a : null,
      right: bracketed ? b : null,
      halfWidth: bracketed ? (b - a) / 2 : null,
    };
    rows.push(row);
    return row;
  }
  try {
    if (bracketed || method === "secant") {
      fa = evaluate(a).value;
      fb = evaluate(b).value;
    }
    if (bracketed) {
      if (fa === 0 || fb === 0) {
        x = fa === 0 ? a : b;
        record(x, evaluate(x), "endpoint");
        finish("exact-zero", "A bracket endpoint evaluates to zero.");
        return { method, status, reason, calls, rows };
      }
      if (!opposite(fa, fb)) {
        finish(
          "invalid-bracket",
          "Endpoint signs do not differ. An even-multiplicity root may still exist.",
        );
        return { method, status, reason, calls, rows };
      }
      x = method === "bisection" ? (a + b) / 2 : Math.min(b, Math.max(a, x));
    }
    if (method === "secant") {
      previous = a;
      previousF = fa;
      x = b;
    }
    for (let iteration = 0; iteration <= input.maxSteps; iteration++) {
      const out = evaluate(x),
        row = record(x, out, iteration === 0 ? "initial" : nextKind);
      if (out.value === 0) {
        finish(
          "exact-zero",
          "The polynomial evaluates to zero in floating-point arithmetic.",
        );
        break;
      }
      if (Math.abs(out.value) <= input.fTolerance) {
        finish(
          "residual-met",
          "Absolute function residual meets the requested tolerance; this is not an x-error bound.",
        );
        break;
      }
      if (bracketed) {
        if (opposite(fa, out.value)) {
          b = x;
          fb = out.value;
        } else {
          a = x;
          fa = out.value;
        }
        row.left = a;
        row.right = b;
        row.halfWidth = (b - a) / 2;
        if ((b - a) / 2 <= input.xTolerance) {
          const middle = (a + b) / 2;
          const mid = evaluate(middle);
          if (middle !== x) record(middle, mid, "bracket midpoint");
          finish(
            "bracket-met",
            "Bracket half-width meets x tolerance, conditional on reliable floating-point signs.",
          );
          break;
        }
      }
      if (iteration === input.maxSteps) break;
      let next;
      if (method === "bisection") {
        next = (a + b) / 2;
        nextKind = "bisect";
      } else if (method === "secant") {
        const denominator = out.value - previousF;
        if (denominator === 0) {
          finish("zero-denominator", "The two secant values are equal.");
          break;
        }
        next = x - out.value * ((x - previous) / denominator);
        nextKind = "secant";
      } else {
        const candidate =
          out.derivative === 0 ? NaN : x - out.value / out.derivative;
        if (method === "newton") {
          if (out.derivative === 0) {
            finish(
              "zero-derivative",
              "Newton cannot divide by a zero derivative.",
            );
            break;
          }
          next = candidate;
          nextKind = "Newton";
        } else {
          const width = b - a;
          if (
            Number.isFinite(candidate) &&
            candidate > a + 0.1 * width &&
            candidate < b - 0.1 * width
          ) {
            next = candidate;
            nextKind = "Newton";
          } else {
            next = (a + b) / 2;
            nextKind = "bisect fallback";
          }
        }
      }
      if (next === x) {
        finish(
          "stagnated",
          "The next iterate rounds to the same floating-point number before meeting a tolerance.",
        );
        break;
      }
      previous = x;
      previousF = out.value;
      x = next;
    }
  } catch (error) {
    finish("numerical-limit", error.message);
  }
  return { method, status, reason, calls, rows };
}
export function analyze(raw) {
  const input = validate(raw);
  return {
    format: "root-register-evidence-v1",
    input,
    runs: ["bisection", "newton", "secant", "safeguarded"].map((method) =>
      solve(input, method),
    ),
    curve: Array.from({ length: 401 }, (_, i) => {
      const x = input.left + ((input.right - input.left) * i) / 400;
      return { x, ...polynomial(input.coefficients, x) };
    }),
  };
}
