import type { DriverProfile, RideId, RideOption } from "./booking-flow.types";

type RidePricingProfile = {
  baseFare: number;
  perMile: number;
  perMinute: number;
  minFare: number;
  waitBufferMinutes: number;
  etaSpeedFactor: number;
  co2SavingsPerMile: number;
};

export const rideOptions: RideOption[] = [
  {
    id: "standard",
    name: "Standard",
    description: "Swift, private journey",
    price: 260,
    etaMinutes: 4,
    icon: "directions_car",
    accent: "neutral",
  },
  {
    id: "eco",
    name: "Ridr Eco",
    description: "100% Electric vehicles only",
    price: 220,
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
    price: 180,
    etaMinutes: 7,
    icon: "group",
    accent: "tertiary",
    savingsLabel: "Saves you \u20b980",
  },
];

export const ridePricingProfiles: Record<RideId, RidePricingProfile> = {
  standard: {
    baseFare: 65,
    perMile: 24,
    perMinute: 4.5,
    minFare: 110,
    waitBufferMinutes: 2,
    etaSpeedFactor: 10,
    co2SavingsPerMile: 0.35,
  },
  eco: {
    baseFare: 55,
    perMile: 20,
    perMinute: 3.8,
    minFare: 95,
    waitBufferMinutes: 1,
    etaSpeedFactor: 9,
    co2SavingsPerMile: 0.72,
  },
  carpool: {
    baseFare: 45,
    perMile: 16,
    perMinute: 3.2,
    minFare: 80,
    waitBufferMinutes: 4,
    etaSpeedFactor: 8,
    co2SavingsPerMile: 1.05,
  },
};

export const defaultPickup = "";
export const defaultDestination = "";

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
