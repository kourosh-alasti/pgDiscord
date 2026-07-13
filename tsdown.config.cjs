const { defineConfig } = require("tsdown");

module.exports = defineConfig({
  entry: ["src/index.ts", "src/register-commands.ts"],
  outDir: "dist",
  format: "cjs",
  platform: "node",
  target: "node18",
  dts: true,
  sourcemap: true,
  clean: true,
});
