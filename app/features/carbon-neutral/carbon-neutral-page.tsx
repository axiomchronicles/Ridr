import { Link } from "react-router";

import { RidrMobileNav } from "~/features/shared/components/ridr-mobile-nav";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";

import "./carbon-neutral-page.css";

const leaderboardAvatars = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCbvYrngvh2U-v5OPpTWKy1Ksrmih9wWv7cJoBdtiAO5BsCCwfIJsKt0MCMls7sUyQ6bbciS1rFzq2ZRBi1XHTgsJIuL7NuOrJNGTImGQCXP1_KVX0iVIWE5EpS_BF-QK_RyvYruBh28NBMj31A7NMZdpXak0DRVIaUU1e12Mlq9aMXgeiRaeIiw5XHIlcHcR26oRlaqlnqWJO_1CPoCPcit2T9ghJnGbP1ncVL06UxscwROZjffg1sJ4Zbj8AYxPve-u98B9x9ZLn5",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAydWTvtefZtBkEGp-giw4KFJBF24XtDpk7h6sXNlQGHxx5AFe353Lz49IyG1gMQEUkxFDEwFm7sfbOgg3NeR1bb2FXX_VFrNBNCIdCfyT5DewttWt2vJzHzq4VPuPs5Zmc7Sgf5QfvD2_3ra8HJ5gWNzk4Om1V64Hxll6AdUUsu-Y_6MnfdkozC196GK6AmPvY2dc4BR30NJfmKmij7yPg3qkC38U5Fnilf-eG8mgBWKI0AX_PQBOqSBjJZwrrmYs8T4QkP2yAsRfQ",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDgmHbkLFWBFuA-3vrIWe7Y-BgTlhoXFU3FmxjNupvsKeZosDlo_JMom6mhsM9n0zCQtGAgwKaTKYhpldOkIg0cyZK9URr7lXD2uzmYF1ZywQvJX_UcptEVDNqSvB4j7WO3z6VYGqllPlvq7ErbzFPqJkZPZUekYmGdgjzpGQ480-6Zlt3fIxbY0jiDeJ1fD7VxenWUZjW17g9eq0kJTfVNSveoeAnznC9ghO8-MN1aMzwjU-iYJwV7nJ3zIHAXEOhqlrjLI3LEwq6a",
];

