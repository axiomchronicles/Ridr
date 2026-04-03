import { MyRidesPage } from "../features/my-rides/my-rides-page";

export function meta() {
  return [
    { title: "Ridr | My Rides" },
    {
      name: "description",
      content:
        "Track active and completed rides, split fare details, and personal sustainability impact.",
    },
  ];
}

export default function MyRidesRoute() {
  return <MyRidesPage />;
}
