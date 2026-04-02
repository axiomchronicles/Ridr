# Ridr Ride Transaction Architecture

## Goal
Create a transaction-first booking flow where each booking is a mutable ride transaction until acceptance.

## Core Concept
A row in `ride_matches` is the source of truth for ride transaction lifecycle.

Transaction state values:
- `pending_acceptance`
- `accepted`
- `cancelled`
- `in_progress`
- `completed`

## State Machine
1. `POST /api/v1/mobility/rides/book`
- Creates transaction in `pending_acceptance`.
- Persists initial rider/driver location records.
- Emits system timeline message in `ride_chat_messages`.

2. `GET /api/v1/mobility/rides/{ride_uid}`
- Returns transaction-aware `RideSummary`.
- Includes `transaction` object with capability flags (`can_cancel`, `can_modify`, `can_accept`) and status message.
- Applies auto-accept simulation if pending longer than `AUTO_ACCEPT_DELAY_SECONDS`.

3. `PATCH /api/v1/mobility/rides/{ride_uid}/transaction`
- `action=modify`: rider can update pickup/destination labels (and optional coordinates/time fields).
- `action=cancel`: rider/driver can cancel when status is mutable.
- `action=accept`: assigned driver can accept pending transaction.

## API Surface
Booking and summary:
- `POST /api/v1/mobility/rides/book`
- `GET /api/v1/mobility/rides/{ride_uid}`

Transaction control:
- `PATCH /api/v1/mobility/rides/{ride_uid}/transaction`

Realtime:
- `WS /api/v1/mobility/vehicles/stream/ws`
- `WS /api/v1/mobility/rides/{ride_uid}/chat/ws`
- `WS /api/v1/mobility/rides/{ride_uid}/tracking/ws`

## Frontend Flow
1. Booking page calls `bookRideMatch`.
2. User is routed to Finding page with `rideId`.
3. Finding page polls `fetchRideSummary` every 4s.
4. Finding page shows transaction status and allowed actions.
5. User actions call `updateRideTransaction` and UI updates from response.

## Data Ownership
- `ride_matches`: transaction state, score, route endpoints.
- `ride_chat_messages`: append-only transaction timeline + rider/driver chat.
- `vehicle_locations`: latest location snapshots for rider/driver markers.

## Safety Rules
- Access control: ride participants only.
- Mutations restricted by role and state:
  - Modify: rider + pending state.
  - Accept: assigned driver + pending state.
  - Cancel: rider/driver + mutable state.
- Immutable terminal states (`cancelled`, `completed`) reject invalid mutations.

## Failure Handling
- API validation errors return explicit HTTP 400/403.
- Finding page handles failed mutations with user-facing message.
- If realtime stream disconnects, page still remains usable through summary polling.

## Extensibility
- Swap auto-accept simulation with actual driver acceptance events.
- Add payment authorization as another transaction phase before `accepted`.
- Add audit table for immutable transaction history if compliance is required.
