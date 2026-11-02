import { EventEmitter } from "./event-emitter";
import type {
	DeviceChangeEvent,
	DeviceInfo,
	DevicePlatform,
	DeviceType,
	ListenerContext,
	ListenerOptions,
	Subscription,
} from "./types";
import { hasWindow, media, noop } from "./utils";

interface UserAgentData {
	readonly platform?: string;
	readonly mobile?: boolean;
}

function flattenDeviceInfo(info: DeviceInfo): Record<string, unknown> {
	const { prefers, languages, ...rest } = info;
	const out: Record<string, unknown> = {
		...rest,
		languages: languages.join(","),
	};
	for (const [key, value] of Object.entries(prefers))
		out[`prefers.${key}`] = value;
	return out;
}

export class Device {
	private readonly emitter = new EventEmitter<{ change: DeviceChangeEvent }>(
		new Set(["change"]),
		() => this.sync(),
	);
	private detach: () => void = noop;
	private last: DeviceInfo | null = null;

	/** Current device information, read on demand. */
	get info(): DeviceInfo {
		const nav = (typeof navigator !== "undefined" ? navigator : undefined) as
			| (Navigator & {
					userAgentData?: UserAgentData;
					deviceMemory?: number;
					standalone?: boolean;
			  })
			| undefined;
		const agent = nav?.userAgent ?? "";
		const touchPoints = nav?.maxTouchPoints ?? 0;
		const hintedPlatform = nav?.userAgentData?.platform ?? nav?.platform ?? "";

		let platform: DevicePlatform = "unknown";
		if (/android/i.test(agent) || /android/i.test(hintedPlatform))
			platform = "android";
		else if (
			/iphone|ipad|ipod/i.test(agent) ||
			/^ios$/i.test(hintedPlatform) ||
			(/mac/i.test(hintedPlatform) && touchPoints > 1)
		)
			platform = "ios";
		else if (
			/cros|chrome os|chromeos/i.test(agent) ||
			/chrome os|chromeos/i.test(hintedPlatform)
		)
			platform = "chromeos";
		else if (/mac/i.test(hintedPlatform) || /macintosh/i.test(agent))
			platform = "macos";
		else if (/win/i.test(hintedPlatform) || /windows/i.test(agent))
			platform = "windows";
		else if (/linux|x11/i.test(hintedPlatform) || /linux|x11/i.test(agent))
			platform = "linux";

		let type: DeviceType = "unknown";
		if (nav) {
			if (
				/ipad|tablet/i.test(agent) ||
				(platform === "ios" && /macintosh/i.test(agent)) ||
				(platform === "android" && !/mobile/i.test(agent))
			)
				type = "tablet";
			else if (
				nav.userAgentData?.mobile === true ||
				/iphone|ipod|mobi/i.test(agent)
			)
				type = "mobile";
			else if (platform !== "unknown") type = "desktop";
		}

		const pointer = media("(pointer: fine)")
			? "fine"
			: media("(pointer: coarse)")
				? "coarse"
				: "none";

		return {
			type,
			platform,
			touch: touchPoints > 0,
			pointer,
			hover: media("(hover: hover)"),
			pixelRatio: hasWindow() ? window.devicePixelRatio || 1 : 1,
			cores: nav?.hardwareConcurrency ?? null,
			memory: nav?.deviceMemory ?? null,
			languages: nav?.languages?.length
				? [...nav.languages]
				: nav?.language
					? [nav.language]
					: [],
			standalone:
				media("(display-mode: standalone)") || nav?.standalone === true,
			prefers: {
				colorScheme: media("(prefers-color-scheme: dark)") ? "dark" : "light",
				reducedMotion: media("(prefers-reduced-motion: reduce)"),
				contrast: media("(prefers-contrast: more)")
					? "more"
					: media("(prefers-contrast: less)")
						? "less"
						: media("(prefers-contrast: custom)")
							? "custom"
							: "no-preference",
				reducedData: media("(prefers-reduced-data: reduce)"),
			},
		};
	}

	/** `change`: emitted when preferences, pointer capabilities, pixel ratio, language, or other device information changes. */
	on(
		name: "change",
		handler: (event: DeviceChangeEvent, ctx: ListenerContext) => void,
		options?: ListenerOptions,
	): Subscription {
		return this.emitter.on(name, handler, options);
	}

	private sync(): void {
		const wanted = this.emitter.count() > 0;
		if (wanted && this.detach === noop) this.attach();
		else if (!wanted && this.detach !== noop) {
			this.detach();
			this.detach = noop;
			this.last = null;
		}
	}

	private attach(): void {
		if (!hasWindow() || typeof matchMedia !== "function") return;
		this.last = this.info;

		const lists: MediaQueryList[] = [];
		const offs: Array<() => void> = [];
		const check = (): void => {
			const info = this.info;
			const previous = this.last as DeviceInfo;
			const a = flattenDeviceInfo(previous);
			const b = flattenDeviceInfo(info);
			const changed = Object.keys(b).filter(
				(key) => !Object.is(a[key], b[key]),
			);
			if (changed.length === 0) return;
			this.last = info;
			this.emitter.emit("change", { info, previous, changed });
		};
		const watch = (query: string): void => {
			const list = matchMedia(query);
			list.addEventListener("change", check);
			lists.push(list);
			offs.push(() => list.removeEventListener("change", check));
		};

		for (const query of [
			"(prefers-color-scheme: dark)",
			"(prefers-reduced-motion: reduce)",
			"(prefers-contrast: more)",
			"(prefers-contrast: less)",
			"(prefers-reduced-data: reduce)",
			"(hover: hover)",
			"(pointer: fine)",
			"(pointer: coarse)",
			"(display-mode: standalone)",
		]) {
			watch(query);
		}

		// Zoom and monitor changes can affect devicePixelRatio, so a resolution query is re-armed whenever it changes.
		let dprList: MediaQueryList | null = null;
		const armDpr = (): void => {
			dprList?.removeEventListener("change", onDpr);
			dprList = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
			dprList.addEventListener("change", onDpr);
		};
		const onDpr = (): void => {
			armDpr();
			check();
		};
		armDpr();

		window.addEventListener("languagechange", check);
		this.detach = () => {
			offs.forEach((off) => off());
			dprList?.removeEventListener("change", onDpr);
			window.removeEventListener("languagechange", check);
		};
	}
}
