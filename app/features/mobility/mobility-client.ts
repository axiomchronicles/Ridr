export type CommuteRole = "driver" | "rider";
export type NearbyRoleFilter = CommuteRole | "all";
export type RideStatus =
  | "pending_acceptance"
  | "accepted"
  | "cancelled"
  | "in_progress"
  | "completed"
  | "matched";

export type FareTier = "standard" | "eco" | "carpool";

export type CommuteCoordinate = {
  lat: number;
  lng: number;
};

export type CommutePayload = {
  origin: CommuteCoordinate;
  destination: CommuteCoordinate;
  departure_time: number;
  flexibility: number;
  days: number[];
  role: CommuteRole;
  origin_label?: string;
  destination_label?: string;
  vehicle?: {
    seats_available?: number;
    fuel_efficiency?: number;
    vehicle_name?: string;
  };
  preferences?: {
    gender?: string;
    smoking?: boolean;
    music?: boolean;
    interests?: string[];
  };
};

export type MatchScoreBreakdown = {
  route: number;
  time: number;
  role: number;
  preference: number;
  total: number;
};

export type RideBookingResponse = {
  ride_id: string;
  status: string;
  booking_session_state: "created" | "existing";
  booking_session_message: string;
  matched_user_id: number;
  matched_user_name: string;
  matched_role: CommuteRole;
  score: number;
  reasons: string[];
  breakdown: MatchScoreBreakdown;
};

export type RideBookingSessionState = {
  has_active_session: boolean;
  ride_id: string | null;
  ride_status: RideStatus | null;
  matched_user_name: string | null;
  pickup_label: string | null;
  destination_label: string | null;
  score: number | null;
  message: string;
};

export type FareEstimateBreakdown = {
  base_fare: number;
  distance_charge: number;
  time_charge: number;
  booking_fee: number;
  operating_fee: number;
  pickup_surcharge: number;
  location_surcharge: number;
  service_multiplier: number;
  demand_multiplier: number;
  traffic_multiplier: number;
  subtotal_before_multiplier: number;
  subtotal_after_multiplier: number;
  minimum_fare: number;
  minimum_fare_applied: boolean;
};

export type FareEstimateResponse = {
  currency: string;
  ride_tier: FareTier;
  party_size: number;
  estimated_duration_minutes: number;
  estimated_total: number;
  estimated_per_rider: number;
  assumptions: string[];
  breakdown: FareEstimateBreakdown;
};

export type SustainabilityKpi = {
  total_rides: number;
  completed_rides: number;
  active_rides: number;
  total_distance_km: number;
  total_distance_miles: number;
  co2_saved_kg: number;
  co2_saved_lbs: number;
  estimated_trees: number;
  money_saved_usd: number;
  avg_co2_saved_lbs_per_ride: number;
};

export type SustainabilityProjection = {
  years: number;
  projected_money_saved_usd: number;
  projected_co2_saved_lbs: number;
  projected_tree_equivalent: number;
  goal_progress_percent: number;
  annualized_co2_saved_lbs: number;
};

export type SustainabilityTrendPoint = {
  period_start: string;
  label: string;
  rides: number;
  co2_saved_lbs: number;
  money_saved_usd: number;
};

export type SustainabilityRideHistoryItem = {
  ride_id: string;
  date: string;
  route_label: string;
  distance_miles: number;
  money_saved_usd: number;
  co2_saved_lbs: number;
  role: CommuteRole;
  status: RideStatus;
  vehicle_name: string | null;
};

export type SustainabilityAchievement = {
  key: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress_percent: number;
};

export type SustainabilityLeaderboardEntry = {
  rank: number;
  user_id: number;
  name: string;
  city: string | null;
  co2_saved_lbs: number;
  badge: string;
  is_current_user: boolean;
};

export type SustainabilityDashboard = {
  as_of: string;
  kpis: SustainabilityKpi;
  forecast_7y: SustainabilityProjection;
  impact_30y: SustainabilityProjection;
  achievements: SustainabilityAchievement[];
  history_weekly: SustainabilityTrendPoint[];
  history_monthly: SustainabilityTrendPoint[];
  recent_history: SustainabilityRideHistoryItem[];
  leaderboard: SustainabilityLeaderboardEntry[];
};

