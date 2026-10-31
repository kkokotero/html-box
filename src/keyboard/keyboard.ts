import { KeyboardError, KeyboardErrorCode } from "./keyboard-error";
import type {
	InputsMode,
	KeyInfo,
	KeypressHandler,
	KeypressOptions,
	KeyboardOptions,
	MatchMode,
	Off,
	Platform,
	ShortcutDefaults,
	ShortcutHandle,
	ShortcutHandler,
	ShortcutOptions,
	Shortcut,
	Subscription,
	ValidShortcut,
} from "./types";
import {
	blockedByInput,
	describe,
	detectPlatform,
	matchesShortcut,
	noop,
	parseShortcut,
	reportHandlerError,
	type Described,
	type Parsed,
} from "./utils";

type EventType = "keydown" | "keyup";

interface Binding {
	readonly kind: "shortcut" | "keypress";
	readonly parsed: Parsed | null;
	readonly handler: unknown;
	readonly options: {
		exact: boolean;
		repeat: boolean;
		inputs: InputsMode;
		preventDefault: boolean;
		stopPropagation: boolean;
	};
	enabled: boolean;
	readonly close: Off;
	readonly run: (event: KeyboardEvent, described: Described) => void;
}

interface Dispatcher {
	readonly target: EventTarget;
	readonly type: EventType;
	readonly capture: boolean;
	readonly bindings: Set<Binding>;
	readonly listener: (event: Event) => void;
}

const inactive = (name: string): ShortcutHandle => ({
	name,
	combo: name,
	active: false,
	enabled: false,
	cancel: noop,
	close: noop,
});

/**
 * Registers and dispatches keyboard shortcuts for a target.
 *
 * Shortcuts can be declared with single key names or modifier combinations.
 * Literal values receive compile-time validation and editor autocomplete. The
 * default input policy protects editable fields from printable shortcuts.
 *
 * @example
 * ```ts
 * const keyboard = new Keyboard(document, {
 *   shortcuts: { "ctrl+k": () => openPalette(), escape: () => closePalette() },
 * });
 * keyboard.close();
 * ```
 */
export class Keyboard {
	private readonly root: EventTarget | null;
	private readonly defaults: Required<
		Pick<
			ShortcutDefaults,
			"match" | "exact" | "repeat" | "inputs" | "event" | "capture"
		>
	> &
		Pick<ShortcutDefaults, "preventDefault" | "stopPropagation" | "target">;
	private readonly forcedPlatform: Platform | undefined;
	private cachedPlatform: Platform | undefined;

	private readonly dispatchers = new Map<
		EventTarget,
		Map<string, Dispatcher>
	>();
	private readonly bindings = new Set<Binding>();
	private isClosed = false;
	private detachSignal: Off = noop;

	/**
	 * @param target Element, document, or window that receives keyboard events. Elements receive
	 * events only when they or their descendants have focus; use `document` for global shortcuts.
	 * Nullish targets create an inert instance.
	 * @param options Shortcut defaults, initial registrations, platform override, and abort signal.
	 * @throws {@link KeyboardError} If the target or options are invalid.
	 */
	constructor(
		target: EventTarget | null | undefined,
		options: KeyboardOptions = {},
	) {
		if (
			target != null &&
			typeof (target as EventTarget).addEventListener !== "function"
		) {
			throw new KeyboardError(
				KeyboardErrorCode.InvalidTarget,
				"Target must be an EventTarget (e.g. an Element) or null.",
			);
		}
		this.root = target ?? null;
		this.forcedPlatform = options.platform;

		const d = options.defaults ?? {};
		this.defaults = {
			match: d.match ?? "key",
			exact: d.exact ?? true,
			repeat: d.repeat ?? false,
			inputs: d.inputs ?? "auto",
			event: d.event ?? "keydown",
			capture: d.capture ?? false,
			...(d.preventDefault === undefined
				? {}
				: { preventDefault: d.preventDefault }),
			...(d.stopPropagation === undefined
				? {}
				: { stopPropagation: d.stopPropagation }),
			...(d.target === undefined ? {} : { target: d.target }),
		};
		this.assertMode("match", this.defaults.match, ["key", "code"]);
		this.assertMode("inputs", this.defaults.inputs, [
			"auto",
			"ignore",
			"allow",
		]);
		this.assertMode("event", this.defaults.event, ["keydown", "keyup"]);

		const { signal } = options;
		if (signal?.aborted) {
			this.isClosed = true;
			return;
		}
		if (signal) {
			const onAbort = () => this.close();
			signal.addEventListener("abort", onAbort, { once: true });
			this.detachSignal = () => signal.removeEventListener("abort", onAbort);
		}

		const map = options.shortcuts as
			| Record<string, ShortcutHandler>
			| undefined;
		if (map) {
			for (const [shortcut, handler] of Object.entries(map))
				this.register(shortcut, handler);
		}
	}

