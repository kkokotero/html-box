import { MAX_ROUNDS } from "./constants";
import type { Reactive } from "./reactive";
import { ReactiveError } from "./reactive-error";
import { ReactiveErrorCode } from "./types";

/**
 * Reactives waiting for notification or recomputation, with their graph level.
 *
 * Lower levels are processed first so derived values see updated sources.
 *
 * @internal
 */
const dirty = new Map<Reactive<any>, number>();

/** Current batch nesting depth. */
let batchDepth = 0;

/** Guards against re-entering the flush loop. */
let flushing = false;

/** Number of subscriber handlers currently being invoked. */
let deliveryDepth = 0;

/**
 * Creates the error used when a reactive update cycle exceeds its limit.
 *
 * @returns A reactive cycle error.
 * @internal
 */
export function createCycleError(): ReactiveError {
	return new ReactiveError(
		ReactiveErrorCode.Cycle,
		"Too many updates in a single flush: a subscriber keeps changing the value it listens to.",
	);
}

/**
 * Opens a subscriber delivery scope.
 *
 * @internal
 */
export function beginDelivery(): void {
	deliveryDepth++;
}

/**
 * Closes a subscriber delivery scope.
 *
 * @returns `true` when the outermost delivery just closed.
 * @internal
 */
export function endDelivery(): boolean {
	deliveryDepth--;
	return deliveryDepth === 0;
}

/**
 * Reports whether a subscriber handler is currently being invoked.
 *
 * @returns `true` during subscriber delivery.
 * @internal
 */
export function isDelivering(): boolean {
	return deliveryDepth > 0;
}

/**
 * Marks a reactive as dirty.
 *
 * @param reactive - Reactive to schedule.
 * @param level - Graph level used to order processing.
 * @internal
 */
export function markDirty(reactive: Reactive<any>, level: number): void {
	dirty.set(reactive, level);
}

/**
 * Checks whether a reactive is already scheduled.
 *
 * @param reactive - Reactive to inspect.
 * @returns `true` when the reactive is dirty.
 * @internal
 */
export function hasDirty(reactive: Reactive<any>): boolean {
	return dirty.has(reactive);
}

/**
 * Removes a reactive from the pending set.
 *
 * @param reactive - Reactive to remove.
 * @internal
 */
export function forgetDirty(reactive: Reactive<any>): void {
	dirty.delete(reactive);
}

/**
 * Clears every pending reactive.
 *
 * @internal
 */
export function clearDirty(): void {
	dirty.clear();
}

/**
 * Reports whether a batch is currently open.
 *
 * @returns `true` while at least one batch is active.
 * @internal
 */
export function isBatching(): boolean {
	return batchDepth > 0;
}

/**
 * Opens a batch scope.
 *
 * @internal
 */
export function beginBatch(): void {
	batchDepth++;
}

/**
 * Closes a batch scope.
 *
 * @returns `true` when the outermost batch just closed.
 * @internal
 */
export function endBatch(): boolean {
	batchDepth--;
	return batchDepth === 0;
}

/**
 * Processes every pending reactive in graph-level order.
 *
 * Re-entrant calls return immediately and let the outer loop drain work queued
 * by subscribers. If one reactive exceeds {@link MAX_ROUNDS}, the flush stops
 * with a cycle error.
 *
 * @param process - Callback that recomputes and notifies one reactive.
 * @throws {ReactiveError} If a reactive exceeds the round limit.
 * @internal
 */
export function flushDirty(
	process: (reactive: Reactive<any>) => void,
	discard: (reactive: Reactive<any>) => void,
): void {
	if (flushing) return;
	flushing = true;

	const rounds = new Map<Reactive<any>, number>();
	let current: Reactive<any> | undefined;
	try {
		while (dirty.size > 0) {
			let next: Reactive<any> | undefined;
			let nextLevel = Number.POSITIVE_INFINITY;

			for (const [candidate, level] of dirty) {
				if (level < nextLevel) {
					next = candidate;
					nextLevel = level;
				}
			}

			if (!next) break;
			current = next;
			dirty.delete(next);

			const count = (rounds.get(next) ?? 0) + 1;
			rounds.set(next, count);
			if (count > MAX_ROUNDS) {
				throw createCycleError();
			}
			process(next);
			current = undefined;
		}
	} catch (error) {
		const pending = new Set(dirty.keys());
		if (current) pending.add(current);
		dirty.clear();
		for (const reactive of pending) discard(reactive);
		throw error;
	} finally {
		flushing = false;
	}
}
