import { EventEmitter } from "./event-emitter";
import type {
	ListenerContext,
	ListenerOptions,
	NetworkEvents,
	NetworkInfo,
	Subscription,
} from "./types";
import { hasWindow, noop } from "./utils";

interface NetworkInformationLike extends EventTarget {
	readonly type?: NetworkInfo["type"];
	readonly effectiveType?: NetworkInfo["effectiveType"];
	readonly downlink?: number;
	readonly rtt?: number;
	readonly saveData?: boolean;
}

export class Network {
	private readonly emitter = new EventEmitter<NetworkEvents>(
		new Set(["online", "offline", "change"]),
		() => this.sync(),
	);
	private detach: () => void = noop;
	private last: NetworkInfo | null = null;

	private get connection(): NetworkInformationLike | null {
		if (typeof navigator === "undefined") return null;
		return (
			(navigator as Navigator & { connection?: NetworkInformationLike })
				.connection ?? null
		);
	}

	get online(): boolean {
		return typeof navigator === "undefined" ? true : navigator.onLine !== false;
	}

	/** Current network information, read on demand. */
	get info(): NetworkInfo {
		const c = this.connection;
		return {
			online: this.online,
			type: c?.type ?? null,
			effectiveType: c?.effectiveType ?? null,
			downlink: c?.downlink ?? null,
			rtt: c?.rtt ?? null,
			saveData: c?.saveData === true,
		};
	}

	on<K extends keyof NetworkEvents & string>(
		name: K,
		handler: (event: NetworkEvents[K], ctx: ListenerContext) => void,
		options?: ListenerOptions,
	): Subscription {
		return this.emitter.on(name, handler, options);
	}

	/** Resolves when online (immediately if already online). Rejects if the signal is aborted. */
	waitUntilOnline(options: { signal?: AbortSignal } = {}): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const { signal } = options;
			if (signal?.aborted) return reject(signal.reason);
			if (this.online) return resolve();
			const subscription = this.on("online", () => {
				signal?.removeEventListener("abort", onAbort);
				resolve();
			});
			const onAbort = (): void => {
				subscription.cancel();
				reject(signal?.reason);
			};
			signal?.addEventListener("abort", onAbort, { once: true });
		});
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
		if (!hasWindow()) return;
		this.last = this.info;

		const onChange = (): void => {
			const info = this.info;
			const previous = this.last as NetworkInfo;
			const same = (Object.keys(info) as (keyof NetworkInfo)[]).every((key) =>
				Object.is(info[key], previous[key]),
			);
			if (same) return;
			this.last = info;
			if (info.online !== previous.online)
				this.emitter.emit(info.online ? "online" : "offline", { info });
			this.emitter.emit("change", { info, previous });
		};

		const connection = this.connection;
		window.addEventListener("online", onChange);
		window.addEventListener("offline", onChange);
		connection?.addEventListener("change", onChange);
		this.detach = () => {
			window.removeEventListener("online", onChange);
			window.removeEventListener("offline", onChange);
			connection?.removeEventListener("change", onChange);
		};
	}
}
