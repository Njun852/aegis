"use server";

import { changeOwnPassword } from "@/lib/dal/account";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

export interface PasswordChangeState {
  error: string | null;
  success: boolean;
}

/**
 * Changes the signed-in user's own password.
 *
 * Every rule is enforced here rather than only in the form: the form is a
 * convenience, this is the boundary. Nothing about the outcome distinguishes a
 * missing account from a wrong password, for the same reason sign-in does not.
 */
export async function changePasswordAction(
  _previous: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!current || !next || !confirm) {
    return { error: "Fill in all three fields.", success: false };
  }
  if (next.length < PASSWORD_MIN_LENGTH) {
    return {
      error: `Your new password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      success: false,
    };
  }
  if (next !== confirm) {
    return { error: "The two new passwords do not match.", success: false };
  }
  if (next === current) {
    return {
      error: "Your new password must be different from your current one.",
      success: false,
    };
  }

  const result = await changeOwnPassword(current, next);
  if (!result.ok) {
    return {
      error:
        result.reason === "wrong-password"
          ? "That is not your current password."
          : "Your account could not be found. Sign out and back in, then try again.",
      success: false,
    };
  }

  return { error: null, success: true };
}
