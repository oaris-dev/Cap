export const VERIFIED_PASSWORD_COOKIE = "x-cap-password";

// Embeds authorise per video via `x-cap-password-<videoId>` cookies. Several
// embeds can load in parallel, so they must not share one cookie: concurrent
// requests each read the same stale value before writing, and the last
// Set-Cookie would evict the others.
export const PER_VIDEO_PASSWORD_COOKIE_PREFIX = "x-cap-password-";

export function perVideoPasswordCookieName(videoId: string) {
	return `${PER_VIDEO_PASSWORD_COOKIE_PREFIX}${videoId}`;
}
