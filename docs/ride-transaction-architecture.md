# Ridr Ride Transaction Architecture

## Goal
Create a transaction-first booking flow where each booking is a mutable ride transaction until acceptance.

## Core Concept
A row in `ride_matches` is the source of truth for ride transaction lifecycle.
A row in `ride_booking_sessions` enforces one active booking session per rider.

Transaction state values:
- `pending_acceptance`
- `accepted`
- `cancelled`
- `in_progress`
- `completed`

## State Machine
1. `POST /api/v1/mobility/rides/book`
- Creates transaction in `pending_acceptance`.
- If rider already has an active ride (`matched`, `pending_acceptance`, `accepted`, `in_progress`), returns that existing ride instead of creating a new one.
- Persists initial rider/driver location records.
- Emits system timeline message in `ride_chat_messages`.
- Opens or refreshes rider booking session lock in `ride_booking_sessions`.

2. `GET /api/v1/mobility/rides/booking-session`
- Returns whether the current rider has an active booking session.
- Used by booking page to redirect directly to existing ride session.

3. `GET /api/v1/mobility/rides/{ride_uid}`
- Returns transaction-aware `RideSummary`.
- Includes `transaction` object with capability flags (`can_cancel`, `can_modify`, `can_accept`) and status message.
- Applies auto-accept simulation if pending longer than `AUTO_ACCEPT_DELAY_SECONDS`.

4. `PATCH /api/v1/mobility/rides/{ride_uid}/transaction`
- `action=modify`: rider can update pickup/destination labels (and optional coordinates/time fields).
- `action=cancel`: rider/driver can cancel when status is mutable.
- `action=accept`: assigned driver can accept pending transaction.
- `action=complete`: rider/driver can complete active ride.
- Session lock closes when ride reaches terminal state (`cancelled`, `completed`).

## API Surface
Booking and summary:
- `POST /api/v1/mobility/rides/book`
- `GET /api/v1/mobility/rides/booking-session`
- `GET /api/v1/mobility/rides/{ride_uid}`

Transaction control:
- `PATCH /api/v1/mobility/rides/{ride_uid}/transaction`

Realtime:
- `WS /api/v1/mobility/vehicles/stream/ws`
- `WS /api/v1/mobility/rides/{ride_uid}/chat/ws`
- `WS /api/v1/mobility/rides/{ride_uid}/meeting-lobby/ws`
- `WS /api/v1/mobility/rides/{ride_uid}/tracking/ws`

Meeting lobby:
- `GET /api/v1/mobility/rides/{ride_uid}/meeting-lobby`
- `POST /api/v1/mobility/rides/{ride_uid}/meeting-lobby/messages`

## Frontend Flow
1. Booking page calls `bookRideMatch`.
2. User is routed to Finding page with `rideId`.
3. Finding page polls `fetchRideSummary` every 4s.
4. Finding page shows transaction status and allowed actions.
5. User actions call `updateRideTransaction` and UI updates from response.
6. Meeting page loads same-rider radius lobby via `fetchRideMeetingLobby`.
7. Meeting page subscribes to `connectRideMeetingLobbySocket` for shared chat + participant updates.

## Data Ownership
- `ride_matches`: transaction state, score, route endpoints.
- `ride_booking_sessions`: one active booking lock per rider; links rider to active ride.
- `ride_chat_messages`: append-only transaction timeline + rider/driver chat.
- `ride_lobby_messages`: shared chat timeline for users clustered around same matched partner and pickup radius.
- `vehicle_locations`: latest location snapshots for rider/driver markers.

## Meeting Lobby Model
- Room key: `anchor_user_id (driver-first) + radius bucket`.
- Participant set: rides sharing the same matched anchor user (typically driver) and pickup within lobby radius.
- Visibility: participant roster + map markers + shared message stream.
- Access rule: user must be in at least one ride participating in that cluster.

## Safety Rules
- Access control: ride participants only.
- Booking lock: rider cannot create a second ride while active booking session exists.
- Mutations restricted by role and state:
  - Modify: rider + pending state.
  - Accept: assigned driver + pending state.
  - Cancel: rider/driver + mutable state.
- Meeting lobby access requires authenticated user in cluster participant list.
- Immutable terminal states (`cancelled`, `completed`) reject invalid mutations.

## Failure Handling
- API validation errors return explicit HTTP 400/403.
- Finding page handles failed mutations with user-facing message.
- If realtime stream disconnects, page still remains usable through summary polling.
- Meeting lobby falls back to HTTP `POST .../meeting-lobby/messages` when websocket is unavailable.

## Extensibility
- Swap auto-accept simulation with actual driver acceptance events.
- Add payment authorization as another transaction phase before `accepted`.
- Add audit table for immutable transaction history if compliance is required.
