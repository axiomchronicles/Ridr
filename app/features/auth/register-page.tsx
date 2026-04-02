import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import {
  AuthApiError,
  registerUser,
  setAuthSession,
} from "~/features/auth/auth-client";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import "./auth-pages.css";

const authMapImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCB7lj27VZe_fC75_GjcF5fQsHhHdIRTwMw7WMsr_1NLtr-cnKd4E6FKhEj8JmNErAqMZp33AjLTVTu8yGJsYSrHH-TVmei9gG-7xSKpImb2g2erfwHB6eUj4vefk6dZfp-HRsmutpb8gr6aJyxt34_9t3kwaf9vJrhUHXBSf3WKMDVwk-sbndm8ZKmiVDOE2C6Pq_oTgBjILLD3TQ63B5_3Zmc4D8SrcPwx3jU82ftzlyHeyY0ASojAfxUaoZtb9XBYCBToFJZJ-6R";

type AuthFeedback = {
  type: "error" | "success";
  message: string;
} | null;

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const destinationPath = useMemo(
    () => searchParams.get("next") || "/booking/fare-estimates",
    [searchParams],
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!acceptedTerms) {
      setFeedback({
        type: "error",
        message: "Please accept the terms and sustainability policy.",
      });
      return;
    }

    if (password !== confirmPassword) {
      setFeedback({
        type: "error",
        message: "Password and confirm password must match.",
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const session = await registerUser({
        firstName,
        lastName,
        email: email.trim().toLowerCase(),
        phone,
        city,
        password,
      });

      setAuthSession(session, "local");

      setFeedback({
        type: "success",
        message: "Account created successfully. Redirecting...",
      });

      navigate(destinationPath, { replace: true });
    } catch (error) {
      const message =
        error instanceof AuthApiError
          ? error.message
          : "Unable to create your account right now. Please try again.";

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

        <section className="auth-shell" aria-label="Register experience">
          <article className="auth-panel">
            <p className="auth-eyebrow">Create your account</p>
            <h1 className="auth-title">Join Ridr today.</h1>
            <p className="auth-subtitle">
              Build your mobility profile, unlock personalized routes, and track every gram of CO2 saved.
            </p>

            <div className="auth-note-pill-row" aria-hidden="true">
              <span className="auth-note-pill">2-minute setup</span>
              <span className="auth-note-pill">No extra OTP step</span>
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

              <div className="auth-grid-2">
                <label className="auth-field">
                  <span>First name</span>
                  <input
                    type="text"
                    placeholder="Aarav"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                  />
                </label>

                <label className="auth-field">
                  <span>Last name</span>
                  <input
                    type="text"
                    placeholder="Sharma"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    required
                  />
                </label>
              </div>

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

              <div className="auth-grid-2">
                <label className="auth-field">
                  <span>Phone</span>
                  <input
                    type="tel"
                    placeholder="+91 98XX XXXX12"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </label>

                <label className="auth-field">
                  <span>City</span>
                  <input
                    type="text"
                    placeholder="New Delhi"
                    autoComplete="address-level2"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                  />
                </label>
              </div>

              <div className="auth-grid-2">
                <label className="auth-field">
                  <span>Password</span>
                  <input
                    type="password"
                    placeholder="Create password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </label>

                <label className="auth-field">
                  <span>Confirm password</span>
                  <input
                    type="password"
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </label>
              </div>

              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                  required
                />
                <span>I agree to Ridr terms and sustainability policy.</span>
              </label>

              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating account..." : "Create account"}
              </button>

              <p className="auth-helper-note">After sign up, you can book instantly and save favorite places.</p>
            </form>

            <p className="auth-footer">
              Already registered?{" "}
              <Link to="/auth/login" className="auth-link">
                <strong>Sign in</strong>
              </Link>
            </p>
          </article>

          <aside className="auth-spotlight">
            <h2>
              Built for modern
              <br />
              urban mobility.
            </h2>
            <p>
              Your account activates instant booking, predictable fares, and impact-first travel preferences.
            </p>

            <div className="auth-chip-grid">
              <div className="auth-chip">
                <strong>Priority EV Match</strong>
                <small>Auto-preference for clean rides at booking</small>
              </div>
              <div className="auth-chip">
                <strong>Smart Saved Places</strong>
                <small>Home/work shortcuts available across flows</small>
              </div>
              <div className="auth-chip">
                <strong>Shared Ride Credits</strong>
                <small>Unlock pricing benefits with every carpool</small>
              </div>
              <div className="auth-chip">
                <strong>Weekly Insight Digest</strong>
                <small>Track spend, routes, and carbon reductions</small>
              </div>
            </div>

            <div className="auth-stats">
              <strong>1.2M+</strong>
              <p>
                riders now using Ridr across metro clusters with verified carbon-neutral trip offsets.
              </p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
