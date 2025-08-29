import { parseCookies } from 'oslo/cookie';
import { config } from 'wasp/server';
export function setOAuthCookieValue(provider, res, fieldName, value) {
    const cookieName = `${provider.id}_${fieldName}`;
    res.cookie(cookieName, value, {
        httpOnly: true,
        secure: !config.isDevelopment,
        path: "/",
        maxAge: 60 * 60 * 1000, // 1 hour
    });
}
export function getOAuthCookieValue(provider, req, fieldName) {
    const cookieName = `${provider.id}_${fieldName}`;
    const cookies = parseCookies(req.headers.cookie ?? "");
    return cookies.get(cookieName);
}
//# sourceMappingURL=cookies.js.map