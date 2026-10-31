import { expect } from "vitest";

import { HtmlError, type HtmlErrorCode } from "../src/html";

/** Asserts that an action throws an HTML API error with the expected code. */
export function expectHtmlError(
	action: () => unknown,
	code: HtmlErrorCode,
): void {
	let thrown: unknown;
	try {
		action();
	} catch (error) {
		thrown = error;
	}
	expect(thrown).toBeInstanceOf(HtmlError);
	expect((thrown as HtmlError).code).toBe(code);
}
