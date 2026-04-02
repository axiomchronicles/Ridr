import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import {
  clearAuthSession,
  getStoredUser,
  isAuthenticated,
  subscribeToAuthSessionChanged,
} from "~/features/auth/auth-client";
import { MaterialSymbol } from "./material-symbol";

export type NavSection = "dashboard" | "impact" | "history" | "ride";

type RidrTopNavProps = {
  active?: NavSection;
  showBookNow?: boolean;
};

const links: Array<{ label: string; to: string; key: NavSection }> = [
  { label: "Home", to: "/", key: "dashboard" },
  { label: "Book", to: "/booking/fare-estimates", key: "ride" },
  { label: "Messages", to: "/ride/pre-meeting-chat", key: "history" },
  { label: "Impact", to: "/impact/carbon-neutral", key: "impact" },
];

const profileAvatar =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD3PvNNrPC6o7BAQOa7uS1W9900JscGKoBSq9TOIQwZRAAmQdcBsP-qMFBdOiLwb-HLEKbZpHToTfx-rUjfJ0cWHu864DZ14FUCfLzbBwLv0SMVALMbLssUOjv1lKbwrf1WBvk2A4iZZn8UJR9tqqNlhvuAenPbeDYJ1SHsC1HDlTCzu8kT2lUROiexV91akNJ5GuNest6MKKP9-Giby94rn-epSjU-dbZCfNC2XImQpBLfkYPu5zwV6cWBuV6nu_3fozwVsU2YEYQg";

export function RidrTopNav({ active, showBookNow = false }: RidrTopNavProps) {
  const navigate = useNavigate();
  const [hasSession, setHasSession] = useState(false);
  const [userFirstName, setUserFirstName] = useState<string>("");

  useEffect(() => {
    function syncAuthState() {
      const signedIn = isAuthenticated();
      const user = getStoredUser();

      setHasSession(signedIn);
      setUserFirstName(user?.first_name || "");
    }

    syncAuthState();
    const unsubscribe = subscribeToAuthSessionChanged(syncAuthState);

    return unsubscribe;
  }, []);

  function handleLogout() {
    clearAuthSession();
    navigate("/auth/login", { replace: true });
  }

  return (
    <header className="ridr-top-nav">
      <div className="ridr-top-nav-left">
        <Link to="/" className="ridr-brand" aria-label="Ridr home">
          Ridr
        </Link>

        <nav className="ridr-top-nav-links" aria-label="Primary navigation">
          {links.map((linkItem) => (
            <Link
              key={linkItem.key}
              to={linkItem.to}
              className={[
                "ridr-nav-link",
                active === linkItem.key ? "ridr-nav-link-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {linkItem.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="ridr-header-actions">
        <button className="ridr-icon-button" type="button" aria-label="Notifications">
          <MaterialSymbol name="notifications" className="ridr-icon-muted" />
        </button>
        <button className="ridr-icon-button" type="button" aria-label="Eco insights">
          <MaterialSymbol name="eco" className="ridr-icon-secondary" filled />
        </button>

        {hasSession ? (
          <>
            <div className="ridr-profile-avatar-shell" aria-label="Profile">
              <img src={profileAvatar} alt="Profile" className="ridr-profile-avatar" />
            </div>
            <span className="ridr-user-greeting" aria-label="Signed in user">
              {userFirstName ? `Hi, ${userFirstName}` : "Signed in"}
            </span>
            <button className="ridr-auth-link ridr-auth-link-primary" type="button" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link className="ridr-auth-link" to="/auth/login">
              Log in
            </Link>
            <Link className="ridr-auth-link ridr-auth-link-primary" to="/auth/register">
              Register
            </Link>
          </>
        )}

        {showBookNow ? (
          <Link className="ridr-book-now" to="/booking/fare-estimates">
            Book Now
          </Link>
        ) : null}
      </div>
    </header>
  );
}
