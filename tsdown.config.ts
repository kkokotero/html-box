import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
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
