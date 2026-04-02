import { PreRideMeetingChatPage } from "../features/pre-ride-meeting/pre-ride-meeting-chat-page";

export function meta() {
  return [
    { title: "Ridr | Pre-Ride Meeting Chat" },
    {
      name: "description",
      content:
        "Coordinate quickly with your driver before pickup using Ridr pre-ride chat.",
    },
  ];
}

export default function PreRideMeetingChatRoute() {
  return <PreRideMeetingChatPage />;
}
