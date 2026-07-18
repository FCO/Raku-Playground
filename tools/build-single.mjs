// Builds dist/raku-playground.html — the whole playground (app, styles,
// CodeMirror bundle and the 77MB Rakudo-JS runtime) inlined into ONE html
// file that can be shared and opened from anywhere, including file://.
//
// The runtime runs in a Web Worker. A file:// page can't load a separate
// worker file, so the worker (glue + world-sim + perl6.js) is emitted as a
// <script type="text/plain" id="worker-src"> block; raku-runtime.js turns that
// into a Blob-URL Worker (spawn() detects the block). The worker sees
// PERL6_EMBEDDED and polls for evalP6 instead of fetching perl6.js.
//
// Usage:  node tools/build-single.mjs
// Needs esbuild on PATH, or pass its binary via the ESBUILD env var.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const esbuild = process.env.ESBUILD ?? "esbuild";
const read = (p) => readFileSync(join(root, p), "utf8");

// inline scripts must not contain a literal "</script"; the replacement is
// identical inside JS strings ("\/" === "/") and can't occur in code otherwise
const escapeScript = (js) => js.replaceAll("</script", "<\\/script");

const appJs = escapeScript(execFileSync(
    esbuild,
    [join(root, "docs/playground.js"), "--bundle", "--format=iife", "--minify"],
    { encoding: "utf8", maxBuffer: 1 << 28 },
));
const css = read("docs/style.css");

// The whole worker in one blob: the flag, then world-sim (defines WorldSim),
// then the worker glue (wrapped so its top-level consts don't collide), then
// perl6.js (defines evalP6, runs last — the glue's embedded path polls for it).
const workerSrc = escapeScript([
    "self.PERL6_EMBEDDED = true;",
    read("docs/world-sim.js"),
    "(function(){\n" + read("docs/raku-worker.js") + "\n})();",
    read("docs/perl6.js"),
].join("\n"));

const indexHtml = read("docs/index.html");
const body = indexHtml.match(/<body>([\s\S]*)<\/body>/)[1];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Raku Playground</title>
<style>
${css}
</style>
</head>
<body>
${body}
<script type="text/plain" id="worker-src">
${workerSrc}
</script>
<script>
${appJs}
</script>
</body>
</html>
`;

mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist/raku-playground.html");
writeFileSync(out, html);
console.log(`built ${out} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
