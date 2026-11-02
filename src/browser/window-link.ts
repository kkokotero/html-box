import { BrowserError } from "./errors";
import { EventEmitter } from "./event-emitter";
import type {
	ListenerContext,
	ListenerOptions,
	Rect,
	Subscription,
} from "./types";
import { hasWindow, noop } from "./utils";

export interface WindowMessage<M = unknown> {
	readonly data: M;
	readonly origin: string;
	readonly source: Window;
	readonly event: MessageEvent;
}

export interface WindowLinkEvents<M> {
	message: WindowMessage<M>;
	close: { readonly origin: string };
}

/**
 * Link to another window (opened with `Browser.open`, or the window that opened this one).
 * Communicates only with that `Window` and its exact origin.
 */
export class WindowLink<M = unknown> {
	private readonly emitter = new EventEmitter<WindowLinkEvents<M>>(
		new Set(["message", "close"]),
		() => this.sync(),
	);
	private detach: () => void = noop;
	private timer: ReturnType<typeof setInterval> | undefined;
	private closedEmitted = false;

	constructor(
		protected readonly remote: Window | null,
		readonly origin: string,
	) {}

	/** Whether a reference to the other window is available (`false` when opened with `noopener`). */
	get controllable(): boolean {
		return this.remote !== null;
	}

	get window(): Window | null {
		return this.remote;
	}

	/** Whether the window is closed. Returns `false` when there is no reference to inspect. */
	get closed(): boolean {
		return this.remote?.closed ?? false;
	}

	/** Sends a structured-clone message to the exact origin; never uses `"*"`. */
	postMessage(data: M, options: { transfer?: Transferable[] } = {}): void {
		if (!this.remote) {
			throw new BrowserError(
				"UNAVAILABLE",
				"This window cannot be messaged: it was opened without an opener reference (noopener).",
			);
		}
		if (this.remote.closed)
			throw new BrowserError("CLOSED", "The target window is closed.");
		this.remote.postMessage(data, {
			targetOrigin: this.origin,
			...(options.transfer === undefined ? {} : { transfer: options.transfer }),
		});
	}

	focus(): void {
		this.remote?.focus();
	}

	close(): void {
		this.remote?.close();
	}

	on<K extends keyof WindowLinkEvents<M> & string>(
		name: K,
		handler: (event: WindowLinkEvents<M>[K], ctx: ListenerContext) => void,
		options?: ListenerOptions,
	): Subscription {
		return this.emitter.on(name, handler, options);
	}

	private sync(): void {
		const wantsMessages = this.emitter.count("message") > 0;
		if (wantsMessages && this.detach === noop && hasWindow()) {
			const listener = (event: MessageEvent): void => {
				// Accept messages only from this window and this exact origin.
				if (
					!this.remote ||
					event.source !== this.remote ||
					event.origin !== this.origin
				)
					return;
				this.emitter.emit("message", {
					data: event.data as M,
					origin: event.origin,
					source: this.remote,
					event,
				});
			};
			window.addEventListener("message", listener);
			this.detach = () => window.removeEventListener("message", listener);
		} else if (!wantsMessages && this.detach !== noop) {
			this.detach();
			this.detach = noop;
		}

		// Windows have no `close` event, so the `closed` property is checked periodically.
		const wantsClose =
			this.emitter.count("close") > 0 &&
			this.remote !== null &&
			!this.closedEmitted;
		if (wantsClose && this.timer === undefined) {
			this.timer = setInterval(() => {
				if (!this.remote?.closed) return;
				this.closedEmitted = true;
				clearInterval(this.timer);
				this.timer = undefined;
				this.emitter.emit("close", { origin: this.origin });
			}, 250);
		} else if (!wantsClose && this.timer !== undefined) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}
}

/** A window opened with `Browser.open`. */
export class BrowserWindow<M = unknown> extends WindowLink<M> {
	constructor(
		remote: Window | null,
		readonly url: URL,
	) {
		super(remote, url.origin);
	}

	/**
	 * Current position and size (same-origin windows only), or `null` when unavailable.
	 */
	get bounds(): Rect | null {
		const w = this.remote;
		if (!w || w.closed) return null;
		try {
			return {
				x: w.screenX,
				y: w.screenY,
				width: w.outerWidth,
				height: w.outerHeight,
			};
		} catch {
			return null; // cross-origin window
		}
	}

	moveTo(x: number, y: number): void {
		this.remote?.moveTo(x, y);
	}

	resizeTo(width: number, height: number): void {
		this.remote?.resizeTo(width, height);
	}
}

export interface OpenOptions {
	/** Target name. An existing window with this name is reused. */
	name?: string;
	width?: number;
	height?: number;
	left?: number;
	top?: number;
	/** Centers the window on the screen (available area) or over the current window. */
	center?: "screen" | "window";
	/** Opens a popup instead of a tab. Defaults to true when a size or position is provided. */
	popup?: boolean;
	/** Do not retain a reference to the new window. Defaults to true for cross-origin URLs. */
	noopener?: boolean;
	/** Do not send the Referer header. Defaults to true for cross-origin URLs. */
	noreferrer?: boolean;
	/** Focuses the new window. Defaults to true. */
	focus?: boolean;
	/** Closes the window when the signal is aborted. */
	signal?: AbortSignal;
}
