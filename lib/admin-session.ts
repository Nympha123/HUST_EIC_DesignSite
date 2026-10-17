export const roleStorageKey = "eic-current-role";
export const ministerSessionCookieName = "eic-minister-session";

export function getMinisterSessionSecret() {
  return process.env.MINISTER_SESSION_SECRET ?? "";
}

export function hasValidMinisterSession(request: Request) {
  const sessionSecret = getMinisterSessionSecret();

  if (!sessionSecret) {
    return false;
  }

  const cookieHeader = request.headers.get("cookie") ?? "";

  return cookieHeader.split(";").some((cookie) => {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    const cookieValue = decodeURIComponent(rawValueParts.join("="));

    return rawName === ministerSessionCookieName && cookieValue === sessionSecret;
  });
}