	/* Instance state */

	/** Indicates whether the instance has been closed. */
	get closed(): boolean {
		return this.isClosed;
	}

	/** Platform used to resolve the `mod` modifier. */
	get platform(): Platform {
		return (this.cachedPlatform ??= this.forcedPlatform ?? detectPlatform());
	}

	/** Canonical forms of currently registered shortcuts. */
	get shortcuts(): readonly string[] {
		const list: string[] = [];
		for (const binding of this.bindings)
			if (binding.parsed) list.push(binding.parsed.canonical);
		return list;
	}

	/** Returns the number of active shortcut and keypress registrations. */
	listenerCount(): number {
		return this.bindings.size;
	}

	/**
	 * Checks whether an equivalent shortcut is currently registered.
	 *
	 * @param shortcut - Shortcut to normalize and compare.
	 * @returns True when a matching registration exists.
	 * @throws {@link KeyboardError} If the shortcut string is invalid.
	 */
	has(shortcut: string): boolean {
		const canonical = parseShortcut(
			shortcut,
			this.defaults.match,
			this.platform,
		).canonical;
		for (const binding of this.bindings)
			if (binding.parsed?.canonical === canonical) return true;
		return false;
	}

	/* Shortcuts */

	/**
	 * Registers one or more shortcuts with the same handler.
	 *
	 * @param shortcut - A single key, shortcut combination, or array of combinations.
	 * @param handler - Callback invoked for each matching shortcut.
	 * @param options - Matching, input, and listener lifecycle options.
	 * @returns A subscription that cancels all registrations made by this call.
	 * @throws {@link KeyboardError} If the instance is closed or any shortcut or option is invalid.
	 */
	on<S extends Shortcut>(
		shortcut: S & ValidShortcut<S>,
		handler: ShortcutHandler,
		options?: ShortcutOptions,
	): Subscription;
	on<S extends string>(
		shortcut: S & ValidShortcut<S>,
		handler: ShortcutHandler,
		options?: ShortcutOptions,
	): Subscription;
	on<S extends Shortcut>(
		shortcuts: readonly (S & ValidShortcut<S>)[],
		handler: ShortcutHandler,
		options?: ShortcutOptions,
	): Subscription;
	on<S extends string>(
		shortcuts: readonly (S & ValidShortcut<S>)[],
		handler: ShortcutHandler,
		options?: ShortcutOptions,
	): Subscription;
	on(
		shortcut: string | readonly string[],
		handler: ShortcutHandler,
		options: ShortcutOptions = {},
	): Subscription {
		if (typeof shortcut === "string")
			return this.register(shortcut, handler, options);

		this.assertOpen();
		const handles = (shortcut as readonly string[]).map((item) =>
			this.register(item, handler, options),
		);
		return {
			name: handles.map((h) => h.name).join(","),
			get active() {
				return handles.some((h) => h.active);
			},
			cancel: () => handles.forEach((h) => h.close()),
		};
	}

