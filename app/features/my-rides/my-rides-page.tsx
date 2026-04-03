import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { getAccessToken } from "~/features/auth/auth-client";
import {
  fetchMyRides,
  type MyRideItem,
  type MyRidesResponse,
} from "~/features/mobility/mobility-client";
import { RidrMobileNav } from "~/features/shared/components/ridr-mobile-nav";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";

import "./my-rides-page.css";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function toStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isMessagingEnabledRide(ride: MyRideItem): boolean {
  return ride.status === "accepted" || ride.status === "in_progress";
}

function buildChatHref(ride: MyRideItem): string {
  const query = new URLSearchParams();
  query.set("rideId", ride.ride_id);
  query.set("ride", "Ridr Eco");

  if (ride.pickup_label?.trim()) {
    query.set("pickup", ride.pickup_label.trim());
  }

  if (ride.destination_label?.trim()) {
    query.set("destination", ride.destination_label.trim());
  }

  return `/ride/pre-meeting-chat?${query.toString()}`;
}

function buildFindingHref(ride: MyRideItem): string {
  const query = new URLSearchParams();
  query.set("rideId", ride.ride_id);

  if (ride.pickup_label?.trim()) {
    query.set("pickup", ride.pickup_label.trim());
  }

  if (ride.destination_label?.trim()) {
    query.set("destination", ride.destination_label.trim());
  }

  return `/ride/finding-your-ride?${query.toString()}`;
}

export function MyRidesPage() {
  const [payload, setPayload] = useState<MyRidesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setErrorMessage("Sign in to view your rides.");
      setIsLoading(false);
      return;
    }

    const authToken = token;

    let disposed = false;

    async function hydrateRides() {
      try {
        const response = await fetchMyRides(authToken);
        if (!disposed) {
          setPayload(response);
          setErrorMessage("");
        }
      } catch (error) {
        if (!disposed) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load your rides right now.",
          );
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    }

    void hydrateRides();

    return () => {
      disposed = true;
    };
  }, []);

  const messagingRide = useMemo(
    () => payload?.rides.find((ride) => isMessagingEnabledRide(ride)) || null,
    [payload],
  );

  const topRides = useMemo(() => payload?.rides.slice(0, 12) || [], [payload]);

  return (
    <div className="my-rides-page">
      <RidrTopNav active="rides" />

      <main className="my-rides-main-layout">
        <aside className="my-rides-side-nav">
          <h1>Ridr Premium</h1>
          <p>Ride Intelligence Hub</p>

          <nav>
            <Link to="/" className="my-rides-side-link">
              <MaterialSymbol name="home" />
              Home
            </Link>
            <Link to="/booking/fare-estimates" className="my-rides-side-link">
              <MaterialSymbol name="directions_car" />
              Book
            </Link>
            <Link to="/ride/my-rides" className="my-rides-side-link my-rides-side-link-active">
              <MaterialSymbol name="history" filled />
              My Rides
            </Link>
            <Link to="/dashboard" className="my-rides-side-link">
              <MaterialSymbol name="energy_savings_leaf" />
              Dashboard
            </Link>
            {messagingRide ? (
              <Link to={buildChatHref(messagingRide)} className="my-rides-side-link">
                <MaterialSymbol name="chat_bubble" />
                Messages
              </Link>
            ) : null}
          </nav>

          <Link to="/booking/fare-estimates" className="my-rides-cta">
            Book New Ride
          </Link>
        </aside>

        <section className="my-rides-content">
          <header className="my-rides-header">
            <span>Performance overview</span>
            <h2>My Rides</h2>
            <p>
              Monitor live bookings, dynamic fare splitting, and your route impact history in one place.
            </p>
            {isLoading ? <p className="my-rides-inline-status">Syncing ride timeline...</p> : null}
            {!isLoading && errorMessage ? <p className="my-rides-inline-error">{errorMessage}</p> : null}
          </header>

          <section className="my-rides-kpi-grid">
            <article>
              <small>Total rides</small>
              <strong>{payload?.total_rides || 0}</strong>
            </article>
            <article>
              <small>Active rides</small>
              <strong>{payload?.active_rides || 0}</strong>
            </article>
            <article>
              <small>Total saved</small>
              <strong>{inrFormatter.format(payload?.total_money_saved_usd || 0)}</strong>
            </article>
            <article>
              <small>CO2 prevented</small>
              <strong>{(payload?.total_co2_saved_lbs || 0).toFixed(1)} lbs</strong>
            </article>
          </section>

          <section className="my-rides-list-card">
            <header>
              <h3>Ride timeline</h3>
              <p>
                Distance: {(payload?.total_distance_miles || 0).toFixed(1)} miles
              </p>
            </header>

            {topRides.length === 0 ? (
              <div className="my-rides-empty-state">
                <MaterialSymbol name="directions_car" />
                <p>No rides yet. Book your first ride to start tracking split fare and impact.</p>
              </div>
            ) : (
              <div className="my-rides-timeline">
                {topRides.map((ride) => (
                  <article key={ride.ride_id} className="my-rides-item">
                    <div className="my-rides-timeline-pin" aria-hidden="true">
                      <span className={`my-rides-status-dot my-rides-status-dot-${ride.status}`} />
                    </div>

                    <div className="my-rides-item-content">
                      <div className="my-rides-item-head">
                        <div>
                          <strong>{ride.matched_user_name || "Matched user"}</strong>
                          <small>{toStatusLabel(ride.status)} • {ride.role}</small>
                        </div>
                        <span className={`my-rides-status-pill my-rides-status-${ride.status}`}>
                          {toStatusLabel(ride.status)}
                        </span>
                      </div>

                      <div className="my-rides-route">
                        <p>{ride.pickup_label || "Pickup"}</p>
                        <MaterialSymbol name="arrow_forward" />
                        <p>{ride.destination_label || "Destination"}</p>
                      </div>

                      <div className="my-rides-metrics">
                        <div>
                          <small>Your share</small>
                          <strong>{inrFormatter.format(ride.your_share_usd)}</strong>
                        </div>
                        <div>
                          <small>Total fare</small>
                          <strong>{inrFormatter.format(ride.total_fare_usd)}</strong>
                        </div>
                        <div>
                          <small>Split size</small>
                          <strong>{ride.split_party_size}</strong>
                        </div>
                        <div>
                          <small>Distance</small>
                          <strong>{ride.distance_miles.toFixed(1)} mi</strong>
                        </div>
                      </div>

                      <div className="my-rides-impact-row">
                        <p>
                          <MaterialSymbol name="eco" />
                          {ride.co2_saved_lbs.toFixed(1)} lbs CO2 saved
                        </p>
                        <p>
                          <MaterialSymbol name="savings" />
                          {inrFormatter.format(ride.money_saved_usd)} saved
                        </p>
                      </div>

                      <footer>
                        <small>Updated {formatDate(ride.updated_at)}</small>
                        {isMessagingEnabledRide(ride) ? (
                          <Link to={buildChatHref(ride)}>Open Messages</Link>
                        ) : ride.status === "matched" || ride.status === "pending_acceptance" ? (
                          <Link to={buildFindingHref(ride)}>View transaction</Link>
                        ) : (
                          <Link to="/booking/fare-estimates">Book again</Link>
                        )}
                      </footer>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>

      <RidrMobileNav active="rides" />
    </div>
  );
}
