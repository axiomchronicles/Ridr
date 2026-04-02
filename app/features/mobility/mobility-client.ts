export type CommuteRole = "driver" | "rider";
export type NearbyRoleFilter = CommuteRole | "all";
export type RideStatus =
  | "pending_acceptance"
  | "accepted"
  | "cancelled"
  | "in_progress"
  | "completed"
  | "matched";

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
  matched_user_id: number;
  matched_user_name: string;
  matched_role: CommuteRole;
  score: number;
  reasons: string[];
  breakdown: MatchScoreBreakdown;
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
  updated_at: string;
  transaction: RideTransactionState;
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
  action: "cancel" | "modify" | "accept";
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