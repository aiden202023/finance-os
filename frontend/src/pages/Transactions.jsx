import { useEffect, useRef, useState } from "react";
import api from "../api/client";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const TYPE_LABELS = { roth_ira: "Roth IRA", hysa: "HYSA", taxable: "Taxable", checking: "Checking" };

function TransactionModal({ accounts, onClose, onSaved }) {
  const [form, setForm] = useState({
    account_id: accounts[0]?.id || "",
    type: "deposit",
    amount: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/transactions/", {
        account_id: parseInt(form.account_id),
        type: form.type,
        amount: parseFloat(form.amount),
        description: form.description,
        date: form.date ? new Date(form.date).toISOString() : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to log transaction");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Log Transaction</div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Account</label>
              <select
                className="select"
                value={form.account_id}
                onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({TYPE_LABELS[a.type] || a.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Type</label>
              <select
                className="select"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Amount ($)</label>
              <input
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Date</label>
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Description (optional)</label>
            <input
              className="input"
              placeholder="e.g. Paycheck, ETF purchase…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
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

function ImportModal({ accounts, onClose, onSaved }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef();

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return setError("Please select a CSV file");
    setError("");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("account_id", accountId);
      fd.append("file", file);
      const res = await api.post("/transactions/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Import CSV</div>

        {error && <div className="auth-error">{error}</div>}

        {result ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="import-result-box">
              <div className="import-result-row">
                <span className="import-result-label">Imported</span>
                <span className="import-result-value import-result-ok">{result.imported} transactions</span>
              </div>
              <div className="import-result-row">
                <span className="import-result-label">Skipped</span>
                <span className="import-result-value" style={{ color: result.skipped > 0 ? "var(--yellow)" : "var(--muted)" }}>
                  {result.skipped} rows
                </span>
              </div>
            </div>
            {result.skipped_details?.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {result.skipped_details.map((d, i) => <div key={i}>{d}</div>)}
              </div>
            )}
            <div className="form-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="form-group">
              <label className="label">Import into account</label>
              <select
                className="select"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({TYPE_LABELS[a.type] || a.type})
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`csv-drop-zone${dragging ? " csv-drop-zone--active" : ""}${file ? " csv-drop-zone--has-file" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={(e) => setFile(e.target.files[0])}
              />
              {file ? (
                <>
                  <div className="csv-drop-icon">📄</div>
                  <div className="csv-drop-name">{file.name}</div>
                  <div className="csv-drop-hint">Click to change file</div>
                </>
              ) : (
                <>
                  <div className="csv-drop-icon">⬆️</div>
                  <div className="csv-drop-name">Drop your CSV here</div>
                  <div className="csv-drop-hint">or click to browse — Chase, BofA, Wells Fargo, and most banks supported</div>
                </>
              )}
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || !file}>
                {loading ? "Importing…" : "Import"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filter, setFilter] = useState("");
  const [modal, setModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  async function load() {
    const [txns, accts] = await Promise.all([
      api.get("/transactions/", { params: filter ? { account_id: filter } : {} }),
      api.get("/accounts/"),
    ]);
    setTransactions(txns.data);
    setAccounts(accts.data);
  }

  useEffect(() => { load(); }, [filter]);

  async function handleDelete(id) {
    if (!window.confirm("Delete this transaction? The account balance will be reversed.")) return;
    await api.delete(`/transactions/${id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Transactions</div>
          <div className="page-subtitle">All deposits and withdrawals</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={() => setImportModal(true)}
            disabled={accounts.length === 0}
            title={accounts.length === 0 ? "Add an account first" : ""}
          >
            Import CSV
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setModal(true)}
            disabled={accounts.length === 0}
            title={accounts.length === 0 ? "Add an account first" : ""}
          >
            + Log Transaction
          </button>
        </div>
      </div>

      <div className="filter-row">
        <select
          className="select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {transactions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-text">No transactions yet</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td style={{ color: "var(--muted)", fontSize: 13 }}>
                      {new Date(t.date).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{t.account_name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {TYPE_LABELS[t.account_type] || t.account_type}
                      </div>
                    </td>
                    <td style={{ color: t.description ? "var(--text)" : "var(--muted)", fontStyle: t.description ? "normal" : "italic" }}>
                      {t.description || "—"}
                    </td>
                    <td>
                      <span className={`badge badge-${t.type}`}>
                        {t.type === "deposit" ? "Deposit" : "Withdrawal"}
                      </span>
                    </td>
                    <td className={t.type === "deposit" ? "amount-pos" : "amount-neg"}>
                      {t.type === "deposit" ? "+" : "-"}{fmt(t.amount)}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(t.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <TransactionModal
          accounts={accounts}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); load(); }}
        />
      )}

      {importModal && (
        <ImportModal
          accounts={accounts}
          onClose={() => setImportModal(false)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}
