/**
 * Indicates whether the current runtime exposes a global `document` object.
 *
 * The value is evaluated once when the module is loaded. It can be used to
 * guard browser-only code in environments such as Node.js, workers, or
 * server-side rendering, where `document` is unavailable.
 *
 * @example
 * ```ts
 * if (hasDocument) {
 *   console.log(document.title);
 * }
 * ```
 */
export const hasDocument: boolean = typeof document !== "undefined";
