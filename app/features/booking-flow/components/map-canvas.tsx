import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DirectionsRenderer,
  GoogleMap,
  MarkerF,
  TrafficLayer,
  TransitLayer,
  useJsApiLoader,
} from "@react-google-maps/api";

import { mapBackgroundImage } from "../booking-flow.data";
import type { DepartureMode, RideId, RouteSnapshot } from "../booking-flow.types";
import { getAccessToken } from "~/features/auth/auth-client";
import {
  connectVehicleStreamSocket,
  fetchNearbyVehicles,
  type VehicleMarker,
} from "~/features/mobility/mobility-client";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";
import {
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_PLACES_LIBRARIES,
} from "~/features/shared/constants/google-maps";

const defaultPickupPoint: google.maps.LatLngLiteral = {
  lat: 28.6139,
  lng: 77.209,
};

const defaultDestinationPoint: google.maps.LatLngLiteral = {
  lat: 28.6304,
  lng: 77.2177,
};

const emptyRouteSnapshot: RouteSnapshot = {
  distanceMiles: 0,
  durationMinutes: 0,
  distanceText: "--",
  durationText: "--",
  hasRoute: false,
};

const rideHailingBaseMapStyle: google.maps.MapTypeStyle[] = [
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8e979d" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#edf1f3" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#dde5ec" }],
  },
  {
    featureType: "road.local",
    elementType: "geometry",
    stylers: [{ color: "#f7f8f9" }, { lightness: 8 }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#edf0f2" }, { lightness: 8 }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#dde2e6" }, { saturation: -70 }, { lightness: 12 }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#a0a7ac" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#f6f8f9" }],
  },
];

const standardMapStyle: google.maps.MapTypeStyle[] = rideHailingBaseMapStyle;

const ecoMapStyle: google.maps.MapTypeStyle[] = rideHailingBaseMapStyle;

const carpoolMapStyle: google.maps.MapTypeStyle[] = rideHailingBaseMapStyle;

const rideMapThemes: Record<
  RideId,
  {
    mapStyles: google.maps.MapTypeStyle[];
    routeColor: string;
    routeOpacity: number;
    routeWeight: number;
    pickupColor: string;
    destinationColor: string;
    label: string;
    enableTransitByDefault: boolean;
  }
> = {
  standard: {
    mapStyles: standardMapStyle,
    routeColor: "#0f6f84",
    routeOpacity: 0.93,
    routeWeight: 6,
    pickupColor: "#0f6f84",
    destinationColor: "#1f8c9f",
    label: "Standard route",
    enableTransitByDefault: false,
  },
  eco: {
    mapStyles: ecoMapStyle,
    routeColor: "#127445",
    routeOpacity: 0.96,
    routeWeight: 7,
    pickupColor: "#0b7c42",
    destinationColor: "#1b9a4f",
    label: "Eco route",
    enableTransitByDefault: false,
  },
  carpool: {
    mapStyles: carpoolMapStyle,
    routeColor: "#246d9a",
    routeOpacity: 0.88,
    routeWeight: 5,
    pickupColor: "#246d9a",
    destinationColor: "#3e7f52",
    label: "Carpool route",
    enableTransitByDefault: false,
  },
};

type MapCanvasProps = {
  pickup: string;
  destination: string;
  selectedRideId: RideId;
  departureMode: DepartureMode;
  onRouteSnapshotChange: (nextSnapshot: RouteSnapshot) => void;
  pickupOverridePoint: google.maps.LatLngLiteral | null;
  onRequestCurrentLocation: () => void;
  isCurrentLocationLoading: boolean;
  onPointsResolved?: (points: {
    pickup: google.maps.LatLngLiteral;
    destination: google.maps.LatLngLiteral;
  }) => void;
};

type RouteChoice = {
  index: number;
  summary: string;
  durationText: string;
  distanceText: string;
};

function normalizeAddress(value: string): string {
  return value.replace(/^current\s+location\s*:\s*/i, "").trim();
}

function toRouteSnapshot(route: google.maps.DirectionsRoute | undefined): RouteSnapshot {
  const leg = route?.legs[0];

  if (!route || !leg) {
    return emptyRouteSnapshot;
  }

  const distanceMeters = leg.distance?.value || 0;
  const durationSeconds = leg.duration_in_traffic?.value || leg.duration?.value || 0;
  const distanceMiles = Number((distanceMeters * 0.000621371).toFixed(2));
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

  return {
    distanceMiles,
    durationMinutes,
    distanceText: leg.distance?.text || "--",
    durationText: leg.duration_in_traffic?.text || leg.duration?.text || "--",
    hasRoute: distanceMiles > 0 && durationMinutes > 0,
  };
}