	/**
	 * Registers a shortcut that is removed after its first invocation.
	 *
	 * @param shortcut - Single key or shortcut combination.
	 * @param handler - Callback invoked once when the shortcut matches.
	 * @param options - Matching and listener lifecycle options.
	 * @returns A subscription for the one-shot shortcut.
	 */
	once<S extends Shortcut>(
		shortcut: S & ValidShortcut<S>,
		handler: ShortcutHandler,
		options?: Omit<ShortcutOptions, "once">,
	): Subscription;
	once<S extends string>(
		shortcut: S & ValidShortcut<S>,
		handler: ShortcutHandler,
		options?: Omit<ShortcutOptions, "once">,
	): Subscription;
	once(
		shortcut: string,
		handler: ShortcutHandler,
		options: Omit<ShortcutOptions, "once"> = {},
	): Subscription {
		return this.register(shortcut, handler, { ...options, once: true });
	}

	/**
	 * Registers a shortcut with an independently controllable handle.
	 *
	 * @param shortcut - Single key or shortcut combination.
	 * @param handler - Callback invoked when the shortcut matches.
	 * @param options - Matching and listener lifecycle options.
	 * @returns A handle that can pause, resume, or remove the registration.
	 * @throws {@link KeyboardError} If the instance, shortcut, handler, or options are invalid.
	 */
	register<S extends Shortcut>(
		shortcut: S & ValidShortcut<S>,
		handler: ShortcutHandler,
		options?: ShortcutOptions,
	): ShortcutHandle;
	register<S extends string>(
		shortcut: S & ValidShortcut<S>,
		handler: ShortcutHandler,
		options?: ShortcutOptions,
	): ShortcutHandle;
	register(
		shortcut: string,
		handler: ShortcutHandler,
		options: ShortcutOptions = {},
	): ShortcutHandle {
		this.assertOpen();
		if (typeof handler !== "function") {
			throw new KeyboardError(
				KeyboardErrorCode.InvalidHandler,
				"Handler must be a function.",
			);
		}
		const resolved = this.resolve(options);
		const parsed = parseShortcut(shortcut, resolved.match, this.platform);
		return this.bind("shortcut", parsed, handler, resolved, options);
	}

	/**
	 * Registers a handler for normalized keyboard events without shortcut matching.
	 *
	 * @param handler - Callback receiving normalized key details.
	 * @param options - Event type, target, input policy, and lifecycle options.
	 * @returns A subscription that cancels the handler.
	 * @throws {@link KeyboardError} If the instance is closed or the handler or options are invalid.
	 */
	keypress(
		handler: KeypressHandler,
		options: KeypressOptions = {},
	): Subscription {
		this.assertOpen();
		if (typeof handler !== "function") {
			throw new KeyboardError(
				KeyboardErrorCode.InvalidHandler,
				"Handler must be a function.",
			);
		}
		const resolved = {
			...this.resolve({}),
			event: options.event ?? this.defaults.event,
			...(options.target === undefined && this.defaults.target === undefined
				? {}
				: { target: options.target ?? this.defaults.target }),
			capture: options.capture ?? false,
			repeat: options.repeat ?? true,
			inputs: options.inputs ?? "allow",
			preventDefault: options.preventDefault ?? false,
			stopPropagation: options.stopPropagation ?? false,
		};
		this.assertMode("event", resolved.event, ["keydown", "keyup"]);
		this.assertMode("inputs", resolved.inputs, ["auto", "ignore", "allow"]);
		return this.bind("keypress", null, handler, resolved, options);
	}

	/**
	 * Removes shortcuts. Without arguments, removes all shortcuts; with a shortcut,
	 * removes equivalent registrations; with a handler, removes only its registrations.
	 */
	/**
	 * Removes matching shortcut registrations.
	 *
	 * @param shortcut - Optional shortcut to remove. Omit to remove every shortcut.
	 * @param handler - Optional callback filter.
	 */
	off(shortcut?: string, handler?: ShortcutHandler): void {
		const canonical =
			shortcut === undefined
				? null
				: parseShortcut(shortcut, this.defaults.match, this.platform).canonical;
		for (const binding of this.bindings) {
			if (canonical !== null && binding.parsed?.canonical !== canonical)
				continue;
			if (handler !== undefined && binding.handler !== handler) continue;
			binding.close();
		}
	}