export function CarbonNeutralPage() {
  return (
    <div className="carbon-page">
      <RidrTopNav active="impact" />

      <main className="carbon-main-layout">
        <aside className="carbon-side-nav">
          <h1>Ridr Premium</h1>
          <p>Carbon Neutral Member</p>

          <nav>
            <Link to="/" className="carbon-side-link">
              <MaterialSymbol name="home" />
              Home
            </Link>
            <Link to="/booking/fare-estimates" className="carbon-side-link">
              <MaterialSymbol name="directions_car" />
              My Rides
            </Link>
            <Link to="/impact/carbon-neutral" className="carbon-side-link carbon-side-link-active">
              <MaterialSymbol name="energy_savings_leaf" filled />
              Sustainability
            </Link>
            <Link to="/ride/pre-meeting-chat" className="carbon-side-link">
              <MaterialSymbol name="chat_bubble" />
              Messages
            </Link>
          </nav>

          <Link to="/booking/fare-estimates" className="carbon-report-cta">
            Carbon Report
          </Link>
        </aside>

        <section className="carbon-content">
          <header className="carbon-header">
            <span>Your Global Footprint</span>
            <h2>Sustainability Dashboard</h2>
            <p>
              Visualizing your contribution to a greener planet and a healthier
              wallet through conscious mobility.
            </p>
          </header>

          <section className="carbon-top-grid">
            <article className="carbon-forecast-card">
              <small>
                <MaterialSymbol name="savings" filled /> Financial Forecast
              </small>
              <h3>
                If you keep using Ridr, you will save <em>$3,503.11</em> in 7 years.
              </h3>
              <div className="carbon-progress-meta">
                <span>Current Progress</span>
                <span>12% of Goal</span>
              </div>
              <div className="carbon-progress-track">
                <div className="carbon-progress-fill" />
              </div>
            </article>

            <article className="carbon-impact-card">
              <MaterialSymbol name="cloud_off" filled className="carbon-cloud-icon" />
              <h3>The 30-Year Impact</h3>
              <strong>You will prevent 102,960 lbs of CO2</strong>
              <p>Equivalent to planting 1,240 mature trees in urban areas.</p>
            </article>
          </section>

          <section className="carbon-mid-grid">
            <article className="carbon-achievements-card">
              <header>
                <h3>Achievements</h3>
                <button type="button">View All</button>
              </header>

              <div>
                <article>
                  <MaterialSymbol name="workspace_premium" filled />
                  <div>
                    <strong>Carbon Saver</strong>
                    <p>Prevented 100 lbs of CO2</p>
                  </div>
                </article>
                <article>
                  <MaterialSymbol name="commute" />
                  <div>
                    <strong>Eco Commuter</strong>
                    <p>10 electric rides in a row</p>
                  </div>
                </article>
                <article className="carbon-achievement-locked">
                  <MaterialSymbol name="lock" />
                  <div>
                    <strong>Forest Guardian</strong>
                    <p>Reach 500 lbs to unlock</p>
                  </div>
                </article>
              </div>
            </article>

            <article className="carbon-history-card">
              <header>
                <h3>Recent Impact History</h3>
                <div>
                  <button type="button">Monthly</button>
                  <button type="button" className="carbon-history-tab-active">
                    Weekly
                  </button>
                </div>
              </header>

              <div>
                <article>
                  <div>
                    <MaterialSymbol name="bolt" />
                    <div>
                      <strong>Downtown Office to Home</strong>
                      <p>Oct 24 • 14.2 miles</p>
                    </div>
                  </div>
                  <aside>
                    <strong>+$12.40</strong>
                    <em>-4.2 lbs CO2</em>
                  </aside>
                </article>
                <article>
                  <div>
                    <MaterialSymbol name="eco" />
                    <div>
                      <strong>Central Park Mall Loop</strong>
                      <p>Oct 23 • 8.5 miles</p>
                    </div>
                  </div>
                  <aside>
                    <strong>+$7.15</strong>
                    <em>-2.8 lbs CO2</em>
                  </aside>
                </article>
                <article>
                  <div>
                    <MaterialSymbol name="electric_car" />
                    <div>
                      <strong>Airport Terminal B Transfer</strong>
                      <p>Oct 21 • 22.1 miles</p>
                    </div>
                  </div>
                  <aside>
                    <strong>+$18.90</strong>
                    <em>-8.4 lbs CO2</em>
                  </aside>
                </article>
              </div>
            </article>
          </section>

          <section className="carbon-leaderboard">
            <header>
              <div>
                <h3>Community Leaderboard</h3>
                <p>How you rank against other Ridr members in your city.</p>
              </div>
              <div className="carbon-leader-avatars">
                {leaderboardAvatars.map((avatar) => (
                  <img key={avatar} src={avatar} alt="Leader avatar" />
                ))}
                <span>+12k</span>
              </div>
            </header>

            <article>
              <span>01</span>
              <div>
                <strong>Sarah Jenkins</strong>
                <p>Seattle, WA</p>
              </div>
              <aside>
                <strong>2,410 lbs prevented</strong>
                <p>Elite Guardian</p>
              </aside>
            </article>

            <article className="carbon-you-row">
              <span>14</span>
              <div>
                <strong>You (Alex)</strong>
                <p>Seattle, WA</p>
              </div>
              <aside>
                <strong>1,024 lbs prevented</strong>
                <p>Carbon Saver</p>
              </aside>
            </article>

            <article>
              <span>15</span>
              <div>
                <strong>Marcus Brown</strong>
                <p>Tacoma, WA</p>
              </div>
              <aside>
                <strong>988 lbs prevented</strong>
                <p>Eco Newbie</p>
              </aside>
            </article>
          </section>
        </section>
      </main>

      <RidrMobileNav active="impact" />
    </div>
  );
}
