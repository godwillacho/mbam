const blockedAuthPrefixes = [
  "/auth",
  "/access",
  "/dashboard-picker",
  "/invite",
  "/reset-password",
];

export function currentProtectedPath(
  pathname: string,
  search = "",
  hash = "",
): string {
  return `${pathname}${search}${hash}`;
}

export function safeNextPath(value: string | null | undefined): string | null {
  if (!value?.startsWith("/") || value === "/" || value.startsWith("//"))
    return null;
  const pathname = routePathname(value);
  if (
    blockedAuthPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }
  return value;
}

export function dashboardPickerPath(nextPath: string | null): string {
  return nextPath
    ? `/dashboard-picker?next=${encodeURIComponent(nextPath)}`
    : "/dashboard-picker";
}

export function authPath(nextPath: string | null): string {
  return nextPath ? `/auth?next=${encodeURIComponent(nextPath)}` : "/auth";
}

export function routePathname(value: string): string {
  try {
    return new URL(value, window.location.origin).pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}
