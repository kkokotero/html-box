import type { FormValue, FormValues } from "./types";

/** Read, reset, validate, and serialize native HTML forms. */
export class Form {
	private constructor() {}

	/**
	 * Read successful form controls into a name-keyed object.
	 *
	 * Disabled controls and unchecked checkboxes or radio buttons are omitted,
	 * matching the native `FormData` rules. Repeated names are represented as
	 * arrays, and file inputs retain their `File` values.
	 *
	 * @param form - Form whose controls should be read.
	 * @returns Form values grouped by control name.
	 */
	static values(form: HTMLFormElement): FormValues {
		const result: FormValues = {};
		for (const [name, value] of new FormData(form).entries()) {
			const current = result[name];
			if (!Object.hasOwn(result, name)) {
				Object.defineProperty(result, name, {
					value,
					writable: true,
					enumerable: true,
					configurable: true,
				});
			} else if (Array.isArray(current)) {
				current.push(value);
			} else {
				result[name] = [current as FormValue, value];
			}
		}
		return result;
	}

	/**
	 * Reset all form controls to their default values.
	 *
	 * @param form - Form to reset.
	 * @returns The same form element.
	 */
	static reset<T extends HTMLFormElement>(form: T): T {
		form.reset();
		return form;
	}

	/**
	 * Check whether all form controls satisfy their native constraints.
	 *
	 * By default this only checks validity. Set `report` to `true` to ask the
	 * browser to display its native validation UI.
	 *
	 * @param form - Form to validate.
	 * @param report - Whether to invoke `reportValidity()`.
	 * @returns `true` when every control is valid; otherwise `false`.
	 */
	static validate(form: HTMLFormElement, report = false): boolean {
		return report ? form.reportValidity() : form.checkValidity();
	}

	/**
	 * Serialize successful form controls as URL-encoded form data.
	 *
	 * Repeated names are preserved. File controls are represented by their file
	 * names because URL-encoded data cannot carry file contents; use
	 * `new FormData(form)` when submitting files.
	 *
	 * @param form - Form to serialize.
	 * @returns URL-encoded form data, without a leading question mark.
	 */
	static serialize(form: HTMLFormElement): URLSearchParams {
		const params = new URLSearchParams();
		for (const [name, value] of new FormData(form).entries()) {
			params.append(name, typeof value === "string" ? value : value.name);
		}
		return params;
	}
}
