import { Link } from "react-router";

import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import "./auth-pages.css";

const authMapImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCB7lj27VZe_fC75_GjcF5fQsHhHdIRTwMw7WMsr_1NLtr-cnKd4E6FKhEj8JmNErAqMZp33AjLTVTu8yGJsYSrHH-TVmei9gG-7xSKpImb2g2erfwHB6eUj4vefk6dZfp-HRsmutpb8gr6aJyxt34_9t3kwaf9vJrhUHXBSf3WKMDVwk-sbndm8ZKmiVDOE2C6Pq_oTgBjILLD3TQ63B5_3Zmc4D8SrcPwx3jU82ftzlyHeyY0ASojAfxUaoZtb9XBYCBToFJZJ-6R";

export function RegisterPage() {
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

            <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
              <div className="auth-grid-2">
                <label className="auth-field">
                  <span>First name</span>
                  <input type="text" placeholder="Aarav" autoComplete="given-name" />
                </label>

                <label className="auth-field">
                  <span>Last name</span>
                  <input type="text" placeholder="Sharma" autoComplete="family-name" />
                </label>
              </div>

              <label className="auth-field">
                <span>Email</span>
                <input type="email" placeholder="you@company.com" autoComplete="email" />
              </label>

              <div className="auth-grid-2">
                <label className="auth-field">
                  <span>Phone</span>
                  <input type="tel" placeholder="+91 98XX XXXX12" autoComplete="tel" />
                </label>

                <label className="auth-field">
                  <span>City</span>
                  <input type="text" placeholder="New Delhi" autoComplete="address-level2" />
                </label>
              </div>

              <div className="auth-grid-2">
                <label className="auth-field">
                  <span>Password</span>
                  <input type="password" placeholder="Create password" autoComplete="new-password" />
                </label>

                <label className="auth-field">
                  <span>Confirm password</span>
                  <input type="password" placeholder="Confirm password" autoComplete="new-password" />
                </label>
              </div>

              <label className="auth-check">
                <input type="checkbox" />
                <span>I agree to Ridr terms and sustainability policy.</span>
              </label>

              <button className="auth-submit" type="submit">
                Create account
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
