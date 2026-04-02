import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import {
  defaultDestination,
  defaultPickup,
  demandAlert,
  primaryDriver,
  rideOptions,
} from "./booking-flow.data";
import type { BookingStatus, DepartureMode, RideId } from "./booking-flow.types";
import { BookingInputsPanel } from "./components/booking-inputs-panel";
import { DemandAlertCard } from "./components/demand-alert-card";
import { MapCanvas } from "./components/map-canvas";
import { RideSelectionSheet } from "./components/ride-selection-sheet";
import { RidrMobileNav } from "~/features/shared/components/ridr-mobile-nav";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import "./booking-flow.css";

export function BookingFareEstimatesPage() {
  const navigate = useNavigate();
  const [pickup, setPickup] = useState(defaultPickup);
  const [destination, setDestination] = useState(defaultDestination);
  const [selectedRideId, setSelectedRideId] = useState<RideId>("eco");
  const [departureMode, setDepartureMode] = useState<DepartureMode>("now");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("idle");

  const bookingResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (bookingResetTimerRef.current !== null) {
        window.clearTimeout(bookingResetTimerRef.current);
      }
    };
  }, []);

  function handleBookRide() {
    if (bookingStatus === "loading") {
      return;
    }

    if (bookingResetTimerRef.current !== null) {
      window.clearTimeout(bookingResetTimerRef.current);
      bookingResetTimerRef.current = null;
    }

    setBookingStatus("loading");

    bookingResetTimerRef.current = window.setTimeout(() => {
      setBookingStatus("confirmed");

      bookingResetTimerRef.current = window.setTimeout(() => {
        navigate("/ride/pre-meeting-chat");
        bookingResetTimerRef.current = null;
      }, 800);
    }, 550);
  }

  return (
    <div className="booking-page">
      <RidrTopNav active="dashboard" />

      <main className="booking-main-canvas">
        <MapCanvas />

        <section className="booking-floating-cluster">
          <BookingInputsPanel
            pickup={pickup}
            destination={destination}
            onPickupChange={setPickup}
            onDestinationChange={setDestination}
          />
          <DemandAlertCard title={demandAlert.title} message={demandAlert.message} />
        </section>

        <RideSelectionSheet
          rides={rideOptions}
          selectedRideId={selectedRideId}
          onSelectRide={setSelectedRideId}
          departureMode={departureMode}
          onToggleDepartureMode={() =>
            setDepartureMode((current) => (current === "now" ? "later" : "now"))
          }
          bookingStatus={bookingStatus}
          onBookRide={handleBookRide}
          driver={primaryDriver}
        />
      </main>

      <RidrMobileNav active="ride" />
    </div>
  );
}
