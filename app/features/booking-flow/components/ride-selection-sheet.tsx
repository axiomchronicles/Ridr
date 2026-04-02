import type {
  BookingStatus,
  DepartureMode,
  DriverProfile,
  RideId,
  RideOption,
} from "../booking-flow.types";
import { DriverPreview } from "./driver-preview";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";
import { RideOptionCard } from "./ride-option-card";

type RideSelectionSheetProps = {
  rides: RideOption[];
  selectedRideId: RideId;
  onSelectRide: (rideId: RideId) => void;
  departureMode: DepartureMode;
  onToggleDepartureMode: () => void;
  bookingStatus: BookingStatus;
  onBookRide: () => void;
  driver: DriverProfile;
  routeSummary: string;
  isRouteReady: boolean;
};

export function RideSelectionSheet({
  rides,
  selectedRideId,
  onSelectRide,
  departureMode,
  onToggleDepartureMode,
  bookingStatus,
  onBookRide,
  driver,
  routeSummary,
  isRouteReady,
}: RideSelectionSheetProps) {
  const selectedRide =
    rides.find((ride) => ride.id === selectedRideId) ?? rides[0];
  const isBookingInFlight = bookingStatus === "loading";
  const isBookButtonDisabled = isBookingInFlight || !isRouteReady;

  return (
    <section className="ride-sheet-shell">
      <div className="ride-sheet">
        <header className="ride-sheet-head">
          <div>
            <h2 className="ride-sheet-title">Select Ride</h2>
            <p className="ride-sheet-subtitle">
              Recommended for your carbon goals
            </p>
            <p className="ride-sheet-route-meta">
              <MaterialSymbol name="route" className="ride-sheet-route-icon" />
              {routeSummary}
            </p>
          </div>

          <button
            type="button"
            className="ride-sheet-departure-pill"
            onClick={onToggleDepartureMode}
            aria-label="Toggle departure mode"
          >
            <MaterialSymbol
              name={departureMode === "now" ? "radio_button_checked" : "schedule"}
              className="ride-sheet-departure-icon"
            />
            <span>{departureMode === "now" ? "Leave now" : "Schedule"}</span>
          </button>
        </header>

        <div className="ride-option-grid">
          {rides.map((ride) => (
            <RideOptionCard
              key={ride.id}
              ride={ride}
              isSelected={selectedRideId === ride.id}
              onSelect={onSelectRide}
            />
          ))}
        </div>

        <footer className="ride-sheet-footer">
          <DriverPreview driver={driver} />

          <button
            type="button"
            className="book-ride-button"
            onClick={onBookRide}
            disabled={isBookButtonDisabled}
          >
            {!isRouteReady
              ? "Set route first"
              : bookingStatus === "loading"
              ? "Booking..."
              : bookingStatus === "confirmed"
                ? `${selectedRide.name} booked`
                : `Book ${selectedRide.name}`}
          </button>
        </footer>

        <p className="ride-sheet-validation" aria-live="polite">
          {isRouteReady
            ? "Trip ready. Select your ride and confirm booking."
            : "Enter a valid pickup and destination to unlock live fares."}
        </p>
      </div>
    </section>
  );
}
