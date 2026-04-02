import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/landing.tsx"),
	route("booking/fare-estimates", "routes/booking-fare-estimates.tsx"),
	route("ride/pre-meeting-chat", "routes/pre-ride-meeting-chat.tsx"),
	route("impact/carbon-neutral", "routes/carbon-neutral.tsx"),
] satisfies RouteConfig;
