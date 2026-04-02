import { useEffect, useMemo, useRef, useState } from "react";

type PlaceSuggestion = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

type CustomPlaceAutocompleteInputProps = {
  value: string;
  onChange: (nextValue: string) => void;
  onSelect?: (selectedAddress: string) => void;
  mapsReady: boolean;
  placeholder: string;
  ariaLabel: string;
  inputClassName?: string;
  countryCode?: string;
};

export function CustomPlaceAutocompleteInput({
  value,
  onChange,
  onSelect,
  mapsReady,
  placeholder,
  ariaLabel,
  inputClassName,
  countryCode = "in",
}: CustomPlaceAutocompleteInputProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const autoCompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const queryValue = useMemo(() => value.trim(), [value]);

  useEffect(() => {
    if (!mapsReady || typeof google === "undefined") {
      autoCompleteServiceRef.current = null;
      sessionTokenRef.current = null;
      setSuggestions([]);
      setIsOpen(false);
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
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }

      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!mapsReady || !autoCompleteServiceRef.current) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      setActiveIndex(-1);
      return;
    }

    if (queryValue.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
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
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);

    if (typeof google !== "undefined") {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    }
  }

  function handleInputBlur() {
    blurTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setActiveIndex(-1);
    }, 120);
  }

  function handleInputFocus() {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    if (suggestions.length > 0 || isLoading) {
      setIsOpen(true);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && suggestions.length > 0 && event.key === "ArrowDown") {
      setIsOpen(true);
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!isOpen || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1 >= suggestions.length ? 0 : current + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex]);
    }
  }

  return (
    <div className="custom-place-autocomplete" ref={rootRef}>
      <input
        className={inputClassName}
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
          {isLoading ? (
            <div className="custom-place-results-state">Searching...</div>
          ) : suggestions.length > 0 ? (
            suggestions.map((suggestion, index) => (
              <button
                key={suggestion.placeId}
                type="button"
                className={[
                  "custom-place-result-item",
                  activeIndex === index ? "custom-place-result-item-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => handleSelect(suggestion)}
                role="option"
                aria-selected={activeIndex === index}
              >
                <span className="custom-place-result-main">{suggestion.mainText}</span>
                {suggestion.secondaryText ? (
                  <small className="custom-place-result-secondary">{suggestion.secondaryText}</small>
                ) : null}
              </button>
            ))
          ) : (
            <div className="custom-place-results-state">No results found</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
