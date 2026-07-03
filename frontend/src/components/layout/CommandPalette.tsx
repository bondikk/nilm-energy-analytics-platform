import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const COMMANDS = [
  { label: "Overview", path: "/dashboard", hint: "Energy summary" },
  { label: "Analytics", path: "/dashboard/analytics", hint: "Telemetry trends" },
  { label: "NILM Lab", path: "/dashboard/nilm-lab", hint: "Prediction overlay" },
  { label: "Anomalies", path: "/dashboard/anomalies", hint: "Events and severity" },
  { label: "Simulator", path: "/dashboard/simulator", hint: "Demo data and MQTT" },
  { label: "Settings", path: "/dashboard/settings", hint: "Session and API" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("voltpulse:open-command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("voltpulse:open-command", onOpen);
    };
  }, []);

  const commands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return COMMANDS;
    }
    return COMMANDS.filter((command) =>
      `${command.label} ${command.hint}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  if (!open) {
    return null;
  }

  return (
    <div className="command-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="command-palette" onMouseDown={(event) => event.stopPropagation()}>
        <label className="command-search">
          <Search size={18} />
          <input
            autoFocus
            placeholder="Search pages, datasets, tools..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="command-list">
          {commands.map((command) => (
            <button
              className="command-item"
              key={command.path}
              type="button"
              onClick={() => {
                navigate(command.path);
                setOpen(false);
                setQuery("");
              }}
            >
              <strong>{command.label}</strong>
              <span>{command.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
