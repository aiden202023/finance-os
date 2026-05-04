import { useEffect, useState } from "react";
import api from "../api/client";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const TYPES = ["roth_ira", "hysa", "taxable", "checking"];
const TYPE_LABELS = { roth_ira: "Roth IRA", hysa: "HYSA", taxable: "Taxable", checking: "Checking" };

function AccountModal({ account, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: account?.name || "",
    type: account?.type || "checking",
    initial_balance: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!account;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isEdit) {
        await api.patch(`/accounts/${account.id}`, { name: form.name, type: form.type });
      } else {
        await api.post("/accounts/", {
          name: form.name,
          type: form.type,
          initial_balance: parseFloat(form.initial_balance) || 0,
        });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{isEdit ? "Edit Account" : "Add Account"}</div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-group">
            <label className="label">Account Name</label>
            <input
              className="input"
              placeholder="e.g. Fidelity Roth IRA"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="label">Account Type</label>
            <select
              className="select"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          {!isEdit && (
            <div className="form-group">
              <label className="label">Initial Balance ($)</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.initial_balance}
                onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
              />
            </div>
          )}
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

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [modal, setModal] = useState(null); // null | { mode: 'add' | 'edit', account? }
  const [deleting, setDeleting] = useState(null);

  async function load() {
    const { data } = await api.get("/accounts/");
    setAccounts(data);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id) {
    if (!window.confirm("Delete this account and all its transactions?")) return;
    setDeleting(id);
    await api.delete(`/accounts/${id}`);
    setDeleting(null);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Accounts</div>
          <div className="page-subtitle">Manage your financial accounts</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: "add" })}>
          + Add Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏦</div>
          <div className="empty-text">No accounts yet — add one to get started</div>
        </div>
      ) : (
        <div className="accounts-grid">
          {accounts.map((a) => (
            <div className="account-card" key={a.id}>
              <div className="account-card-header">
                <span className={`badge badge-${a.type}`}>{TYPE_LABELS[a.type]}</span>
                <div className="account-card-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setModal({ mode: "edit", account: a })}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(a.id)}
                    disabled={deleting === a.id}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="account-card-name">{a.name}</div>
              <div className="account-card-balance">{fmt(a.balance)}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Opened {new Date(a.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <AccountModal
          account={modal.account}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
