import { LandingPage } from "../features/landing/landing-page";

export function meta() {
  return [
    { title: "Ridr | Move with Purpose" },
    {
      name: "description",
      content:
        "Premium eco-friendly mobility with transparent impact and carbon-neutral ride options.",
    },
  ];
}

export default function LandingRoute() {
  return <LandingPage />;
}
