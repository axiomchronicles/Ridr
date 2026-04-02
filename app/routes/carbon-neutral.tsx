import { CarbonNeutralPage } from "../features/carbon-neutral/carbon-neutral-page";

export function meta() {
  return [
    { title: "Ridr | Carbon Neutral Dashboard" },
    {
      name: "description",
      content:
        "Track projected savings, emissions reductions, and sustainability milestones in Ridr.",
    },
  ];
}

export default function CarbonNeutralRoute() {
  return <CarbonNeutralPage />;
}