	/* Utilities */

	/**
	 * Checks whether an event matches a shortcut without registering a listener.
	 * @example `element.addEventListener("keydown", (event) => Keyboard.matches(event, "ctrl+k"));`
	 */
	static matches<S extends Shortcut>(
		event: KeyboardEvent,
		shortcut: S & ValidShortcut<S>,
		options?: { match?: MatchMode; exact?: boolean; platform?: Platform },
	): boolean;
	static matches<S extends string>(
		event: KeyboardEvent,
		shortcut: S & ValidShortcut<S>,
		options?: { match?: MatchMode; exact?: boolean; platform?: Platform },
	): boolean;
	static matches<S extends string>(
		event: KeyboardEvent,
		shortcut: S & ValidShortcut<S>,
		options: { match?: MatchMode; exact?: boolean; platform?: Platform } = {},
	): boolean {
		const platform = options.platform ?? detectPlatform();
		const parsed = parseShortcut(shortcut, options.match ?? "key", platform);
		if (typeof event.key !== "string") return false;
		const described = describe(event);
		return (
			!described.composing &&
			!described.altGraph &&
			matchesShortcut(parsed, described, event, options.exact ?? true)
		);
	}

	/* Lifecycle */

	/** Removes all shortcuts and native event listeners. Safe to call repeatedly. */
	close(): void {
		if (
			this.isClosed &&
			this.bindings.size === 0 &&
			this.dispatchers.size === 0
		)
			return;
		this.isClosed = true;
		this.detachSignal();
		for (const binding of this.bindings) binding.close();
		this.bindings.clear();
		this.dispatchers.clear();
	}

	/* Internal implementation */

	private assertOpen(): void {
		if (this.isClosed)
			throw new KeyboardError(
				KeyboardErrorCode.Closed,
				"This Keyboard has been closed.",
			);
	}

	private assertMode(
		name: string,
		value: unknown,
		allowed: readonly string[],
	): void {
		if (!allowed.includes(value as string)) {
			throw new KeyboardError(
				KeyboardErrorCode.InvalidOption,
				`Option \`${name}\` must be one of: ${allowed.join(", ")}.`,
			);
		}
	}

	private resolve(options: ShortcutOptions) {
		const resolved = {
			match: options.match ?? this.defaults.match,
			exact: options.exact ?? this.defaults.exact,
			repeat: options.repeat ?? this.defaults.repeat,
			inputs: options.inputs ?? this.defaults.inputs,
			event: options.event ?? this.defaults.event,
			capture: options.capture ?? this.defaults.capture,
			preventDefault:
				options.preventDefault ?? this.defaults.preventDefault ?? false,
			stopPropagation:
				options.stopPropagation ?? this.defaults.stopPropagation ?? false,
			...(options.target === undefined && this.defaults.target === undefined
				? {}
				: { target: options.target ?? this.defaults.target }),
		};
		this.assertMode("match", resolved.match, ["key", "code"]);
		this.assertMode("inputs", resolved.inputs, ["auto", "ignore", "allow"]);
		this.assertMode("event", resolved.event, ["keydown", "keyup"]);
		return resolved;
	}

	private acquire(
		target: EventTarget,
		type: EventType,
		capture: boolean,
	): Dispatcher {
		let byKey = this.dispatchers.get(target);
		if (!byKey) this.dispatchers.set(target, (byKey = new Map()));
		const key = `${type}:${capture}`;
		let dispatcher = byKey.get(key);
		if (!dispatcher) {
			const created: Dispatcher = {
				target,
				type,
				capture,
				bindings: new Set(),
				listener: (event) => this.dispatch(created, event as KeyboardEvent),
			};
			target.addEventListener(type, created.listener, { capture });
			byKey.set(key, (dispatcher = created));
		}
		return dispatcher;
	}

