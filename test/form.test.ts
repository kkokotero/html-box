import { describe, expect, it, vi } from "vitest";

import { Form } from "../src/form";

function createForm(markup: string): HTMLFormElement {
	const container = document.createElement("div");
	container.innerHTML = `<form>${markup}</form>`;
	return container.querySelector("form")!;
}

describe("Form", () => {
	it("reads successful controls and groups repeated names", () => {
		const form = createForm(`
			<input name="query" value="HTML Box">
			<input name="tag" value="dom">
			<input name="tag" value="typescript">
			<input name="disabled" value="ignored" disabled>
			<input type="checkbox" name="feature" value="yes">
			<input type="checkbox" name="feature" value="enabled" checked>
		`);

		expect(Form.values(form)).toEqual({
			query: "HTML Box",
			tag: ["dom", "typescript"],
			feature: "enabled",
		});
	});

	it("preserves special control names without changing object properties", () => {
		const form = createForm('<input name="__proto__" value="safe">');
		const values = Form.values(form);

		expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
		expect(Object.hasOwn(values, "__proto__")).toBe(true);
		expect(values["__proto__"]).toBe("safe");
	});

	it("resets controls and returns the same form", () => {
		const form = createForm('<input name="title" value="initial">');
		const input = form.elements.namedItem("title") as HTMLInputElement;
		input.value = "changed";

		expect(Form.reset(form)).toBe(form);
		expect(input.value).toBe("initial");
	});

	it("checks native constraints and optionally reports validity", () => {
		const form = createForm('<input name="email" type="email" required>');
		const input = form.elements.namedItem("email") as HTMLInputElement;
		const reportValidity = vi.spyOn(form, "reportValidity");

		expect(Form.validate(form)).toBe(false);
		expect(reportValidity).not.toHaveBeenCalled();
		expect(Form.validate(form, true)).toBe(false);
		expect(reportValidity).toHaveBeenCalledOnce();
		input.value = "person@example.com";
		expect(Form.validate(form)).toBe(true);
	});

	it("serializes URL-encoded data and preserves duplicate names", () => {
		const form = createForm(`
			<input name="query" value="html & dom">
			<input name="tag" value="one">
			<input name="tag" value="two">
	`);
		const serialized = Form.serialize(form);

		expect(serialized).toBeInstanceOf(URLSearchParams);
		expect(serialized.toString()).toBe("query=html+%26+dom&tag=one&tag=two");
		expect(serialized.getAll("tag")).toEqual(["one", "two"]);
	});
});
