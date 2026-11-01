/**
 * Sentinel used when no global `document` exists, so server-side environments
 * still get a stable key for tracking active transitions.
 */
export const SERVER_KEY: object = {};

/** Media query used to detect the user's reduced-motion preference. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** No-operation callback. */
export const NOOP: () => void = () => {};
