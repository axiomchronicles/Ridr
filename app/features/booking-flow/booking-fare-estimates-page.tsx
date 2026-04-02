import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import {
  defaultDestination,
  defaultPickup,
  demandAlert,
  primaryDriver,
  ridePricingProfiles,
  rideOptions,
} from "./booking-flow.data";
import type {
  BookingStatus,
  DepartureMode,
  RideId,
  RouteSnapshot,
} from "./booking-flow.types";
import { BookingInputsPanel } from "./components/booking-inputs-panel";
import { DemandAlertCard } from "./components/demand-alert-card";
import { MapCanvas } from "./components/map-canvas";
import { RideSelectionSheet } from "./components/ride-selection-sheet";
import { RidrMobileNav } from "~/features/shared/components/ridr-mobile-nav";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import "./booking-flow.css";

const emptyRouteSnapshot: RouteSnapshot = {
  distanceMiles: 0,
  durationMinutes: 0,
  distanceText: "--",
  durationText: "--",
  hasRoute: false,
};

type LocationFetchStatus = "idle" | "loading" | "ready" | "error";
type SavedPlaceKey = "home" | "work";
type SavedPlaces = Partial<Record<SavedPlaceKey, string>>;

const savedPlacesStorageKey = "ridr.saved-places";
const defaultLocationStatusMessage =
  "Use current location or start typing your pickup address.";

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

