import { useEffect, useState } from "react";
import api from "../api/client";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function GoalModal({ goal, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: goal?.name || "",
    target_amount: goal?.target_amount || "",
    current_amount: goal?.current_amount || "",
    target_date: goal?.target_date ? new Date(goal.target_date).toISOString().slice(0, 10) : "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const payload = {
      name: form.name,
      target_amount: parseFloat(form.target_amount),
      current_amount: parseFloat(form.current_amount) || 0,
      target_date: form.target_date ? new Date(form.target_date).toISOString() : null,
    };
    try {
      if (goal) {
        await api.patch(`/goals/${goal.id}`, payload);
      } else {
        await api.post("/goals/", payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save goal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{goal ? "Edit Goal" : "New Goal"}</div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-group">
            <label className="label">Goal Name</label>
            <input
              className="input"
              placeholder="e.g. Emergency Fund, House Down Payment…"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Target Amount ($)</label>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                placeholder="10000"
                value={form.target_amount}
                onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Current Amount ($)</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.current_amount}
                onChange={(e) => setForm({ ...form, current_amount: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Target Date (optional)</label>
            <input
              className="input"
              type="date"
              value={form.target_date}
              onChange={(e) => setForm({ ...form, target_date: e.target.value })}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [modal, setModal] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function load() {
    const { data } = await api.get("/goals/");
    setGoals(data);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id) {
    await api.delete(`/goals/${id}`);
    setPendingDelete(null);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Goals</div>
          <div className="page-subtitle">Track your savings milestones</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ goal: null })}>
          + Add Goal
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <div className="empty-text">No goals yet — set one to stay on track</div>
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map((g) => {
            const pct = Math.min(100, g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0);
            const complete = pct >= 100;
            return (
              <div className="goal-card" key={g.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="goal-name">{g.name}</div>
                  {complete && <span style={{ fontSize: 20 }}>✅</span>}
                </div>
                <div>
                  <div className="goal-amounts">
                    <span>{fmt(g.current_amount)} saved</span>
                    <span className="goal-pct">{pct.toFixed(0)}%</span>
                    <span>of {fmt(g.target_amount)}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div className="progress-track">
                      <div
                        className={`progress-fill${complete ? " complete" : ""}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
                {g.target_date && (
                  <div className="goal-date">
                    🗓 Target: {new Date(g.target_date).toLocaleDateString("en-US", { year: "numeric", month: "long" })}
                  </div>
                )}
                <div className="goal-actions">
                  {pendingDelete === g.id ? (
                    <>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>Sure?</span>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(g.id)}>Yes</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPendingDelete(null)}>No</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => setModal({ goal: g })}>
                        Edit
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => setPendingDelete(g.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <GoalModal
          goal={modal.goal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
