import { BookingFareEstimatesPage } from "../features/booking-flow/booking-fare-estimates-page";

export function meta() {
  return [
    { title: "Ridr | Booking Fare Estimates" },
    {
      name: "description",
      content: "Select your eco-friendly ride with transparent fare estimates.",
    },
  ];
}

export default function BookingFareEstimatesRoute() {
  return <BookingFareEstimatesPage />;
}
