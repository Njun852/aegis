"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/dal/session";

export interface SignInState {
  error: string | null;
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Enter your username and password to continue." };
  }

  try {
    await signIn("credentials", { username, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      // Deliberately vague: distinguishing "no such user" from "wrong
      // password" tells an attacker which usernames exist.
      return { error: "That username and password do not match an account." };
    }
    throw error;
  }

  // Outside the try: redirect() signals by throwing, and the catch above would
  // swallow it.
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_BUSINESS_COOKIE);
  await signOut({ redirectTo: "/login" });
}
