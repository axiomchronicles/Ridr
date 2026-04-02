import { useEffect, useMemo, useRef, useState } from "react";

import { MaterialSymbol } from "./material-symbol";

type PlaceSuggestion = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  matchOffset: number;
  matchLength: number;
  source: "prediction" | "recent";
};

type RecentPlace = {
  description: string;
  secondaryText: string;
  updatedAt: number;
};

type RecentPlacesStore = Record<string, RecentPlace[]>;

type CustomPlaceAutocompleteInputProps = {
  value: string;
  onChange: (nextValue: string) => void;
  onSelect?: (selectedAddress: string) => void;
  mapsReady: boolean;
  placeholder: string;
  ariaLabel: string;
  inputClassName?: string;
  countryCode?: string;
  recentStorageNamespace?: string;
  showCurrentLocationAction?: boolean;
  currentLocationActionLabel?: string;
  onUseCurrentLocation?: () => void;
};

const recentPlacesStorageKey = "ridr.recent-place-searches";
const maxRecentPlaces = 5;

export function CustomPlaceAutocompleteInput({
  value,
  onChange,
  onSelect,
  mapsReady,
  placeholder,
  ariaLabel,
  inputClassName,
  countryCode = "in",
  recentStorageNamespace = "global",
  showCurrentLocationAction = false,
  currentLocationActionLabel = "Use current location",
  onUseCurrentLocation,
}: CustomPlaceAutocompleteInputProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const autoCompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [recentPlaces, setRecentPlaces] = useState<RecentPlace[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const queryValue = useMemo(() => value.trim(), [value]);
  const showCurrentAction = showCurrentLocationAction && Boolean(onUseCurrentLocation);
  const showPredictionResults = queryValue.length >= 2;

  const recentSuggestions = useMemo<PlaceSuggestion[]>(
    () =>
      recentPlaces.map((place) => ({
        placeId: `recent-${place.description}`,
        description: place.description,
        mainText: place.description.split(",")[0] || place.description,
        secondaryText: place.secondaryText,
        matchOffset: -1,
        matchLength: 0,
        source: "recent",
      })),
    [recentPlaces],
  );

  const visibleSuggestions = showPredictionResults ? suggestions : recentSuggestions;
  const keyboardItemsCount = visibleSuggestions.length + (showCurrentAction ? 1 : 0);

  function readRecentPlaces(namespace: string): RecentPlace[] {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const rawStore = window.localStorage.getItem(recentPlacesStorageKey);
      if (!rawStore) {
        return [];
      }

      const parsed = JSON.parse(rawStore) as RecentPlacesStore;
      return parsed[namespace] || [];
    } catch {
      return [];
    }
  }

  function persistRecentPlaces(namespace: string, entries: RecentPlace[]) {
    if (typeof window === "undefined") {
      return;
    }

    let parsed: RecentPlacesStore = {};

    try {
      const rawStore = window.localStorage.getItem(recentPlacesStorageKey);
      if (rawStore) {
        parsed = JSON.parse(rawStore) as RecentPlacesStore;
      }
    } catch {
      parsed = {};
    }

    parsed[namespace] = entries;
    window.localStorage.setItem(recentPlacesStorageKey, JSON.stringify(parsed));
  }

  function cacheRecentPlace(description: string, secondaryText: string) {
    if (!description.trim()) {
      return;
    }

    setRecentPlaces((current) => {
      const deduped = current.filter(
        (entry) => entry.description.toLowerCase() !== description.toLowerCase(),
      );

      const next = [
        {
          description,
          secondaryText,
          updatedAt: Date.now(),
        },
        ...deduped,
      ].slice(0, maxRecentPlaces);

      persistRecentPlaces(recentStorageNamespace, next);
      return next;
    });
  }

  function closeResults() {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  useEffect(() => {
    setRecentPlaces(readRecentPlaces(recentStorageNamespace));
  }, [recentStorageNamespace]);

  useEffect(() => {
    if (!mapsReady || typeof google === "undefined") {
      autoCompleteServiceRef.current = null;
      sessionTokenRef.current = null;
      setSuggestions([]);
      closeResults();
      return;
    }

    if (!autoCompleteServiceRef.current) {
      autoCompleteServiceRef.current = new google.maps.places.AutocompleteService();
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    }
  }, [mapsReady]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current) {
        return;
      }

      if (!rootRef.current.contains(event.target as Node)) {
        closeResults();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!mapsReady || !autoCompleteServiceRef.current) {
      setSuggestions([]);
      setIsLoading(false);
      setActiveIndex(-1);
      return;
    }

    if (queryValue.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setActiveIndex(-1);
      return;
    }

    let disposed = false;
    setIsLoading(true);

    const debounceId = window.setTimeout(() => {
      autoCompleteServiceRef.current?.getPlacePredictions(
        {
          input: queryValue,
          componentRestrictions: { country: countryCode },
          sessionToken: sessionTokenRef.current || undefined,
          types: ["geocode"],
        },
        (predictions, status) => {
          if (disposed) {
            return;
          }

          setIsLoading(false);
          setActiveIndex(-1);
          setIsOpen(true);

          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !predictions ||
            predictions.length === 0
          ) {
            setSuggestions([]);
            return;
          }

          setSuggestions(
            predictions.map((prediction) => ({
              placeId: prediction.place_id,
              description: prediction.description,
              mainText: prediction.structured_formatting?.main_text || prediction.description,
              secondaryText: prediction.structured_formatting?.secondary_text || "",
              matchOffset:
                prediction.structured_formatting?.main_text_matched_substrings?.[0]
                  ?.offset ?? -1,
              matchLength:
                prediction.structured_formatting?.main_text_matched_substrings?.[0]
                  ?.length ?? 0,
              source: "prediction",
            })),
          );
        },
      );
    }, 220);

    return () => {
      disposed = true;
      window.clearTimeout(debounceId);
    };
  }, [countryCode, mapsReady, queryValue]);

  function handleSelect(suggestion: PlaceSuggestion) {
    onChange(suggestion.description);
    onSelect?.(suggestion.description);
    cacheRecentPlace(suggestion.description, suggestion.secondaryText);
    setSuggestions([]);
    closeResults();

    if (typeof google !== "undefined") {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    }
  }

  function handleInputBlur() {
    blurTimeoutRef.current = window.setTimeout(() => {
      closeResults();
    }, 120);
  }

  function handleInputFocus() {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    if (
      suggestions.length > 0 ||
      isLoading ||
      queryValue.length < 2 ||
      recentSuggestions.length > 0 ||
      showCurrentAction
    ) {
      setIsOpen(true);
    }
  }

  function handleCurrentLocationAction() {
    onUseCurrentLocation?.();
    closeResults();
  }

  function normalizeActiveIndex(nextIndex: number): number {
    if (keyboardItemsCount === 0) {
      return -1;
    }

    if (nextIndex < 0) {
      return keyboardItemsCount - 1;
    }

    if (nextIndex >= keyboardItemsCount) {
      return 0;
    }

    return nextIndex;
  }

  function getSuggestionByActiveIndex(index: number): PlaceSuggestion | null {
    if (index < 0) {
      return null;
    }

    const offset = showCurrentAction ? 1 : 0;
    const suggestionIndex = index - offset;

    if (suggestionIndex < 0) {
      return null;
    }

    return visibleSuggestions[suggestionIndex] || null;
  }

  function renderMainText(suggestion: PlaceSuggestion) {
    if (suggestion.matchOffset < 0 || suggestion.matchLength <= 0) {
      return suggestion.mainText;
    }

    const before = suggestion.mainText.slice(0, suggestion.matchOffset);
    const match = suggestion.mainText.slice(
      suggestion.matchOffset,
      suggestion.matchOffset + suggestion.matchLength,
    );
    const after = suggestion.mainText.slice(suggestion.matchOffset + suggestion.matchLength);

    return (
      <>
        {before}
        <mark className="custom-place-highlight">{match}</mark>
        {after}
      </>
    );
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && keyboardItemsCount > 0 && event.key === "ArrowDown") {
      setIsOpen(true);
      return;
    }

    if (event.key === "Escape") {
      closeResults();
      return;
    }

    if (!isOpen || keyboardItemsCount === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => normalizeActiveIndex(current + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => normalizeActiveIndex(current - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();

      if (showCurrentAction && activeIndex === 0) {
        handleCurrentLocationAction();
        return;
      }

      const selectedSuggestion = getSuggestionByActiveIndex(activeIndex);
      if (selectedSuggestion) {
        handleSelect(selectedSuggestion);
      }
    }
  }

  return (
    <div className="custom-place-autocomplete" ref={rootRef}>
      <input
        className={inputClassName}
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
      />

      {mapsReady && isOpen ? (
        <div className="custom-place-results" role="listbox" aria-label="Location suggestions">
          {showCurrentAction ? (
            <button
              type="button"
              className={[
                "custom-place-action-row",
                activeIndex === 0 ? "custom-place-action-row-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerDown={(event) => {
                event.preventDefault();
              }}
              onClick={handleCurrentLocationAction}
            >
              <MaterialSymbol name="my_location" className="custom-place-result-icon" />
              <span>{currentLocationActionLabel}</span>
            </button>
          ) : null}

          {!showPredictionResults && recentSuggestions.length > 0 ? (
            <div className="custom-place-results-header">Recent searches</div>
          ) : null}

          {isLoading ? (
            <div className="custom-place-results-state">Searching...</div>
          ) : visibleSuggestions.length > 0 ? (
            visibleSuggestions.map((suggestion, index) => {
              const visualIndex = index + (showCurrentAction ? 1 : 0);

              return (
              <button
                key={suggestion.placeId}
                type="button"
                className={[
                  "custom-place-result-item",
                    suggestion.source === "recent" ? "custom-place-result-item-recent" : "",
                    activeIndex === visualIndex ? "custom-place-result-item-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                  onMouseEnter={() => setActiveIndex(visualIndex)}
                onPointerDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => handleSelect(suggestion)}
                role="option"
                  aria-selected={activeIndex === visualIndex}
              >
                  <MaterialSymbol
                    name={suggestion.source === "recent" ? "history" : "location_on"}
                    className="custom-place-result-icon"
                  />
                  <span className="custom-place-result-main">{renderMainText(suggestion)}</span>
                  <small className="custom-place-result-secondary">{suggestion.secondaryText}</small>
              </button>
              );
            })
          ) : (
            <div className="custom-place-results-state">
              {showPredictionResults ? "No matches found. Try a nearby landmark." : "Type to search places."}
            </div>
          )}

          <div className="custom-place-results-footer">Use up/down arrows and Enter to select</div>
        </div>
      ) : null}
    </div>
  );
}
