import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useJsApiLoader } from "@react-google-maps/api";

import { RidrMobileNav } from "~/features/shared/components/ridr-mobile-nav";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";
import { CustomPlaceAutocompleteInput } from "~/features/shared/components/custom-place-autocomplete-input";
import {
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_PLACES_LIBRARIES,
} from "~/features/shared/constants/google-maps";

import "./landing-page.css";

const mapImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCB7lj27VZe_fC75_GjcF5fQsHhHdIRTwMw7WMsr_1NLtr-cnKd4E6FKhEj8JmNErAqMZp33AjLTVTu8yGJsYSrHH-TVmei9gG-7xSKpImb2g2erfwHB6eUj4vefk6dZfp-HRsmutpb8gr6aJyxt34_9t3kwaf9vJrhUHXBSf3WKMDVwk-sbndm8ZKmiVDOE2C6Pq_oTgBjILLD3TQ63B5_3Zmc4D8SrcPwx3jU82ftzlyHeyY0ASojAfxUaoZtb9XBYCBToFJZJ-6R";

const vehicleImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuA2ZeE8raFmK1qN5vQzkagFQXZoDQ7LUdc0d5nf28Fw-Uyg2MWpde1pHLUfS7z2YW8tuDS5h0GsUDDMQoDarYcBeXI5qdsY9L3x9ex2P_CFrtJnonbMTs0kNOwmUT_cCWAWhA6AbRA5MStl7HvkFPp1wxhaGrHVeRiu0ZlINzZQnkosPZgBI7AZuhCR-fY4Zo6IJriBKphavXuk-7Ady_EaqFtOtSiwoMGYJtKbfNAB02KVidA8dYd1su6zv6yazs-fK6Wclvaj4AzD";

const crowdOne =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD7zyhIyrj1gflcWL9lOedgCciPCVVRVZAB2UJKtEP-EmbZx05oJPFWCQjsnJMITYQ7EVDilbD8VUu-Zurl9TO4cq1KyAY9CYdw7pbmn6zpi7CZof1-dbedn0oX-gmtVkdq8CgDKEbcHczzpemJ5ASMl_jA2vfapOS6bjpPrpI2Rko05EhCpgifrpkWtyYTVTLQy7Bvk3XSNKKCf4CP1htI9FMPlp5cGSbycwemDl52aMhWRuQrleBmtFbOuxZFb0UjtElehTR08sFo";

const crowdTwo =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDgh-ifjYJl19hk0SE92PJ_4WmTkKjxE67XPh0yargDkyDv7NQWxmYzl0Ge4oSu2mcwUiefgThW72lyJ4iTzmiX106w_mNETVUZFcddodQKd0ms6gojX-rtgL4O7pOGTxieQMje22fYtkonh8QNJYP0L_yYsaurdwIuPMT8tzx6pzwvjvr9Vz9qBzW0RitFVAHkm19TVwT62B8xaGQHVrBWjCKoSZpGB0s6RN7f_DL1eKreX1ge8C4vL15k5N8bIieg71bYnyVjeLND";

const savedPlacesStorageKey = "ridr.saved-places";
const defaultLandingStatusMessage =
  "Use current location or type your route for live map data.";

type SavedPlaceKey = "home" | "work";
type SavedPlaces = Partial<Record<SavedPlaceKey, string>>;

type RouteInsight = {
  distanceText: string;
  durationText: string;
  fareText: string;
};

function normalizeAddress(value: string): string {
  return value.trim();
}

async function reverseGeocodeCoordinates(
  apiKey: string,
  coords: google.maps.LatLngLiteral,
): Promise<string | null> {
  try {
    const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    endpoint.searchParams.set("latlng", `${coords.lat},${coords.lng}`);
    endpoint.searchParams.set("language", "en");
    endpoint.searchParams.set("key", apiKey);

    const response = await fetch(endpoint.toString());
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      status?: string;
      results?: Array<{ formatted_address?: string }>;
    };

    if (payload.status !== "OK") {
      return null;
    }

    return payload.results?.[0]?.formatted_address || null;
  } catch {
    return null;
  }
}

