import { serverEnv } from "@cap/env";

/**
 * Upstream transcribes with AssemblyAI and gates every transcription entry
 * point on ASSEMBLY_API_KEY. This fork keeps Voxtral (Mistral, EU-hosted) as
 * the primary provider with Deepgram's EU endpoint as fallback, so those gates
 * would silently disable transcription here.
 *
 * Every such gate calls this instead. Keeping it in one place means a sync only
 * has to re-apply the fork's providers once rather than in five files.
 */
export function isTranscriptionConfigured(): boolean {
	const env = serverEnv();
	return Boolean(
		env.MISTRAL_API_KEY || env.DEEPGRAM_API_KEY || env.ASSEMBLY_API_KEY,
	);
}
