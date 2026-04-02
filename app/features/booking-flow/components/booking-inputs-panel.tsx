import { useEffect, useState } from "react";

import { MaterialSymbol } from "~/features/shared/components/material-symbol";
import { CustomPlaceAutocompleteInput } from "~/features/shared/components/custom-place-autocomplete-input";

type BookingInputsPanelProps = {
  pickup: string;
  destination: string;
  onPickupChange: (nextValue: string) => void;
  onDestinationChange: (nextValue: string) => void;
  onSwapRoute: () => void;
  routeSummary: string;
  mapsEnabled: boolean;
  onRequestCurrentLocation: () => void;
  isCurrentLocationLoading: boolean;
  locationStatusMessage: string;
  savedPlaces: Partial<Record<"home" | "work", string>>;
  canSaveDestination: boolean;
  onSavePlace: (key: "home" | "work") => void;
  onApplySavedPlace: (key: "home" | "work") => void;
  onClearSavedPlace: (key: "home" | "work") => void;
  onClearPickup: () => void;
  onClearDestination: () => void;
};

export function BookingInputsPanel({
  pickup,
  destination,
  onPickupChange,
  onDestinationChange,
  onSwapRoute,
  routeSummary,
  mapsEnabled,
  onRequestCurrentLocation,
  isCurrentLocationLoading,
  locationStatusMessage,
  savedPlaces,
  canSaveDestination,
  onSavePlace,
  onApplySavedPlace,
  onClearSavedPlace,
  onClearPickup,
  onClearDestination,
}: BookingInputsPanelProps) {
  const [placesReady, setPlacesReady] = useState(false);

  useEffect(() => {
    function hasPlacesApiLoaded() {
      return (
        typeof window !== "undefined" &&
        typeof google !== "undefined" &&
        Boolean(google.maps?.places?.AutocompleteService)
      );
    }

    if (!mapsEnabled) {
      setPlacesReady(false);
      return;
    }

    if (hasPlacesApiLoaded()) {
      setPlacesReady(true);
      return;
    }

    const readinessPollId = window.setInterval(() => {
      if (hasPlacesApiLoaded()) {
        setPlacesReady(true);
        window.clearInterval(readinessPollId);
      }
    }, 250);

    return () => {
      window.clearInterval(readinessPollId);
    };
  }, [mapsEnabled]);

  return (
    <section className="booking-glass-panel booking-inputs-panel">
      <div className="booking-inputs-head">
        <h1 className="booking-title">Where to?</h1>
        <button
          type="button"
          className="route-swap-button"
          onClick={onSwapRoute}
          aria-label="Swap pickup and destination"
        >
          <MaterialSymbol name="swap_vert" className="route-swap-icon" />
          Swap
        </button>
      </div>

      <div className="booking-route-inputs">
        <div className="route-line" aria-hidden="true">
          <span className="route-dot route-dot-start" />
          <span className="route-line-track" />
          <span className="route-dot route-dot-end" />
        </div>

        <div className="route-fields">
          <div className="route-field route-field-muted" role="group" aria-label="Pickup field">
            <div className="route-field-head">
              <span className="route-label">Pickup</span>
              <div className="route-field-actions">
                <button
                  type="button"
                  className="route-action-button route-action-button-location"
                  onClick={onRequestCurrentLocation}
                  disabled={isCurrentLocationLoading}
                  aria-label="Use current location"
                >
                  <MaterialSymbol name="my_location" className="route-action-icon" />
                  {isCurrentLocationLoading ? "Locating..." : "Current"}
                </button>

                {pickup ? (
                  <button
                    type="button"
                    className="route-action-button"
                    onClick={onClearPickup}
                    aria-label="Clear pickup"
                  >
                    <MaterialSymbol name="close" className="route-action-icon" />
                  </button>
                ) : null}
              </div>
            </div>

            <CustomPlaceAutocompleteInput
              value={pickup}
              onChange={onPickupChange}
              mapsReady={placesReady}
              placeholder="Choose pickup"
              ariaLabel="Pickup"
              inputClassName="route-input"
              recentStorageNamespace="booking-pickup"
              showCurrentLocationAction
              currentLocationActionLabel={
                isCurrentLocationLoading ? "Locating..." : "Use current location"
              }
              onUseCurrentLocation={
                isCurrentLocationLoading ? undefined : onRequestCurrentLocation
              }
            />
          </div>

          <div className="route-field route-field-active" role="group" aria-label="Destination field">
            <div className="route-field-head">
              <span className="route-label route-label-active">Destination</span>
              {destination ? (
                <button
                  type="button"
                  className="route-action-button"
                  onClick={onClearDestination}
                  aria-label="Clear destination"
                >
                  <MaterialSymbol name="close" className="route-action-icon" />
                </button>
              ) : null}
            </div>

            <CustomPlaceAutocompleteInput
              value={destination}
              onChange={onDestinationChange}
              mapsReady={placesReady}
              placeholder="Choose destination"
              ariaLabel="Destination"
              inputClassName="route-input"
              recentStorageNamespace="booking-destination"
            />
          </div>
        </div>
      </div>

      <div className="route-live-summary" aria-live="polite">
        <MaterialSymbol name="route" className="route-live-summary-icon" />
        <div>
          <p>{routeSummary}</p>
          <small>
            {placesReady
              ? "Custom map suggestions active"
              : mapsEnabled
                ? "Loading map suggestions..."
                : "Maps key missing: autocomplete disabled"}
          </small>
          <small>{locationStatusMessage}</small>
        </div>
      </div>

      <div className="saved-places-block" aria-label="Saved places">
        <header>
          <p>Saved Places</p>
          <small>Save your destination as Home or Work</small>
        </header>

        <div className="saved-places-grid">
          {(["home", "work"] as const).map((placeKey) => {
            const placeAddress = savedPlaces[placeKey];
            const placeLabel = placeKey === "home" ? "Home" : "Work";

            if (!placeAddress) {
              return (
                <button
                  key={placeKey}
                  type="button"
                  className="saved-place-card saved-place-card-empty"
                  onClick={() => onSavePlace(placeKey)}
                  disabled={!canSaveDestination}
                >
                  <MaterialSymbol
                    name={placeKey === "home" ? "home" : "work"}
                    className="saved-place-icon"
                  />
                  <span>Save as {placeLabel}</span>
                </button>
              );
            }

            return (
              <div key={placeKey} className="saved-place-card">
                <button
                  type="button"
                  className="saved-place-main"
                  onClick={() => onApplySavedPlace(placeKey)}
                >
                  <MaterialSymbol
                    name={placeKey === "home" ? "home" : "work"}
                    className="saved-place-icon"
                  />
                  <div>
                    <strong>{placeLabel}</strong>
                    <p>{placeAddress}</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="saved-place-clear"
                  onClick={() => onClearSavedPlace(placeKey)}
                  aria-label={`Remove ${placeLabel} address`}
                >
                  <MaterialSymbol name="delete" className="route-action-icon" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
