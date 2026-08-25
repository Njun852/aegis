import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/auth/login-screen";
import { optionalSession } from "@/lib/dal/session";

export default async function LoginPage() {
  // Already signed in — no reason to show the form again.
  if (await optionalSession()) {
    redirect("/dashboard");
  }
  return <LoginScreen />;
}
