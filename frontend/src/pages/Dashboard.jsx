import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import api from "../api/client";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const ACCOUNT_COLORS = {
  roth_ira: "var(--accent)",
  hysa: "var(--green)",
  taxable: "var(--yellow)",
  checking: "var(--muted)",
};

const ACCOUNT_LABELS = {
  roth_ira: "Roth IRA",
  hysa: "HYSA",
  taxable: "Taxable",
  checking: "Checking",
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card card-sm" style={{ minWidth: 160 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{fmt(payload[0].value)}</div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.get("/dashboard/summary").then((r) => setSummary(r.data));
    api.get("/dashboard/net-worth-history").then((r) => setHistory(r.data));
  }, []);

  if (!summary) {
    return <div className="empty-state"><div className="empty-icon">⏳</div><div>Loading…</div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Your financial overview</div>
        </div>
      </div>

      {/* Net worth hero */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total Net Worth
            </div>
            <div className="net-worth-big">{fmt(summary.net_worth)}</div>
            <div className="net-worth-sub">{summary.accounts_count} accounts · {summary.goals_count} goals</div>
          </div>
        </div>

        {/* Account breakdown */}
        <div className="account-mini-grid">
          {summary.accounts.map((a) => (
            <div className="account-mini" key={a.id}>
              <div className="account-mini-name" style={{ color: ACCOUNT_COLORS[a.type] }}>
                {ACCOUNT_LABELS[a.type] || a.type} · {a.name}
              </div>
              <div className="account-mini-val">{fmt(a.balance)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="dash-grid">
        {/* Net worth chart */}
        <div className="card">
          <div className="section-title">Net Worth Over Time</div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(d) => {
                    const dt = new Date(d);
                    return `${dt.toLocaleString("default", { month: "short" })} '${String(dt.getFullYear()).slice(2)}`;
                  }}
                />
                <YAxis
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`}
                  width={55}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="net_worth"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "var(--accent)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent transactions */}
        <div className="card">
          <div className="section-title">Recent Transactions</div>
          {summary.recent_transactions.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px 0" }}>
              <div className="empty-icon">📭</div>
              <div className="empty-text">No transactions yet</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {summary.recent_transactions.map((t) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {t.description || (t.type === "deposit" ? "Deposit" : "Withdrawal")}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {t.account_name} · {new Date(t.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className={t.type === "deposit" ? "amount-pos" : "amount-neg"}>
                    {t.type === "deposit" ? "+" : "-"}{fmt(t.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
