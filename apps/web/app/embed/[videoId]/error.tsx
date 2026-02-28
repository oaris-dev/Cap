"use client";

export default function EmbedError() {
	return (
		<div className="flex flex-col justify-center items-center min-h-screen text-center text-white bg-black font-lexend">
			<h1 className="mb-4 text-xl font-semibold font-league-spartan">
				Unable to load video
			</h1>
			<p className="mb-6 text-sm text-gray-400">
				This video cannot be displayed in this context.
			</p>
			<a
				href={
					typeof window !== "undefined"
						? window.location.href.replace("/embed/", "/s/")
						: "#"
				}
				target="_blank"
				rel="noopener noreferrer"
				className="px-4 py-2 text-sm font-medium text-white bg-[#3b7a6b] rounded-lg hover:opacity-90 transition-opacity"
			>
				Open in New Tab
			</a>
		</div>
	);
}
