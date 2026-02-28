"use client";

import { Button, Dialog, DialogContent, Input } from "@cap/ui";
import type { Video } from "@cap/web-domain";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { verifyVideoPassword } from "@/actions/videos/password";
import { OarisLogo } from "@/components/OarisLogo";
import { t } from "@/lib/translations";

interface PasswordOverlayProps {
	isOpen: boolean;
	videoId: Video.VideoId;
}

function useIsSandboxed() {
	const [sandboxed, setSandboxed] = useState(false);
	useEffect(() => {
		if (window.origin === "null" || window.origin === null) {
			setSandboxed(true);
		}
	}, []);
	return sandboxed;
}

function SandboxedFallback({ videoId }: { videoId: Video.VideoId }) {
	const [copied, setCopied] = useState(false);
	const [fullUrl, setFullUrl] = useState(`/s/${videoId}`);
	const textRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		try {
			const url = new URL(window.location.href);
			url.pathname = `/s/${videoId}`;
			url.search = "";
			setFullUrl(url.toString());
		} catch {
			const origin =
				window.location.origin !== "null" ? window.location.origin : "";
			if (origin) {
				setFullUrl(`${origin}/s/${videoId}`);
			}
		}
	}, [videoId]);

	const handleCopy = () => {
		if (textRef.current) {
			textRef.current.select();
			textRef.current.setSelectionRange(0, textRef.current.value.length);
			document.execCommand("copy");
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<div className="w-full space-y-3 sm:space-y-4">
			<a
				href={fullUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="block w-full"
			>
				<Button type="button" variant="dark" size="lg" className="w-full">
					{t("password.openInBrowser")}
				</Button>
			</a>
			<div className="flex gap-2">
				<input
					ref={textRef}
					readOnly
					value={fullUrl}
					className="flex-1 px-3 py-2 text-xs bg-gray-2 border border-gray-6 rounded-lg text-gray-11 select-all truncate"
					onFocus={(e) => e.target.select()}
				/>
				<Button type="button" variant="gray" size="sm" onClick={handleCopy}>
					{copied ? t("password.copied") : t("password.copy")}
				</Button>
			</div>
		</div>
	);
}

export const PasswordOverlay: React.FC<PasswordOverlayProps> = ({
	isOpen,
	videoId,
}) => {
	const [password, setPassword] = useState("");
	const router = useRouter();
	const isSandboxed = useIsSandboxed();

	const verifyPassword = useMutation({
		mutationFn: () =>
			verifyVideoPassword(videoId, password).then((v) => {
				if (v.success) return v.value;
				throw new Error(v.error);
			}),
		onSuccess: (result) => {
			toast.success(result);
			try {
				router.refresh();
			} catch (_) {
				window.location.reload();
			}
		},
		onError: (e) => {
			toast.error(e.message);
		},
	});

	return (
		<Dialog open={isOpen}>
			<DialogContent className="w-[95vw] max-w-sm p-4 sm:p-6 md:p-8 sm:max-w-md font-lexend">
				<div className="flex flex-col items-center space-y-4 sm:space-y-6">
					<div className="flex flex-col items-center space-y-3 sm:space-y-4">
						<OarisLogo className="w-16 sm:w-20 md:w-24 h-auto text-gray-12" />
						<div className="text-center space-y-2">
							<h2 className="text-lg sm:text-xl font-semibold text-gray-12 font-league-spartan">
								{t("password.title")}
							</h2>
							<p className="text-xs sm:text-sm text-gray-10 max-w-xs sm:max-w-sm px-2 sm:px-0">
								{isSandboxed
									? t("password.sandboxDescription")
									: t("password.description")}
							</p>
						</div>
					</div>

					{isSandboxed ? (
						<SandboxedFallback videoId={videoId} />
					) : (
						<div className="w-full space-y-3 sm:space-y-4">
							<div className="space-y-2">
								<label
									htmlFor="password"
									className="text-sm font-medium text-gray-12"
								>
									{t("password.label")}
								</label>
								<Input
									id="password"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder={t("password.placeholder")}
									className="w-full"
									autoFocus
								/>
							</div>
							<Button
								type="button"
								variant="dark"
								size="lg"
								className="w-full"
								spinner={verifyPassword.isPending}
								disabled={verifyPassword.isPending || !password.trim()}
								onClick={() => verifyPassword.mutate()}
							>
								{verifyPassword.isPending
									? t("password.verifying")
									: t("password.submit")}
							</Button>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
