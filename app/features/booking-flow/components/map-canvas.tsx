import { mapBackgroundImage } from "../booking-flow.data";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";

export function MapCanvas() {
  return (
    <div className="map-canvas" aria-hidden="true">
      <img
        src={mapBackgroundImage}
        alt="Minimal city map"
        className="map-background-image"
      />
      <div className="map-overlay-grid" />

      <div className="map-marker map-marker-primary" role="presentation">
        <div className="map-marker-pill">
          <MaterialSymbol name="directions_car" className="map-marker-icon" />
        </div>
        <div className="map-marker-tooltip">Tesla Model 3 • 3 min</div>
      </div>

      <div className="map-marker map-marker-secondary" role="presentation">
        <div className="map-marker-pill map-marker-pill-secondary">
          <MaterialSymbol name="eco" className="map-marker-icon" filled />
        </div>
      </div>
    </div>
  );
}
