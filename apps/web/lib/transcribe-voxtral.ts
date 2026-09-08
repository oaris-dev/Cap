import { serverEnv } from "@cap/env";
import {
	AI_GENERATION_LANGUAGE_AUTO,
	type AiGenerationLanguage,
} from "@cap/web-domain";
import type { AssemblyAIWord } from "@/lib/transcribe-utils";

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
	language: AiGenerationLanguage = AI_GENERATION_LANGUAGE_AUTO,
): Promise<AssemblyAIWord[] | null> {
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

		if (language !== AI_GENERATION_LANGUAGE_AUTO) {
			formData.append("language", language);
		}

		const baseUrl = serverEnv().MISTRAL_API_URL ?? "https://api.mistral.ai";
		const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
			body: formData,
		});

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

		return voxtralSegmentsToWords(result.segments);
	} catch (error) {
		console.error(
			"[transcribeWithVoxtral] Unexpected error:",
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

// Voxtral reports segment offsets in seconds; every downstream consumer
// (caption VTT, edit transcript) works in milliseconds.
function voxtralSegmentsToWords(segments: VoxtralSegment[]): AssemblyAIWord[] {
	const words: AssemblyAIWord[] = [];

	for (const segment of segments) {
		const text = segment.text.trim();
		if (!text) continue;
		if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) {
			continue;
		}

		words.push({
			text,
			start: Math.round(segment.start * 1000),
			end: Math.round(segment.end * 1000),
		});
	}

	return words;
}
