import type { DriverProfile } from "../booking-flow.types";

type DriverPreviewProps = {
  driver: DriverProfile;
};

export function DriverPreview({ driver }: DriverPreviewProps) {
  return (
    <div className="driver-preview">
      <div className="driver-avatar-cluster" aria-hidden="true">
        <img src={driver.avatarUrl} alt="" className="driver-avatar" />
        <span className="driver-support-count">+{driver.supportDriverCount}</span>
      </div>

      <div className="driver-copy">
        <p className="driver-name-rating">
          {driver.name} • {driver.rating.toFixed(2)} ★
        </p>
        <div className="driver-badges" aria-label="Driver badges">
          {driver.badges.map((badge) => (
            <span
              key={badge}
              className={[
                "driver-badge",
                badge.toLowerCase().includes("eco")
                  ? "driver-badge-eco"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {badge}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