function buildTaxiIconSvg(fillColor: string): string {
  return `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="17" fill="#ffffff" fill-opacity="0.95"/><path d="M8 20.5c0-1.38 1.12-2.5 2.5-2.5h15c1.38 0 2.5 1.12 2.5 2.5V24a1 1 0 0 1-1 1h-1.4a2.6 2.6 0 0 1-5.2 0h-4.8a2.6 2.6 0 0 1-5.2 0H9a1 1 0 0 1-1-1v-3.5Z" fill="${fillColor}"/><path d="M11.2 18 13 13.8a2 2 0 0 1 1.84-1.22h6.32A2 2 0 0 1 23 13.8L24.8 18H11.2Z" fill="${fillColor}"/><circle cx="12.8" cy="25" r="1.5" fill="#1f2a25"/><circle cx="23.2" cy="25" r="1.5" fill="#1f2a25"/><text x="18" y="17.2" text-anchor="middle" font-size="5.4" font-family="Inter, sans-serif" font-weight="700" fill="#ffffff">CAB</text></svg>`;
}

function buildTaxiIcon(status: string): google.maps.Icon | undefined {
  if (typeof google === "undefined") {
    return undefined;
  }

  const fillColor =
    status === "assigned"
      ? "#0f6d43"
      : status === "busy"
        ? "#1464a5"
        : "#2e7a4a";

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(buildTaxiIconSvg(fillColor))}`,
    scaledSize: new google.maps.Size(30, 30),
    anchor: new google.maps.Point(15, 15),
  };
}

function mergeVehicleMarkers(
  current: VehicleMarker[],
  nextMarker: VehicleMarker,
): VehicleMarker[] {
  const deduped = current.filter((item) => item.user_id !== nextMarker.user_id);
  return [nextMarker, ...deduped].slice(0, 28);
}

async function geocodeWithFallback(
  geocoder: google.maps.Geocoder,
  rawAddress: string,
  fallbackPoint: google.maps.LatLngLiteral,
): Promise<google.maps.LatLngLiteral> {
  const normalized = normalizeAddress(rawAddress);
  if (!normalized) {
    return fallbackPoint;
  }

  const candidates: string[] = [normalized];

  if (!/\bindia\b/i.test(normalized)) {
    candidates.push(`${normalized}, India`);
  }

  if (!/\b(faridabad|haryana)\b/i.test(normalized)) {
    candidates.push(`${normalized}, Faridabad, Haryana, India`);
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

  return fallbackPoint;
}

function StaticMapCanvas({ message }: { message?: string }) {
  return (
    <div className="map-canvas" aria-hidden="true">
      <img
        src={mapBackgroundImage}
        alt="Minimal city map"
        className="map-background-image"
      />
      <div className="map-overlay-grid" />
      {message ? <p className="map-fallback-message">{message}</p> : null}
    </div>
  );
}

function InteractiveMapCanvas({
  apiKey,
  pickup,
  destination,
  selectedRideId,
  departureMode,
  onRouteSnapshotChange,
  pickupOverridePoint,
  onRequestCurrentLocation,
  isCurrentLocationLoading,
  onPointsResolved,
}: {
  apiKey: string;
  pickup: string;
  destination: string;
  selectedRideId: RideId;
  departureMode: DepartureMode;
  onRouteSnapshotChange: (nextSnapshot: RouteSnapshot) => void;
  pickupOverridePoint: google.maps.LatLngLiteral | null;
  onRequestCurrentLocation: () => void;
  isCurrentLocationLoading: boolean;
  onPointsResolved?: (points: {
    pickup: google.maps.LatLngLiteral;
    destination: google.maps.LatLngLiteral;
  }) => void;
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_PLACES_LIBRARIES,
    preventGoogleFontsLoading: true,
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const [pickupPoint, setPickupPoint] = useState(defaultPickupPoint);
  const [destinationPoint, setDestinationPoint] = useState(defaultDestinationPoint);
  const [debouncedPickup, setDebouncedPickup] = useState(pickup);
  const [debouncedDestination, setDebouncedDestination] = useState(destination);
  const [directionsResult, setDirectionsResult] =
    useState<google.maps.DirectionsResult | null>(null);
  const [routeChoices, setRouteChoices] = useState<RouteChoice[]>([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [distanceText, setDistanceText] = useState("--");
  const [durationText, setDurationText] = useState("--");
  const mapTheme = rideMapThemes[selectedRideId];
  const [mapTypeId, setMapTypeId] = useState<google.maps.MapTypeId>(
    "roadmap" as google.maps.MapTypeId,
  );
  const [showTraffic, setShowTraffic] = useState(false);
  const [showTransit, setShowTransit] = useState(mapTheme.enableTransitByDefault);
  const [nearbyVehicles, setNearbyVehicles] = useState<VehicleMarker[]>([]);

  const hasPickupSource =
    Boolean(pickupOverridePoint) || normalizeAddress(debouncedPickup).length > 0;
  const hasDestinationSource = normalizeAddress(debouncedDestination).length > 0;
  const hudPrimaryText = hasPickupSource
    ? hasDestinationSource
      ? `${distanceText} • ${durationText}`
      : "Add destination to preview route"
    : "Set pickup and destination";

  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      disableDefaultUI: true,
      zoomControl: false,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "greedy",
      mapTypeId,
      backgroundColor: "#edf1f3",
      styles: mapTheme.mapStyles,
    }),
    [mapTheme.mapStyles, mapTypeId],
  );

  const pickupIcon = useMemo<google.maps.Symbol | undefined>(() => {
    if (!isLoaded) {
      return undefined;
    }

    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: mapTheme.pickupColor,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
    };
  }, [isLoaded, mapTheme.pickupColor]);

  const destinationIcon = useMemo<google.maps.Symbol | undefined>(() => {
    if (!isLoaded) {
      return undefined;
    }

    return {
      path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
      scale: 6,
      fillColor: mapTheme.destinationColor,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 1.5,
    };
  }, [isLoaded, mapTheme.destinationColor]);

  const fitCurrentBounds = useCallback(
    (nextPickup: google.maps.LatLngLiteral, nextDestination: google.maps.LatLngLiteral) => {
      if (!mapRef.current) {
        return;
      }

      const bounds = new google.maps.LatLngBounds();
      bounds.extend(nextPickup);
      bounds.extend(nextDestination);

      mapRef.current.fitBounds(bounds, {
        top: 100,
        right: 110,
        bottom: 230,
        left: 110,
      });
    },
    [],
  );

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const handleRecenter = useCallback(() => {
    fitCurrentBounds(pickupPoint, destinationPoint);
  }, [destinationPoint, fitCurrentBounds, pickupPoint]);

  useEffect(() => {
    setShowTransit(mapTheme.enableTransitByDefault);
  }, [mapTheme.enableTransitByDefault]);

  useEffect(() => {
    onPointsResolved?.({
      pickup: pickupPoint,
      destination: destinationPoint,
    });
  }, [destinationPoint, onPointsResolved, pickupPoint]);

  useEffect(() => {
    const debounceId = window.setTimeout(() => {
      setDebouncedPickup(pickup);
      setDebouncedDestination(destination);
    }, 350);

    return () => {
      window.clearTimeout(debounceId);
    };
  }, [destination, pickup]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const geocoder = new google.maps.Geocoder();
    let disposed = false;

    async function resolvePoints() {
      const [nextPickup, nextDestination] = await Promise.all([
        pickupOverridePoint
          ? Promise.resolve(pickupOverridePoint)
          : hasPickupSource
            ? geocodeWithFallback(geocoder, debouncedPickup, defaultPickupPoint)
            : Promise.resolve(defaultPickupPoint),
        hasDestinationSource
          ? geocodeWithFallback(geocoder, debouncedDestination, defaultDestinationPoint)
          : Promise.resolve(defaultDestinationPoint),
      ]);

      if (disposed) {
        return;
      }

      setPickupPoint(nextPickup);
      setDestinationPoint(nextDestination);

      if (hasPickupSource && hasDestinationSource) {
        fitCurrentBounds(nextPickup, nextDestination);
        return;
      }

      mapRef.current?.panTo(nextPickup);
      mapRef.current?.setZoom(13);
    }

    resolvePoints();

    return () => {
      disposed = true;
    };
  }, [
    debouncedDestination,
    debouncedPickup,
    fitCurrentBounds,
    hasDestinationSource,
    hasPickupSource,
    isLoaded,
    pickupOverridePoint,
  ]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!hasPickupSource || !hasDestinationSource) {
      setDirectionsResult(null);
      setRouteChoices([]);
      setDistanceText("--");
      setDurationText("--");
      onRouteSnapshotChange(emptyRouteSnapshot);
      return;
    }

    const directionsService = new google.maps.DirectionsService();
    let disposed = false;

    directionsService.route(
      {
        origin: pickupPoint,
        destination: destinationPoint,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
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

        if (status !== google.maps.DirectionsStatus.OK || !result) {
          setDirectionsResult(null);
          setRouteChoices([]);
          setDistanceText("--");
          setDurationText("--");
          onRouteSnapshotChange(emptyRouteSnapshot);
          return;
        }

        setDirectionsResult(result);
        setActiveRouteIndex(0);

        const choices = result.routes.map((route, index) => {
          const primaryLeg = route.legs[0];

          return {
            index,
            summary: route.summary || `Route ${index + 1}`,
            durationText:
              primaryLeg?.duration_in_traffic?.text || primaryLeg?.duration?.text || "--",
            distanceText: primaryLeg?.distance?.text || "--",
          };
        });

        setRouteChoices(choices);

        const firstSnapshot = toRouteSnapshot(result.routes[0]);
        setDistanceText(firstSnapshot.distanceText);
        setDurationText(firstSnapshot.durationText);
        onRouteSnapshotChange(firstSnapshot);

        if (result.routes[0]?.bounds) {
          mapRef.current?.fitBounds(result.routes[0].bounds, {
            top: 100,
            right: 110,
            bottom: 230,
            left: 110,
          });
        }
      },
    );

    return () => {
      disposed = true;
    };
  }, [
    destinationPoint,
    hasDestinationSource,
    hasPickupSource,
    isLoaded,
    onRouteSnapshotChange,
    pickupPoint,
  ]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setNearbyVehicles([]);
      return;
    }

    const authToken = token;

    let disposed = false;
    let ws: WebSocket | null = null;

    async function hydrateNearbyVehicles() {
      try {
        const markers = await fetchNearbyVehicles(authToken, {
          lat: pickupPoint.lat,
          lng: pickupPoint.lng,
          radiusKm: 10,
        });

        if (!disposed) {
          setNearbyVehicles(markers);
        }
      } catch {
        if (!disposed) {
          setNearbyVehicles([]);
        }
      }

      ws = connectVehicleStreamSocket({
        token: authToken,
        lat: pickupPoint.lat,
        lng: pickupPoint.lng,
        radiusKm: 10,
        onVehicleUpdate: (vehicle) => {
          if (!disposed) {
            setNearbyVehicles((current) => mergeVehicleMarkers(current, vehicle));
          }
        },
      });
    }

    void hydrateNearbyVehicles();

    return () => {
      disposed = true;
      if (ws) {
        ws.close();
      }
    };
  }, [isLoaded, pickupPoint.lat, pickupPoint.lng]);

  useEffect(() => {
    if (!directionsResult) {
      return;
    }

    const nextRoute = directionsResult.routes[activeRouteIndex] || directionsResult.routes[0];
    const nextSnapshot = toRouteSnapshot(nextRoute);

    setDistanceText(nextSnapshot.distanceText);
    setDurationText(nextSnapshot.durationText);
    onRouteSnapshotChange(nextSnapshot);

    if (nextRoute?.bounds) {
      mapRef.current?.fitBounds(nextRoute.bounds, {
        top: 100,
        right: 110,
        bottom: 230,
        left: 110,
      });
    }
  }, [activeRouteIndex, directionsResult, onRouteSnapshotChange]);

  if (loadError) {
    return (
      <StaticMapCanvas message="Google Maps failed to load. Check API key and billing settings." />
    );
  }

  if (!isLoaded) {
    return (
      <div className="map-canvas map-canvas-loading" aria-hidden="true">
        <div className="map-loading-card">Loading map and route intelligence...</div>
      </div>
    );
  }

  return (
    <div className={["map-canvas", `map-canvas-theme-${selectedRideId}`].join(" ")}>
      <GoogleMap
        mapContainerClassName="map-google-surface"
        center={pickupPoint}
        zoom={13}
        options={mapOptions}
        onLoad={handleMapLoad}
      >
        {showTraffic ? <TrafficLayer /> : null}
        {showTransit ? <TransitLayer /> : null}

        <MarkerF
          position={pickupPoint}
          title="Pickup"
          icon={pickupIcon}
          label={{ text: "P", color: "#ffffff", fontWeight: "700" }}
        />
        <MarkerF
          position={destinationPoint}
          title="Destination"
          icon={destinationIcon}
          label={{ text: "D", color: "#ffffff", fontWeight: "700" }}
        />

        {nearbyVehicles.map((vehicle) => (
          <MarkerF
            key={`vehicle-${vehicle.user_id}`}
            position={{ lat: vehicle.lat, lng: vehicle.lng }}
            title={`${vehicle.vehicle_name || "Ridr cab"} • ${vehicle.distance_km} km away`}
            icon={buildTaxiIcon(vehicle.status)}
          />
        ))}

        {directionsResult ? (
          <DirectionsRenderer
            directions={directionsResult}
            routeIndex={activeRouteIndex}
            options={{
              suppressMarkers: true,
              preserveViewport: true,
              polylineOptions: {
                strokeColor: mapTheme.routeColor,
                strokeOpacity:
                  departureMode === "later"
                    ? Math.max(0.68, mapTheme.routeOpacity - 0.14)
                    : mapTheme.routeOpacity,
                strokeWeight: mapTheme.routeWeight,
                icons:
                  departureMode === "later"
                    ? [
                        {
                          icon: {
                            path: "M 0,-1 0,1",
                            strokeOpacity: 0.9,
                            scale: 4,
                          },
                          offset: "0",
                          repeat: "16px",
                        },
                      ]
                    : undefined,
              },
            }}
          />
        ) : null}
      </GoogleMap>

      <div className="map-ride-tint" />

      <div className="map-top-controls" role="group" aria-label="Map controls">
        <button type="button" onClick={handleRecenter} className="map-control-button">
          <MaterialSymbol name="center_focus_strong" />
          Recenter
        </button>
        <button
          type="button"
          onClick={onRequestCurrentLocation}
          className="map-control-button"
          disabled={isCurrentLocationLoading}
        >
          <MaterialSymbol name="my_location" />
          {isCurrentLocationLoading ? "Locating..." : "Use My Location"}
        </button>
        <button
          type="button"
          onClick={() =>
            setMapTypeId((current) =>
              current === google.maps.MapTypeId.ROADMAP
                ? google.maps.MapTypeId.SATELLITE
                : google.maps.MapTypeId.ROADMAP,
            )
          }
          className="map-control-button"
        >
          <MaterialSymbol
            name={mapTypeId === google.maps.MapTypeId.ROADMAP ? "satellite_alt" : "map"}
          />
          {mapTypeId === google.maps.MapTypeId.ROADMAP ? "Satellite" : "Roadmap"}
        </button>
        <button
          type="button"
          onClick={() => setShowTraffic((current) => !current)}
          className={[
            "map-control-button",
            showTraffic ? "map-control-button-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <MaterialSymbol name="traffic" />
          Traffic
        </button>
        <button
          type="button"
          onClick={() => setShowTransit((current) => !current)}
          className={[
            "map-control-button",
            showTransit ? "map-control-button-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <MaterialSymbol name="directions_transit" />
          Transit
        </button>
      </div>

      <aside className="map-route-hud" aria-live="polite">
        <strong>{mapTheme.label}</strong>
        <p>{hudPrimaryText}</p>
        <small>
          {normalizeAddress(pickup) || "Pickup"} to {normalizeAddress(destination) || "Destination"}
        </small>
        <small>{nearbyVehicles.length} nearby cabs live</small>
      </aside>

      {routeChoices.length > 1 ? (
        <nav className="map-route-selector" aria-label="Route choices">
          {routeChoices.map((choice) => (
            <button
              key={choice.index}
              type="button"
              className={[
                "map-route-chip",
                activeRouteIndex === choice.index ? "map-route-chip-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setActiveRouteIndex(choice.index)}
            >
              <span>{choice.summary}</span>
              <small>
                {choice.distanceText} • {choice.durationText}
              </small>
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export function MapCanvas({
  pickup,
  destination,
  selectedRideId,
  departureMode,
  onRouteSnapshotChange,
  pickupOverridePoint,
  onRequestCurrentLocation,
  isCurrentLocationLoading,
  onPointsResolved,
}: MapCanvasProps) {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (typeof window === "undefined") {
    return <StaticMapCanvas />;
  }

  if (!mapsApiKey) {
    return (
      <StaticMapCanvas message="Set VITE_GOOGLE_MAPS_API_KEY to enable live routes and map controls." />
    );
  }

  return (
    <InteractiveMapCanvas
      apiKey={mapsApiKey}
      pickup={pickup}
      destination={destination}
      selectedRideId={selectedRideId}
      departureMode={departureMode}
      onRouteSnapshotChange={onRouteSnapshotChange}
      pickupOverridePoint={pickupOverridePoint}
      onRequestCurrentLocation={onRequestCurrentLocation}
      isCurrentLocationLoading={isCurrentLocationLoading}
      onPointsResolved={onPointsResolved}
    />
  );
}