export type RideCostSplit = {
  party_size: number;
  total_fare_usd: number;
  your_share_usd: number;
  currency: string;
  message: string;
};

export type RideSummary = {
  ride_id: string;
  status: RideStatus;
  rider_id: number | null;
  driver_id: number | null;
  matched_user_name: string | null;
  matched_role: CommuteRole | null;
  pickup: CommuteCoordinate;
  destination: CommuteCoordinate;
  pickup_label: string | null;
  destination_label: string | null;
  score: number;
  reasons: string[];
  cost_split: RideCostSplit | null;
  updated_at: string;
  transaction: RideTransactionState;
};

export type MyRideItem = {
  ride_id: string;
  status: RideStatus;
  role: CommuteRole;
  matched_user_name: string | null;
  pickup_label: string | null;
  destination_label: string | null;
  updated_at: string;
  distance_miles: number;
  total_fare_usd: number;
  your_share_usd: number;
  split_party_size: number;
  co2_saved_lbs: number;
  money_saved_usd: number;
  vehicle_name: string | null;
};

export type MyRidesResponse = {
  as_of: string;
  total_rides: number;
  active_rides: number;
  completed_rides: number;
  total_distance_miles: number;
  total_co2_saved_lbs: number;
  total_money_saved_usd: number;
  rides: MyRideItem[];
};

export type RideTransactionState = {
  status: RideStatus;
  can_cancel: boolean;
  can_modify: boolean;
  can_accept: boolean;
  message: string;
  estimated_accept_seconds: number | null;
};

export type RideTransactionUpdatePayload = {
  action: "cancel" | "modify" | "accept" | "complete";
  reason?: string;
  pickup?: CommuteCoordinate;
  destination?: CommuteCoordinate;
  pickup_label?: string;
  destination_label?: string;
  departure_time?: number;
};

export type RideChatMessage = {
  id: number;
  ride_id: string;
  sender_id: number | null;
  sender_role: string;
  text: string;
  created_at: string;
};

export type RideLobbyParticipant = {
  user_id: number;
  name: string;
  role: CommuteRole;
  ride_id: string;
  ride_status: RideStatus;
  distance_km: number;
  vehicle_name: string | null;
  lat: number;
  lng: number;
  is_current_user: boolean;
};

export type RideLobbyMessage = {
  id: number;
  ride_id: string | null;
  rider_id: number;
  cluster_key: string;
  sender_id: number | null;
  sender_role: string;
  sender_name: string | null;
  text: string;
  created_at: string;
};

export type RideMeetingLobbySnapshot = {
  ride_id: string;
  cluster_key: string;
  radius_km: number;
  center: CommuteCoordinate;
  participants: RideLobbyParticipant[];
  messages: RideLobbyMessage[];
};

export type VehicleMarker = {
  user_id: number;
  ride_id: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed_kph: number | null;
  status: string;
  role: CommuteRole;
  vehicle_name: string | null;
  distance_km: number;
  updated_at: string;
};

type ErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
};

const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  "http://localhost:8000/api/v1"
).replace(/\/$/, "");

const WS_BASE_URL = API_BASE_URL.replace(/^http/i, (protocol) =>
  protocol.toLowerCase() === "https" ? "wss" : "ws",
);

export class MobilityApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MobilityApiError";
    this.status = status;
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ErrorPayload;

    if (typeof payload.detail === "string") {
      return payload.detail;
    }

    if (Array.isArray(payload.detail) && payload.detail.length > 0) {
      return payload.detail[0]?.msg || `Request failed with status ${response.status}`;
    }
  } catch {
    return `Request failed with status ${response.status}`;
  }

  return `Request failed with status ${response.status}`;
}

async function requestJson<T>(
  path: string,
  token: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new MobilityApiError(message, response.status);
  }

  return (await response.json()) as T;
}

