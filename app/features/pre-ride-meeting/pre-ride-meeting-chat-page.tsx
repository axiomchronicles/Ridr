import { useEffect, useMemo, useRef, useState } from "react";
import {
  DirectionsRenderer,
  GoogleMap,
  InfoWindowF,
  MarkerF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useNavigate, useSearchParams } from "react-router";

import { getAccessToken, getStoredUser } from "~/features/auth/auth-client";
import {
  connectRideMeetingLobbySocket,
  fetchActiveRideBookingSession,
  fetchRideMeetingLobby,
  fetchRideSummary,
  postRideMeetingLobbyMessage,
  type RideLobbyMessage,
  type RideLobbyParticipant,
} from "~/features/mobility/mobility-client";
import { RidrMobileNav } from "~/features/shared/components/ridr-mobile-nav";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";
import {
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_PLACES_LIBRARIES,
} from "~/features/shared/constants/google-maps";

import "./pre-ride-meeting-chat-page.css";

const MEETING_RADIUS_KM = 3.5;

const quickReplies = [
  "Reached the pickup lane.",
  "I am wearing a blue jacket",
  "I have two bags",
];

const defaultMapCenter: google.maps.LatLngLiteral = {
  lat: 28.6139,
  lng: 77.209,
};

const defaultDestinationCenter: google.maps.LatLngLiteral = {
  lat: 28.6262,
  lng: 77.229,
};

const uberLikeMapStyles: google.maps.MapTypeStyle[] = [
  {
    featureType: "all",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3b3f45" }],
  },
  {
    featureType: "all",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#f7f7f7" }],
  },
  {
    featureType: "poi",
    stylers: [{ saturation: -100 }, { lightness: 12 }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#e3e7ec" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#d7dde4" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#d8e3ef" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
];

function formatMessageTime(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Now";
  }

  return parsedDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mergeLobbyMessages(
  current: RideLobbyMessage[],
  incoming: RideLobbyMessage,
): RideLobbyMessage[] {
  const deduped = current.filter((message) => message.id !== incoming.id);
  return [...deduped, incoming].sort(
    (left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  );
}

function buildParticipantIcon(participant: RideLobbyParticipant): google.maps.Symbol | undefined {
  if (typeof google === "undefined") {
    return undefined;
  }

  const fillColor =
    participant.role === "rider"
      ? "#111418"
      : participant.is_current_user
        ? "#0f0f10"
        : "#3a4656";

  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: participant.role === "rider" ? 11 : 9,
  };
}

function buildRouteMarkerIcon(kind: "pickup" | "destination"): google.maps.Symbol | undefined {
  if (typeof google === "undefined") {
    return undefined;
  }

  if (kind === "pickup") {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: "#111418",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
      scale: 7,
    };
  }

  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: "#5a6472",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 6,
  };
}

function buildParticipantMarkerPositions(
  entries: RideLobbyParticipant[],
): Map<number, google.maps.LatLngLiteral> {
  const grouped = new Map<string, RideLobbyParticipant[]>();

  for (const entry of entries) {
    const key = `${entry.lat.toFixed(6)}:${entry.lng.toFixed(6)}`;
    const group = grouped.get(key);
    if (group) {
      group.push(entry);
    } else {
      grouped.set(key, [entry]);
    }
  }

  const markerPositions = new Map<number, google.maps.LatLngLiteral>();

  for (const group of grouped.values()) {
    if (group.length === 1) {
      const participant = group[0];
      markerPositions.set(participant.user_id, {
        lat: participant.lat,
        lng: participant.lng,
      });
      continue;
    }

    const spreadRadius = 0.00028;
    const angleStep = (2 * Math.PI) / group.length;

    group
      .slice()
      .sort((left, right) => left.user_id - right.user_id)
      .forEach((participant, index) => {
        const angle = angleStep * index;
        const latOffset = spreadRadius * Math.cos(angle);
        const lngOffset =
          (spreadRadius * Math.sin(angle)) /
          Math.max(0.35, Math.cos((participant.lat * Math.PI) / 180));

        markerPositions.set(participant.user_id, {
          lat: participant.lat + latOffset,
          lng: participant.lng + lngOffset,
        });
      });
  }

  return markerPositions;
}

