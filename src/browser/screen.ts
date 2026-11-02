import { BrowserError } from "./errors";
import { EventEmitter } from "./event-emitter";
import type {
	ListenerContext,
	ListenerOptions,
	Ratio,
	Rect,
	ScreenEvents,
	ScreenInfo,
	ScreenOptions,
	Size,
	Subscription,
	ViewportInfo,
	WindowGeometry,
	WindowState,
} from "./types";
import { hasWindow, media, noop, ratioOf } from "./utils";

interface DetailedScreen {
	label?: string;
	isPrimary?: boolean;
	isInternal?: boolean;
	left: number;
	top: number;
	width: number;
	height: number;
	availLeft: number;
	availTop: number;
	availWidth: number;
	availHeight: number;
	devicePixelRatio: number;
}

const MAXIMIZED_TOLERANCE = 20;

export class Screen {
	private readonly emitter = new EventEmitter<ScreenEvents>(
		new Set(["resize", "move", "state", "orientation"]),
		() => this.sync(),
	);
	private readonly interval: number;
	private detach: () => void = noop;
	private timer: ReturnType<typeof setInterval> | undefined;
	private lastSize: Size = { width: 0, height: 0 };
	private lastBounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
	private lastState: WindowState = "floating";
	private lastOrientation: { type: string | null; angle: number } = {
		type: null,
		angle: 0,
	};

	constructor(options: ScreenOptions = {}) {
		const interval = options.pollInterval ?? 150;
		if (
			typeof interval !== "number" ||
			!Number.isFinite(interval) ||
			interval < 16
		) {
			throw new BrowserError(
				"INVALID_OPTION",
				"Option `pollInterval` must be a number >= 16 (ms).",
			);
		}
		this.interval = interval;
	}

	/* ---- pantalla --------------------------------------------------------- */

	/** Screen size in CSS pixels. */
	get size(): Size {
		return hasWindow()
			? { width: screen.width, height: screen.height }
			: { width: 0, height: 0 };
	}

	/** Available screen area (excluding system bars), including its origin. */
	get available(): Rect {
		if (!hasWindow()) return { x: 0, y: 0, width: 0, height: 0 };
		const s = screen as globalThis.Screen & {
			availLeft?: number;
			availTop?: number;
		};
		return {
			x: s.availLeft ?? 0,
			y: s.availTop ?? 0,
			width: s.availWidth,
			height: s.availHeight,
		};
	}

	/** Screen aspect ratio. */
	get ratio(): Ratio {
		const { width, height } = this.size;
		return ratioOf(width, height);
	}

	get pixelRatio(): number {
		return hasWindow() ? window.devicePixelRatio || 1 : 1;
	}

	get colorDepth(): number {
		return hasWindow() ? screen.colorDepth : 0;
	}

	get orientation(): { type: string | null; angle: number } {
		if (!hasWindow()) return { type: null, angle: 0 };
		const o = screen.orientation as ScreenOrientation | undefined;
		return o ? { type: o.type, angle: o.angle } : { type: null, angle: 0 };
	}

	/** Whether multiple screens are connected, or null when unavailable. */
	get extended(): boolean | null {
		if (!hasWindow()) return null;
		const value = (screen as globalThis.Screen & { isExtended?: boolean })
			.isExtended;
		return typeof value === "boolean" ? value : null;
	}

	/* ---- viewport y ventana ---------------------------------------------- */

	/** Visible page area. */
	get viewport(): ViewportInfo {
		if (!hasWindow())
			return { width: 0, height: 0, ratio: ratioOf(0, 0), scale: 1 };
		const vv = window.visualViewport;
		const width = vv?.width ?? window.innerWidth;
		const height = vv?.height ?? window.innerHeight;
		return {
			width,
			height,
			ratio: ratioOf(width, height),
			scale: vv?.scale ?? 1,
		};
	}

	/** Browser window state and geometry. */
	get window(): WindowGeometry {
		if (!hasWindow()) {
			const empty: Rect = { x: 0, y: 0, width: 0, height: 0 };
			return {
				state: "floating",
				floating: true,
				bounds: empty,
				relative: { x: 0, y: 0 },
				inner: { width: 0, height: 0 },
				ratio: ratioOf(0, 0),
			};
		}
		const x = window.screenX ?? window.screenLeft ?? 0;
		const y = window.screenY ?? window.screenTop ?? 0;
		const width = window.outerWidth;
		const height = window.outerHeight;
		const available = this.available;
		const inner = { width: window.innerWidth, height: window.innerHeight };

		const fullscreen =
			(typeof document !== "undefined" && !!document.fullscreenElement) ||
			media("(display-mode: fullscreen)") ||
			(screen.width > 0 &&
				inner.width === screen.width &&
				inner.height === screen.height);
		const maximized =
			Math.abs(width - available.width) <= MAXIMIZED_TOLERANCE &&
			Math.abs(height - available.height) <= MAXIMIZED_TOLERANCE;
		const state: WindowState = fullscreen
			? "fullscreen"
			: maximized
				? "maximized"
				: "floating";

		return {
			state,
			floating: state === "floating",
			bounds: { x, y, width, height },
			relative: { x: x - available.x, y: y - available.y },
			inner,
			ratio: ratioOf(width, height),
		};
	}

