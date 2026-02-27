"use client";

import { Button, Dialog, DialogContent, Input } from "@cap/ui";
import type { Video } from "@cap/web-domain";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { verifyVideoPassword } from "@/actions/videos/password";
import { OarisLogo } from "@/components/OarisLogo";

interface PasswordOverlayProps {
	isOpen: boolean;
	videoId: Video.VideoId;
}

function useIsSandboxed() {
	const [sandboxed, setSandboxed] = useState(false);
	useEffect(() => {
		try {
			void document.cookie;
		} catch {
			setSandboxed(true);
		}
	}, []);
	return sandboxed;
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
			router.refresh();
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
								Protected Video
							</h2>
							{isSandboxed ? (
								<p className="text-xs sm:text-sm text-gray-10 max-w-xs sm:max-w-sm px-2 sm:px-0">
									This video requires a password. Open it in a new tab to enter
									the password and watch.
								</p>
							) : (
								<p className="text-xs sm:text-sm text-gray-10 max-w-xs sm:max-w-sm px-2 sm:px-0">
									This video is password protected. Please enter the password to
									continue watching.
								</p>
							)}
						</div>
					</div>

					{isSandboxed ? (
						<div className="w-full space-y-3 sm:space-y-4">
							<Button
								type="button"
								variant="dark"
								size="lg"
								className="w-full"
								onClick={() =>
									window.open(`/s/${videoId}`, "_blank", "noopener")
								}
							>
								Open in New Tab
							</Button>
						</div>
					) : (
						<div className="w-full space-y-3 sm:space-y-4">
							<div className="space-y-2">
								<label
									htmlFor="password"
									className="text-sm font-medium text-gray-12"
								>
									Password
								</label>
								<Input
									id="password"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="Enter password"
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
								{verifyPassword.isPending ? "Verifying..." : "Access Video"}
							</Button>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