async function geocodeWithFallback(
  geocoder: google.maps.Geocoder,
  rawAddress: string,
): Promise<google.maps.LatLngLiteral | null> {
  const normalized = normalizeAddress(rawAddress);
  if (!normalized) {
    return null;
  }

  const candidates: string[] = [normalized];

  if (!/\bindia\b/i.test(normalized)) {
    candidates.push(`${normalized}, India`);
  }

  if (!/\b(new delhi|delhi)\b/i.test(normalized)) {
    candidates.push(`${normalized}, New Delhi, India`);
  }

  for (const query of candidates) {
    const result = await new Promise<google.maps.LatLngLiteral | null>((resolve) => {
      geocoder.geocode({ address: query }, (results, status) => {
        const firstLocation = results?.[0]?.geometry?.location;

        if (status === google.maps.GeocoderStatus.OK && firstLocation) {
          resolve({
            lat: firstLocation.lat(),
            lng: firstLocation.lng(),
          });
          return;
        }

        resolve(null);
      });
    });

    if (result) {
      return result;
    }
  }

  return null;
}

function estimateFareInr(leg: google.maps.DirectionsLeg | undefined): number {
  if (!leg) {
    return 0;
  }

  const distanceKm = (leg.distance?.value || 0) / 1000;
  const durationMinutes = Math.max(
    1,
    Math.round((leg.duration_in_traffic?.value || leg.duration?.value || 0) / 60),
  );

  const fare = 55 + distanceKm * 15 + durationMinutes * 3;
  return Math.max(95, Math.round(fare));
}

function StaticLandingBookingCard({ message }: { message: string }) {
  return (
    <article className="landing-booking-card">
      <h1>Where to?</h1>

      <div className="landing-route-stack">
        <label>
          <span>
            <MaterialSymbol name="trip_origin" className="landing-input-icon" />
            Pickup
          </span>
          <input type="text" value="Current location" readOnly />
        </label>

        <label>
          <span>
            <MaterialSymbol name="location_on" className="landing-input-icon" />
            Destination
          </span>
          <input type="text" placeholder="Enter destination" readOnly />
        </label>
      </div>

      <p className="landing-booking-note">{message}</p>

      <div className="landing-saved-grid">
        <button type="button" disabled>
          <MaterialSymbol name="home" className="landing-saved-icon" />
          <div>
            <small>Home</small>
            <strong>Save in booking flow</strong>
          </div>
        </button>
        <button type="button" disabled>
          <MaterialSymbol name="work" className="landing-saved-icon" />
          <div>
            <small>Work</small>
            <strong>Save in booking flow</strong>
          </div>
        </button>
      </div>

      <div className="landing-card-actions">
        <Link to="/booking/fare-estimates" className="landing-primary-action">
          Book a Ride
        </Link>
        <Link to="/ride/pre-meeting-chat" className="landing-secondary-action">
          Share a Ride
        </Link>
      </div>
    </article>
  );
}

