import { analyze, example, presets } from "./core.js";
const $ = (id) => document.getElementById(id),
  names = {
    bisection: "Bisection",
    newton: "Newton",
    secant: "Secant",
    safeguarded: "Safeguarded Newton",
  };
let report = analyze(example),
  method = "bisection",
  step = 0,
  timer = null;
const fmt = (x) =>
  x === null || x === undefined
    ? "—"
    : x === 0
      ? "0"
      : Math.abs(x) < 0.0001 || Math.abs(x) > 1e6
        ? x.toExponential(6)
        : Number(x.toPrecision(10)).toString();
function stop() {
  clearInterval(timer);
  timer = null;
  $("play").textContent = "Play";
}
function form() {
  $("preset").value =
    Object.entries(presets).find(
      ([, preset]) => JSON.stringify(preset) === JSON.stringify(report.input),
    )?.[0] ?? "custom";
  for (const key of [
    "left",
    "right",
    "start",
    "maxSteps",
    "xTolerance",
    "fTolerance",
  ])
    $(key).value = report.input[key];
  $("coefficients").value = report.input.coefficients.join(", ");
}
function draw(run, row) {
  const { left, right } = report.input,
    curve = report.curve,
    maxY = Math.max(1e-12, ...curve.map((p) => Math.abs(p.value))),
    X = (x) => 50 + ((x - left) / (right - left)) * 700,
    Y = (y) => 220 - (y / maxY) * 175;
  let svg = `<line class="axis" x1="50" y1="220" x2="750" y2="220"/><text x="50" y="418">${fmt(left)}</text><text x="690" y="418">${fmt(right)}</text><text x="12" y="30">f(x), ±${fmt(maxY)}</text>`;
  if (row?.left !== null && row?.left !== undefined)
    svg += `<rect class="bracket" x="${X(row.left)}" y="40" width="${Math.max(0, X(row.right) - X(row.left))}" height="350"/>`;
  svg += `<path class="curve" d="${curve.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(3)},${Y(p.value).toFixed(3)}`).join(" ")}"/>`;
  if (row && row.x >= left && row.x <= right && Math.abs(row.f) <= maxY * 1.05)
    svg += `<line class="marker" x1="${X(row.x)}" x2="${X(row.x)}" y1="40" y2="390"/><circle class="point" cx="${X(row.x)}" cy="${Y(row.f)}" r="7"/>`;
  else if (row)
    svg +=
      '<text x="50" y="385">Current iterate is outside the plot range.</text>';
  $("plot").innerHTML = svg;
}
function render() {
  const run = report.runs.find((r) => r.method === method);
  step = Math.max(0, Math.min(step, run.rows.length - 1));
  const row = run.rows[step];
  $("method-name").textContent = names[method];
  $("status").textContent = run.status.replaceAll("-", " ");
  $("reason").textContent = run.reason;
  $("metrics").innerHTML = [
    ["Inspected x", row?.x],
    ["Function residual", row ? Math.abs(row.f) : null],
    ["Derivative", row?.derivative],
    ["Bracket half-width", row?.halfWidth],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${fmt(v)}</dd>`)
    .join("");
  $("step-kind").textContent = row
    ? `Row ${step}: ${row.stepKind}. ${step < run.rows.length - 1 ? "Outcome above describes the complete run." : ""}`
    : "No iterations: starting assumptions failed.";
  $("step").max = Math.max(0, run.rows.length - 1);
  $("step").value = step;
  $("step").disabled = run.rows.length < 2;
  $("position").textContent = run.rows.length
    ? `${step} / ${run.rows.length - 1}`
    : "—";
  $("back").disabled = step === 0;
  $("next").disabled = step >= run.rows.length - 1;
  $("play").disabled = run.rows.length < 2;
  $("formula").textContent =
    `degree ${report.input.coefficients.length - 1} · coefficients [${report.input.coefficients.join(", ")}]`;
  $("comparison").innerHTML = report.runs
    .map(
      (r) =>
        `<tr><td>${names[r.method]}</td><td>${r.status}</td><td>${fmt(r.rows.at(-1)?.x)}</td><td>${fmt(r.rows.length ? Math.abs(r.rows.at(-1).f) : null)}</td><td>${r.calls}</td></tr>`,
    )
    .join("");
  $("ledger").innerHTML = run.rows
    .map(
      (r) =>
        `<tr><td>${r.iteration}</td><td>${fmt(r.x)}</td><td>${fmt(r.f)}</td><td>${fmt(r.derivative)}</td><td>${fmt(r.step)}</td><td>${r.stepKind}</td></tr>`,
    )
    .join("");
  draw(run, row);
}
function change(input) {
  const result = analyze(input);
  stop();
  report = result;
  step = 0;
  form();
  render();
  $("message").textContent = "";
}
$("preset").onchange = () => change(presets[$("preset").value]);
$("method").onchange = () => {
  stop();
  method = $("method").value;
  step = 0;
  render();
};
$("settings").onsubmit = (e) => {
  e.preventDefault();
  try {
    const pieces = $("coefficients").value.split(",");
    if (pieces.some((x) => !x.trim()))
      throw Error("Every coefficient must contain a number.");
    const input = { coefficients: pieces.map(Number) };
    for (const k of [
      "left",
      "right",
      "start",
      "maxSteps",
      "xTolerance",
      "fTolerance",
    ])
      input[k] = Number($(k).value);
    change(input);
    $("message").textContent = "All four methods recalculated.";
  } catch (error) {
    $("message").textContent = error.message;
  }
};
function move(x) {
  stop();
  step = Number(x);
  render();
}
$("step").oninput = (e) => move(e.target.value);
$("back").onclick = () => move(step - 1);
$("next").onclick = () => move(step + 1);
$("play").onclick = () => {
  if (timer) {
    stop();
    return;
  }
  const run = report.runs.find((r) => r.method === method);
  if (run.rows.length < 2) return;
  if (step >= run.rows.length - 1) step = 0;
  $("play").textContent = "Pause";
  render();
  timer = setInterval(() => {
    step++;
    render();
    if (step >= run.rows.length - 1) stop();
  }, 500);
};
function download(name, value, type = "application/json") {
  const url = URL.createObjectURL(
      new Blob(
        [type === "application/json" ? JSON.stringify(value, null, 2) : value],
        { type },
      ),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export").onclick = () =>
  download("root-register-evidence.json", {
    ...report,
    inspection: { method, step },
  });
$("save").onclick = () => download("root-register-study.json", report.input);
$("csv").onclick = () => {
  const fields = [
    "iteration",
    "x",
    "f",
    "derivative",
    "step",
    "stepKind",
    "left",
    "right",
    "halfWidth",
  ];
  download(
    "root-register-traces.csv",
    [
      "method," + fields.join(","),
      ...report.runs.flatMap((r) =>
        r.rows.map(
          (row) => r.method + "," + fields.map((k) => row[k] ?? "").join(","),
        ),
      ),
    ].join("\r\n") + "\r\n",
    "text/csv",
  );
};
$("open").onclick = () => $("file").click();
$("file").onchange = async () => {
  try {
    const file = $("file").files[0];
    if (!file) return;
    if (file.size > 20000) throw Error("Study files must be under 20 KB.");
    change(JSON.parse(await file.text()));
    $("message").textContent = "Study imported and all methods recomputed.";
  } catch (error) {
    $("message").textContent = error.message;
  } finally {
    $("file").value = "";
  }
};
form();
render();
