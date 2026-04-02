import { FindingRidePage } from "../features/finding-ride/finding-ride-page";

export function meta() {
  return [
    { title: "Ridr | Finding Your Ride" },
    {
      name: "description",
      content:
        "Track ride matching progress, route optimization, and estimated impact before pickup.",
    },
  ];
}

export default function FindingYourRideRoute() {
  return <FindingRidePage />;
}