function InteractiveLandingBookingCard({ mapsApiKey }: { mapsApiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: mapsApiKey,
    libraries: GOOGLE_MAPS_PLACES_LIBRARIES,
    preventGoogleFontsLoading: true,
  });

  const locationRequestTokenRef = useRef(0);

  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaces>({});
  const [placesReady, setPlacesReady] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState(defaultLandingStatusMessage);
  const [routeInsight, setRouteInsight] = useState<RouteInsight | null>(null);

  const inrFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedValue = window.localStorage.getItem(savedPlacesStorageKey);
    if (!storedValue) {
      return;
    }

    try {
      const parsedValue = JSON.parse(storedValue) as SavedPlaces;
      setSavedPlaces({
        home: parsedValue.home,
        work: parsedValue.work,
      });
    } catch {
      setSavedPlaces({});
    }
  }, []);

  useEffect(() => {
    function hasPlacesApiLoaded() {
      return (
        typeof window !== "undefined" &&
        typeof google !== "undefined" &&
        Boolean(google.maps?.places?.AutocompleteService)
      );
    }

    if (!isLoaded || loadError) {
      setPlacesReady(false);
      return;
    }

    if (hasPlacesApiLoaded()) {
      setPlacesReady(true);
      return;
    }

    const readinessPollId = window.setInterval(() => {
      if (hasPlacesApiLoaded()) {
        setPlacesReady(true);
        window.clearInterval(readinessPollId);
      }
    }, 250);

    return () => {
      window.clearInterval(readinessPollId);
    };
  }, [isLoaded, loadError]);

  useEffect(() => {
    if (!isLoaded || loadError) {
      return;
    }

    const normalizedPickup = normalizeAddress(pickup);
    const normalizedDestination = normalizeAddress(destination);

    if (normalizedPickup.length < 3 || normalizedDestination.length < 3) {
      setIsRouteLoading(false);
      setRouteInsight(null);
      return;
    }

    const geocoder = new google.maps.Geocoder();
    const directionsService = new google.maps.DirectionsService();
    let disposed = false;

    async function resolveRouteInsight() {
      setIsRouteLoading(true);

      const [originPoint, destinationPoint] = await Promise.all([
        geocodeWithFallback(geocoder, normalizedPickup),
        geocodeWithFallback(geocoder, normalizedDestination),
      ]);

      if (disposed) {
        return;
      }

      if (!originPoint || !destinationPoint) {
        setIsRouteLoading(false);
        setRouteInsight(null);
        setLocationMessage("Try a more specific pickup or destination.");
        return;
      }

      directionsService.route(
        {
          origin: originPoint,
          destination: destinationPoint,
          travelMode: google.maps.TravelMode.DRIVING,
          unitSystem: google.maps.UnitSystem.METRIC,
          drivingOptions: {
            departureTime: new Date(),
            trafficModel: google.maps.TrafficModel.BEST_GUESS,
          },
        },
        (result, status) => {
          if (disposed) {
            return;
          }

          setIsRouteLoading(false);

          if (status !== google.maps.DirectionsStatus.OK || !result) {
            setRouteInsight(null);
            setLocationMessage("Map route unavailable. Try nearby landmarks.");
            return;
          }

          const leg = result.routes[0]?.legs[0];
          if (!leg) {
            setRouteInsight(null);
            setLocationMessage("Map route unavailable. Try nearby landmarks.");
            return;
          }

          setRouteInsight({
            distanceText: leg.distance?.text || "--",
            durationText: leg.duration_in_traffic?.text || leg.duration?.text || "--",
            fareText: inrFormatter.format(estimateFareInr(leg)),
          });
          setLocationMessage("Live map estimate ready.");
        },
      );
    }

    resolveRouteInsight();

    return () => {
      disposed = true;
    };
  }, [destination, inrFormatter, isLoaded, loadError, pickup]);

  const bookingHref = useMemo(() => {
    const params = new URLSearchParams();

    if (pickup.trim()) {
      params.set("pickup", pickup.trim());
    }

    if (destination.trim()) {
      params.set("destination", destination.trim());
    }

    const query = params.toString();
    return query ? `/booking/fare-estimates?${query}` : "/booking/fare-estimates";
  }, [destination, pickup]);

  const requestCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage("Geolocation is not supported in this browser.");
      return;
    }

    const requestToken = locationRequestTokenRef.current + 1;
    locationRequestTokenRef.current = requestToken;

    setIsLocating(true);
    setLocationMessage("Requesting your current location...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        const resolvedAddress = await reverseGeocodeCoordinates(mapsApiKey, nextCoords);

        if (requestToken !== locationRequestTokenRef.current) {
          return;
        }

        setPickup(resolvedAddress || "Current location");
        setIsLocating(false);
        setLocationMessage(
          resolvedAddress
            ? "Pickup set from your current address."
            : "Location found. You can refine pickup if needed.",
        );
      },
      (error) => {
        if (requestToken !== locationRequestTokenRef.current) {
          return;
        }

        setIsLocating(false);

        if (error.code === error.PERMISSION_DENIED) {
          setLocationMessage("Location permission denied. Enter pickup manually.");
          return;
        }

        if (error.code === error.TIMEOUT) {
          setLocationMessage("Location request timed out. Try again.");
          return;
        }

        setLocationMessage("Unable to fetch location. Enter pickup manually.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }, [mapsApiKey]);

  const handleClearPickup = useCallback(() => {
    locationRequestTokenRef.current += 1;
    setIsLocating(false);
    setPickup("");
    setRouteInsight(null);
    setLocationMessage(defaultLandingStatusMessage);
  }, []);

  const routePrimaryText = isRouteLoading
    ? "Calculating live map estimate..."
    : routeInsight
      ? `${routeInsight.distanceText} • ${routeInsight.durationText}`
      : "Enter pickup and destination for map-backed route data.";

  const routeSecondaryText = routeInsight
    ? `Estimated fare from ${routeInsight.fareText}`
    : locationMessage;

  return (
    <article className="landing-booking-card">
      <h1>Where to?</h1>

      <div className="landing-route-stack">
        <label>
          <div className="landing-route-label-row">
            <span>
              <MaterialSymbol name="trip_origin" className="landing-input-icon" />
              Pickup
            </span>
            <button
              type="button"
              className="landing-route-inline-action"
              onClick={requestCurrentLocation}
              disabled={isLocating}
            >
              {isLocating ? "Locating..." : "Current"}
            </button>
          </div>

          <div className="landing-input-row">
              <CustomPlaceAutocompleteInput
                value={pickup}
                onChange={setPickup}
                mapsReady={placesReady}
                placeholder="Choose pickup"
                ariaLabel="Pickup"
                recentStorageNamespace="landing-pickup"
                showCurrentLocationAction
                currentLocationActionLabel={isLocating ? "Locating..." : "Use current location"}
                onUseCurrentLocation={isLocating ? undefined : requestCurrentLocation}
              />

            {pickup ? (
              <button
                type="button"
                className="landing-input-clear"
                onClick={handleClearPickup}
                aria-label="Clear pickup"
              >
                <MaterialSymbol name="close" className="landing-input-icon" />
              </button>
            ) : null}
          </div>
        </label>

        <label>
          <span>
            <MaterialSymbol name="location_on" className="landing-input-icon" />
            Destination
          </span>

          <div className="landing-input-row">
            <CustomPlaceAutocompleteInput
              value={destination}
              onChange={setDestination}
              mapsReady={placesReady}
              placeholder="Enter destination"
              ariaLabel="Destination"
              recentStorageNamespace="landing-destination"
            />
          </div>
        </label>
      </div>

      <div className="landing-map-insight" aria-live="polite">
        <MaterialSymbol name="route" className="landing-map-insight-icon" />
        <div>
          <p>{routePrimaryText}</p>
          <small>{routeSecondaryText}</small>
        </div>
      </div>

      <div className="landing-saved-grid">
        {([
          { key: "home", label: "Home", icon: "home" },
          { key: "work", label: "Work", icon: "work" },
        ] as const).map((item) => {
          const placeAddress = savedPlaces[item.key];

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (placeAddress) {
                  setDestination(placeAddress);
                  setLocationMessage(`Using saved ${item.label} address.`);
                }
              }}
              disabled={!placeAddress}
            >
              <MaterialSymbol name={item.icon} className="landing-saved-icon" />
              <div>
                <small>{item.label}</small>
                <strong>{placeAddress || "Save in booking flow"}</strong>
              </div>
            </button>
          );
        })}
      </div>

      <div className="landing-card-actions">
        <Link to={bookingHref} className="landing-primary-action">
          Book a Ride
        </Link>
        <Link to="/ride/pre-meeting-chat" className="landing-secondary-action">
          Share a Ride
        </Link>
      </div>

      {loadError ? (
        <p className="landing-booking-note">
          Live map services are unavailable right now. You can still continue to booking.
        </p>
      ) : null}
    </article>
  );
}