function buildWebSocketUrl(path: string, query: URLSearchParams): string {
  const queryString = query.toString();
  return `${WS_BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;
}

export async function bookRideMatch(
  token: string,
  payload: {
    commute: CommutePayload;
    selected_user_id?: number;
    max_candidates?: number;
    radius_km?: number;
  },
): Promise<RideBookingResponse> {
  return requestJson<RideBookingResponse>("/mobility/rides/book", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchActiveRideBookingSession(
  token: string,
): Promise<RideBookingSessionState> {
  return requestJson<RideBookingSessionState>("/mobility/rides/booking-session", token, {
    method: "GET",
  });
}

export async function estimateRideFare(payload: {
  distance_km: number;
  duration_minutes?: number;
  departure_time: number;
  ride_tier: FareTier;
  party_size?: number;
  active_supply_load?: number;
  pickup_reposition_km?: number;
  pickup_label?: string;
  destination_label?: string;
}): Promise<FareEstimateResponse> {
  const response = await fetch(`${API_BASE_URL}/mobility/fare-estimate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new MobilityApiError(message, response.status);
  }

  return (await response.json()) as FareEstimateResponse;
}

export async function fetchSustainabilityDashboard(
  token: string,
): Promise<SustainabilityDashboard> {
  return requestJson<SustainabilityDashboard>("/mobility/sustainability/dashboard", token, {
    method: "GET",
  });
}

export async function fetchMyRides(token: string): Promise<MyRidesResponse> {
  return requestJson<MyRidesResponse>("/mobility/rides/my-rides", token, {
    method: "GET",
  });
}

export async function fetchNearbyVehicles(
  token: string,
  params: {
    lat: number;
    lng: number;
    radiusKm?: number;
    roleFilter?: NearbyRoleFilter;
  },
): Promise<VehicleMarker[]> {
  const query = new URLSearchParams();
  query.set("lat", String(params.lat));
  query.set("lng", String(params.lng));
  query.set("radius_km", String(params.radiusKm ?? 8));
  query.set("role", params.roleFilter ?? "driver");

  const response = await requestJson<{ vehicles: VehicleMarker[] }>(
    `/mobility/vehicles/nearby?${query.toString()}`,
    token,
    {
      method: "GET",
    },
  );

  return response.vehicles;
}

export async function fetchRideSummary(
  token: string,
  rideId: string,
): Promise<RideSummary> {
  return requestJson<RideSummary>(
    `/mobility/rides/${encodeURIComponent(rideId)}`,
    token,
    {
      method: "GET",
    },
  );
}

