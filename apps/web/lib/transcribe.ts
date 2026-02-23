import { promises as fs } from "node:fs";
import { db } from "@cap/database";
import { organizations, s3Buckets, videos } from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { S3Buckets } from "@cap/web-backend";
import type { S3Bucket, Video } from "@cap/web-domain";
import { createClient } from "@deepgram/sdk";
import { eq } from "drizzle-orm";
import { Option } from "effect";
import { checkHasAudioTrack, extractAudioFromUrl } from "@/lib/audio-extract";
import { startAiGeneration } from "@/lib/generate-ai";
import {
	checkHasAudioTrackViaMediaServer,
	extractAudioViaMediaServer,
	isMediaServerConfigured,
} from "@/lib/media-client";
import { runPromise } from "@/lib/server";
import { type DeepgramResult, formatToWebVTT } from "@/lib/transcribe-utils";

type TranscribeResult = {
	success: boolean;
	message: string;
};

export async function transcribeVideo(
	videoId: Video.VideoId,
	userId: string,
	aiGenerationEnabled = false,
	_isRetry = false,
): Promise<TranscribeResult> {
	if (!serverEnv().DEEPGRAM_API_KEY) {
		return {
			success: false,
			message: "Missing necessary environment variables",
		};
	}

	if (!userId || !videoId) {
		return {
			success: false,
			message: "userId or videoId not supplied",
		};
	}

	const query = await db()
		.select({
			video: videos,
			bucket: s3Buckets,
			settings: videos.settings,
			orgSettings: organizations.settings,
		})
		.from(videos)
		.leftJoin(s3Buckets, eq(videos.bucket, s3Buckets.id))
		.leftJoin(organizations, eq(videos.orgId, organizations.id))
		.where(eq(videos.id, videoId));

	if (query.length === 0) {
		return { success: false, message: "Video does not exist" };
	}

	const result = query[0];
	if (!result || !result.video) {
		return { success: false, message: "Video information is missing" };
	}

	const { video } = result;

	if (!video) {
		return { success: false, message: "Video information is missing" };
	}

	if (
		video.settings?.disableTranscript ??
		result.orgSettings?.disableTranscript
	) {
		console.log(
			`[transcribeVideo] Transcription disabled for video ${videoId}`,
		);
		try {
			await db()
				.update(videos)
				.set({ transcriptionStatus: "SKIPPED" })
				.where(eq(videos.id, videoId));
		} catch (err) {
			console.error(`[transcribeVideo] Failed to mark as skipped:`, err);
			return {
				success: false,
				message: "Transcription disabled, but failed to update status",
			};
		}
		return {
			success: true,
			message: "Transcription disabled for video — skipping transcription",
		};
	}

	if (
		video.transcriptionStatus === "COMPLETE" ||
		(!_isRetry && video.transcriptionStatus === "PROCESSING") ||
		video.transcriptionStatus === "SKIPPED" ||
		video.transcriptionStatus === "NO_AUDIO"
	) {
		return {
			success: true,
			message: "Transcription already completed or in progress",
		};
	}

	try {
		console.log(
			`[transcribeVideo] Starting direct transcription for video ${videoId}`,
		);

		await transcribeVideoDirect(videoId, userId, aiGenerationEnabled);

		return {
			success: true,
			message: "Transcription completed",
		};
	} catch (error) {
		console.error("[transcribeVideo] Transcription failed:", error);

		await db()
			.update(videos)
			.set({ transcriptionStatus: "ERROR" })
			.where(eq(videos.id, videoId));

		return {
			success: false,
			message: "Transcription failed",
		};
	}
}