function LandingBookingCard() {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  if (typeof window === "undefined") {
    return <StaticLandingBookingCard message={defaultLandingStatusMessage} />;
  }

  if (!mapsApiKey) {
    return (
      <StaticLandingBookingCard message="Set VITE_GOOGLE_MAPS_API_KEY to enable live map data." />
    );
  }

  return <InteractiveLandingBookingCard mapsApiKey={mapsApiKey} />;
}

export function LandingPage() {
  return (
    <div className="landing-page">
      <RidrTopNav active="dashboard" showBookNow />

      <main className="landing-main">
        <section className="landing-hero" aria-label="Ridr booking hero">
          <img src={mapImage} alt="City map" className="landing-hero-map" />
          <div className="landing-hero-overlay" />
          <div className="landing-hero-fade" />

          <div className="landing-hero-content">
            <LandingBookingCard />

            <aside className="landing-hero-copy">
              <h2>
                Move with
                <br />
                Purpose.
              </h2>
              <p>
                High-precision logistics meeting environmental stewardship.
                Premium rides, zero carbon guilt.
              </p>
            </aside>
          </div>
        </section>

        <section className="landing-impact" aria-labelledby="impact-heading">
          <header className="landing-impact-head">
            <div>
              <span>Sustainability Impact</span>
              <h3 id="impact-heading">Your footprint, reimagined.</h3>
            </div>
            <Link to="/impact/carbon-neutral" className="landing-impact-link">
              View Carbon Report
              <MaterialSymbol name="arrow_forward" className="landing-inline-icon" />
            </Link>
          </header>

          <div className="landing-impact-grid">
            <article className="landing-impact-card">
              <MaterialSymbol name="payments" className="landing-impact-icon" />
              <small>Annual Savings</small>
              <h4>Save $500/year</h4>
              <p>
                Based on your average commute. Efficient routing and shared rides
                optimize your wallet and the planet.
              </p>
            </article>

            <article className="landing-impact-card landing-impact-card-strong">
              <MaterialSymbol
                name="energy_savings_leaf"
                className="landing-impact-icon"
                filled
              />
              <small>Weekly Reduction</small>
              <h4>Prevent 66 lbs CO2/week</h4>
              <div className="landing-progress-track">
                <div className="landing-progress-fill" />
              </div>
              <p>75% of your monthly goal achieved</p>
            </article>

            <article className="landing-impact-card">
              <small>Collective Power</small>
              <h4>Together, we are reducing CO2 by 125 million metric tons.</h4>
              <div className="landing-crowd">
                <img src={crowdOne} alt="Community member" />
                <img src={crowdTwo} alt="Community member" />
                <span>+1M</span>
                <em>Join the movement</em>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-feature" aria-label="Feature spotlight">
          <figure className="landing-feature-media">
            <img src={vehicleImage} alt="Electric vehicle interior" />
            <figcaption>
              <div>
                <MaterialSymbol name="electric_car" className="landing-inline-icon" />
                <strong>Ridr Premium</strong>
              </div>
              <p>100% of our premium fleet consists of zero-emission vehicles.</p>
            </figcaption>
          </figure>

          <article className="landing-feature-copy">
            <h3>Precision engineering meet environmental ethics.</h3>
            <ul>
              <li>
                <MaterialSymbol name="check" className="landing-list-icon" filled />
                <div>
                  <strong>Optimized Carbon Routing</strong>
                  <p>
                    AI-assisted route planning minimizes idle time and reduces
                    unnecessary emissions.
                  </p>
                </div>
              </li>
              <li>
                <MaterialSymbol name="check" className="landing-list-icon" filled />
                <div>
                  <strong>Verified Offsetting</strong>
                  <p>
                    Every ride is neutralized with independently verified
                    reforestation and clean-energy projects.
                  </p>
                </div>
              </li>
              <li>
                <MaterialSymbol name="check" className="landing-list-icon" filled />
                <div>
                  <strong>Sustainable Perks</strong>
                  <p>
                    Earn eco points on every shared route and redeem them with
                    local green partners.
                  </p>
                </div>
              </li>
            </ul>
          </article>
        </section>

        <footer className="landing-footer">
          <div className="landing-footer-brand">
            <strong>Ridr</strong>
            <p>
              Revolutionizing daily transit through technical precision and
              biological necessity.
            </p>
          </div>

          <div>
            <h5>Product</h5>
            <Link to="/booking/fare-estimates">Ride Types</Link>
            <Link to="/impact/carbon-neutral">Sustainability</Link>
          </div>

          <div>
            <h5>Company</h5>
            <a href="#">About Us</a>
            <a href="#">Careers</a>
          </div>

          <div>
            <h5>Support</h5>
            <a href="#">Help Center</a>
            <a href="#">Privacy Policy</a>
          </div>
        </footer>
      </main>

      <RidrMobileNav active="dashboard" />
    </div>
  );
}
