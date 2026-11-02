import { BrowserError } from "./errors";
import type { ListenerOptions, Subscription } from "./types";
import { inactive, noop, randomId, reportUncaught } from "./utils";

export interface ChannelEntry {
	payload?: unknown;
	response?: unknown;
}

/** Default schema for arbitrary, untyped messages. */
export type UntypedChannel = Record<string, ChannelEntry>;

type Keys<S> = keyof S & string;
type PayloadOf<S, K extends keyof S> = S[K] extends { payload: infer P }
	? P
	: S[K] extends { payload?: infer P }
		? P
		: undefined;
type ResponseOf<S, K extends keyof S> = S[K] extends { response: infer R }
	? R
	: S[K] extends { response?: infer R }
		? R
		: undefined;

export interface RequestOptions {
	/** Milliseconds before rejecting with TIMEOUT. Defaults to 5000 (`Infinity` disables the timeout). */
	timeout?: number;
	signal?: AbortSignal;
}

export interface ChannelMeta {
	/** ID of the channel instance that sent the message. */
	readonly from: string;
	readonly type: string;
}

export interface ChannelOptions {
	/** Closes the channel when the signal is aborted. */
	signal?: AbortSignal;
}

type PayloadArgs<P> = [P] extends [undefined | void]
	? [payload?: P]
	: [payload: P];

interface Envelope {
	readonly v: 1;
	readonly kind: "event" | "request" | "response";
	readonly id: string;
	readonly from: string;
	readonly type: string;
	readonly payload?: unknown;
	readonly replyTo?: string;
	readonly ok?: boolean;
	readonly error?: string;
}

const isEnvelope = (value: unknown): value is Envelope => {
	const v = value as Partial<Envelope> | null;
	return (
		!!v &&
		typeof v === "object" &&
		v.v === 1 &&
		typeof v.id === "string" &&
		typeof v.from === "string" &&
		typeof v.type === "string" &&
		(v.kind === "event" || v.kind === "request" || v.kind === "response")
	);
};

/**
 * Typed messaging between windows and tabs on the same origin.
 *
 *   interface AppMessages {
 *     theme: { payload: "light" | "dark" };
 *     ping:  { payload: undefined; response: string };
 *   }
 *   const channel = Browser.channel<AppMessages>("app");
 */
