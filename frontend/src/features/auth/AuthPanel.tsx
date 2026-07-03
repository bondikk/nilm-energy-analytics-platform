import { LockKeyhole, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";

import { useAuth } from "../../app/providers";
import { ErrorState } from "../../components/ui/ErrorState";

export function AuthPanel() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-panel">
      <div>
        <span className="eyebrow">Authenticated workspace</span>
        <h2>Sign in to operate homes, telemetry, simulator, and anomaly workflows.</h2>
        <p>
          NILM Lab remains available after sign-in through the same dashboard shell and reads its
          dataset-backed sample from the backend.
        </p>
      </div>
      <form className="form-card" onSubmit={onSubmit}>
        <label>
          Email
          <span className="input-with-icon">
            <UserRound size={16} />
            <input
              autoComplete="username"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </span>
        </label>
        <label>
          Password
          <span className="input-with-icon">
            <LockKeyhole size={16} />
            <input
              autoComplete="current-password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </span>
        </label>
        <button className="button" disabled={busy} type="submit">
          {busy ? "Signing in..." : "Sign in"}
        </button>
        {error ? <ErrorState message={error} title="Authentication failed" /> : null}
      </form>
    </section>
  );
}
