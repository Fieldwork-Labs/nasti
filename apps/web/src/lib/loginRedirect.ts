// Let the root route choose the user's landing area from their organisation
// permissions instead of assuming every organisation has Trips access.
const DEFAULT_LOGIN_REDIRECT = "/"

export const getLoginRedirect = (redirect?: string) => {
  if (
    !redirect ||
    !redirect.startsWith("/") ||
    redirect.startsWith("//") ||
    redirect === "/auth/login" ||
    redirect.startsWith("/auth/")
  ) {
    return DEFAULT_LOGIN_REDIRECT
  }

  return redirect
}
