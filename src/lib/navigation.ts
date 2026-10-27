export function sanitizeNext(nextParam: string | null): string {
  if (!nextParam) return "/characters";
  // Only allow same-origin absolute paths.
  if (!nextParam.startsWith("/")) return "/characters";
  // Block protocol-relative redirects like //evil.example or /\evil.example.
  if (nextParam.startsWith("//") || nextParam.startsWith("/\\")) return "/characters";
  return nextParam;
}
