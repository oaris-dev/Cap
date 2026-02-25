import { serverEnv } from "@cap/env";
import { formatTimestamp } from "@/lib/transcribe-utils";

interface VoxtralSegment {
	text: string;
	start: number;
	end: number;
	speaker_id?: string | null;
	type: string;
}

interface VoxtralResponse {
	model: string;
	text: string;
	language: string | null;
	segments: VoxtralSegment[];
	usage?: {
		prompt_audio_seconds: number;
		prompt_tokens: number;
		total_tokens: number;
		completion_tokens: number;
	};
}

export async function transcribeWithVoxtral(
	audioData: Buffer,
): Promise<string | null> {
	const apiKey = serverEnv().MISTRAL_API_KEY;
	if (!apiKey) return null;

	try {
		const formData = new FormData();
		formData.append(
			"file",
			new Blob([new Uint8Array(audioData)], { type: "audio/mpeg" }),
			"audio.mp3",
		);
		formData.append("model", "voxtral-mini-latest");
		formData.append("response_format", "verbose_json");
		formData.append("timestamp_granularities", "word");

		const baseUrl =
			serverEnv().MISTRAL_API_URL ?? "https://api.mistral.ai";
		const response = await fetch(
			`${baseUrl}/v1/audio/transcriptions`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				body: formData,
			},
		);

		if (!response.ok) {
			const errorBody = await response.text();
			console.error(
				`[transcribeWithVoxtral] API error: ${response.status} ${response.statusText}`,
				errorBody,
			);
			return null;
		}

		const result: VoxtralResponse = await response.json();

		if (!result.segments || result.segments.length === 0) {
			return null;
		}

		return voxtralToWebVTT(result.segments);
	} catch (error) {
		console.error(
			"[transcribeWithVoxtral] Unexpected error:",
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

function voxtralToWebVTT(segments: VoxtralSegment[]): string {
	let output = "WEBVTT\n\n";
	let captionIndex = 1;

	let group: string[] = [];
	let groupStart = segments[0]?.start ?? 0;
	let wordCount = 0;

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		if (!segment) continue;

		const word = segment.text.trim();
		if (!word) continue;

		if (group.length === 0) {
			groupStart = segment.start;
		}

		group.push(word);
		wordCount++;

		const nextSegment = segments[i + 1];
		const shouldBreak =
			word.endsWith(",") ||
			word.endsWith(".") ||
			word.endsWith("!") ||
			word.endsWith("?") ||
			(nextSegment && nextSegment.start - segment.end > 0.5) ||
			wordCount === 8;

		if (shouldBreak) {
			const start = formatTimestamp(groupStart);
			const end = formatTimestamp(segment.end);
			const groupText = group.join(" ");

			output += `${captionIndex}\n${start} --> ${end}\n${groupText}\n\n`;
			captionIndex++;

			group = [];
			wordCount = 0;
		}
	}

	if (group.length > 0) {
		const lastSegment = segments[segments.length - 1];
		if (lastSegment) {
			const start = formatTimestamp(groupStart);
			const end = formatTimestamp(lastSegment.end);
			const groupText = group.join(" ");
			output += `${captionIndex}\n${start} --> ${end}\n${groupText}\n\n`;
		}
	}

	return output;
}
