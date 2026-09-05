/**
 * Who can watch a Cap, in words.
 *
 * The header used to say "Shared" or "Not shared", which told the owner
 * nothing: not whether the public link was on, not who a share reached. This
 * names the widest audience the video currently has, and the tooltip spells
 * out what that means for the link.
 */

import { t, tParam } from "@/lib/translations";

export type ShareAudienceKind = "public" | "spaces" | "private";

export interface ShareAudience {
	kind: ShareAudienceKind;
	label: string;
	tooltip: string;
}

export interface ShareAudienceInput {
	isPublic: boolean;
	/** Includes an inherited password from a space or organization. */
	passwordProtected: boolean;
	/**
	 * Names of the spaces and organizations this is shared into. Unnamed
	 * entries are counted but not listed, so a missing name degrades to
	 * "Shared with 2 spaces" rather than printing an empty one.
	 */
	audienceNames: (string | null | undefined)[];
}

const listNames = (names: string[], total: number): string => {
	if (names.length === 1 && total === 1)
		return tParam("audience.sharedWithOne", { name: names[0] as string });
	if (names.length === 2 && total === 2)
		return tParam("audience.sharedWithTwo", {
			first: names[0] as string,
			second: names[1] as string,
		});
	if (names.length >= 1)
		return tParam(
			total - 1 === 1
				? "audience.sharedWithOneAndOther"
				: "audience.sharedWithOneAndOthers",
			{ name: names[0] as string, count: total - 1 },
		);
	return tParam(
		total === 1 ? "audience.sharedWithSpace" : "audience.sharedWithSpaces",
		{ count: total },
	);
};

export const describeShareAudience = ({
	isPublic,
	passwordProtected,
	audienceNames,
}: ShareAudienceInput): ShareAudience => {
	if (isPublic) {
		return {
			kind: "public",
			label: passwordProtected
				? t("audience.publicWithPassword")
				: t("audience.public"),
			tooltip: passwordProtected
				? t("audience.publicWithPasswordTooltip")
				: t("audience.publicTooltip"),
		};
	}

	const named = audienceNames.filter(
		(name): name is string => typeof name === "string" && name.trim() !== "",
	);
	const total = audienceNames.length;

	if (total > 0) {
		const listed = named.slice(0, 2);
		const remainder = total - listed.length;
		return {
			kind: "spaces",
			label: listNames(listed, total),
			tooltip: listed.length
				? remainder > 0
					? tParam("audience.spacesTooltipMore", {
							names: listed.join(", "),
							count: remainder,
						})
					: tParam("audience.spacesTooltip", { names: listed.join(", ") })
				: t("audience.spacesTooltipUnnamed"),
		};
	}

	return {
		kind: "private",
		label: t("audience.private"),
		tooltip: t("audience.privateTooltip"),
	};
};
