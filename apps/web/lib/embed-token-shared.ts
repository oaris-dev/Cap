export type EmbedTokenExpiry = "1h" | "24h" | "7d" | "30d";

export const VALID_EXPIRIES: readonly EmbedTokenExpiry[] = [
	"1h",
	"24h",
	"7d",
	"30d",
];

export const EXPIRY_LABELS: Record<EmbedTokenExpiry, string> = {
	"1h": "1 hour",
	"24h": "24 hours",
	"7d": "7 days",
	"30d": "30 days",
};
