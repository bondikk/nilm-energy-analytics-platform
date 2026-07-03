import {
  Activity,
  AlertTriangle,
  BarChart3,
  Gauge,
  Home,
  LogOut,
  Microscope,
  Play,
  Search,
  Settings,
  Zap,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../app/providers";
import { AuthPanel } from "../../features/auth/AuthPanel";
import { CommandPalette } from "./CommandPalette";

const navItems = [
  { label: "Overview", path: "/dashboard", icon: Gauge, end: true },
  { label: "Analytics", path: "/dashboard/analytics", icon: BarChart3 },
  { label: "NILM Lab", path: "/dashboard/nilm-lab", icon: Microscope },
  { label: "Anomalies", path: "/dashboard/anomalies", icon: AlertTriangle },
  { label: "Simulator", path: "/dashboard/simulator", icon: Play },
  { label: "Settings", path: "/dashboard/settings", icon: Settings },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Energy control room",
  "/dashboard/analytics": "Telemetry analytics",
  "/dashboard/nilm-lab": "NILM Lab",
  "/dashboard/anomalies": "Anomaly operations",
  "/dashboard/simulator": "Simulator",
  "/dashboard/settings": "Settings",
};

export function DashboardLayout() {
  const { isAuthenticated, isBootstrapping, signOut, user } = useAuth();
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "VoltPulse";

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/">
          <span className="brand__mark">
            <Zap size={19} />
          </span>
          <span>
            <strong>VoltPulse</strong>
            <small>NILM Platform</small>
          </span>
        </NavLink>

        <nav className="nav-stack" aria-label="Dashboard">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
                end={item.end}
                key={item.path}
                to={item.path}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <div className="sidebar-card__icon">
            <Activity size={18} />
          </div>
          <strong>Research mode</strong>
          <span>Dataset, baseline, evaluation, dashboard.</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Cloud-native NILM</span>
            <h1>{title}</h1>
          </div>
          <div className="topbar__actions">
            <button
              className="search-button"
              type="button"
              onClick={() => window.dispatchEvent(new Event("voltpulse:open-command"))}
            >
              <Search size={16} />
              <span>Command</span>
              <kbd>⌘K</kbd>
            </button>
            {isAuthenticated ? (
              <button className="button button--secondary" type="button" onClick={signOut}>
                <LogOut size={16} />
                Sign out
              </button>
            ) : null}
          </div>
        </header>

        {!isAuthenticated && !isBootstrapping ? (
          <AuthPanel />
        ) : (
          <>
            <div className="session-strip">
              <Home size={16} />
              <span>{user?.email ?? "Loading session"}</span>
            </div>
            <Outlet />
          </>
        )}
      </main>
      <CommandPalette />
    </div>
  );
}