	/** Window coordinates when floating, or `null` when maximized or fullscreen. */
	floating(): Rect | null {
		const geometry = this.window;
		return geometry.floating ? geometry.bounds : null;
	}

	/**
	 * All connected screens and their positions (Window Management API, Chromium only).
	 * Requests user permission on first use. Returns only the current screen when unsupported.
	 */
	async screens(): Promise<readonly ScreenInfo[]> {
		if (!hasWindow()) return [];
		const manager = window as unknown as {
			getScreenDetails?: () => Promise<{
				screens: DetailedScreen[];
				currentScreen: DetailedScreen;
			}>;
		};
		if (typeof manager.getScreenDetails !== "function") {
			const size = this.size;
			const available = this.available;
			return [
				{
					label: "",
					primary: true,
					internal: false,
					current: true,
					bounds: { x: 0, y: 0, ...size },
					available,
					pixelRatio: this.pixelRatio,
					ratio: this.ratio,
				},
			];
		}
		try {
			const details = await manager.getScreenDetails();
			return details.screens.map((s) => ({
				label: s.label ?? "",
				primary: !!s.isPrimary,
				internal: !!s.isInternal,
				current: s === details.currentScreen,
				bounds: { x: s.left, y: s.top, width: s.width, height: s.height },
				available: {
					x: s.availLeft,
					y: s.availTop,
					width: s.availWidth,
					height: s.availHeight,
				},
				pixelRatio: s.devicePixelRatio,
				ratio: ratioOf(s.width, s.height),
			}));
		} catch (error) {
			if ((error as { name?: string })?.name === "NotAllowedError") {
				throw new BrowserError(
					"PERMISSION_DENIED",
					"Permission to read the screen layout was denied.",
				);
			}
			throw error;
		}
	}

	/* ---- eventos ---------------------------------------------------------- */

	on<K extends keyof ScreenEvents & string>(
		name: K,
		handler: (event: ScreenEvents[K], ctx: ListenerContext) => void,
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
		}
		// Polling runs only while `move` or `state` listeners are registered.
		const needsPoll =
			this.detach !== noop &&
			(this.emitter.count("move") > 0 || this.emitter.count("state") > 0);
		if (needsPoll && this.timer === undefined)
			this.timer = setInterval(() => this.check(), this.interval);
		else if (!needsPoll && this.timer !== undefined) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	private attach(): void {
		if (!hasWindow()) return;
		const geometry = this.window;
		this.lastSize = { width: window.innerWidth, height: window.innerHeight };
		this.lastBounds = geometry.bounds;
		this.lastState = geometry.state;
		this.lastOrientation = this.orientation;

		const onChange = (): void => this.check();
		const onOrientation = (): void => this.checkOrientation();
		window.addEventListener("resize", onChange);
		if (typeof document !== "undefined")
			document.addEventListener("fullscreenchange", onChange);
		const orientation = screen.orientation as ScreenOrientation | undefined;
		orientation?.addEventListener?.("change", onOrientation);

		this.detach = () => {
			window.removeEventListener("resize", onChange);
			if (typeof document !== "undefined")
				document.removeEventListener("fullscreenchange", onChange);
			orientation?.removeEventListener?.("change", onOrientation);
		};
	}

	private check(): void {
		if (this.detach === noop) return;
		const geometry = this.window;
		const size: Size = { width: window.innerWidth, height: window.innerHeight };

		if (
			size.width !== this.lastSize.width ||
			size.height !== this.lastSize.height
		) {
			const previous = this.lastSize;
			this.lastSize = size;
			this.emitter.emit("resize", {
				viewport: this.viewport,
				window: geometry,
				previous,
			});
		}

		const b = geometry.bounds;
		const p = this.lastBounds;
		if (b.x !== p.x || b.y !== p.y) {
			this.lastBounds = { ...b };
			this.emitter.emit("move", {
				bounds: b,
				previous: p,
				deltaX: b.x - p.x,
				deltaY: b.y - p.y,
				window: geometry,
			});
		} else {
			this.lastBounds = { ...b };
		}

		if (geometry.state !== this.lastState) {
			const previous = this.lastState;
			this.lastState = geometry.state;
			this.emitter.emit("state", {
				state: geometry.state,
				previous,
				window: geometry,
			});
		}
	}

	private checkOrientation(): void {
		const current = this.orientation;
		const previous = this.lastOrientation;
		if (current.type === previous.type && current.angle === previous.angle)
			return;
		this.lastOrientation = current;
		this.emitter.emit("orientation", { ...current, previous });
	}
}
