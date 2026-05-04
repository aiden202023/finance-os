import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import api from "../api/client";

const CONTRIBUTION_LIMIT = 7000;
const CURRENT_YEAR = new Date().getFullYear();

// Allocations & assumed annual returns
const ALLOCATIONS = [
  { ticker: "VTI",  pct: 75, rate: 0.10, color: "#6366f1" },
  { ticker: "VXUS", pct: 15, rate: 0.08, color: "#10b981" },
  { ticker: "QQQM", pct: 5,  rate: 0.12, color: "#f59e0b" },
  { ticker: "GLD",  pct: 5,  rate: 0.05, color: "#ef4444" },
];

// Blended annual return
const BLENDED_RATE = ALLOCATIONS.reduce((sum, a) => sum + (a.pct / 100) * a.rate, 0);

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function buildProjection(currentBalance, annualContribution = CONTRIBUTION_LIMIT, years = 30) {
  const points = [];
  let balance = currentBalance;
  for (let y = 0; y <= years; y++) {
    points.push({ year: CURRENT_YEAR + y, value: Math.round(balance) });
    balance = balance * (1 + BLENDED_RATE) + annualContribution;
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
  const [rothAccounts, setRothAccounts] = useState([]);
  const [contributedThisYear, setContributedThisYear] = useState(0);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [acctsRes, txnsRes] = await Promise.all([
        api.get("/accounts/"),
        api.get("/transactions/"),
      ]);

      const roth = acctsRes.data.filter((a) => a.type === "roth_ira");
      setRothAccounts(roth);
      setTotalBalance(roth.reduce((s, a) => s + a.balance, 0));

      const rothIds = new Set(roth.map((a) => a.id));
      const yearContribs = txnsRes.data
        .filter((t) => {
          if (!rothIds.has(t.account_id) || t.type !== "deposit") return false;
          return new Date(t.date).getFullYear() === CURRENT_YEAR;
        })
        .reduce((s, t) => s + t.amount, 0);
      setContributedThisYear(yearContribs);
      setLoading(false);
    }
    load();
  }, []);

  const pct = Math.min(100, (contributedThisYear / CONTRIBUTION_LIMIT) * 100);
  const remaining = Math.max(0, CONTRIBUTION_LIMIT - contributedThisYear);
  const projection = buildProjection(totalBalance);

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

      {rothAccounts.length === 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: "var(--yellow)", background: "rgba(245,158,11,0.08)" }}>
          <div style={{ color: "var(--yellow)", fontSize: 14 }}>
            ⚠ No Roth IRA accounts found. Add an account with type "Roth IRA" on the Accounts page.
          </div>
        </div>
      )}

      <div className="roth-grid" style={{ marginBottom: 20 }}>
        {/* Contribution tracker */}
        <div className="card">
          <div className="section-title">
            {CURRENT_YEAR} Contributions
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 800 }}>{fmt(contributedThisYear)}</span>
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
          </div>

          {pct >= 100 ? (
            <div style={{ background: "var(--green-dim)", border: "1px solid var(--green)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 14, color: "var(--green)" }}>
              ✅ Annual contribution limit reached!
            </div>
          ) : (
            <div style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 14 }}>
              Contribute {fmt(remaining)} more to max out for {CURRENT_YEAR}
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <div className="section-title" style={{ fontSize: 14 }}>Account Balances</div>
            {rothAccounts.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No Roth IRA accounts</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rothAccounts.map((a) => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>{a.name}</span>
                    <span style={{ fontWeight: 600 }}>{fmt(a.balance)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4 }}>
                  <span>Total</span>
                  <span style={{ color: "var(--accent)" }}>{fmt(totalBalance)}</span>
                </div>
              </div>
            )}
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
              <div>• Starting balance: {fmt(totalBalance)}</div>
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
                name="Projected Value"
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
