"use client";

export type ResolvedPlaybackSource = {
	url: string;
	type: "mp4" | "raw";
	supportsCrossOrigin: boolean;
};

type ProbeResult = {
	url: string;
	response: Response;
};

type ProbeFailure = {
	url: string;
	reason: "network-error" | "unavailable";
	status?: number;
};

type ProbeOutcome = ProbeFailure | ProbeResult;

type ResolvePlaybackSourceInput = {
	videoSrc: string;
	rawFallbackSrc?: string;
	enableCrossOrigin?: boolean;
	fetchImpl?: typeof fetch;
	now?: () => number;
	createVideoElement?: () => Pick<HTMLVideoElement, "canPlayType">;
	preferredSource?: "mp4" | "raw";
	maxProbeAttempts?: number;
	probeRetryDelayMs?: number;
	sleepImpl?: (ms: number) => Promise<void>;
};

const DEFAULT_MAX_PROBE_ATTEMPTS = 3;
const DEFAULT_PROBE_RETRY_DELAY_MS = 300;

const defaultSleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryableProbeStatus(status: number): boolean {
	return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableProbeFailure(failure: ProbeFailure): boolean {
	return (
		failure.reason === "unavailable" &&
		typeof failure.status === "number" &&
		isRetryableProbeStatus(failure.status)
	);
}

function appendCacheBust(url: string, timestamp: number): string {
	return url.includes("?")
		? `${url}&_t=${timestamp}`
		: `${url}?_t=${timestamp}`;
}

function isPlayableProbeResponse(response: Response): boolean {
	return response.ok || response.status === 206;
}

function isProbeResult(outcome: ProbeOutcome): outcome is ProbeResult {
	return "response" in outcome;
}

function canUseUnprobedSource(url: string): boolean {
	return url.startsWith("/") && !url.startsWith("//");
}

function isWebMContentType(contentType: string, url: string): boolean {
	return (
		contentType.toLowerCase().includes("video/webm") ||
		/\.webm(?:$|[?#])/i.test(url)
	);
}

async function probePlaybackSourceWithRetry(
	url: string,
	fetchImpl: typeof fetch,
	now: () => number,
	maxAttempts: number,
	retryDelayMs: number,
	sleep: (ms: number) => Promise<void>,
): Promise<ProbeOutcome> {
	let lastOutcome = await probePlaybackSource(url, fetchImpl, now);

	for (let attempt = 1; attempt < maxAttempts; attempt++) {
		if (isProbeResult(lastOutcome) || !isRetryableProbeFailure(lastOutcome)) {
			return lastOutcome;
		}

		await sleep(retryDelayMs * 2 ** (attempt - 1));
		lastOutcome = await probePlaybackSource(url, fetchImpl, now);
	}

	return lastOutcome;
}

async function probePlaybackSource(
	url: string,
	fetchImpl: typeof fetch,
	now: () => number,
): Promise<ProbeOutcome> {
	const requestUrl = appendCacheBust(url, now());

	try {
		const response = await fetchImpl(requestUrl, {
			headers: { range: "bytes=0-0" },
		});

		if (!isPlayableProbeResponse(response)) {
			return {
				url: requestUrl,
				reason: "unavailable",
				status: response.status,
			};
		}

		return {
			url: response.redirected ? response.url : requestUrl,
			response,
		};
	} catch {
		return {
			url: requestUrl,
			reason: "network-error",
		};
	}
}

export function detectCrossOriginSupport(
	url: string,
	probeWasRedirected = false,
): boolean {
	if (probeWasRedirected) return true;
	try {
		const hostname = new URL(url, "https://cap.so").hostname;
		const isR2OrS3 =
			hostname.includes("r2.cloudflarestorage.com") ||
			hostname.includes("s3.amazonaws.com") ||
			hostname.includes(".s3.");
		return !isR2OrS3;
	} catch {
		return true;
	}
}

export function canPlayRawContentType(
	contentType: string,
	url: string,
	createVideoElement: () => Pick<HTMLVideoElement, "canPlayType"> = () =>
		document.createElement("video"),
): boolean {
	if (!isWebMContentType(contentType, url)) {
		return true;
	}

	const video = createVideoElement();
	return (
		video.canPlayType(contentType) !== "" ||
		video.canPlayType("video/webm") !== ""
	);
}

export function shouldFallbackToRawPlaybackSource(
	resolvedSourceType: ResolvedPlaybackSource["type"] | null | undefined,
	rawFallbackSrc: string | undefined,
	hasTriedRawFallback: boolean,
): boolean {
	return Boolean(
		rawFallbackSrc && resolvedSourceType === "mp4" && !hasTriedRawFallback,
	);
}

export async function resolvePlaybackSource({
	videoSrc,
	rawFallbackSrc,
	enableCrossOrigin = false,
	fetchImpl = fetch,
	now = () => Date.now(),
	createVideoElement,
	preferredSource = "mp4",
	maxProbeAttempts = DEFAULT_MAX_PROBE_ATTEMPTS,
	probeRetryDelayMs = DEFAULT_PROBE_RETRY_DELAY_MS,
	sleepImpl = defaultSleep,
}: ResolvePlaybackSourceInput): Promise<ResolvedPlaybackSource | null> {
	const probe = (url: string) =>
		probePlaybackSourceWithRetry(
			url,
			fetchImpl,
			now,
			maxProbeAttempts,
			probeRetryDelayMs,
			sleepImpl,
		);

	const resolveRaw = async (): Promise<ResolvedPlaybackSource | null> => {
		if (!rawFallbackSrc) {
			return null;
		}

		const rawResult = await probe(rawFallbackSrc);

		if (!isProbeResult(rawResult)) {
			return null;
		}

		const contentType = rawResult.response.headers.get("content-type") ?? "";

		if (
			!canPlayRawContentType(contentType, rawResult.url, createVideoElement)
		) {
			return null;
		}

		return {
			url: rawResult.url,
			type: "raw",
			supportsCrossOrigin:
				enableCrossOrigin &&
				detectCrossOriginSupport(rawResult.url, rawResult.response.redirected),
		};
	};

	if (preferredSource === "raw") {
		return await resolveRaw();
	}

	const mp4Result = await probe(videoSrc);

	if (isProbeResult(mp4Result)) {
		return {
			url: mp4Result.url,
			type: "mp4",
			supportsCrossOrigin:
				enableCrossOrigin &&
				detectCrossOriginSupport(mp4Result.url, mp4Result.response.redirected),
		};
	}

	const mp4FailureIsTransient =
		mp4Result.reason === "network-error" || isRetryableProbeFailure(mp4Result);

	if (mp4FailureIsTransient && canUseUnprobedSource(videoSrc)) {
		return {
			url: mp4Result.url,
			type: "mp4",
			supportsCrossOrigin: false,
		};
	}

	return await resolveRaw();
}
