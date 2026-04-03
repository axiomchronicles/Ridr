# Ridr Sustainability Dashboard Architecture

## Goal
Provide an end-to-end sustainability analytics system that converts ride lifecycle data into:
- Personal carbon savings metrics
- Financial savings forecasts
- Weekly/monthly impact trends
- Achievement milestones
- City leaderboard rankings

## Data Sources
Primary ride lifecycle source:
- `ride_matches`:
  - route coordinates (`pickup_*`, `destination_*`)
  - participants (`rider_id`, `driver_id`)
  - state (`matched`, `pending_acceptance`, `accepted`, `in_progress`, `completed`, `cancelled`)
  - timestamps (`created_at`, `updated_at`)

Driver sustainability context:
- `commute_profiles`:
  - `vehicle_name`
  - `fuel_efficiency`

User profile context:
- `users`:
  - identity and city (for leaderboard)

## Carbon Accounting Model
### 1. Ride distance
Distance is estimated using geo-distance between pickup and destination:
- `distance_km = max(0.6, haversine_km(pickup, destination))`

### 2. Baseline emissions (counterfactual)
Baseline assumes single-passenger conventional ride:
- `baseline_co2_kg = distance_km * 0.192`

### 3. Actual emissions
Emission factor logic:
- EV vehicle detected from vehicle name keywords:
  - `actual_per_km = 0.055`
- Else if fuel efficiency exists:
  - `actual_per_km = max(0.04, 2.31 / fuel_efficiency)`
- Else fallback:
  - `actual_per_km = 0.167`

Passenger allocation:
- occupancy = 2 when rider+driver exist, else 1
- `actual_per_passenger_km = actual_per_km / occupancy`

Final actual emissions:
- `actual_co2_kg = distance_km * actual_per_passenger_km`

Savings:
- `co2_saved_kg = max(0, baseline_co2_kg - actual_co2_kg)`
- `co2_saved_lbs = co2_saved_kg * 2.20462`

## Financial Savings Model
Baseline and shared-cost estimation:
- `baseline_cost = 2.4 + distance_km * 0.88`
- `shared_cost = 1.35 + distance_km * shared_rate`
- `shared_rate = 0.57 * 0.92` for EV, else `0.57`
- If occupancy is 1, shared cost uses a mild reduction factor to avoid over-crediting
- `money_saved = max(0, baseline_cost - shared_cost)`

## Lifecycle Weighting
To avoid over-counting early-state rides, weighted impact is applied:
- `completed`: 1.00
- `in_progress`: 0.85
- `accepted`: 0.70
- `pending_acceptance` / `matched`: 0.45
- `cancelled`: excluded

Weighted values feed KPI totals and projections.

## Projection Strategy
1. Compute weighted totals from user rides.
2. Estimate monthly pace from observed span:
- `monthly_factor = 30 / max(30, days_span)`
- `monthly_co2_saved = total_co2_saved_lbs * monthly_factor`
- `monthly_money_saved = total_money_saved * monthly_factor`
3. Project over 7 and 30 years.
4. Derive tree equivalent:
- `trees = projected_co2_kg / 37.5`
5. Goal progress:
- savings goal baseline: `₹30,000`

## API Contract
Endpoint:
- `GET /api/v1/mobility/sustainability/dashboard`

Response sections:
- `kpis`: rides, distance, co2, trees, money savings
- `forecast_7y`
- `impact_30y`
- `achievements`
- `history_weekly`
- `history_monthly`
- `recent_history`
- `leaderboard`

## Frontend Integration
Dashboard page calls `fetchSustainabilityDashboard` and binds:
- top forecast card to `forecast_7y`
- impact card to `impact_30y`
- achievements card to `achievements`
- history panel to `recent_history` + trend strips
- leaderboard to `leaderboard`

## Reliability Notes
- System handles empty data by returning zeroed metrics, not errors.
- Emission and cost models are deterministic and transparent.
- No mutable aggregation tables required for current scale (computed on request).

## Next Evolution
- Persist per-ride sustainability snapshots after ride completion.
- Add organization-level dashboards and city-level admin analytics.
- Add model calibration from telematics/real route distances.
