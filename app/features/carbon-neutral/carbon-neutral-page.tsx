import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { getAccessToken } from "~/features/auth/auth-client";
import {
  fetchActiveRideBookingSession,
  fetchSustainabilityDashboard,
  type SustainabilityDashboard,
  type SustainabilityLeaderboardEntry,
  type SustainabilityTrendPoint,
} from "~/features/mobility/mobility-client";
import { RidrMobileNav } from "~/features/shared/components/ridr-mobile-nav";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";

import "./carbon-neutral-page.css";

type HistoryView = "weekly" | "monthly";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatShortDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }

  return parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function toInitials(name: string): string {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "RM";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export function CarbonNeutralPage() {
  const [dashboard, setDashboard] = useState<SustainabilityDashboard | null>(null);
  const [historyView, setHistoryView] = useState<HistoryView>("weekly");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [messageHref, setMessageHref] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      setErrorMessage("Sign in to view your sustainability analytics.");
      return;
    }
    const authToken = token;

    let disposed = false;

    async function hydrateDashboard() {
      try {
        const data = await fetchSustainabilityDashboard(authToken);
        if (!disposed) {
          setDashboard(data);
          setErrorMessage("");
        }
      } catch (error) {
        if (!disposed) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load sustainability dashboard right now.",
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    async function hydrateMessageAccess() {
      try {
        const session = await fetchActiveRideBookingSession(authToken);
        if (disposed) {
          return;
        }

        const hasMessagingSession =
          session.has_active_session &&
          session.ride_id &&
          (session.ride_status === "accepted" || session.ride_status === "in_progress");

        if (!hasMessagingSession) {
          setMessageHref(null);
          return;
        }

        const query = new URLSearchParams();
        query.set("rideId", session.ride_id as string);

        if (session.pickup_label?.trim()) {
          query.set("pickup", session.pickup_label.trim());
        }

        if (session.destination_label?.trim()) {
          query.set("destination", session.destination_label.trim());
        }

        setMessageHref(`/ride/pre-meeting-chat?${query.toString()}`);
      } catch {
        if (!disposed) {
          setMessageHref(null);
        }
      }
    }

    void hydrateDashboard();
    void hydrateMessageAccess();

    return () => {
      disposed = true;
    };
  }, []);

  const historyPoints: SustainabilityTrendPoint[] = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    return historyView === "weekly" ? dashboard.history_weekly : dashboard.history_monthly;
  }, [dashboard, historyView]);

  const leaderboardRows = useMemo(() => {
    if (!dashboard) {
      return [] as SustainabilityLeaderboardEntry[];
    }

    const topRows = dashboard.leaderboard.slice(0, 5);
    if (topRows.some((entry) => entry.is_current_user)) {
      return topRows;
    }

    const currentUserRow = dashboard.leaderboard.find((entry) => entry.is_current_user);
    if (!currentUserRow) {
      return topRows;
    }

    return [...topRows.slice(0, 4), currentUserRow].sort((left, right) => left.rank - right.rank);
  }, [dashboard]);

  const leaderboardAvatars = useMemo(
    () => leaderboardRows.slice(0, 3),
    [leaderboardRows],
  );

  const sevenYearSavings = dashboard?.forecast_7y.projected_money_saved_usd ?? 0;
  const sevenYearGoalProgress = dashboard?.forecast_7y.goal_progress_percent ?? 0;
  const thirtyYearImpactLbs = dashboard?.impact_30y.projected_co2_saved_lbs ?? 0;
  const thirtyYearTrees = dashboard?.impact_30y.projected_tree_equivalent ?? 0;

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
              Book
            </Link>
            <Link to="/ride/my-rides" className="carbon-side-link">
              <MaterialSymbol name="history" />
              My Rides
            </Link>
            <Link to="/dashboard" className="carbon-side-link carbon-side-link-active">
              <MaterialSymbol name="energy_savings_leaf" filled />
              Dashboard
            </Link>
            {messageHref ? (
              <Link to={messageHref} className="carbon-side-link">
                <MaterialSymbol name="chat_bubble" />
                Messages
              </Link>
            ) : null}
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
              Live carbon analytics generated from your ride activity, vehicle profile,
              and city-level community comparisons.
            </p>
            {loading ? <p className="carbon-inline-status">Refreshing live sustainability metrics...</p> : null}
            {!loading && errorMessage ? <p className="carbon-inline-error">{errorMessage}</p> : null}
          </header>

          <section className="carbon-top-grid">
            <article className="carbon-forecast-card">
              <small>
                <MaterialSymbol name="savings" filled /> Financial Forecast
              </small>
              <h3>
                If you keep using Ridr, you can save <em>{inrFormatter.format(sevenYearSavings)}</em> in 7 years.
              </h3>
              <div className="carbon-progress-meta">
                <span>Current Progress</span>
                <span>{sevenYearGoalProgress.toFixed(1)}% of Goal</span>
              </div>
              <div className="carbon-progress-track">
                <div className="carbon-progress-fill" style={{ width: `${Math.max(0, Math.min(100, sevenYearGoalProgress))}%` }} />
              </div>
            </article>

            <article className="carbon-impact-card">
              <MaterialSymbol name="cloud_off" filled className="carbon-cloud-icon" />
              <h3>The 30-Year Impact</h3>
              <strong>You can prevent {Math.round(thirtyYearImpactLbs).toLocaleString()} lbs of CO2</strong>
              <p>Equivalent to planting {thirtyYearTrees.toLocaleString()} mature trees in urban areas.</p>
            </article>
          </section>

          <section className="carbon-mid-grid">
            <article className="carbon-achievements-card">
              <header>
                <h3>Achievements</h3>
                <button type="button">Live</button>
              </header>

              <div>
                {(dashboard?.achievements || []).map((achievement) => (
                  <article
                    key={achievement.key}
                    className={achievement.unlocked ? "" : "carbon-achievement-locked"}
                  >
                    <MaterialSymbol name={achievement.unlocked ? "workspace_premium" : "lock"} filled={achievement.unlocked} />
                    <div>
                      <strong>{achievement.title}</strong>
                      <p>
                        {achievement.description}
                        {achievement.unlocked ? " • Unlocked" : ` • ${achievement.progress_percent.toFixed(1)}%`}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="carbon-history-card">
              <header>
                <h3>Recent Impact History</h3>
                <div>
                  <button
                    type="button"
                    className={historyView === "monthly" ? "carbon-history-tab-active" : ""}
                    onClick={() => setHistoryView("monthly")}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={historyView === "weekly" ? "carbon-history-tab-active" : ""}
                    onClick={() => setHistoryView("weekly")}
                  >
                    Weekly
                  </button>
                </div>
              </header>

              <div>
                {(dashboard?.recent_history || []).slice(0, 3).map((entry) => (
                  <article key={entry.ride_id}>
                    <div>
                      <MaterialSymbol name={entry.role === "driver" ? "electric_car" : "eco"} />
                      <div>
                        <strong>{entry.route_label}</strong>
                        <p>{formatShortDate(entry.date)} • {entry.distance_miles.toFixed(1)} miles</p>
                      </div>
                    </div>
                    <aside>
                      <strong>+{inrFormatter.format(entry.money_saved_usd)}</strong>
                      <em>-{entry.co2_saved_lbs.toFixed(1)} lbs CO2</em>
                    </aside>
                  </article>
                ))}
                {historyPoints.length > 0 ? (
                  <div className="carbon-trend-strip" role="img" aria-label="Trend summary">
                    {historyPoints.map((point) => (
                      <div key={`${historyView}-${point.period_start}`}>
                        <strong>{point.label}</strong>
                        <p>{point.co2_saved_lbs.toFixed(1)} lbs</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          </section>

          <section className="carbon-leaderboard">
            <header>
              <div>
                <h3>Community Leaderboard</h3>
                <p>Real-time city ranking from ride-derived CO2 savings.</p>
              </div>
              <div className="carbon-leader-avatars">
                {leaderboardAvatars.map((leader) => (
                  <span key={`leader-initial-${leader.user_id}`}>{toInitials(leader.name)}</span>
                ))}
                <span>+{Math.max(0, (dashboard?.leaderboard.length || 0) - leaderboardAvatars.length)}</span>
              </div>
            </header>

            {leaderboardRows.map((entry) => (
              <article key={`leader-${entry.user_id}-${entry.rank}`} className={entry.is_current_user ? "carbon-you-row" : ""}>
                <span>{String(entry.rank).padStart(2, "0")}</span>
                <div>
                  <strong>{entry.is_current_user ? `You (${entry.name})` : entry.name}</strong>
                  <p>{entry.city || "City unknown"}</p>
                </div>
                <aside>
                  <strong>{entry.co2_saved_lbs.toLocaleString()} lbs prevented</strong>
                  <p>{entry.badge}</p>
                </aside>
              </article>
            ))}
          </section>
        </section>
      </main>

      <RidrMobileNav active="impact" />
    </div>
  );
}
