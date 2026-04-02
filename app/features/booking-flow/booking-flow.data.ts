import type { DriverProfile, RideOption } from "./booking-flow.types";

export const rideOptions: RideOption[] = [
  {
    id: "standard",
    name: "Standard",
    description: "Swift, private journey",
    price: 24.5,
    etaMinutes: 4,
    icon: "directions_car",
    accent: "neutral",
  },
  {
    id: "eco",
    name: "Ridr Eco",
    description: "100% Electric vehicles only",
    price: 18.2,
    etaMinutes: 2,
    icon: "eco",
    accent: "secondary",
    featureTag: "Best for Planet",
    impactLabel: "Saves 4.2 lbs CO2",
  },
  {
    id: "carpool",
    name: "Ridr Carpool",
    description: "Share with 1 other passenger",
    price: 12.5,
    etaMinutes: 7,
    icon: "group",
    accent: "tertiary",
    savingsLabel: "Saves you $12.50",
  },
];

export const defaultPickup = "Current Location: 101 Market St";
export const defaultDestination = "Salesforce Tower";

export const primaryDriver: DriverProfile = {
  name: "Sarah",
  rating: 4.98,
  avatarUrl:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuA7VjxS0j1Gb8nUawIMoKZGBf3MwyKBN6sjCHDTsYtzhphomSSnb7CxIkE498n9-N4ceYky1iHPyI1lieQ0QBwa7VMUl9_qd_VQPLMvIXbcKVzC8FhX6U36dAtSDy0CP_EIEEGePqonLKGsWt4xBJVOaFVEqqlgOx5xO4qENJVcPtV3Lfk_gWV5xOunzY5Z9_dfeIvc29Xe5CAAqSKjt_SYra3K4WR5LVEZrYdW-gJcZL9ZEe4AXbIIggfB9TmV8NN4FgeP4Pw5ZuyK",
  supportDriverCount: 12,
  badges: ["Fuel-efficient vehicle", "Eco-badge"],
};

export const mapBackgroundImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuArOAQJyd87NpfzOVAsoNXBalqn70oyDGhD0rTn9pUxUI30xPIz3bieVecfrVMoyXNebowknMdZP9Xg_wY21799MP_mfSWuGl0_T5hf83JQx7KC9zUVzKqK9aNXsL--oTjmj62dVoSHrFlIEnsjgdbk_fzyfY5FdkaWbMaoIYbJZHYdC6TUpzCxPK2HJyJ4Hd23NoJkH-CtcikaT0H-cwlEX6bokPKPFsqnLge6_T71fhAtqyNEWVxq5ollswCez0zOlz9Fcm2XIes2";

export const demandAlert = {
  title: "High demand in your area",
  message: "But carpooling reduces your carbon footprint by 30% today.",
};
