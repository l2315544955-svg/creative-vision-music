import { Navigate, useSearchParams } from "react-router-dom";

interface LoginPageProps {
  isAuthenticated: boolean;
}

export function LoginPage({ isAuthenticated }: LoginPageProps) {
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get("mode");
  const redirect = searchParams.get("redirect") || "";
  const auth = requestedMode === "register" ? "register" : "login";
  const nextSearchParams = new URLSearchParams();

  nextSearchParams.set("auth", auth);

  if (redirect) {
    nextSearchParams.set("redirect", redirect);
  }

  if (isAuthenticated) {
    return <Navigate replace to={redirect || "/create"} />;
  }

  return <Navigate replace to={`/?${nextSearchParams.toString()}`} />;
}
