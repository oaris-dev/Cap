import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = { entries: [] as { name: string; value: string }[] };

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
	cookies: async () => ({
		getAll: () => cookieStore.entries,
		get: (name: string) => cookieStore.entries.find((c) => c.name === name),
		set: () => {},
	}),
}));
vi.mock("@cap/database/crypto", () => ({
	decrypt: async (value: string) => {
		if (value.startsWith("bad")) throw new Error("cannot decrypt");
		return value.replace(/^enc:/, "");
	},
	encrypt: async (value: string) => `enc:${value}`,
}));

import {
	getVerifiedPasswordHashes,
	perVideoPasswordCookieName,
} from "@/lib/password-cookie";

describe("perVideoPasswordCookieName", () => {
	it("namespaces the cookie by video id", () => {
		expect(perVideoPasswordCookieName("abc123")).toBe("x-cap-password-abc123");
	});
});

describe("getVerifiedPasswordHashes", () => {
	beforeEach(() => {
		cookieStore.entries = [];
	});

	it("collects hashes from every per-video cookie", async () => {
		cookieStore.entries = [
			{ name: "x-cap-password-video1", value: "enc:hashOne" },
			{ name: "x-cap-password-video2", value: "enc:hashTwo" },
		];

		await expect(getVerifiedPasswordHashes()).resolves.toEqual([
			"hashOne",
			"hashTwo",
		]);
	});

	it("still reads the shared cookie alongside per-video cookies", async () => {
		cookieStore.entries = [
			{ name: "x-cap-password", value: 'enc:["sharedOne","sharedTwo"]' },
			{ name: "x-cap-password-video1", value: "enc:hashOne" },
		];

		const hashes = await getVerifiedPasswordHashes();
		expect(hashes).toContain("sharedOne");
		expect(hashes).toContain("sharedTwo");
		expect(hashes).toContain("hashOne");
	});

	it("ignores unrelated cookies", async () => {
		cookieStore.entries = [
			{ name: "next-auth.session-token", value: "enc:secret" },
			{ name: "x-cap-password-video1", value: "enc:hashOne" },
		];

		await expect(getVerifiedPasswordHashes()).resolves.toEqual(["hashOne"]);
	});

	it("skips cookies that fail to decrypt without losing the others", async () => {
		cookieStore.entries = [
			{ name: "x-cap-password-video1", value: "badCookie" },
			{ name: "x-cap-password-video2", value: "enc:hashTwo" },
		];

		await expect(getVerifiedPasswordHashes()).resolves.toEqual(["hashTwo"]);
	});

	it("deduplicates a hash present in several cookies", async () => {
		cookieStore.entries = [
			{ name: "x-cap-password-video1", value: "enc:sameHash" },
			{ name: "x-cap-password-video2", value: "enc:sameHash" },
		];

		await expect(getVerifiedPasswordHashes()).resolves.toEqual(["sameHash"]);
	});
});

describe("per-video cookie payloads", () => {
	beforeEach(() => {
		cookieStore.entries = [];
	});

	it("reads the timestamped payload format written by the proxy", async () => {
		cookieStore.entries = [
			{
				name: "x-cap-password-video1",
				value: 'enc:{"h":"hashOne","t":1700000000}',
			},
		];

		await expect(getVerifiedPasswordHashes()).resolves.toEqual(["hashOne"]);
	});

	it("still reads bare-hash cookies written before the payload format", async () => {
		cookieStore.entries = [
			{ name: "x-cap-password-video1", value: "enc:legacyHash" },
		];

		await expect(getVerifiedPasswordHashes()).resolves.toEqual(["legacyHash"]);
	});

	it("mixes payload, legacy and shared-array cookies", async () => {
		cookieStore.entries = [
			{ name: "x-cap-password", value: 'enc:["sharedHash"]' },
			{ name: "x-cap-password-video1", value: 'enc:{"h":"newHash","t":1}' },
			{ name: "x-cap-password-video2", value: "enc:legacyHash" },
		];

		const hashes = await getVerifiedPasswordHashes();
		expect(hashes.sort()).toEqual(["legacyHash", "newHash", "sharedHash"]);
	});
});
