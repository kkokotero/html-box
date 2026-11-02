import { BrowserError } from "./errors";
import type { ListenerContext, ListenerOptions, Subscription } from "./types";
import { inactive, reportUncaught } from "./utils";

export class EventEmitter<E extends object> {
	private readonly map = new Map<
		keyof E,
		Set<{ run: (payload: unknown) => void }>
	>();

	constructor(
		private readonly valid: ReadonlySet<string>,
		private readonly onChange: () => void,
	) {}

	on<K extends keyof E & string>(
		name: K,
		handler: (payload: E[K], ctx: ListenerContext) => void,
		options: ListenerOptions = {},
	): Subscription {
		if (!this.valid.has(name)) {
			throw new BrowserError(
				"INVALID_ARGUMENT",
				`Unknown event "${String(name)}". Expected one of: ${[...this.valid].join(", ")}.`,
			);
		}
		if (typeof handler !== "function") {
			throw new BrowserError("INVALID_ARGUMENT", "Handler must be a function.");
		}
		if (options.signal?.aborted) return inactive(name);

		let removed = false;
		const cancel = (): void => {
			if (removed) return;
			removed = true;
			options.signal?.removeEventListener("abort", cancel);
			const set = this.map.get(name);
			set?.delete(entry);
			if (set?.size === 0) this.map.delete(name);
			this.onChange();
		};
		const entry = {
			run: (payload: unknown): void => {
				if (removed) return;
				if (options.once) cancel();
				try {
					handler(payload as E[K], { cancel });
				} catch (error) {
					reportUncaught(error); // un handler que falla no impide que corran los demás
				}
			},
		};

		let set = this.map.get(name);
		if (!set) this.map.set(name, (set = new Set()));
		set.add(entry);
		options.signal?.addEventListener("abort", cancel, { once: true });
		this.onChange();

		return {
			name,
			get active() {
				return !removed;
			},
			cancel,
		};
	}

	emit<K extends keyof E>(name: K, payload: E[K]): void {
		const set = this.map.get(name);
		if (set) {
			for (const entry of Array.from(set)) entry.run(payload);
		}
	}

	count(name?: keyof E): number {
		if (name !== undefined) return this.map.get(name)?.size ?? 0;
		let total = 0;
		for (const set of this.map.values()) total += set.size;
		return total;
	}

	clear(): void {
		this.map.clear();
		this.onChange();
	}
}
