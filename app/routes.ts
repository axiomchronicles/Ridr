import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/landing.tsx"),
	route("auth/login", "routes/login.tsx"),
	route("auth/register", "routes/register.tsx"),
	route("booking/fare-estimates", "routes/booking-fare-estimates.tsx"),
	route("ride/finding-your-ride", "routes/finding-your-ride.tsx"),
	route("ride/my-rides", "routes/my-rides.tsx"),
	route("ride/pre-meeting-chat", "routes/pre-ride-meeting-chat.tsx"),
	route("dashboard", "routes/dashboard.tsx"),
	route("impact/carbon-neutral", "routes/carbon-neutral.tsx"),
] satisfies RouteConfig;
