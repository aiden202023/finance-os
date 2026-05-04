import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const CONTRIBUTION_LIMIT = 7000;
const CURRENT_YEAR = new Date().getFullYear();

const ALLOCATIONS = [
  { ticker: "VTI",  pct: 75, rate: 0.10, color: "#6366f1" },
  { ticker: "VXUS", pct: 15, rate: 0.08, color: "#10b981" },
  { ticker: "QQQM", pct: 5,  rate: 0.12, color: "#f59e0b" },
  { ticker: "GLD",  pct: 5,  rate: 0.05, color: "#ef4444" },
];

const BLENDED_RATE = ALLOCATIONS.reduce((sum, a) => sum + (a.pct / 100) * a.rate, 0);

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function buildProjection(currentBalance, years = 30) {
  const points = [];
  let balance = currentBalance;
  for (let y = 0; y <= years; y++) {
    points.push({ year: CURRENT_YEAR + y, value: Math.round(balance) });
    balance = balance * (1 + BLENDED_RATE) + CONTRIBUTION_LIMIT;
  }
  return points;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card card-sm" style={{ minWidth: 160 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{fmt(payload[0].value)}</div>
    </div>
  );
}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export default function RothIRA() {
  const [balance, setBalance] = useState(() => load("roth_balance", ""));
  const [contributed, setContributed] = useState(() => load("roth_contributed", ""));
  const [saved, setSaved] = useState(true);

  const currentBalance = parseFloat(balance) || 0;
  const contributedAmt = parseFloat(contributed) || 0;
  const pct = Math.min(100, (contributedAmt / CONTRIBUTION_LIMIT) * 100);
  const remaining = Math.max(0, CONTRIBUTION_LIMIT - contributedAmt);
  const projection = buildProjection(currentBalance);

  function handleSave(e) {
    e.preventDefault();
    localStorage.setItem("roth_balance", JSON.stringify(balance));
    localStorage.setItem("roth_contributed", JSON.stringify(contributed));
    setSaved(true);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Roth IRA</div>
          <div className="page-subtitle">{CURRENT_YEAR} contribution tracker & growth projection</div>
        </div>
      </div>

      <div className="roth-grid" style={{ marginBottom: 20 }}>
        {/* Input + contribution tracker */}
        <div className="card">
          <div className="section-title">Your Numbers</div>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="form-group">
              <label className="label">Current Roth IRA Value ($)</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 24000"
                value={balance}
                onChange={(e) => { setBalance(e.target.value); setSaved(false); }}
              />
            </div>
            <div className="form-group">
              <label className="label">Contributed in {CURRENT_YEAR} ($)</label>
              <input
                className="input"
                type="number"
                min="0"
                max={CONTRIBUTION_LIMIT}
                step="0.01"
                placeholder="e.g. 3500"
                value={contributed}
                onChange={(e) => { setContributed(e.target.value); setSaved(false); }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ alignSelf: "flex-start" }}
              disabled={saved}
            >
              {saved ? "Saved" : "Save"}
            </button>
          </form>

          <div style={{ marginTop: 28 }}>
            <div className="section-title" style={{ fontSize: 14 }}>{CURRENT_YEAR} Contribution Progress</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, marginTop: 12 }}>
              <span style={{ fontSize: 24, fontWeight: 800 }}>{fmt(contributedAmt)}</span>
              <span style={{ color: "var(--muted)", alignSelf: "flex-end" }}>of {fmt(CONTRIBUTION_LIMIT)}</span>
            </div>
            <div className="progress-track" style={{ height: 12 }}>
              <div
                className={`progress-fill${pct >= 100 ? " complete" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13, color: "var(--muted)" }}>
              <span>{pct.toFixed(1)}% contributed</span>
              <span>{fmt(remaining)} remaining</span>
            </div>

            <div style={{ marginTop: 16 }}>
              {pct >= 100 ? (
                <div style={{ background: "var(--green-dim)", border: "1px solid var(--green)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 14, color: "var(--green)" }}>
                  ✅ Annual contribution limit reached!
                </div>
              ) : (
                <div style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 14 }}>
                  Contribute {fmt(remaining)} more to max out for {CURRENT_YEAR}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Allocation breakdown */}
        <div className="card">
          <div className="section-title">Portfolio Allocation</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            Blended annual return: ~{(BLENDED_RATE * 100).toFixed(2)}%
          </div>
          <div className="alloc-list">
            {ALLOCATIONS.map((a) => (
              <div className="alloc-item" key={a.ticker}>
                <div className="alloc-header">
                  <span style={{ fontWeight: 600 }}>{a.ticker}</span>
                  <div style={{ display: "flex", gap: 16, color: "var(--muted)", fontSize: 13 }}>
                    <span>~{(a.rate * 100).toFixed(0)}%/yr</span>
                    <span className="alloc-pct">{a.pct}%</span>
                  </div>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${a.pct}%`, background: a.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="section-title" style={{ fontSize: 14 }}>Projection Assumptions</div>
            <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
              <div>• Annual contribution: {fmt(CONTRIBUTION_LIMIT)}/yr</div>
              <div>• Compounding: annual</div>
              <div>• Starting balance: {fmt(currentBalance)}</div>
              <div>• Horizon: 30 years</div>
            </div>
          </div>
        </div>
      </div>

      {/* Projected growth chart */}
      <div className="card">
        <div className="section-title">30-Year Projected Growth</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          Projected value at {CURRENT_YEAR + 30}: <strong style={{ color: "var(--green)" }}>{fmt(projection[30]?.value)}</strong>
        </div>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projection} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="year"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`}
                width={65}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--green)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: "var(--green)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
