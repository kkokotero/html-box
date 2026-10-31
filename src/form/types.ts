/** A value returned by a successful form control. */
export type FormValue = string | File;

/** Form data grouped by control name; duplicate names produce arrays. */
export type FormValues = Record<string, FormValue | FormValue[]>;
