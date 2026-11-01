import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		query: "src/query/index.ts",
		interaction: "src/interaction/index.ts",
		pointer: "src/pointer/index.ts",
		html: "src/html/index.ts",
		"safe-zone": "src/safe-zone/index.ts",
		viewport: "src/viewport/index.ts",
		keyboard: "src/keyboard/index.ts",
		scheduler: "src/scheduler/index.ts",
		element: "src/element/index.ts",
		form: "src/form/index.ts",
		"view-transition": "src/view-transition/index.ts",
	},
	target: "esnext",
	format: ["esm"],
	platform: "neutral",
	outDir: "dist",
	clean: true,
	minify: false,
	treeshake: true,
	dts: true,
	outputOptions: {
		comments: false,
	},
});
