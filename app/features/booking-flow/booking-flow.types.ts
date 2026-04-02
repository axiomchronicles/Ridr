export type RideId = "standard" | "eco" | "carpool";

export type RideAccent = "neutral" | "secondary" | "tertiary";

export type RideOption = {
  id: RideId;
  name: string;
  description: string;
  price: number;
  etaMinutes: number;
  icon: string;
  accent: RideAccent;
  featureTag?: string;
  impactLabel?: string;
  savingsLabel?: string;
};

export type DriverProfile = {
  name: string;
  rating: number;
  avatarUrl: string;
  supportDriverCount: number;
  badges: string[];
};

export type DepartureMode = "now" | "later";

export type BookingStatus = "idle" | "loading" | "confirmed";
