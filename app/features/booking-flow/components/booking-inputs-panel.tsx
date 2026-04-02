type BookingInputsPanelProps = {
  pickup: string;
  destination: string;
  onPickupChange: (nextValue: string) => void;
  onDestinationChange: (nextValue: string) => void;
};

export function BookingInputsPanel({
  pickup,
  destination,
  onPickupChange,
  onDestinationChange,
}: BookingInputsPanelProps) {
  return (
    <section className="booking-glass-panel booking-inputs-panel">
      <h1 className="booking-title">Where to?</h1>
      <div className="booking-route-inputs">
        <div className="route-line" aria-hidden="true">
          <span className="route-dot route-dot-start" />
          <span className="route-line-track" />
          <span className="route-dot route-dot-end" />
        </div>

        <div className="route-fields">
          <label className="route-field route-field-muted">
            <span className="route-label">Pickup</span>
            <input
              className="route-input"
              type="text"
              value={pickup}
              onChange={(event) => onPickupChange(event.target.value)}
              aria-label="Pickup"
            />
          </label>

          <label className="route-field route-field-active">
            <span className="route-label route-label-active">Destination</span>
            <input
              className="route-input"
              type="text"
              value={destination}
              onChange={(event) => onDestinationChange(event.target.value)}
              aria-label="Destination"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
