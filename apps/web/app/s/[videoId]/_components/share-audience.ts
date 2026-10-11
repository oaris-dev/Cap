/**
 * Who can watch a Cap, in words.
 *
 * The header used to say "Shared" or "Not shared", which told the owner
 * nothing: not whether the public link was on, not who a share reached. This
 * names the widest audience the video currently has, and the tooltip spells
 * out what that means for the link.
 */

import { t, tParam } from "@/lib/translations";

export type ShareAudienceKind = "public" | "spaces" | "people" | "private";

export interface ShareAudience {
	kind: ShareAudienceKind;
	label: string;
	tooltip: string;
}

export interface ShareAudienceInput {
	isPublic: boolean;
	allowedEmailDomain?: string | null;
	/** Includes an inherited password from a space or organization. */
	passwordProtected: boolean;
	/**
	 * Names of the spaces and organizations this is shared into. Unnamed
	 * entries are counted but not listed, so a missing name degrades to
	 * "Shared with 2 spaces" rather than printing an empty one.
	 */
	audienceNames: (string | null | undefined)[];
	viewerCount?: number;
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

/** Appended to a tooltip when a password gates the link as well. */
const passwordSuffix = (passwordProtected: boolean): string =>
	passwordProtected ? t("audience.passwordAlsoRequired") : "";

export const describeShareAudience = ({
	isPublic,
	allowedEmailDomain,
	passwordProtected,
	audienceNames,
	viewerCount = 0,
}: ShareAudienceInput): ShareAudience => {
	if (isPublic) {
		if (allowedEmailDomain?.trim()) {
			return {
				kind: "public",
				label: t("audience.restrictedLink"),
				tooltip:
					tParam("audience.restrictedLinkTooltip", {
						domain: allowedEmailDomain.trim(),
					}) + passwordSuffix(passwordProtected),
			};
		}
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
		const spaceDescription = listed.length
			? remainder > 0
				? tParam("audience.membersOfMore", {
						names: listed.join(", "),
						count: remainder,
					})
				: tParam("audience.membersOf", { names: listed.join(", ") })
			: t("audience.membersOfUnnamed");
		return {
			kind: "spaces",
			label:
				viewerCount > 0
					? tParam(
							viewerCount === 1
								? "audience.sharedWithSpacesAndPerson"
								: "audience.sharedWithSpacesAndPeople",
							{ count: viewerCount },
						)
					: listNames(listed, total),
			tooltip:
				viewerCount > 0
					? tParam(
							viewerCount === 1
								? "audience.spacesAndPersonTooltip"
								: "audience.spacesAndPeopleTooltip",
							{ spaces: spaceDescription, count: viewerCount },
						) + passwordSuffix(passwordProtected)
					: tParam("audience.spacesTooltip", { spaces: spaceDescription }),
		};
	}
	if (viewerCount > 0) {
		return {
			kind: "people",
			label: tParam(
				viewerCount === 1
					? "audience.sharedWithPerson"
					: "audience.sharedWithPeople",
				{ count: viewerCount },
			),
			tooltip: t("audience.peopleTooltip") + passwordSuffix(passwordProtected),
		};
	}

	return {
		kind: "private",
		label: t("audience.private"),
		tooltip: t("audience.privateTooltip"),
	};
};