function formatParticipantRole(role: RideLobbyParticipant["role"]): string {
  return role === "rider" ? "Rider" : "Driver";
}

export function PreRideMeetingChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rideId = searchParams.get("rideId")?.trim() || "";
  const pickupQuery = searchParams.get("pickup")?.trim() || "Terminal 2, Door 4";
  const destinationQuery =
    searchParams.get("destination")?.trim() || "Passenger pickup zone";

  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const authToken = useMemo(
    () => (typeof window === "undefined" ? null : getAccessToken()),
    [],
  );
  const currentUser = useMemo(
    () => (typeof window === "undefined" ? null : getStoredUser()),
    [],
  );
  const currentUserId = currentUser?.id ?? null;

  const { isLoaded: mapsLoaded, loadError: mapsLoadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: mapsApiKey || "",
    libraries: GOOGLE_MAPS_PLACES_LIBRARIES,
    preventGoogleFontsLoading: true,
  });

  const [participants, setParticipants] = useState<RideLobbyParticipant[]>([]);
  const [messages, setMessages] = useState<RideLobbyMessage[]>([]);
  const [pickupLabel, setPickupLabel] = useState(pickupQuery);
  const [destinationLabel, setDestinationLabel] = useState(destinationQuery);
  const [pickupPoint, setPickupPoint] = useState<google.maps.LatLngLiteral>(defaultMapCenter);
  const [destinationPoint, setDestinationPoint] = useState<google.maps.LatLngLiteral>(
    defaultDestinationCenter,
  );
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>(defaultMapCenter);
  const [journeyRoute, setJourneyRoute] = useState<google.maps.DirectionsResult | null>(null);
  const [hoveredParticipantId, setHoveredParticipantId] = useState<number | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [chatConnectionStatus, setChatConnectionStatus] = useState(
    rideId ? "Connecting meeting lobby..." : "Ride id missing",
  );
  const [isSessionValidated, setIsSessionValidated] = useState(false);

  const lobbySocketRef = useRef<WebSocket | null>(null);
  const lobbyReconnectTimerRef = useRef<number | null>(null);
  const hoverCardCloseTimerRef = useRef<number | null>(null);
  const markerInteractionAtRef = useRef(0);
  const isProfileCardHoveredRef = useRef(false);
  const selectedParticipantIdRef = useRef<number | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);
  const hasStartedConversation = useMemo(
    () => messages.some((message) => message.sender_role !== "system"),
    [messages],
  );
  const primaryDriver = useMemo(
    () => participants.find((participant) => participant.role === "driver") || null,
    [participants],
  );
  const activeRider = useMemo(
    () => participants.find((participant) => participant.role === "rider") || null,
    [participants],
  );
  const estimatedArrival = useMemo(() => {
    if (!primaryDriver) {
      return "--";
    }

    const etaMinutes = Math.max(2, Math.round((primaryDriver.distance_km / 26) * 60));
    return `${etaMinutes} mins`;
  }, [primaryDriver]);
  const participantMarkerPositions = useMemo(
    () => buildParticipantMarkerPositions(participants),
    [participants],
  );
  const activeMapProfileParticipantId = selectedParticipantId ?? hoveredParticipantId;
  const activeMapProfileParticipant = useMemo(
    () =>
      activeMapProfileParticipantId === null
        ? null
        : participants.find((participant) => participant.user_id === activeMapProfileParticipantId) || null,
    [activeMapProfileParticipantId, participants],
  );
  const activeMapProfilePosition = useMemo(() => {
    if (activeMapProfileParticipantId === null) {
      return null;
    }

    return participantMarkerPositions.get(activeMapProfileParticipantId) || null;
  }, [activeMapProfileParticipantId, participantMarkerPositions]);

  function clearHoverCardCloseTimer() {
    if (hoverCardCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCardCloseTimerRef.current);
      hoverCardCloseTimerRef.current = null;
    }
  }

  function scheduleHoverCardClose(participantId: number | null = null) {
    clearHoverCardCloseTimer();
    hoverCardCloseTimerRef.current = window.setTimeout(() => {
      if (selectedParticipantIdRef.current !== null || isProfileCardHoveredRef.current) {
        return;
      }

      if (participantId === null) {
        setHoveredParticipantId(null);
        return;
      }

      setHoveredParticipantId((current) => (current === participantId ? null : current));
    }, 170);
  }

  useEffect(() => {
    if (!authToken) {
      navigate("/booking/fare-estimates", { replace: true });
      return;
    }

    const token = authToken;

    let disposed = false;

    async function validateMessageAccess() {
      try {
        const session = await fetchActiveRideBookingSession(token);
        if (disposed) {
          return;
        }

        const hasAcceptedSession =
          session.has_active_session &&
          session.ride_id &&
          (session.ride_status === "accepted" || session.ride_status === "in_progress");

        if (!hasAcceptedSession) {
          if (session.has_active_session && session.ride_id) {
            const nextParams = new URLSearchParams();
            nextParams.set("rideId", session.ride_id);

            if (session.pickup_label?.trim()) {
              nextParams.set("pickup", session.pickup_label.trim());
            }

            if (session.destination_label?.trim()) {
              nextParams.set("destination", session.destination_label.trim());
            }

            navigate(`/ride/finding-your-ride?${nextParams.toString()}`, {
              replace: true,
            });
            return;
          }

          navigate("/booking/fare-estimates", { replace: true });
          return;
        }

        const activeRideId = session.ride_id as string;
        if (!rideId || rideId !== activeRideId) {
          const nextParams = new URLSearchParams();
          nextParams.set("rideId", activeRideId);
          nextParams.set("ride", "Ridr Eco");

          if (session.pickup_label?.trim()) {
            nextParams.set("pickup", session.pickup_label.trim());
          }

          if (session.destination_label?.trim()) {
            nextParams.set("destination", session.destination_label.trim());
          }

          navigate(`/ride/pre-meeting-chat?${nextParams.toString()}`, {
            replace: true,
          });
          return;
        }

        setIsSessionValidated(true);
      } catch {
        if (!disposed) {
          navigate("/booking/fare-estimates", { replace: true });
        }
      }
    }

    void validateMessageAccess();

    return () => {
      disposed = true;
    };
  }, [authToken, navigate, rideId]);

  useEffect(() => {
    if (!rideId || !authToken) {
      return;
    }

    const token = authToken;
    let disposed = false;

    async function hydrateSummary() {
      try {
        const rideSummary = await fetchRideSummary(token, rideId);
        if (disposed) {
          return;
        }

        setPickupLabel(rideSummary.pickup_label?.trim() || pickupQuery);
        setDestinationLabel(rideSummary.destination_label?.trim() || destinationQuery);
        setPickupPoint(rideSummary.pickup);
        setDestinationPoint(rideSummary.destination);
        setMapCenter(rideSummary.pickup);
      } catch {
        return;
      }
    }

    void hydrateSummary();

    return () => {
      disposed = true;
    };
  }, [authToken, destinationQuery, pickupQuery, rideId]);

  useEffect(() => {
    if (!rideId || !authToken) {
      return;
    }

    const token = authToken;
    let disposed = false;
    let reconnectAttempts = 0;

    async function hydrateLobbySnapshot() {
      try {
        const snapshot = await fetchRideMeetingLobby(token, rideId, MEETING_RADIUS_KM);
        if (!disposed) {
          setParticipants(snapshot.participants);
          setMessages(snapshot.messages);
          setMapCenter(snapshot.center);
          setChatConnectionStatus(
            `${snapshot.participants.length} users connected in ${snapshot.radius_km} km lobby`,
          );
        }
      } catch {
        if (!disposed) {
          setChatConnectionStatus("Unable to load meeting lobby.");
        }
      }
    }

    function clearReconnectTimer() {
      if (lobbyReconnectTimerRef.current !== null) {
        window.clearTimeout(lobbyReconnectTimerRef.current);
        lobbyReconnectTimerRef.current = null;
      }
    }

    function connectLobbySocket() {
      if (disposed) {
        return;
      }

      const socket = connectRideMeetingLobbySocket({
        token,
        rideId,
        radiusKm: MEETING_RADIUS_KM,
        onSnapshot: (snapshot) => {
          if (!disposed) {
            setParticipants(snapshot.participants);
            setMessages(snapshot.messages);
            setMapCenter(snapshot.center);
          }
        },
        onMessage: (message) => {
          if (!disposed) {
            setMessages((current) => mergeLobbyMessages(current, message));
          }
        },
      });

      socket.addEventListener("open", () => {
        if (!disposed) {
          reconnectAttempts = 0;
          clearReconnectTimer();
          setChatConnectionStatus("Meeting lobby connected");
        }
      });

      socket.addEventListener("close", () => {
        if (!disposed) {
          const delayMs = Math.min(6000, 900 * (reconnectAttempts + 1));
          reconnectAttempts += 1;
          setChatConnectionStatus(`Meeting lobby disconnected. Reconnecting in ${Math.ceil(delayMs / 1000)}s...`);
          clearReconnectTimer();
          lobbyReconnectTimerRef.current = window.setTimeout(() => {
            if (!disposed) {
              connectLobbySocket();
            }
          }, delayMs);
        }
      });

      socket.addEventListener("error", () => {
        if (!disposed) {
          setChatConnectionStatus("Meeting lobby connection issue");
        }
      });

      lobbySocketRef.current = socket;
    }

    void hydrateLobbySnapshot();
    connectLobbySocket();

    return () => {
      disposed = true;
      clearReconnectTimer();
      if (lobbySocketRef.current) {
        lobbySocketRef.current.close();
        lobbySocketRef.current = null;
      }
    };
  }, [authToken, rideId]);

  useEffect(() => {
    if (!mapsLoaded || typeof google === "undefined") {
      return;
    }

    let disposed = false;

    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: pickupPoint,
        destination: destinationPoint,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (disposed) {
          return;
        }

        if (status === google.maps.DirectionsStatus.OK && result) {
          setJourneyRoute(result);
          return;
        }

        setJourneyRoute(null);
      },
    );

    return () => {
      disposed = true;
    };
  }, [destinationPoint, mapsLoaded, pickupPoint]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [hasStartedConversation, messages]);

  useEffect(() => {
    selectedParticipantIdRef.current = selectedParticipantId;
  }, [selectedParticipantId]);

  useEffect(() => {
    return () => {
      clearHoverCardCloseTimer();
    };
  }, []);

  useEffect(() => {
    const participantIds = new Set(participants.map((participant) => participant.user_id));

    if (selectedParticipantId !== null && !participantIds.has(selectedParticipantId)) {
      setSelectedParticipantId(null);
    }

    if (hoveredParticipantId !== null && !participantIds.has(hoveredParticipantId)) {
      setHoveredParticipantId(null);
    }
  }, [hoveredParticipantId, participants, selectedParticipantId]);

  async function sendMessage(text: string) {
    const value = text.trim();
    if (!value) {
      return;
    }

    const socket = lobbySocketRef.current;
    if (rideId && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "lobby_message",
          text: value,
        }),
      );
      setDraft("");
      return;
    }

    if (rideId && authToken) {
      try {
        const createdMessage = await postRideMeetingLobbyMessage(
          authToken,
          rideId,
          value,
          MEETING_RADIUS_KM,
        );
        setMessages((current) => mergeLobbyMessages(current, createdMessage));
        setDraft("");
      } catch {
        setChatConnectionStatus("Message could not be sent. Please retry.");
      }
    }
  }

  if (!isSessionValidated) {
    return (
      <div className="auth-route-guard-loading">Validating active ride session...</div>
    );
  }

  return (
    <div className="chat-page">
      <RidrTopNav active="rides" />

      <main className="chat-main-layout">
        <aside className="chat-sidebar">
          <section className="chat-driver-card">
            <div className="chat-driver-head">
              <div className="chat-avatar-badge">
                <MaterialSymbol name="directions_car" filled />
              </div>
              <div>
                <h1>{primaryDriver?.name || "Driver assigning"}</h1>
                <p>
                  {participants.length} lobby participants
                  <span> • radius {MEETING_RADIUS_KM} km</span>
                </p>
                <small>
                  <MaterialSymbol name="groups" filled /> Shared rider coordination room
                </small>
              </div>
            </div>

            <div className="chat-driver-meta">
              <div>
                <span>Vehicle</span>
                <strong>{primaryDriver?.vehicle_name || "Vehicle details syncing"}</strong>
              </div>
              <em>{primaryDriver ? primaryDriver.ride_id.toUpperCase() : "PENDING"}</em>
            </div>

            <div className="chat-driver-stats">
              <article>
                <span>Arrival</span>
                <strong>{estimatedArrival}</strong>
              </article>
              <article>
                <span>Nearby drivers</span>
                <strong>{participants.filter((item) => item.role === "driver").length}</strong>
              </article>
            </div>
          </section>

          <section className="chat-meeting-map">
            {!mapsApiKey ? (
              <div className="chat-map-fallback">
                Add VITE_GOOGLE_MAPS_API_KEY to view live pickup map.
              </div>
            ) : mapsLoadError ? (
              <div className="chat-map-fallback">
                Maps failed to load. Check API key configuration.
              </div>
            ) : !mapsLoaded ? (
              <div className="chat-map-fallback">Loading live pickup map...</div>
            ) : (
              <GoogleMap
                mapContainerClassName="chat-live-map"
                center={mapCenter}
                zoom={13}
                options={{
                  disableDefaultUI: true,
                  clickableIcons: false,
                  gestureHandling: "greedy",
                  styles: uberLikeMapStyles,
                }}
                onClick={() => {
                  if (Date.now() - markerInteractionAtRef.current < 260) {
                    return;
                  }

                  clearHoverCardCloseTimer();
                  setSelectedParticipantId(null);
                  setHoveredParticipantId(null);
                }}
              >
                {journeyRoute ? (
                  <DirectionsRenderer
                    directions={journeyRoute}
                    options={{
                      suppressMarkers: true,
                      polylineOptions: {
                        strokeColor: "#111418",
                        strokeOpacity: 0.82,
                        strokeWeight: 5,
                      },
                    }}
                  />
                ) : null}

                <MarkerF
                  position={pickupPoint}
                  title={`Pickup: ${pickupLabel}`}
                  icon={buildRouteMarkerIcon("pickup")}
                />
                <MarkerF
                  position={destinationPoint}
                  title={`Destination: ${destinationLabel}`}
                  icon={buildRouteMarkerIcon("destination")}
                />

                {participants.map((participant) => (
                  <MarkerF
                    key={`lobby-participant-${participant.user_id}`}
                    position={
                      participantMarkerPositions.get(participant.user_id) || {
                        lat: participant.lat,
                        lng: participant.lng,
                      }
                    }
                    title={`${participant.name} • ${participant.distance_km} km`}
                    label={{
                      text: participant.name.charAt(0).toUpperCase(),
                      color: "#ffffff",
                      fontSize: "11px",
                      fontWeight: "700",
                    }}
                    icon={buildParticipantIcon(participant)}
                    onMouseOver={() => {
                      clearHoverCardCloseTimer();
                      setHoveredParticipantId(participant.user_id);
                    }}
                    onMouseOut={() => {
                      scheduleHoverCardClose(participant.user_id);
                    }}
                    onClick={() => {
                      markerInteractionAtRef.current = Date.now();
                      isProfileCardHoveredRef.current = false;
                      clearHoverCardCloseTimer();
                      setSelectedParticipantId(participant.user_id);
                      setHoveredParticipantId(participant.user_id);
                    }}
                  />
                ))}

                {activeMapProfileParticipant && activeMapProfilePosition ? (
                  <InfoWindowF
                    position={activeMapProfilePosition}
                    options={{ disableAutoPan: true }}
                    onCloseClick={() => {
                      clearHoverCardCloseTimer();
                      isProfileCardHoveredRef.current = false;
                      setSelectedParticipantId(null);
                      setHoveredParticipantId(null);
                    }}
                  >
                    <article
                      className="chat-map-profile-card"
                      onMouseEnter={() => {
                        isProfileCardHoveredRef.current = true;
                        clearHoverCardCloseTimer();
                      }}
                      onMouseLeave={() => {
                        isProfileCardHoveredRef.current = false;
                        scheduleHoverCardClose();
                      }}
                    >
                      <header>
                        <div className="chat-map-profile-title">
                          <span className="chat-map-profile-avatar">
                            {activeMapProfileParticipant.name.charAt(0).toUpperCase()}
                          </span>
                          <p>{activeMapProfileParticipant.name}</p>
                        </div>
                        <span>{formatParticipantRole(activeMapProfileParticipant.role)}</span>
                      </header>
                      <small>
                        {activeMapProfileParticipant.distance_km} km away • {activeMapProfileParticipant.ride_status.replace(/_/g, " ")}
                      </small>
                      <strong>
                        {activeMapProfileParticipant.vehicle_name || "Vehicle details pending"}
                      </strong>
                      <em>
                        Ride {activeMapProfileParticipant.ride_id.toUpperCase()}
                        {activeMapProfileParticipant.is_current_user ? " • You" : ""}
                      </em>
                    </article>
                  </InfoWindowF>
                ) : null}
              </GoogleMap>
            )}
            <button type="button">
              <div>
                <span>Pickup</span>
                <strong>{pickupLabel}</strong>
                <small>{destinationLabel}</small>
              </div>
              <MaterialSymbol name="arrow_forward_ios" />
            </button>
          </section>

          <section className="chat-preferences">
            <h2>Lobby Members</h2>
            <div className="chat-lobby-members">
              {participants.map((participant) => (
                <article key={`member-${participant.user_id}`}>
                  <p>
                    <strong>{participant.name}</strong>
                    <span>{participant.role}</span>
                  </p>
                  <small>
                    {participant.distance_km} km away • {participant.ride_status.replace(/_/g, " ")}
                  </small>
                </article>
              ))}
              {participants.length === 0 ? (
                <article>
                  <p>
                    <strong>Waiting for users</strong>
                    <span>lobby</span>
                  </p>
                  <small>Matching users around the same rider radius.</small>
                </article>
              ) : null}
            </div>
          </section>
        </aside>

        <section className="chat-panel">
          <header className="chat-panel-header">
            <div>
              <span className="chat-online-dot" />
              <strong>Meeting Chat</strong>
            </div>
            <button type="button" title={chatConnectionStatus}>
              <MaterialSymbol name="groups" className="chat-safe-icon" />
              {chatConnectionStatus}
            </button>
          </header>

          <div className="chat-messages" ref={messagesViewportRef}>
            <div className="chat-message-stack">
              {messages.length === 0 ? (
                <p className="chat-system-pill">
                  Lobby initialized. Participants around the same rider can chat here.
                </p>
              ) : null}

              {messages.map((message) => {
                const isSystem = message.sender_role === "system";
                const isCurrentUser =
                  !isSystem && currentUserId !== null && message.sender_id === currentUserId;

                if (isSystem) {
                  return (
                    <p key={`message-${message.id}`} className="chat-system-pill">
                      {message.text}
                    </p>
                  );
                }

                return (
                  <div
                    key={`message-${message.id}`}
                    className={isCurrentUser ? "chat-bubble-row chat-bubble-row-user" : "chat-bubble-row"}
                  >
                    <div>
                      {!isCurrentUser ? (
                        <span className="chat-sender-name">{message.sender_name || "Participant"}</span>
                      ) : null}
                      <p className={isCurrentUser ? "chat-bubble chat-bubble-user" : "chat-bubble"}>
                        {message.text}
                      </p>
                      <small>{formatMessageTime(message.created_at)}</small>
                    </div>
                  </div>
                );
              })}

              {!hasStartedConversation ? (
                <div className="chat-quick-replies">
                  {quickReplies.map((reply) => (
                    <button key={reply} type="button" onClick={() => void sendMessage(reply)}>
                      {reply}
                    </button>
                  ))}
                </div>
              ) : null}

              {!hasStartedConversation ? (
                <article className="chat-info-card">
                  <MaterialSymbol name="groups" className="chat-info-icon" />
                  <div>
                    <strong>Shared rider lobby enabled</strong>
                    <p>
                      {activeRider?.name || "The rider"} and all nearby matched users can coordinate here in
                      real time.
                    </p>
                  </div>
                </article>
              ) : null}
            </div>
          </div>

          <footer className="chat-input-row">
            <button type="button" aria-label="Add quick note">
              <MaterialSymbol name="add_comment" />
            </button>
            <input
              type="text"
              value={draft}
              placeholder="Send message to everyone in this rider lobby..."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void sendMessage(draft);
                }
              }}
            />
            <button
              type="button"
              aria-label="Send message"
              onClick={() => void sendMessage(draft)}
              disabled={!canSend}
            >
              <MaterialSymbol name="send" filled />
            </button>
          </footer>
        </section>
      </main>

      <RidrMobileNav active="rides" />
    </div>
  );
}
