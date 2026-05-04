import { useState, useEffect } from "react";
import api from "../api/client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const CONTRIBUTION_LIMIT = 7000;
const CURRENT_YEAR = new Date().getFullYear();

const DEFAULT_ALLOCATIONS = [
  { ticker: "VTI",  pct: 75, rate: 10, color: "#6366f1" },
  { ticker: "VXUS", pct: 15, rate: 8,  color: "#10b981" },
  { ticker: "QQQM", pct: 5,  rate: 12, color: "#f59e0b" },
  { ticker: "GLD",  pct: 5,  rate: 5,  color: "#ef4444" },
];

const PALETTE = ["#6366f1","#10b981","#f59e0b","#ef4444","#06b6d4","#f97316","#8b5cf6","#ec4899"];

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function blendedRate(allocations) {
  return allocations.reduce((sum, a) => sum + (a.pct / 100) * (a.rate / 100), 0);
}

function buildProjection(currentBalance, allocations, years = 30) {
  const rate = blendedRate(allocations);
  const points = [];
  let balance = currentBalance;
  for (let y = 0; y <= years; y++) {
    points.push({ year: CURRENT_YEAR + y, value: Math.round(balance) });
    balance = balance * (1 + rate) + CONTRIBUTION_LIMIT;
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

export default function RothIRA() {
  const [balance, setBalance] = useState("");
  const [contributed, setContributed] = useState("");
  const [allocations, setAllocations] = useState(DEFAULT_ALLOCATIONS);
  const [editingAlloc, setEditingAlloc] = useState(false);
  const [allocDraft, setAllocDraft] = useState([]);
  const [allocError, setAllocError] = useState("");
  const [saved, setSaved] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/roth-ira/").then((r) => {
      setBalance(r.data.balance > 0 ? String(r.data.balance) : "");
      setContributed(r.data.contributed > 0 ? String(r.data.contributed) : "");
      if (r.data.allocations?.length) {
        setAllocations(r.data.allocations.map((a) => ({ ...a, rate: a.rate * 100 })));
      }
    }).finally(() => setLoading(false));
  }, []);

  const currentBalance = parseFloat(balance) || 0;
  const contributedAmt = parseFloat(contributed) || 0;
  const pct = Math.min(100, (contributedAmt / CONTRIBUTION_LIMIT) * 100);
  const remaining = Math.max(0, CONTRIBUTION_LIMIT - contributedAmt);
  const projection = buildProjection(currentBalance, allocations);
  const blended = blendedRate(allocations);

  async function handleSave(e) {
    e.preventDefault();
    await api.put("/roth-ira/", {
      balance: parseFloat(balance) || 0,
      contributed: parseFloat(contributed) || 0,
      allocations: allocations.map((a) => ({ ...a, rate: a.rate / 100 })),
    });
    setSaved(true);
  }

  function startEditAlloc() {
    setAllocDraft(allocations.map((a) => ({ ...a })));
    setAllocError("");
    setEditingAlloc(true);
  }

  function updateDraftRow(i, field, value) {
    setAllocDraft((d) => d.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  function addDraftRow() {
    const color = PALETTE[allocDraft.length % PALETTE.length];
    setAllocDraft((d) => [...d, { ticker: "", pct: 0, rate: 7, color }]);
  }

  function removeDraftRow(i) {
    setAllocDraft((d) => d.filter((_, idx) => idx !== i));
  }

  function saveAllocations() {
    const rows = allocDraft.map((r) => ({
      ...r,
      ticker: r.ticker.trim().toUpperCase(),
      pct: parseFloat(r.pct) || 0,
      rate: parseFloat(r.rate) || 0,
    }));

    if (rows.some((r) => !r.ticker)) {
      setAllocError("All tickers must be filled in.");
      return;
    }
    const total = rows.reduce((s, r) => s + r.pct, 0);
    if (Math.abs(total - 100) > 0.01) {
      setAllocError(`Percentages must sum to 100% (currently ${total.toFixed(1)}%).`);
      return;
    }

    setAllocations(rows);
    setEditingAlloc(false);
    setAllocError("");
    setSaved(false);
  }

  if (loading) {
    return <div className="empty-state"><div className="empty-icon">⏳</div><div>Loading…</div></div>;
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
                  Annual contribution limit reached!
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Portfolio Allocation</div>
            {!editingAlloc && (
              <button className="btn btn-ghost btn-sm" onClick={startEditAlloc}>Edit</button>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            Blended annual return: ~{(blended * 100).toFixed(2)}%
          </div>

          {editingAlloc ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allocDraft.map((a, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px auto", gap: 6, alignItems: "center" }}>
                  <input
                    className="input"
                    placeholder="Ticker"
                    value={a.ticker}
                    onChange={(e) => updateDraftRow(i, "ticker", e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                  <div style={{ position: "relative" }}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="%"
                      value={a.pct}
                      onChange={(e) => updateDraftRow(i, "pct", e.target.value)}
                      style={{ fontSize: 13, paddingRight: 20 }}
                    />
                    <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--muted)", pointerEvents: "none" }}>%</span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="Rate"
                      value={a.rate}
                      onChange={(e) => updateDraftRow(i, "rate", e.target.value)}
                      style={{ fontSize: 13, paddingRight: 22 }}
                      title="Expected annual return %"
                    />
                    <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--muted)", pointerEvents: "none" }}>/yr</span>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => removeDraftRow(i)} disabled={allocDraft.length <= 1}>×</button>
                </div>
              ))}
              <div style={{ display: "flex", fontSize: 12, color: "var(--muted)", paddingLeft: 2 }}>
                <span style={{ flex: 1 }}>Ticker</span>
                <span style={{ width: 60, textAlign: "center" }}>Alloc %</span>
                <span style={{ width: 60, textAlign: "center", marginLeft: 6 }}>Return</span>
              </div>
              {allocError && <div style={{ fontSize: 12, color: "var(--red)" }}>{allocError}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={addDraftRow}>+ Add row</button>
                <button className="btn btn-primary btn-sm" onClick={saveAllocations}>Apply</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingAlloc(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="alloc-list">
              {allocations.map((a) => (
                <div className="alloc-item" key={a.ticker}>
                  <div className="alloc-header">
                    <span style={{ fontWeight: 600 }}>{a.ticker}</span>
                    <div style={{ display: "flex", gap: 16, color: "var(--muted)", fontSize: 13 }}>
                      <span>~{a.rate.toFixed(0)}%/yr</span>
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
          )}

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
