import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/dashboard",    icon: "📊", label: "Dashboard" },
  { to: "/accounts",     icon: "🏦", label: "Accounts" },
  { to: "/transactions", icon: "↕️",  label: "Transactions" },
  { to: "/goals",        icon: "🎯", label: "Goals" },
  { to: "/roth-ira",     icon: "📈", label: "Roth IRA" },
];

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-logo">💰 Finance OS</div>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
        >
          <span className="icon">{l.icon}</span>
          {l.label}
        </NavLink>
      ))}
      <div className="navbar-spacer" />
      {user && <div className="navbar-user">{user.email}</div>}
      <button className="navbar-logout" onClick={logout}>
        <span>🚪</span> Log out
      </button>
    </nav>
  );
}
