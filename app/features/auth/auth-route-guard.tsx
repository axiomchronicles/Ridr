import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  clearAuthSession,
  fetchCurrentUser,
  getAccessToken,
  setStoredUser,
} from "./auth-client";

const PUBLIC_PATHS = new Set(["/", "/auth/login", "/auth/register"]);

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function AuthRouteGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const validatedTokenRef = useRef<string | null>(null);

  const normalizedPath = useMemo(() => normalizePath(location.pathname), [location.pathname]);
  const isPublicPath = PUBLIC_PATHS.has(normalizedPath);

  useEffect(() => {
    let cancelled = false;

    if (typeof window === "undefined") {
      setIsChecking(false);
      return;
    }

    async function validateSession() {
      setIsChecking(true);

      const token = getAccessToken();
      const currentPath = `${location.pathname}${location.search}`;

      if (!token) {
        validatedTokenRef.current = null;

        if (!isPublicPath) {
          const params = new URLSearchParams();
          params.set("next", currentPath);
          navigate(`/auth/login?${params.toString()}`, { replace: true });
          return;
        }

        if (!cancelled) {
          setIsChecking(false);
        }
        return;
      }

      if (validatedTokenRef.current !== token) {
        try {
          const user = await fetchCurrentUser(token);
          validatedTokenRef.current = token;
          setStoredUser(user);
        } catch {
          clearAuthSession();
          validatedTokenRef.current = null;

          if (!isPublicPath) {
            const params = new URLSearchParams();
            params.set("next", currentPath);
            navigate(`/auth/login?${params.toString()}`, { replace: true });
            return;
          }

          if (!cancelled) {
            setIsChecking(false);
          }
          return;
        }
      }

      if (normalizedPath === "/auth/login" || normalizedPath === "/auth/register") {
        const params = new URLSearchParams(location.search);
        const nextPath = params.get("next") || "/booking/fare-estimates";
        navigate(nextPath, { replace: true });
        return;
      }

      if (!cancelled) {
        setIsChecking(false);
      }
    }

    void validateSession();

    return () => {
      cancelled = true;
    };
  }, [isPublicPath, location.pathname, location.search, navigate, normalizedPath]);

  if (typeof window === "undefined") {
    if (!isPublicPath) {
      return null;
    }

    return <>{children}</>;
  }

  if (isChecking) {
    return <div className="auth-route-guard-loading">Checking your session...</div>;
  }

  return <>{children}</>;
}