export function BookingFareEstimatesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPickup = searchParams.get("pickup")?.trim() || defaultPickup;
  const initialDestination =
    searchParams.get("destination")?.trim() || defaultDestination;
  const [pickup, setPickup] = useState(initialPickup);
  const [destination, setDestination] = useState(initialDestination);
  const [selectedRideId, setSelectedRideId] = useState<RideId>("eco");
  const [departureMode, setDepartureMode] = useState<DepartureMode>("now");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("idle");
  const [routeSnapshot, setRouteSnapshot] =
    useState<RouteSnapshot>(emptyRouteSnapshot);
  const [pickupOverridePoint, setPickupOverridePoint] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [locationFetchStatus, setLocationFetchStatus] =
    useState<LocationFetchStatus>("idle");
  const [locationStatusMessage, setLocationStatusMessage] = useState(
    defaultLocationStatusMessage,
  );
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaces>({});

  const bookingResetTimerRef = useRef<number | null>(null);
  const locationRequestTokenRef = useRef(0);
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapsEnabled = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const inrFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
    [],
  );

  const isRouteReady =
    mapsEnabled &&
    routeSnapshot.hasRoute &&
    pickup.trim().length >= 3 &&
    destination.trim().length >= 3;

  const routeSummaryText = isRouteReady
    ? `${routeSnapshot.distanceText} • ${routeSnapshot.durationText}`
    : mapsEnabled
      ? "Set pickup and destination to build route"
      : "Set VITE_GOOGLE_MAPS_API_KEY to enable route intelligence";

  const isCurrentLocationLoading = locationFetchStatus === "loading";
  const canSaveDestination = destination.trim().length > 3;

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
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(savedPlacesStorageKey, JSON.stringify(savedPlaces));
  }, [savedPlaces]);

  const handlePickupChange = useCallback((nextValue: string) => {
    setPickup(nextValue);

    locationRequestTokenRef.current += 1;
    if (locationFetchStatus === "loading") {
      setLocationFetchStatus("idle");
      setLocationStatusMessage("Pickup updated manually.");
    }

    const normalized = nextValue.toLowerCase();
    if (!normalized.includes("current location") && pickupOverridePoint) {
      setPickupOverridePoint(null);
    }
  }, [locationFetchStatus, pickupOverridePoint]);

  const handleClearPickup = useCallback(() => {
    locationRequestTokenRef.current += 1;
    setPickup("");
    setPickupOverridePoint(null);
    setLocationFetchStatus("idle");
    setLocationStatusMessage(defaultLocationStatusMessage);
  }, []);

  const handleSwapRoute = useCallback(() => {
    locationRequestTokenRef.current += 1;
    setPickupOverridePoint(null);
    setPickup(destination);
    setDestination(pickup);
    setLocationFetchStatus("idle");
    setLocationStatusMessage("Pickup and destination swapped.");
  }, [destination, pickup]);

  const requestCurrentLocation = useCallback(() => {
    const requestToken = locationRequestTokenRef.current + 1;
    locationRequestTokenRef.current = requestToken;

    if (!mapsEnabled || !mapsApiKey) {
      setLocationFetchStatus("error");
      setLocationStatusMessage("Add Maps API key first to use current location.");
      return;
    }

    if (!navigator.geolocation) {
      setLocationFetchStatus("error");
      setLocationStatusMessage("Geolocation is not supported on this browser.");
      return;
    }

    setLocationFetchStatus("loading");
    setLocationStatusMessage("Requesting your location permission...");

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

        setPickupOverridePoint(nextCoords);
        setPickup(resolvedAddress || "Your address");
        setLocationFetchStatus("ready");
        setLocationStatusMessage(
          resolvedAddress
            ? "Pickup set from your current address."
            : "Location found. Refine pickup if needed.",
        );
      },
      (error) => {
        if (requestToken !== locationRequestTokenRef.current) {
          return;
        }

        setLocationFetchStatus("error");

        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatusMessage("Location permission denied. Enter pickup manually.");
          return;
        }

        if (error.code === error.TIMEOUT) {
          setLocationStatusMessage("Location request timed out. Try again.");
          return;
        }

        setLocationStatusMessage("Unable to fetch location. Enter pickup manually.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }, [mapsApiKey, mapsEnabled]);

  const handleSavePlace = useCallback(
    (placeKey: SavedPlaceKey) => {
      const trimmedDestination = destination.trim();
      if (!trimmedDestination) {
        return;
      }

      setSavedPlaces((current) => ({
        ...current,
        [placeKey]: trimmedDestination,
      }));
      setLocationStatusMessage(`Saved destination as ${placeKey}.`);
    },
    [destination],
  );

  const handleApplySavedPlace = useCallback(
    (placeKey: SavedPlaceKey) => {
      const placeAddress = savedPlaces[placeKey];
      if (!placeAddress) {
        return;
      }

      setDestination(placeAddress);
      setLocationStatusMessage(`Using saved ${placeKey} address.`);
    },
    [savedPlaces],
  );

  const handleClearSavedPlace = useCallback((placeKey: SavedPlaceKey) => {
    setSavedPlaces((current) => {
      const nextPlaces = { ...current };
      delete nextPlaces[placeKey];
      return nextPlaces;
    });
    setLocationStatusMessage(`Removed saved ${placeKey} address.`);
  }, []);

  const dynamicRideOptions = useMemo(() => {
    const effectiveDistance = routeSnapshot.hasRoute ? routeSnapshot.distanceMiles : 4.2;
    const effectiveDuration = routeSnapshot.hasRoute ? routeSnapshot.durationMinutes : 17;

    function estimateFare(rideId: RideId): number {
      const profile = ridePricingProfiles[rideId];
      const baseAmount =
        profile.baseFare +
        effectiveDistance * profile.perMile +
        effectiveDuration * profile.perMinute;

      const departureFactor = departureMode === "later" ? 0.91 : 1.08;
      return Math.max(profile.minFare, baseAmount * departureFactor);
    }

    const standardFare = estimateFare("standard");

    return rideOptions.map((ride) => {
      const profile = ridePricingProfiles[ride.id];
      const estimatedFare = estimateFare(ride.id);
      const waitOffset = departureMode === "later" ? 6 : 0;
      const etaMinutes = Math.max(
        2,
        Math.round(effectiveDuration / profile.etaSpeedFactor) +
          profile.waitBufferMinutes +
          waitOffset,
      );

      const impactLbs = Math.max(
        0,
        effectiveDistance * profile.co2SavingsPerMile,
      );
      const savingsVsStandard = Math.max(0, standardFare - estimatedFare);

      return {
        ...ride,
        price: Number(estimatedFare.toFixed(2)),
        etaMinutes,
        impactLabel:
          ride.id === "eco"
            ? `Saves ${impactLbs.toFixed(1)} lbs CO2`
            : ride.impactLabel,
        savingsLabel:
          ride.id === "carpool"
            ? `Saves you ${inrFormatter.format(savingsVsStandard)}`
            : ride.savingsLabel,
      };
    });
  }, [
    departureMode,
    inrFormatter,
    routeSnapshot.distanceMiles,
    routeSnapshot.durationMinutes,
    routeSnapshot.hasRoute,
  ]);

  useEffect(() => {
    return () => {
      if (bookingResetTimerRef.current !== null) {
        window.clearTimeout(bookingResetTimerRef.current);
      }
    };
  }, []);

  function handleBookRide() {
    if (bookingStatus === "loading" || !isRouteReady) {
      return;
    }

    if (bookingResetTimerRef.current !== null) {
      window.clearTimeout(bookingResetTimerRef.current);
      bookingResetTimerRef.current = null;
    }

    setBookingStatus("loading");

    bookingResetTimerRef.current = window.setTimeout(() => {
      setBookingStatus("confirmed");

      bookingResetTimerRef.current = window.setTimeout(() => {
        navigate("/ride/pre-meeting-chat");
        bookingResetTimerRef.current = null;
      }, 800);
    }, 550);
  }

  return (
    <div className="booking-page">
      <RidrTopNav active="ride" />

      <main className="booking-main-canvas">
        <MapCanvas
          pickup={pickup}
          destination={destination}
          selectedRideId={selectedRideId}
          departureMode={departureMode}
          onRouteSnapshotChange={setRouteSnapshot}
          pickupOverridePoint={pickupOverridePoint}
          onRequestCurrentLocation={requestCurrentLocation}
          isCurrentLocationLoading={isCurrentLocationLoading}
        />

        <section className="booking-floating-cluster">
          <BookingInputsPanel
            pickup={pickup}
            destination={destination}
            onPickupChange={handlePickupChange}
            onDestinationChange={setDestination}
            onSwapRoute={handleSwapRoute}
            routeSummary={routeSummaryText}
            mapsEnabled={mapsEnabled}
            onRequestCurrentLocation={requestCurrentLocation}
            isCurrentLocationLoading={isCurrentLocationLoading}
            locationStatusMessage={locationStatusMessage}
            savedPlaces={savedPlaces}
            canSaveDestination={canSaveDestination}
            onSavePlace={handleSavePlace}
            onApplySavedPlace={handleApplySavedPlace}
            onClearSavedPlace={handleClearSavedPlace}
            onClearPickup={handleClearPickup}
            onClearDestination={() => setDestination("")}
          />
          <DemandAlertCard title={demandAlert.title} message={demandAlert.message} />
        </section>

        <RideSelectionSheet
          rides={dynamicRideOptions}
          selectedRideId={selectedRideId}
          onSelectRide={setSelectedRideId}
          departureMode={departureMode}
          onToggleDepartureMode={() =>
            setDepartureMode((current) => (current === "now" ? "later" : "now"))
          }
          bookingStatus={bookingStatus}
          onBookRide={handleBookRide}
          driver={primaryDriver}
          routeSummary={routeSummaryText}
          isRouteReady={isRouteReady}
        />
      </main>

      <RidrMobileNav active="ride" />
    </div>
  );
}
