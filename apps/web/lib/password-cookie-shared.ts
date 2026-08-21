export const VERIFIED_PASSWORD_COOKIE = "x-cap-password";

// Embeds authorise per video via `x-cap-password-<videoId>` cookies. Several
// embeds can load in parallel, so they must not share one cookie: concurrent
// requests each read the same stale value before writing, and the last
// Set-Cookie would evict the others.
export const PER_VIDEO_PASSWORD_COOKIE_PREFIX = "x-cap-password-";

export function perVideoPasswordCookieName(videoId: string) {
	return `${PER_VIDEO_PASSWORD_COOKIE_PREFIX}${videoId}`;
}

// A viewer can open many distinct password-protected embeds inside the cookie
// lifetime. Every per-video cookie is sent on every request to this origin, so
// the set is capped and the oldest entries are retired once it is reached.
export const MAX_PER_VIDEO_COOKIES = 12;

export type PerVideoPasswordPayload = {
	h: string;
	t: number;
};

export function isPerVideoPasswordPayload(
	value: unknown,
): value is PerVideoPasswordPayload {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as PerVideoPasswordPayload).h === "string" &&
		typeof (value as PerVideoPasswordPayload).t === "number"
	);
}
