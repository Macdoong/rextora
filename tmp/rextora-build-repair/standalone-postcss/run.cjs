const fs = require("node:fs");
const path = require("node:path");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const autoprefixer = require("autoprefixer");

const root = process.cwd();
const inputPath = path.join(root, "app", "globals.css");
const outputPath = path.join(
  root,
  "tmp",
  "rextora-build-repair",
  "standalone-postcss",
  "output.css",
);
const input = fs.readFileSync(inputPath, "utf8");
const startedAt = Date.now();

postcss([tailwind(), autoprefixer()])
  .process(input, { from: inputPath, to: outputPath })
  .then((result) => {
    fs.writeFileSync(outputPath, result.css);
    const report = {
      passed: true,
      durationMs: Date.now() - startedAt,
      inputBytes: Buffer.byteLength(input),
      outputBytes: Buffer.byteLength(result.css),
      warnings: result.warnings().map((warning) => warning.toString()),
      plugins: ["@tailwindcss/postcss@4.3.0", "autoprefixer@10.5.0"],
      memoryUsage: process.memoryUsage(),
    };
    fs.writeFileSync(
      path.join(path.dirname(outputPath), "result.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  })
  .catch((error) => {
    const report = {
      passed: false,
      durationMs: Date.now() - startedAt,
      inputBytes: Buffer.byteLength(input),
      plugins: ["@tailwindcss/postcss@4.3.0", "autoprefixer@10.5.0"],
      error: error instanceof Error ? error.stack : String(error),
      memoryUsage: process.memoryUsage(),
    };
    fs.writeFileSync(
      path.join(path.dirname(outputPath), "result.json"),
      JSON.stringify(report, null, 2),
    );
    console.error(JSON.stringify(report));
    process.exitCode = 1;
  });
