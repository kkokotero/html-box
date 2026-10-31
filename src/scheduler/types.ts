/** A scheduled operation that can be canceled. */
export interface CancelableTask {
	/** Whether the task has been canceled or has completed. */
	readonly canceled: boolean;
	/** Cancel pending work. Repeated calls have no effect. */
	cancel(): void;
}

/** A cancelable timer that can also be awaited. Cancellation resolves the wait. */
export interface CancelableDelay extends CancelableTask {
	/** Resolves when the timer completes or is canceled. */
	readonly promise: Promise<void>;
}

/** A cancelable task that can be invoked immediately. */
export type ScheduledCall<
	Args extends unknown[] = unknown[],
	Result = void,
> = ((...args: Args) => Result) &
	CancelableTask & {
		/** Invoke the callback immediately with the supplied arguments. */
		call(...args: Args): Result;
	};

/** A cancelable task that can also be flushed immediately. */
export interface FlushableTask extends CancelableTask {
	/** Run pending work immediately, if any. */
	flush(): void;
}

/** A cancelable task that can be paused and resumed. */
export interface RepeatTask extends CancelableTask {
	/** Whether the repeating task is currently paused. */
	readonly paused: boolean;
	/** Pause future iterations while preserving the task. */
	pause(): this;
	/** Resume iterations after a pause. */
	resume(): this;
}