export class Channel<S extends object = UntypedChannel> {
	/** Identifies this channel instance and can be used to identify message senders. */
	readonly id = randomId();
	private readonly bc: BroadcastChannel;
	private readonly listeners = new Map<
		string,
		Set<{ run: (payload: unknown, meta: ChannelMeta) => void }>
	>();
	private readonly responders = new Map<
		string,
		Set<{ run: (payload: unknown, meta: ChannelMeta) => unknown }>
	>();
	private readonly pending = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (error: unknown) => void;
			cleanup: () => void;
		}
	>();
	private isClosed = false;
	private detachSignal: () => void = noop;
	private readonly onMessage = (event: MessageEvent): void =>
		this.receive(event.data);

	constructor(
		readonly name: string,
		options: ChannelOptions = {},
	) {
		if (typeof name !== "string" || name === "") {
			throw new BrowserError(
				"INVALID_ARGUMENT",
				"Channel name must be a non-empty string.",
			);
		}
		if (typeof BroadcastChannel === "undefined") {
			throw new BrowserError(
				"NOT_SUPPORTED",
				"BroadcastChannel is not available in this environment.",
			);
		}
		this.bc = new BroadcastChannel(name);
		this.bc.addEventListener("message", this.onMessage);

		const { signal } = options;
		if (signal?.aborted) {
			this.close();
		} else if (signal) {
			const onAbort = () => this.close();
			signal.addEventListener("abort", onAbort, { once: true });
			this.detachSignal = () => signal.removeEventListener("abort", onAbort);
		}
	}

	get closed(): boolean {
		return this.isClosed;
	}

	/** Broadcasts a message to other windows. It is not delivered to this channel instance. */
	send<K extends Keys<S>>(
		type: K,
		...args: PayloadArgs<PayloadOf<S, K>>
	): void {
		this.assertOpen();
		this.post({
			v: 1,
			kind: "event",
			id: randomId(),
			from: this.id,
			type,
			payload: args[0],
		});
	}

	/** Listens for messages of a given type. */
	on<K extends Keys<S>>(
		type: K,
		handler: (payload: PayloadOf<S, K>, meta: ChannelMeta) => void,
		options: ListenerOptions = {},
	): Subscription {
		this.assertOpen();
		return this.register(
			this.listeners,
			type,
			handler as (p: unknown, m: ChannelMeta) => unknown,
			options,
		);
	}

	/**
	 * Handles requests of a given type. The handler may be asynchronous; if it throws, the requester
	 * receives a `REMOTE_ERROR`. When multiple windows handle the request, the first response wins.
	 */
	handle<K extends Keys<S>>(
		type: K,
		handler: (
			payload: PayloadOf<S, K>,
			meta: ChannelMeta,
		) => ResponseOf<S, K> | Promise<ResponseOf<S, K>>,
		options: ListenerOptions = {},
	): Subscription {
		this.assertOpen();
		return this.register(
			this.responders,
			type,
			handler as (p: unknown, m: ChannelMeta) => unknown,
			options,
		);
	}

	/** Sends a request to another window and waits for a response (`TIMEOUT` if none responds). */
	request<K extends Keys<S>>(
		type: K,
		payload: PayloadOf<S, K>,
		options: RequestOptions = {},
	): Promise<ResponseOf<S, K>> {
		return new Promise<ResponseOf<S, K>>((resolve, reject) => {
			if (this.isClosed)
				return reject(
					new BrowserError("CLOSED", "This channel has been closed."),
				);
			const { signal } = options;
			const timeout = options.timeout ?? 5000;
			if (signal?.aborted) return reject(signal.reason);
			if (typeof timeout !== "number" || Number.isNaN(timeout) || timeout < 0) {
				return reject(
					new BrowserError(
						"INVALID_OPTION",
						"Option `timeout` must be a non-negative number.",
					),
				);
			}

			const id = randomId();
			let timer: ReturnType<typeof setTimeout> | undefined;
			const cleanup = (): void => {
				if (timer !== undefined) clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
				this.pending.delete(id);
			};
			const onAbort = (): void => {
				cleanup();
				reject(signal?.reason);
			};
			if (Number.isFinite(timeout)) {
				timer = setTimeout(() => {
					cleanup();
					reject(
						new BrowserError(
							"TIMEOUT",
							`No window answered "${type}" within ${timeout} ms.`,
						),
					);
				}, timeout);
			}
			signal?.addEventListener("abort", onAbort, { once: true });
			this.pending.set(id, {
				resolve: resolve as (v: unknown) => void,
				reject,
				cleanup,
			});

			try {
				this.post({ v: 1, kind: "request", id, from: this.id, type, payload });
			} catch (error) {
				cleanup();
				reject(error);
			}
		});
	}

	/** Closes the channel, removes listeners, and rejects pending requests. Safe to call more than once. */
	close(): void {
		if (this.isClosed) return;
		this.isClosed = true;
		this.detachSignal();
		this.bc.removeEventListener("message", this.onMessage);
		this.bc.close();
		for (const request of this.pending.values()) {
			request.cleanup();
			request.reject(
				new BrowserError("CLOSED", "This channel has been closed."),
			);
		}
		this.pending.clear();
		this.listeners.clear();
		this.responders.clear();
	}

	/* ---- internals -------------------------------------------------------- */

	private assertOpen(): void {
		if (this.isClosed)
			throw new BrowserError("CLOSED", "This channel has been closed.");
	}

	private post(envelope: Envelope): void {
		// BroadcastChannel is origin-scoped and does not accept a targetOrigin argument.
		// oxlint-disable-next-line unicorn/require-post-message-target-origin
		this.bc.postMessage(envelope);
	}

	private register<R>(
		registry: Map<
			string,
			Set<{ run: (payload: unknown, meta: ChannelMeta) => R }>
		>,
		type: string,
		handler: (payload: unknown, meta: ChannelMeta) => R,
		options: ListenerOptions,
	): Subscription {
		if (typeof type !== "string" || type === "") {
			throw new BrowserError(
				"INVALID_ARGUMENT",
				"Message type must be a non-empty string.",
			);
		}
		if (typeof handler !== "function") {
			throw new BrowserError("INVALID_ARGUMENT", "Handler must be a function.");
		}
		if (options.signal?.aborted) return inactive(type);

		let removed = false;
		const cancel = (): void => {
			if (removed) return;
			removed = true;
			options.signal?.removeEventListener("abort", cancel);
			const set = registry.get(type);
			set?.delete(entry);
			if (set?.size === 0) registry.delete(type);
		};
		const entry = {
			run: (payload: unknown, meta: ChannelMeta): R => {
				if (options.once) cancel();
				return handler(payload, meta);
			},
		};
		let set = registry.get(type);
		if (!set) registry.set(type, (set = new Set()));
		set.add(entry);
		options.signal?.addEventListener("abort", cancel, { once: true });

		return {
			name: type,
			get active() {
				return !removed;
			},
			cancel,
		};
	}

	private receive(data: unknown): void {
		if (this.isClosed || !isEnvelope(data) || data.from === this.id) return;
		const meta: ChannelMeta = { from: data.from, type: data.type };

		if (data.kind === "event") {
			for (const entry of Array.from(this.listeners.get(data.type) ?? [])) {
				try {
					entry.run(data.payload, meta);
				} catch (error) {
					reportUncaught(error);
				}
			}
		} else if (data.kind === "request") {
			void this.answer(data, meta);
		} else {
			const request = data.replyTo ? this.pending.get(data.replyTo) : undefined;
			if (!request) return; // respuesta tardía o duplicada (otra ventana ya contestó)
			request.cleanup();
			if (data.ok) request.resolve(data.payload);
			else
				request.reject(
					new BrowserError(
						"REMOTE_ERROR",
						data.error ?? "The other window failed to answer.",
					),
				);
		}
	}

	private async answer(request: Envelope, meta: ChannelMeta): Promise<void> {
		const responder = [...(this.responders.get(request.type) ?? [])][0];
		if (!responder) return; // this window does not handle this message type; another window may respond
		let reply: Envelope;
		try {
			const payload = await responder.run(request.payload, meta);
			reply = {
				v: 1,
				kind: "response",
				id: randomId(),
				from: this.id,
				type: request.type,
				replyTo: request.id,
				ok: true,
				payload,
			};
		} catch (error) {
			reply = {
				v: 1,
				kind: "response",
				id: randomId(),
				from: this.id,
				type: request.type,
				replyTo: request.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
		if (!this.isClosed) {
			try {
				this.post(reply);
			} catch (error) {
				// Report clone failures instead of leaving the request pending.
				this.post({
					...reply,
					ok: false,
					payload: undefined,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}
}
