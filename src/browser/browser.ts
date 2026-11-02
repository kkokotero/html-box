import { Channel } from "./channel";
import type { ChannelOptions, UntypedChannel } from "./channel";
import { Device } from "./device";
import { BrowserError } from "./errors";
import { Network } from "./network";
import { Screen } from "./screen";
import { hasWindow } from "./utils";
import { BrowserWindow, WindowLink } from "./window-link";
import type { OpenOptions } from "./window-link";

let deviceInstance: Device | undefined;
let screenInstance: Screen | undefined;
let networkInstance: Network | undefined;

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

function finiteNumber(value: unknown, name: string): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new BrowserError(
			"INVALID_OPTION",
			`Option \`${name}\` must be a finite number.`,
		);
	}
	return Math.round(value);
}

export class Browser {
	private constructor() {
		throw new BrowserError(
			"INVALID_ARGUMENT",
			"Browser is a static API: use Browser.device, Browser.screen, Browser.open()...",
		);
	}

	/** Device information (shared instance). */
	static get device(): Device {
		return (deviceInstance ??= new Device());
	}

	/** Screen and window information (shared instance). */
	static get screen(): Screen {
		return (screenInstance ??= new Screen());
	}

	/** Network information (shared instance). */
	static get network(): Network {
		return (networkInstance ??= new Network());
	}

	/** APIs supported by this browser. */
	static get supports(): {
		readonly matchMedia: boolean;
		readonly networkInformation: boolean;
		readonly broadcastChannel: boolean;
		readonly windowManagement: boolean;
		readonly screenOrientation: boolean;
		readonly visualViewport: boolean;
	} {
		const w: (Window & { getScreenDetails?: () => unknown }) | undefined =
			hasWindow()
				? (window as Window & { getScreenDetails?: () => unknown })
				: undefined;
		return {
			matchMedia: typeof matchMedia === "function",
			networkInformation:
				typeof navigator !== "undefined" && "connection" in navigator,
			broadcastChannel: typeof BroadcastChannel !== "undefined",
			windowManagement: typeof w?.getScreenDetails === "function",
			screenOrientation: hasWindow() && !!screen.orientation,
			visualViewport: !!w?.visualViewport,
		};
	}

	/**
	 * Opens another window (must be called from a user gesture).
	 * Returns a `BrowserWindow` for moving, resizing, and communicating with it.
	 */
	static open<M = unknown>(
		url: string | URL,
		options: OpenOptions = {},
	): BrowserWindow<M> {
		if (!hasWindow())
			throw new BrowserError(
				"NOT_SUPPORTED",
				"Browser.open() requires a window.",
			);

		let target: URL;
		try {
			target = new URL(String(url), window.location.href);
		} catch {
			throw new BrowserError(
				"INVALID_ARGUMENT",
				`Invalid URL: "${String(url)}".`,
			);
		}
		const blank = target.href === "about:blank";
		if (!blank && !ALLOWED_PROTOCOLS.has(target.protocol)) {
			throw new BrowserError(
				"UNSAFE_URL",
				`Only http(s) URLs can be opened (got "${target.protocol}").`,
			);
		}

		const sameOrigin = blank || target.origin === window.location.origin;
		const noopener = options.noopener ?? !sameOrigin;
		const noreferrer = options.noreferrer ?? !sameOrigin;

		const width = finiteNumber(options.width, "width");
		const height = finiteNumber(options.height, "height");
		let left = finiteNumber(options.left, "left");
		let top = finiteNumber(options.top, "top");

		if (options.center !== undefined) {
			if (options.center !== "screen" && options.center !== "window") {
				throw new BrowserError(
					"INVALID_OPTION",
					'Option `center` must be "screen" or "window".',
				);
			}
			if (width === undefined || height === undefined) {
				throw new BrowserError(
					"INVALID_OPTION",
					"Option `center` requires `width` and `height`.",
				);
			}
			if (options.center === "screen") {
				const available = Browser.screen.available;
				left = Math.round(available.x + (available.width - width) / 2);
				top = Math.round(available.y + (available.height - height) / 2);
			} else {
				const bounds = Browser.screen.window.bounds;
				left = Math.round(bounds.x + (bounds.width - width) / 2);
				top = Math.round(bounds.y + (bounds.height - height) / 2);
			}
		}

		const popup =
			options.popup ?? [width, height, left, top].some((v) => v !== undefined);
		const features: string[] = [];
		if (popup) features.push("popup=yes");
		if (width !== undefined) features.push(`width=${width}`);
		if (height !== undefined) features.push(`height=${height}`);
		if (left !== undefined) features.push(`left=${left}`);
		if (top !== undefined) features.push(`top=${top}`);
		if (noopener) features.push("noopener");
		if (noreferrer) features.push("noreferrer");

		const opened = window.open(
			target.href,
			options.name ?? "_blank",
			features.join(",") || undefined,
		);
		if (!opened && !noopener) {
			throw new BrowserError(
				"POPUP_BLOCKED",
				"The browser blocked the window. Call Browser.open() from a user gesture (click, key press).",
			);
		}

		const handle = new BrowserWindow<M>(opened, target);
		if (opened && options.focus !== false) {
			try {
				opened.focus();
			} catch {
				/* algunos navegadores no permiten dar foco */
			}
		}
		const { signal } = options;
		if (signal) {
			if (signal.aborted) handle.close();
			else
				signal.addEventListener("abort", () => handle.close(), { once: true });
		}
		return handle;
	}

	/**
	 * Link to the window that opened this one (`window.opener`), or `null` if there is none.
	 * Communication is restricted to the same origin by default; specify another origin explicitly.
	 */
	static opener<M = unknown>(
		options: { origin?: string } = {},
	): WindowLink<M> | null {
		if (!hasWindow() || !window.opener) return null;
		const origin = options.origin ?? window.location.origin;
		if (origin === "*" || origin === "null") {
			throw new BrowserError(
				"INVALID_OPTION",
				'Option `origin` must be an exact origin (no "*" and no "null").',
			);
		}
		return new WindowLink<M>(window.opener as Window, origin);
	}

	/** Typed channel between windows on the same origin. */
	static channel<S extends object = UntypedChannel>(
		name: string,
		options?: ChannelOptions,
	): Channel<S> {
		return new Channel<S>(name, options);
	}
}
