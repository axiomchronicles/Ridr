import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";

import { getAccessToken } from "~/features/auth/auth-client";
import {
  connectVehicleStreamSocket,
  fetchNearbyVehicles,
  fetchRideSummary,
  updateRideTransaction,
  type RideSummary,
  type VehicleMarker,
} from "~/features/mobility/mobility-client";
import { RidrMobileNav } from "~/features/shared/components/ridr-mobile-nav";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";
import {
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_PLACES_LIBRARIES,
} from "~/features/shared/constants/google-maps";

import "./finding-ride-page.css";

const defaultMapCenter: google.maps.LatLngLiteral = {
  lat: 28.6139,
  lng: 77.209,
};

function parseCoordinate(
  params: URLSearchParams,
  key: string,
  fallback: number,
): number {
  const rawValue = params.get(key);
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getValue(
  params: URLSearchParams,
  key: string,
  fallback: string,
): string {
  const value = params.get(key)?.trim();
  return value ? value : fallback;
}

function buildRiderIconSvg(fillColor: string): string {
  return `<svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg"><circle cx="17" cy="17" r="16" fill="#ffffff" fill-opacity="0.96"/><path d="M17 6.8a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" fill="${fillColor}"/><path d="M9.2 24.3c0-3.7 3.5-6 7.8-6 4.3 0 7.8 2.3 7.8 6v1.1H9.2v-1.1Z" fill="${fillColor}"/><circle cx="17" cy="17" r="15.2" fill="none" stroke="${fillColor}" stroke-opacity="0.25" stroke-width="1.2"/></svg>`;
}

function buildRiderMapIcon(status: string): google.maps.Icon | undefined {
  if (typeof google === "undefined") {
    return undefined;
  }

  const fillColor =
    status === "waiting_pickup"
      ? "#0f6d43"
      : status === "active"
        ? "#2f7a4a"
        : "#446b5d";

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(buildRiderIconSvg(fillColor))}`,
    scaledSize: new google.maps.Size(28, 28),
    anchor: new google.maps.Point(14, 14),
  };
}

function mergeRiderMarkers(
  current: VehicleMarker[],
  incoming: VehicleMarker,
): VehicleMarker[] {
  const deduped = current.filter((entry) => entry.user_id !== incoming.user_id);
  return [incoming, ...deduped].sort((a, b) => a.distance_km - b.distance_km).slice(0, 24);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function formatCurrency(value: number, currency: string): string {
  const normalizedCurrency = currency.toUpperCase();
  const locale = normalizedCurrency === "INR" ? "en-IN" : "en-US";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${normalizedCurrency} ${value.toFixed(2)}`;
  }
}

