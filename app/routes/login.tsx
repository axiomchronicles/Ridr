import { LoginPage } from "../features/auth/login-page";

export function meta() {
  return [
    { title: "Ridr | Login" },
    {
      name: "description",
      content: "Sign in to Ridr for route intelligence, booking controls, and sustainability insights.",
    },
  ];
}

export default function LoginRoute() {
  return <LoginPage />;
}
