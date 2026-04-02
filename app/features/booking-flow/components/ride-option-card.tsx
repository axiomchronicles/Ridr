import type { RideOption } from "../booking-flow.types";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";

type RideOptionCardProps = {
  ride: RideOption;
  isSelected: boolean;
  onSelect: (rideId: RideOption["id"]) => void;
};

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function RideOptionCard({
  ride,
  isSelected,
  onSelect,
}: RideOptionCardProps) {
  const cardClassName = [
    "ride-option-card",
    `ride-option-${ride.accent}`,
    isSelected ? "ride-option-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={cardClassName}
      onClick={() => onSelect(ride.id)}
      aria-pressed={isSelected}
    >
      {ride.featureTag ? (
        <span className="ride-option-feature-tag">{ride.featureTag}</span>
      ) : null}

      <header className="ride-option-head">
        <MaterialSymbol
          name={ride.icon}
          className="ride-option-head-icon"
          filled={ride.id === "eco"}
        />
        <strong className="ride-option-price">{inrFormatter.format(ride.price)}</strong>
      </header>

      <div className="ride-option-copy">
        <h3 className="ride-option-title">{ride.name}</h3>
        <p className="ride-option-description">{ride.description}</p>
      </div>

      {ride.impactLabel ? (
        <div className="ride-option-metric ride-option-metric-impact">
          <MaterialSymbol
            name="energy_savings_leaf"
            className="ride-option-metric-icon"
            filled
          />
          <span>{ride.impactLabel}</span>
        </div>
      ) : null}

      {ride.savingsLabel ? (
        <div className="ride-option-metric ride-option-metric-savings">
          <MaterialSymbol
            name="savings"
            className="ride-option-metric-icon"
            filled
          />
          <span>{ride.savingsLabel}</span>
        </div>
      ) : null}

      <footer className="ride-option-eta">
        <MaterialSymbol name="timer" className="ride-option-eta-icon" />
        <span>{ride.etaMinutes} min away</span>
      </footer>
    </button>
  );
}
