import { Link } from "react-router";

import { MaterialSymbol } from "./material-symbol";
import type { NavSection } from "./ridr-top-nav";

type RidrMobileNavProps = {
  active: NavSection;
};

const items: Array<{ label: string; to: string; key: NavSection; icon: string }> = [
  { label: "Home", to: "/", key: "dashboard", icon: "home" },
  {
    label: "Book",
    to: "/booking/fare-estimates",
    key: "ride",
    icon: "directions_car",
  },
  {
    label: "Chat",
    to: "/ride/pre-meeting-chat",
    key: "history",
    icon: "chat_bubble",
  },
  {
    label: "Impact",
    to: "/impact/carbon-neutral",
    key: "impact",
    icon: "energy_savings_leaf",
  },
];

export function RidrMobileNav({ active }: RidrMobileNavProps) {
  return (
    <nav className="ridr-mobile-nav" aria-label="Mobile navigation">
      {items.map((item) => {
        const activeClass = active === item.key ? "ridr-mobile-nav-link-active" : "";

        return (
          <Link
            key={item.to}
            to={item.to}
            className={["ridr-mobile-nav-link", activeClass].filter(Boolean).join(" ")}
          >
            <MaterialSymbol name={item.icon} filled={active === item.key} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
