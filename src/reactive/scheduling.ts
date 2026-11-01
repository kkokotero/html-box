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
export function flushDirty(process: (reactive: Reactive<any>) => void): void {
	if (flushing) return;
	flushing = true;

	const rounds = new Map<Reactive<any>, number>();
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
			dirty.delete(next);

			const count = (rounds.get(next) ?? 0) + 1;
			rounds.set(next, count);
			if (count > MAX_ROUNDS) {
				throw new ReactiveError(
					ReactiveErrorCode.Cycle,
					"Too many updates in a single flush: a subscriber keeps changing the value it listens to.",
				);
			}
			process(next);
		}
	} catch (error) {
		dirty.clear();
		throw error;
	} finally {
		flushing = false;
	}
}
