import { describe, expect, it, vi } from "vitest";

// The dictionary picks its language from buildEnv when there is no document;
// unset here so these assertions read against the English strings.
vi.mock("@cap/env", () => ({
	buildEnv: { NEXT_PUBLIC_UI_LANGUAGE: "en" },
}));

const { tParam } = await import("@/lib/translations");

describe("tParam", () => {
	// The values are user-controlled — an owner's display name, a space's name.
	// A string replacement would read these as `String.replace` substitution
	// patterns and drop or duplicate parts of the message.
	it.each([
		["$&", "Respond to $&..."],
		["$`", "Respond to $`..."],
		["$'", "Respond to $'..."],
		["$1", "Respond to $1..."],
		["$$", "Respond to $$..."],
	])("inserts %j literally", (name, expected) => {
		expect(tParam("activity.respondTo", { name })).toBe(expected);
	});

	it("fills every placeholder in a multi-parameter message", () => {
		expect(
			tParam("audience.sharedWithTwo", { first: "Design", second: "$&" }),
		).toBe("Shared with Design and $&");
	});

	it("leaves the rest of the message untouched", () => {
		expect(tParam("activity.respondTo", { name: "Ricardo" })).toBe(
			"Respond to Ricardo...",
		);
	});
});
