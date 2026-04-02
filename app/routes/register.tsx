import { RegisterPage } from "../features/auth/register-page";

export function meta() {
  return [
    { title: "Ridr | Register" },
    {
      name: "description",
      content: "Create a Ridr account to personalize rides, fares, and carbon impact tracking.",
    },
  ];
}

export default function RegisterRoute() {
  return <RegisterPage />;
}
