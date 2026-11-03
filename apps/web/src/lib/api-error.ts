import { translateApiError } from "@/lib/i18n";
import { m } from "@/paraglide/messages";

export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Throws ApiError with the API's error code for non-2xx responses. */
export async function ensureOk<
  T extends { ok: boolean; json(): Promise<unknown> },
>(res: T): Promise<T> {
  if (res.ok) return res;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new ApiError(body.error ?? "generic");
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return translateApiError(error.code);
  return m["errors.generic"]();
}

/** Better Auth returns upper-case codes such as INVALID_EMAIL_OR_PASSWORD. */
export function translateAuthError(code: string | undefined): string {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return m["auth.error_invalid_credentials"]();
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return m["auth.error_user_exists"]();
    case "PASSWORD_TOO_SHORT":
      return m["auth.error_password_short"]();
    case "INVALID_EMAIL":
      return m["auth.error_invalid_email"]();
    case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER":
      return m["household.error_last_owner"]();
    default:
      return m["errors.generic"]();
  }
}
