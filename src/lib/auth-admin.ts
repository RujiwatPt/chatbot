/**
 * Checks whether the given user email is authorized as an administrator.
 * Admin emails are specified via the ADMIN_EMAILS environment variable
 * as a comma-separated list of emails (case-insensitive).
 */
export function isAdminUser(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const adminEmailsEnv = process.env.ADMIN_EMAILS;
  if (!adminEmailsEnv) return false;

  const adminList = adminEmailsEnv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  return adminList.includes(email.trim().toLowerCase());
}