	private release(dispatcher: Dispatcher): void {
		if (dispatcher.bindings.size > 0) return;
		dispatcher.target.removeEventListener(
			dispatcher.type,
			dispatcher.listener,
			{ capture: dispatcher.capture },
		);
		const byKey = this.dispatchers.get(dispatcher.target);
		byKey?.delete(`${dispatcher.type}:${dispatcher.capture}`);
		if (byKey?.size === 0) this.dispatchers.delete(dispatcher.target);
	}

	private bind(
		kind: "shortcut" | "keypress",
		parsed: Parsed | null,
		handler: unknown,
		resolved: {
			exact?: boolean;
			repeat: boolean;
			inputs: InputsMode;
			preventDefault: boolean;
			stopPropagation: boolean;
			event: EventType;
			capture: boolean;
			target?: EventTarget | null;
		},
		options: { once?: boolean; signal?: AbortSignal },
	): ShortcutHandle {
		const name = parsed?.canonical ?? "keypress";
		const target = resolved.target ?? this.root;
		if (!this.root || !target || options.signal?.aborted) return inactive(name);

		const dispatcher = this.acquire(target, resolved.event, resolved.capture);
		let removed = false;

		const close: Off = () => {
			if (removed) return;
			removed = true;
			options.signal?.removeEventListener("abort", close);
			dispatcher.bindings.delete(binding);
			this.bindings.delete(binding);
			this.release(dispatcher);
		};

		const binding: Binding = {
			kind,
			parsed,
			handler,
			options: {
				exact: resolved.exact ?? true,
				repeat: resolved.repeat,
				inputs: resolved.inputs,
				preventDefault: resolved.preventDefault,
				stopPropagation: resolved.stopPropagation,
			},
			enabled: true,
			close,
			run: (event, described) => {
				if (removed) return;
				if (options.once) close();
				try {
					if (kind === "shortcut") {
						(handler as ShortcutHandler)(event, {
							shortcut: name,
							target: described.target,
							cancel: close,
						});
					} else {
						const info: KeyInfo = {
							key: described.best,
							rawKey: event.key,
							code: event.code,
							combo: described.combo,
							modifiers: described.mods,
							repeat: event.repeat,
							altGraph: described.altGraph,
							composing: described.composing,
							editable: described.editable,
							target: described.target,
							event,
						};
						(handler as KeypressHandler)(info, { cancel: close });
					}
				} catch (error) {
					reportHandlerError(error); // A failing handler must not block other handlers.
				}
			},
		};

		dispatcher.bindings.add(binding);
		this.bindings.add(binding);
		options.signal?.addEventListener("abort", close, { once: true });

		return {
			name,
			combo: name,
			get active() {
				return !removed;
			},
			get enabled() {
				return binding.enabled;
			},
			set enabled(value: boolean) {
				binding.enabled = Boolean(value);
			},
			cancel: close,
			close,
		};
	}

	private dispatch(dispatcher: Dispatcher, event: KeyboardEvent): void {
		// Algunos autofill y herramientas disparan "keydown" sin `key`.
		if (this.isClosed || typeof event.key !== "string") return;

		let described: Described | null = null;
		for (const binding of dispatcher.bindings) {
			if (!binding.enabled) continue;
			described ??= describe(event);

			if (binding.kind === "shortcut") {
				if (described.composing || described.altGraph) continue; // IME y AltGr escriben texto
				if (
					!binding.parsed ||
					!matchesShortcut(
						binding.parsed,
						described,
						event,
						binding.options.exact,
					)
				)
					continue;
			}
			if (!binding.options.repeat && event.repeat) continue;
			if (
				blockedByInput(
					binding.options.inputs,
					binding.parsed,
					described,
					event,
					this.platform,
				)
			)
				continue;

			if (binding.options.preventDefault) event.preventDefault();
			if (binding.options.stopPropagation) event.stopPropagation();
			binding.run(event, described);
		}
	}
}

export default Keyboard;