export async function updateRideTransaction(
  token: string,
  rideId: string,
  payload: RideTransactionUpdatePayload,
): Promise<RideSummary> {
  return requestJson<RideSummary>(
    `/mobility/rides/${encodeURIComponent(rideId)}/transaction`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchRideChatMessages(
  token: string,
  rideId: string,
): Promise<RideChatMessage[]> {
  return requestJson<RideChatMessage[]>(
    `/mobility/rides/${encodeURIComponent(rideId)}/chat/messages`,
    token,
    {
      method: "GET",
    },
  );
}

export async function postRideChatMessage(
  token: string,
  rideId: string,
  text: string,
): Promise<RideChatMessage> {
  return requestJson<RideChatMessage>(
    `/mobility/rides/${encodeURIComponent(rideId)}/chat/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    },
  );
}

export async function fetchRideMeetingLobby(
  token: string,
  rideId: string,
  radiusKm = 3.5,
): Promise<RideMeetingLobbySnapshot> {
  const query = new URLSearchParams();
  query.set("radius_km", String(radiusKm));

  return requestJson<RideMeetingLobbySnapshot>(
    `/mobility/rides/${encodeURIComponent(rideId)}/meeting-lobby?${query.toString()}`,
    token,
    {
      method: "GET",
    },
  );
}

export async function postRideMeetingLobbyMessage(
  token: string,
  rideId: string,
  text: string,
  radiusKm = 3.5,
): Promise<RideLobbyMessage> {
  const query = new URLSearchParams();
  query.set("radius_km", String(radiusKm));

  return requestJson<RideLobbyMessage>(
    `/mobility/rides/${encodeURIComponent(rideId)}/meeting-lobby/messages?${query.toString()}`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    },
  );
}

export async function postRideTrackingUpdate(
  token: string,
  rideId: string,
  payload: {
    lat: number;
    lng: number;
    heading?: number;
    speed_kph?: number;
    status?: string;
  },
): Promise<VehicleMarker> {
  return requestJson<VehicleMarker>(
    `/mobility/rides/${encodeURIComponent(rideId)}/tracking`,
    token,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function connectRideChatSocket(args: {
  token: string;
  rideId: string;
  onMessage: (message: RideChatMessage) => void;
  onError?: (event: Event) => void;
}): WebSocket {
  const query = new URLSearchParams();
  query.set("token", args.token);

  const socket = new WebSocket(
    buildWebSocketUrl(
      `/mobility/rides/${encodeURIComponent(args.rideId)}/chat/ws`,
      query,
    ),
  );

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data) as {
        type?: string;
        message?: RideChatMessage;
      };

      if (payload.type === "chat_message" && payload.message) {
        args.onMessage(payload.message);
      }
    } catch {
      return;
    }
  });

  if (args.onError) {
    socket.addEventListener("error", args.onError);
  }

  return socket;
}

export function connectRideTrackingSocket(args: {
  token: string;
  rideId: string;
  onVehicleUpdate: (vehicle: VehicleMarker) => void;
  onError?: (event: Event) => void;
}): WebSocket {
  const query = new URLSearchParams();
  query.set("token", args.token);

  const socket = new WebSocket(
    buildWebSocketUrl(
      `/mobility/rides/${encodeURIComponent(args.rideId)}/tracking/ws`,
      query,
    ),
  );

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data) as {
        type?: string;
        vehicle?: VehicleMarker;
      };

      if (payload.type === "tracking_update" && payload.vehicle) {
        args.onVehicleUpdate(payload.vehicle);
      }
    } catch {
      return;
    }
  });

  if (args.onError) {
    socket.addEventListener("error", args.onError);
  }

  return socket;
}

export function connectRideMeetingLobbySocket(args: {
  token: string;
  rideId: string;
  radiusKm?: number;
  onSnapshot?: (snapshot: RideMeetingLobbySnapshot) => void;
  onMessage: (message: RideLobbyMessage) => void;
  onError?: (event: Event) => void;
}): WebSocket {
  const query = new URLSearchParams();
  query.set("token", args.token);
  query.set("radius_km", String(args.radiusKm ?? 3.5));

  const socket = new WebSocket(
    buildWebSocketUrl(
      `/mobility/rides/${encodeURIComponent(args.rideId)}/meeting-lobby/ws`,
      query,
    ),
  );

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data) as {
        type?: string;
        snapshot?: RideMeetingLobbySnapshot;
        message?: RideLobbyMessage;
      };

      if (payload.type === "lobby_snapshot" && payload.snapshot && args.onSnapshot) {
        args.onSnapshot(payload.snapshot);
        return;
      }

      if (payload.type === "lobby_message" && payload.message) {
        args.onMessage(payload.message);
      }
    } catch {
      return;
    }
  });

  if (args.onError) {
    socket.addEventListener("error", args.onError);
  }

  return socket;
}

export function connectVehicleStreamSocket(args: {
  token: string;
  lat: number;
  lng: number;
  radiusKm?: number;
  roleFilter?: NearbyRoleFilter;
  onVehicleUpdate: (vehicle: VehicleMarker) => void;
  onError?: (event: Event) => void;
}): WebSocket {
  const query = new URLSearchParams();
  query.set("token", args.token);
  query.set("lat", String(args.lat));
  query.set("lng", String(args.lng));
  query.set("radius_km", String(args.radiusKm ?? 8));
  query.set("role", args.roleFilter ?? "driver");

  const socket = new WebSocket(buildWebSocketUrl("/mobility/vehicles/stream/ws", query));

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data) as {
        type?: string;
        vehicle?: VehicleMarker;
      };

      if (payload.type === "vehicle_update" && payload.vehicle) {
        args.onVehicleUpdate(payload.vehicle);
      }
    } catch {
      return;
    }
  });

  if (args.onError) {
    socket.addEventListener("error", args.onError);
  }

  return socket;
}