export function FindingRidePage() {
  const [searchParams] = useSearchParams();
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const authToken = useMemo(
    () => (typeof window === "undefined" ? null : getAccessToken()),
    [],
  );

  const { isLoaded: mapsLoaded, loadError: mapsLoadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: mapsApiKey || "",
    libraries: GOOGLE_MAPS_PLACES_LIBRARIES,
    preventGoogleFontsLoading: true,
  });

  const pickupQueryValue = getValue(
    searchParams,
    "pickup",
    "Pickup location is syncing from your booking.",
  );
  const destinationQueryValue = getValue(
    searchParams,
    "destination",
    "Destination is syncing from your booking.",
  );
  const rideName = getValue(searchParams, "ride", "Ridr Eco");
  const rideId = searchParams.get("rideId")?.trim() || "";
  const matchUser = getValue(searchParams, "matchUser", "your closest driver");
  const matchScore = getValue(searchParams, "matchScore", "--");
  const fare = getValue(searchParams, "fare", "₹220");
  const eta = getValue(searchParams, "eta", "2 min");
  const routeSummary = getValue(
    searchParams,
    "route",
    "Preparing the fastest low-emission route",
  );
  const impactKg = getValue(searchParams, "impactKg", "4.2");

  const [pickupLabel, setPickupLabel] = useState(pickupQueryValue);
  const [destinationLabel, setDestinationLabel] = useState(destinationQueryValue);
  const [modifyPickupLabel, setModifyPickupLabel] = useState(pickupQueryValue);
  const [modifyDestinationLabel, setModifyDestinationLabel] = useState(destinationQueryValue);
  const [transactionReason, setTransactionReason] = useState("");
  const [transactionNotice, setTransactionNotice] = useState("");
  const [rideSummaryState, setRideSummaryState] = useState<RideSummary | null>(null);
  const [isTransactionBusy, setIsTransactionBusy] = useState(false);
  const [showModifyPanel, setShowModifyPanel] = useState(false);

  const initialPickupPoint = useMemo(
    () => ({
      lat: parseCoordinate(searchParams, "pickupLat", defaultMapCenter.lat),
      lng: parseCoordinate(searchParams, "pickupLng", defaultMapCenter.lng),
    }),
    [searchParams],
  );

  const initialDestinationPoint = useMemo(
    () => ({
      lat: parseCoordinate(searchParams, "destinationLat", defaultMapCenter.lat + 0.012),
      lng: parseCoordinate(searchParams, "destinationLng", defaultMapCenter.lng + 0.01),
    }),
    [searchParams],
  );

  const [pickupPoint, setPickupPoint] = useState(initialPickupPoint);
  const [destinationPoint, setDestinationPoint] = useState(initialDestinationPoint);
  const [nearbyRiders, setNearbyRiders] = useState<VehicleMarker[]>([]);
  const [feedStatus, setFeedStatus] = useState("Connecting nearby rider feed...");
  const [lastFeedUpdate, setLastFeedUpdate] = useState<string>("");

  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      disableDefaultUI: true,
      zoomControl: false,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "greedy",
    }),
    [],
  );

  const progressPercent = useMemo(() => {
    if (rideSummaryState?.status === "accepted") {
      return 100;
    }

    if (rideSummaryState?.status === "cancelled") {
      return 0;
    }

    const numericMatch = Number(matchScore);
    if (Number.isFinite(numericMatch) && numericMatch > 0) {
      return Math.min(99, Math.max(65, numericMatch));
    }

    return Math.min(95, 72 + nearbyRiders.length * 4);
  }, [matchScore, nearbyRiders.length, rideSummaryState?.status]);

  const transactionState = rideSummaryState?.transaction ?? null;
  const costSplit = rideSummaryState?.cost_split ?? null;
  const canContinueToChat = rideSummaryState?.status === "accepted";
  const matchDisplayUser = rideSummaryState?.matched_user_name || matchUser;
  const matchDisplayScore =
    rideSummaryState !== null
      ? String(Math.round(rideSummaryState.score * 100))
      : matchScore;
  const fareDisplay = costSplit
    ? formatCurrency(costSplit.your_share_usd, costSplit.currency)
    : fare;

  useEffect(() => {
    if (!rideId || !authToken) {
      return;
    }

    const token = authToken;

    let disposed = false;
    let refreshTimer: number | null = null;

    async function refreshRideSummary() {
      try {
        const nextSummary = await fetchRideSummary(token, rideId);
        if (disposed) {
          return;
        }

        setRideSummaryState(nextSummary);
        setPickupPoint(nextSummary.pickup);
        setDestinationPoint(nextSummary.destination);

        const nextPickupLabel = nextSummary.pickup_label?.trim() || pickupQueryValue;
        const nextDestinationLabel =
          nextSummary.destination_label?.trim() || destinationQueryValue;

        setPickupLabel(nextPickupLabel);
        setDestinationLabel(nextDestinationLabel);
        if (!showModifyPanel) {
          setModifyPickupLabel(nextPickupLabel);
          setModifyDestinationLabel(nextDestinationLabel);
        }

        setTransactionNotice("");
      } catch {
        if (!disposed) {
          setTransactionNotice("Unable to refresh ride transaction state.");
        }
        return;
      }
    }

    void refreshRideSummary();
    refreshTimer = window.setInterval(() => {
      void refreshRideSummary();
    }, 4000);

    return () => {
      disposed = true;
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer);
      }
    };
  }, [
    authToken,
    destinationQueryValue,
    pickupQueryValue,
    rideId,
    showModifyPanel,
  ]);

  useEffect(() => {
    if (!authToken) {
      setFeedStatus("Sign in required to fetch nearby riders.");
      setNearbyRiders([]);
      return;
    }

    const token = authToken;

    let disposed = false;
    let liveSocket: WebSocket | null = null;

    async function hydrateNearbyRiders() {
      try {
        const riders = await fetchNearbyVehicles(token, {
          lat: pickupPoint.lat,
          lng: pickupPoint.lng,
          radiusKm: 14,
          roleFilter: "rider",
        });

        if (!disposed) {
          setNearbyRiders(riders);
          setFeedStatus(
            riders.length > 0
              ? `${riders.length} nearby riders connected in real time.`
              : "No riders nearby right now. Listening for live updates.",
          );
        }
      } catch {
        if (!disposed) {
          setFeedStatus("Unable to fetch nearby riders. Retrying live feed...");
        }
      }

      liveSocket = connectVehicleStreamSocket({
        token,
        lat: pickupPoint.lat,
        lng: pickupPoint.lng,
        radiusKm: 14,
        roleFilter: "rider",
        onVehicleUpdate: (vehicle) => {
          if (disposed) {
            return;
          }

          setNearbyRiders((current) => mergeRiderMarkers(current, vehicle));
          setLastFeedUpdate(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          );
          setFeedStatus("Live nearby rider feed active.");
        },
      });

      liveSocket.addEventListener("close", () => {
        if (!disposed) {
          setFeedStatus("Live feed disconnected. Attempting reconnect when page refreshes.");
        }
      });
    }

    void hydrateNearbyRiders();

    return () => {
      disposed = true;
      if (liveSocket) {
        liveSocket.close();
      }
    };
  }, [authToken, pickupPoint.lat, pickupPoint.lng]);

  const bookingHref = useMemo(() => {
    const params = new URLSearchParams();

    if (pickupLabel) {
      params.set("pickup", pickupLabel);
    }

    if (destinationLabel) {
      params.set("destination", destinationLabel);
    }

    const query = params.toString();
    return query ? `/booking/fare-estimates?${query}` : "/booking/fare-estimates";
  }, [destinationLabel, pickupLabel]);

  const chatHref = useMemo(() => {
    const params = new URLSearchParams();

    params.set("ride", rideName);
    params.set("pickup", pickupLabel);
    params.set("destination", destinationLabel);
    if (rideId) {
      params.set("rideId", rideId);
    }

    return `/ride/pre-meeting-chat?${params.toString()}`;
  }, [destinationLabel, pickupLabel, rideId, rideName]);

  async function handleTransactionAction(action: "cancel" | "accept") {
    if (!rideId || !authToken) {
      setTransactionNotice("You must be signed in to update this transaction.");
      return;
    }

    setIsTransactionBusy(true);
    try {
      const updatedSummary = await updateRideTransaction(authToken, rideId, {
        action,
        reason:
          action === "cancel"
            ? (transactionReason.trim() || "Cancelled by rider from finding page")
            : undefined,
      });
      setRideSummaryState(updatedSummary);
      setPickupPoint(updatedSummary.pickup);
      setDestinationPoint(updatedSummary.destination);
      setPickupLabel(updatedSummary.pickup_label?.trim() || pickupQueryValue);
      setDestinationLabel(
        updatedSummary.destination_label?.trim() || destinationQueryValue,
      );
      setTransactionNotice(
        action === "cancel"
          ? "Ride request cancelled successfully."
          : "Ride accepted.",
      );
    } catch (error) {
      setTransactionNotice(
        getErrorMessage(error, "Unable to update ride transaction."),
      );
    } finally {
      setIsTransactionBusy(false);
    }
  }

  async function handleModifyTransactionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!rideId || !authToken) {
      setTransactionNotice("You must be signed in to modify this transaction.");
      return;
    }

    const nextPickupLabel = modifyPickupLabel.trim();
    const nextDestinationLabel = modifyDestinationLabel.trim();
    if (!nextPickupLabel || !nextDestinationLabel) {
      setTransactionNotice("Pickup and destination cannot be empty.");
      return;
    }

    setIsTransactionBusy(true);
    try {
      const updatedSummary = await updateRideTransaction(authToken, rideId, {
        action: "modify",
        pickup_label: nextPickupLabel,
        destination_label: nextDestinationLabel,
        reason: transactionReason.trim() || undefined,
      });
      setRideSummaryState(updatedSummary);
      setPickupLabel(updatedSummary.pickup_label?.trim() || nextPickupLabel);
      setDestinationLabel(
        updatedSummary.destination_label?.trim() || nextDestinationLabel,
      );
      setShowModifyPanel(false);
      setTransactionNotice("Ride transaction updated. Driver review restarted.");
    } catch (error) {
      setTransactionNotice(
        getErrorMessage(error, "Unable to modify ride transaction."),
      );
    } finally {
      setIsTransactionBusy(false);
    }
  }

  return (
    <div className="finding-page">
      <RidrTopNav active="ride" />

      <main className="finding-main">
        <div className="finding-layout">
          <section className="finding-left-column">
            <article className="finding-match-card">
              <div className="finding-match-card-glow" aria-hidden="true" />

              <div className="finding-match-content">
                <p className="finding-kicker">Precision ecology</p>
                <h1>Finding your ride</h1>
                <p className="finding-copy">
                  Matching you with the most fuel-efficient route and an
                  electric-first vehicle nearby.
                </p>
                <p className="finding-copy">
                  Best live pairing: {matchDisplayUser} ({matchDisplayScore}% compatibility)
                </p>

                <div
                  className="finding-progress-ring"
                  aria-label="Matching progress"
                  style={{
                    background: `conic-gradient(#006d43 0 ${progressPercent}%, #d8e2dd ${progressPercent}% 100%)`,
                  }}
                >
                  <div className="finding-progress-core">
                    <strong>{progressPercent}%</strong>
                    <span>Matching</span>
                  </div>
                </div>

                <div className="finding-signal-row">
                  <div>
                    <span className="finding-signal-dot" />
                    <p>Signal strong</p>
                  </div>
                  <div>
                    <span className="finding-signal-dot finding-signal-dot-pulse" />
                    <p>
                      {transactionState?.status === "accepted"
                        ? "Driver accepted"
                        : `${nearbyRiders.length} riders nearby`}
                    </p>
                  </div>
                </div>
              </div>
            </article>

            <article className="finding-map-card">
              {!mapsApiKey ? (
                <div className="finding-map-fallback">
                  Add VITE_GOOGLE_MAPS_API_KEY to show nearby riders on the live map.
                </div>
              ) : mapsLoadError ? (
                <div className="finding-map-fallback">
                  Maps failed to load. Check API key and billing settings.
                </div>
              ) : !mapsLoaded ? (
                <div className="finding-map-fallback">Loading live map and rider feed...</div>
              ) : (
                <>
                  <GoogleMap
                    mapContainerClassName="finding-live-map"
                    center={pickupPoint}
                    zoom={13}
                    options={mapOptions}
                  >
                    <MarkerF
                      position={pickupPoint}
                      title="Pickup"
                      label={{ text: "P", color: "#ffffff", fontWeight: "700" }}
                    />
                    <MarkerF
                      position={destinationPoint}
                      title="Destination"
                      label={{ text: "D", color: "#ffffff", fontWeight: "700" }}
                    />

                    {nearbyRiders.map((rider) => (
                      <MarkerF
                        key={`rider-${rider.user_id}`}
                        position={{ lat: rider.lat, lng: rider.lng }}
                        title={`Rider ${rider.user_id} • ${rider.distance_km} km away`}
                        icon={buildRiderMapIcon(rider.status)}
                      />
                    ))}
                  </GoogleMap>

                  <div className="finding-map-fade" aria-hidden="true" />
                </>
              )}

              <div className="finding-map-status">
                <MaterialSymbol name="group" className="finding-map-status-icon" />
                <div>
                  <p>Nearby riders</p>
                  <strong>{feedStatus}</strong>
                  {lastFeedUpdate ? <small>Last update {lastFeedUpdate}</small> : null}
                </div>
              </div>
            </article>
          </section>

          <section className="finding-right-column">
            <article className="finding-impact-card">
              <p>Estimated impact</p>
              <div className="finding-impact-value">
                <h2>{impactKg}</h2>
                <span>kg CO2 saved</span>
              </div>
              <small>Equivalent to roughly one quarter tree day offset.</small>
            </article>

            <article className="finding-trip-card">
              <h3>
                <MaterialSymbol name="route" className="finding-route-icon" />
                Trip overview
              </h3>

              <div className="finding-route-points">
                <div className="finding-route-point">
                  <span className="finding-route-node" aria-hidden="true" />
                  <div>
                    <p>Pickup</p>
                    <strong>{pickupLabel}</strong>
                  </div>
                </div>

                <div className="finding-route-point finding-route-point-destination">
                  <span className="finding-route-node" aria-hidden="true" />
                  <div>
                    <p>Destination</p>
                    <strong>{destinationLabel}</strong>
                  </div>
                </div>
              </div>

              <div className="finding-trip-meta">
                <div>
                  <span>Vehicle class</span>
                  <strong>{rideName}</strong>
                </div>
                <div>
                  <span>Estimated fare</span>
                  <strong>{fareDisplay}</strong>
                </div>
              </div>

              {costSplit ? (
                <div className="finding-split-card">
                  <p className="finding-split-kicker">Live fare split</p>
                  <strong>{formatCurrency(costSplit.your_share_usd, costSplit.currency)} per rider</strong>
                  <small>{costSplit.message}</small>
                  <div className="finding-split-meta">
                    <span>{costSplit.party_size} riders</span>
                    <span>Total {formatCurrency(costSplit.total_fare_usd, costSplit.currency)}</span>
                  </div>
                </div>
              ) : null}

              <div className="finding-timeout-card">
                <MaterialSymbol name="timer" className="finding-timeout-icon" />
                <div>
                  <strong>Matching priority active</strong>
                  <p>
                    We are locking your best match now. Current route summary:
                    {" "}
                    {routeSummary}
                  </p>
                </div>
              </div>

              <div className="finding-transaction-card">
                <p className="finding-transaction-kicker">Transaction state</p>
                <strong>
                  {transactionState?.message || "Preparing transaction details..."}
                </strong>
                {transactionState?.estimated_accept_seconds !== null &&
                transactionState?.estimated_accept_seconds !== undefined ? (
                  <small>
                    Estimated acceptance in {transactionState.estimated_accept_seconds}s
                  </small>
                ) : (
                  <small>Status: {rideSummaryState?.status || "pending"}</small>
                )}

                {transactionNotice ? (
                  <p className="finding-transaction-feedback">{transactionNotice}</p>
                ) : null}

                {(transactionState?.can_modify ||
                  transactionState?.can_cancel ||
                  transactionState?.can_accept) && (
                  <div className="finding-transaction-actions">
                    {transactionState?.can_modify ? (
                      <button
                        type="button"
                        className="finding-transaction-button"
                        onClick={() => {
                          setShowModifyPanel((current) => !current);
                          setTransactionNotice("");
                        }}
                        disabled={isTransactionBusy}
                      >
                        {showModifyPanel ? "Hide modifications" : "Modify request"}
                      </button>
                    ) : null}

                    {transactionState?.can_cancel ? (
                      <button
                        type="button"
                        className="finding-transaction-button finding-transaction-button-danger"
                        onClick={() => void handleTransactionAction("cancel")}
                        disabled={isTransactionBusy}
                      >
                        Cancel ride
                      </button>
                    ) : null}

                    {transactionState?.can_accept ? (
                      <button
                        type="button"
                        className="finding-transaction-button finding-transaction-button-accept"
                        onClick={() => void handleTransactionAction("accept")}
                        disabled={isTransactionBusy}
                      >
                        Accept ride
                      </button>
                    ) : null}
                  </div>
                )}

                {showModifyPanel ? (
                  <form
                    className="finding-transaction-form"
                    onSubmit={(event) => void handleModifyTransactionSubmit(event)}
                  >
                    <label>
                      Pickup label
                      <input
                        value={modifyPickupLabel}
                        onChange={(event) => setModifyPickupLabel(event.target.value)}
                        placeholder="Update pickup"
                      />
                    </label>
                    <label>
                      Destination label
                      <input
                        value={modifyDestinationLabel}
                        onChange={(event) => setModifyDestinationLabel(event.target.value)}
                        placeholder="Update destination"
                      />
                    </label>
                    <label>
                      Note for transaction
                      <input
                        value={transactionReason}
                        onChange={(event) => setTransactionReason(event.target.value)}
                        placeholder="Optional reason"
                      />
                    </label>
                    <button type="submit" disabled={isTransactionBusy}>
                      Save transaction changes
                    </button>
                  </form>
                ) : null}
              </div>

              <div className="finding-rider-grid" aria-label="Nearby rider feed">
                {nearbyRiders.slice(0, 4).map((rider) => (
                  <article key={`rider-card-${rider.user_id}`} className="finding-rider-card">
                    <p>Rider #{rider.user_id}</p>
                    <strong>{rider.distance_km} km</strong>
                    <small>{rider.status.replace(/_/g, " ")}</small>
                  </article>
                ))}
                {nearbyRiders.length === 0 ? (
                  <article className="finding-rider-card finding-rider-card-muted">
                    <p>Nearby riders</p>
                    <strong>Waiting</strong>
                    <small>Live stream listening for new riders</small>
                  </article>
                ) : null}
              </div>
            </article>

            <div className="finding-actions">
              {canContinueToChat ? (
                <Link to={chatHref} className="finding-action-primary">
                  Continue to live chat
                </Link>
              ) : (
                <span className="finding-action-primary finding-action-disabled">
                  Waiting for acceptance ({eta})
                </span>
              )}
              <Link to={bookingHref} className="finding-action-secondary">
                Adjust preferences
              </Link>
              <button
                type="button"
                className="finding-action-ghost"
                onClick={() => void handleTransactionAction("cancel")}
                disabled={isTransactionBusy || !transactionState?.can_cancel}
              >
                Cancel request
              </button>
            </div>
          </section>
        </div>
      </main>

      <RidrMobileNav active="ride" />
    </div>
  );
}