async function transcribeVideoDirect(
	videoId: string,
	userId: string,
	aiGenerationEnabled: boolean,
): Promise<void> {
	await db()
		.update(videos)
		.set({ transcriptionStatus: "PROCESSING" })
		.where(eq(videos.id, videoId as Video.VideoId));

	const query = await db()
		.select({
			bucket: s3Buckets,
		})
		.from(videos)
		.leftJoin(s3Buckets, eq(videos.bucket, s3Buckets.id))
		.where(eq(videos.id, videoId as Video.VideoId));

	if (query.length === 0) {
		throw new Error("Video does not exist");
	}

	const { bucket } = query[0];
	const bucketId = (bucket?.id ?? null) as S3Bucket.S3BucketId | null;

	const [s3Bucket] = await S3Buckets.getBucketAccess(
		Option.fromNullable(bucketId),
	).pipe(runPromise);

	const videoKey = `${userId}/${videoId}/result.mp4`;
	const videoUrl = await s3Bucket.getSignedObjectUrl(videoKey).pipe(runPromise);

	const headResponse = await fetch(videoUrl, {
		method: "GET",
		headers: { range: "bytes=0-0" },
	});
	if (!headResponse.ok) {
		throw new Error("Video file not accessible");
	}

	const useMediaServer = isMediaServerConfigured();
	let hasAudio: boolean;
	let audioBuffer: Buffer;

	if (useMediaServer) {
		hasAudio = await checkHasAudioTrackViaMediaServer(videoUrl);
		if (!hasAudio) {
			await db()
				.update(videos)
				.set({ transcriptionStatus: "NO_AUDIO" })
				.where(eq(videos.id, videoId as Video.VideoId));
			return;
		}
		audioBuffer = await extractAudioViaMediaServer(videoUrl);
	} else {
		hasAudio = await checkHasAudioTrack(videoUrl);
		if (!hasAudio) {
			await db()
				.update(videos)
				.set({ transcriptionStatus: "NO_AUDIO" })
				.where(eq(videos.id, videoId as Video.VideoId));
			return;
		}
		const extracted = await extractAudioFromUrl(videoUrl);
		try {
			audioBuffer = await fs.readFile(extracted.filePath);
		} finally {
			await extracted.cleanup();
		}
	}

	const audioKey = `${userId}/${videoId}/audio-temp.mp3`;
	await s3Bucket
		.putObject(audioKey, audioBuffer, { contentType: "audio/mpeg" })
		.pipe(runPromise);

	const audioSignedUrl = await s3Bucket
		.getSignedObjectUrl(audioKey)
		.pipe(runPromise);

	const audioResponse = await fetch(audioSignedUrl);
	if (!audioResponse.ok) {
		throw new Error(
			`Audio URL not accessible: ${audioResponse.status} ${audioResponse.statusText}`,
		);
	}

	const audioData = Buffer.from(await audioResponse.arrayBuffer());

	const deepgramApiUrl = serverEnv().DEEPGRAM_API_URL;
	const deepgramOptions = deepgramApiUrl
		? { global: { url: deepgramApiUrl } }
		: undefined;
	const deepgram = createClient(
		serverEnv().DEEPGRAM_API_KEY as string,
		deepgramOptions,
	);

	const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
		audioData,
		{
			model: "nova-3",
			smart_format: true,
			detect_language: true,
			utterances: true,
			mime_type: "audio/mpeg",
		},
	);

	if (error) {
		throw new Error(`Deepgram transcription failed: ${error.message}`);
	}

	const transcription = formatToWebVTT(result as unknown as DeepgramResult);

	await s3Bucket
		.putObject(`${userId}/${videoId}/transcription.vtt`, transcription, {
			contentType: "text/vtt",
		})
		.pipe(runPromise);

	await db()
		.update(videos)
		.set({ transcriptionStatus: "COMPLETE" })
		.where(eq(videos.id, videoId as Video.VideoId));

	try {
		await s3Bucket.deleteObject(audioKey).pipe(runPromise);
	} catch (cleanupError) {
		console.error(
			`[transcribeVideo] Failed to cleanup temp audio: ${audioKey}`,
			cleanupError,
		);
	}

	if (aiGenerationEnabled) {
		await startAiGeneration(videoId as Video.VideoId, userId);
	}
}
