import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import {
  AuthApiError,
  loginUser,
  setAuthSession,
  type SessionPersistence,
} from "~/features/auth/auth-client";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import "./auth-pages.css";

const authMapImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCB7lj27VZe_fC75_GjcF5fQsHhHdIRTwMw7WMsr_1NLtr-cnKd4E6FKhEj8JmNErAqMZp33AjLTVTu8yGJsYSrHH-TVmei9gG-7xSKpImb2g2erfwHB6eUj4vefk6dZfp-HRsmutpb8gr6aJyxt34_9t3kwaf9vJrhUHXBSf3WKMDVwk-sbndm8ZKmiVDOE2C6Pq_oTgBjILLD3TQ63B5_3Zmc4D8SrcPwx3jU82ftzlyHeyY0ASojAfxUaoZtb9XBYCBToFJZJ-6R";

type AuthFeedback = {
  type: "error" | "success";
  message: string;
} | null;

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const destinationPath = useMemo(
    () => searchParams.get("next") || "/booking/fare-estimates",
    [searchParams],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const session = await loginUser({
        email: email.trim().toLowerCase(),
        password,
      });

      const persistence: SessionPersistence = rememberDevice ? "local" : "session";
      setAuthSession(session, persistence);

      setFeedback({
        type: "success",
        message: "Login successful. Redirecting...",
      });

      navigate(destinationPath, { replace: true });
    } catch (error) {
      const message =
        error instanceof AuthApiError
          ? error.message
          : "Unable to sign in right now. Please try again.";

      setFeedback({
        type: "error",
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <RidrTopNav active="dashboard" />

      <main className="auth-main">
        <img src={authMapImage} alt="City map" className="auth-map-bg" />
        <div className="auth-bg-overlay" />

        <section className="auth-shell" aria-label="Login experience">
          <article className="auth-panel">
            <p className="auth-eyebrow">Welcome back</p>
            <h1 className="auth-title">Sign in to Ridr.</h1>
            <p className="auth-subtitle">
              Access your routes, live fare intelligence, and carbon impact dashboard.
            </p>

            <div className="auth-note-pill-row" aria-hidden="true">
              <span className="auth-note-pill">Fast sign in</span>
              <span className="auth-note-pill">Encrypted session</span>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              {feedback ? (
                <p
                  className={[
                    "auth-feedback",
                    feedback.type === "error" ? "auth-feedback-error" : "auth-feedback-success",
                  ].join(" ")}
                  role="status"
                  aria-live="polite"
                >
                  {feedback.message}
                </p>
              ) : null}

              <label className="auth-field">
                <span>Email</span>
                <input
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>

              <label className="auth-field">
                <span>Password</span>
                <input
                  type="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </label>

              <div className="auth-inline-row">
                <label className="auth-check">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(event) => setRememberDevice(event.target.checked)}
                  />
                  <span>Remember this device</span>
                </label>

                <span className="auth-link auth-link-muted">Secure password login</span>
              </div>

              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Continue to dashboard"}
              </button>

              <p className="auth-helper-note">Use your Ridr account email and password to continue.</p>
            </form>

            <p className="auth-footer">
              New to Ridr?{" "}
              <Link to="/auth/register" className="auth-link">
                <strong>Create account</strong>
              </Link>
            </p>
          </article>

          <aside className="auth-spotlight">
            <h2>
              Every login,
              <br />
              a better journey.
            </h2>
            <p>
              Ridr blends premium mobility with measurable sustainability insights across every trip.
            </p>

            <div className="auth-chip-grid">
              <div className="auth-chip">
                <strong>Real-time Route IQ</strong>
                <small>Traffic-aware and ETA-predictive dispatching</small>
              </div>
              <div className="auth-chip">
                <strong>Carbon Ledger</strong>
                <small>Transparent impact tracking per ride</small>
              </div>
              <div className="auth-chip">
                <strong>Saved Places</strong>
                <small>Home/work shortcuts synced in session</small>
              </div>
              <div className="auth-chip">
                <strong>Fleet Priority</strong>
                <small>EV and eco options surfaced first</small>
              </div>
            </div>

            <div className="auth-stats">
              <strong>97.4%</strong>
              <p>
                of active users choose eco or carpool rides after tracking weekly impact insights.
              </p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
