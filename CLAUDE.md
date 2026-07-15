# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Raku::Playground is a Swift-Playgrounds-inspired page that runs Raku entirely in the browser: a CodeMirror 6 editor, a Run button, and an output pane, powered by Rakudo compiled to JavaScript. It is a pure static site under `docs/` (GitHub Pages-friendly, no backend), wrapped in an App::Mi6-managed Raku distribution.

## Commands

```sh
# Serve the playground locally
python3 -m http.server 8000 --directory docs
# then open http://localhost:8000 (first load takes ~1-2 min: perl6.js is 77MB)

# Run the Raku test suite (same as CI)
prove6 -I. t

# Run a single test file
raku -I. t/01-basic.rakutest

# Regenerate README.md from the pod in the module, update META6.json (App::Mi6)
mi6 build
```

CI (`.github/workflows/test.yml`) runs `prove6 -I. t` on Linux/macOS/Windows against the latest Raku.

## Architecture

The playground is framework-free vanilla JS in `docs/`:

- `docs/perl6.js` — Rakudo compiled via its JavaScript backend, bundled with Parcel (~77MB, copied verbatim from `../MemoizedDOM/examples/todo-webperl/`). When loaded it sets `window.evalP6(code)`, which synchronously evaluates Raku source (the UI thread blocks during a run). Raku code can reach JS/DOM via `EVAL :lang<JavaScript>`.
- `docs/raku-runtime.js` — ~100-line shim around perl6.js (replaces WebPerl's webperl.js entirely). Key constraints it encodes:
  - `window.NQP_STDOUT` must be defined **before** perl6.js loads; what it receives is HTML (ansi-to-html with escapeXML: user text entity-encoded, ANSI colors as real `<span>` tags). The shim decodes to plain text via `DOMParser` — do not just strip `<`/`>`, that mangles the span tags Rakudo uses for compile errors.
  - There is **no NQP_STDERR hook** in perl6.js: stderr is hard-wired to `console.error`, resolved at call time, so the shim wraps `console.error` and forwards to the output pane only during a run plus a short grace window (stderr is buffered and can flush a tick after `evalP6` returns). In practice `note`/`warn` arrive this way, but **`die` messages and compile errors arrive through NQP_STDOUT** (Rakudo's own EVAL error handler prints them), so they render as regular output, not in the stderr color.
  - Raku `exit()` throws a JS exception whose constructor is named `Exit` — treated as a clean end-of-run, not an error.
  - **Cross-eval state does not persist**: each `evalP6` call compiles a fresh unit; lexicals from a previous run are not visible in the next (verified).
  - States: `uninitialized → loading → ready → running → ready` (or `error`).
- `docs/playground.js` — wires the editor, level/speed selects, Run/Step/Clear/Example buttons, instructions panel, status badge, output pane, world pane, and preview pane to the shim.
- **Preview pane** (`#preview`, Free play mode): a plain div in the main document that Raku code renders into via `EVAL :lang<JavaScript>, 'return PREVIEW'` (`window.PREVIEW` is set by playground.js). It is emptied at the start of every run. Caveats: user code shares the page's DOM (it can touch the playground UI), and event listeners attached to `document` by earlier runs linger.
- **Puzzle world** (`docs/world.js`, Swift-Playgrounds-style levels): because `evalP6` blocks the UI thread, commands are **recorded during eval and animated afterwards**. A single-line Raku prelude (`PRELUDE`) defines the kebab-case commands `move-forward`, `turn-left`, `turn-right`, `collect-gem` and the Bool queries `is-blocked`, `is-blocked-left`, `is-blocked-right`, `is-on-gem` — **all declared as terms** (`sub term:<…>`), never plain subs: a plain sub is a listop that slurps what follows, breaking `until is-blocked { … }` (block parsed as argument) and `move-forward xx 2` (`xx` parsed as an undeclared routine). As terms they compose with `xx`, `for ^n`, and statement modifiers; the trade-off is that call syntax with parens (`move-forward()`) is not supported. All of them call `window.PG.command/query` via `EVAL :lang<JavaScript>`; the JS simulation advances instantly so queries are answered mid-eval. Key constraints:
  - The prelude interpolates into EVAL strings, so it starts with `use MONKEY-SEE-NO-EVAL;`.
  - The prelude is one line, so **user compile-error line numbers are off by exactly one** in puzzle mode.
  - Queries return 1/0 and the prelude compares `== 1` (numeric coercion across the JS boundary is more reliable than JS booleans).
  - `PG.command` throws after 1000 commands (runaway-loop guard); a `loop { }` recording *no* commands still freezes the tab — the sync eval can't be interrupted.
  - After Camelia falls (moving onto water/void), further commands are silently dropped; the recorded fall animates and the run fails.
  - Level format in `world.js` `LEVELS`: `{ name, goal, steps[], explain[], grid[], start: {x,y,facing}, starter, hint, solution }`; grid legend `#` path, `G` gem, `W` rock (bump), `~` water / ` ` void (fall). `explain` paragraphs render in the instructions panel with `` `backticks` `` becoming `<code>`. **`solution` is load-bearing**: the headless verification runs every level's solution and requires the success banner — keep it correct when editing levels.
  - 16 levels teach Raku syntax progressively (statements → `xx` → `for`/ranges → `until`/`while` → conditionals → subs → `elsif`/`else` → pointy blocks → `repeat` → truthiness via the numeric `gems-left` query → `loop`/`next`/`last` → `given`/`when` → named parameters → `with`/`//`/`?? !!` → recap). Topics aligned with docs.raku.org/language/control.
  - **Progression is locked**: a level is selectable only when all previous ones are completed; completion is stored in localStorage under `raku-playground-progress`; the success banner offers a "Next level →" button. Free play is always available.
  - The board is pseudo-isometric CSS driven by `--rotX`/`--rotZ` custom properties on `#world` (default 55°/45°); **click-drag rotates it** (pointer handlers in playground.js). Sprites counter-rotate via `.upright` using `calc()` on the same variables — change angles only through the variables.
- **Single-file build**: `node tools/build-single.mjs` (esbuild on PATH or `ESBUILD=/path/to/esbuild`) produces `dist/raku-playground.html` (~75MB) — app JS bundled, CSS and perl6.js inlined, shareable and works from `file://`. The shim detects `window.PERL6_EMBEDDED` and polls for `evalP6` instead of injecting a script tag. `dist/` is gitignored.
- `docs/vendor/codemirror.js` — committed one-time esbuild bundle of CodeMirror 6 with the legacy Perl mode for highlighting (no CM6 Raku grammar exists) and the one-dark theme (the default highlight colors are unreadable on the dark UI). Regenerate with:
  ```sh
  npm install codemirror @codemirror/language @codemirror/legacy-modes @codemirror/theme-one-dark esbuild
  # entry.js re-exports: EditorView, basicSetup (codemirror); EditorState (@codemirror/state);
  # keymap (@codemirror/view); StreamLanguage (@codemirror/language);
  # perl (@codemirror/legacy-modes/mode/perl); oneDark (@codemirror/theme-one-dark)
  npx esbuild entry.js --bundle --format=esm --minify --outfile=docs/vendor/codemirror.js
  ```
- `docs/.nojekyll` — keeps GitHub Pages from running Jekyll (harmless with the Actions deployment, needed if anyone switches back to branch deployment).
- **GitHub Pages**: `.github/workflows/pages.yml` deploys `docs/` on every push to `main` (and via manual dispatch). One-time setup after the repo exists on GitHub: set Pages source to "GitHub Actions" (Settings → Pages, or `gh api repos/{owner}/{repo}/pages -X POST -f build_type=workflow`).

## Raku Distribution Conventions

- This project is managed by App::Mi6 (`dist.ini`). **Do not edit `README.md` directly** — it is generated from the pod at the bottom of `lib/Raku/Playground.rakumod` (see `[ReadmeFromPod]` in `dist.ini`). Edit the pod and run `mi6 build`.
- `META6.json` declares the distribution: new modules go under `provides`, runtime dependencies under `depends`.
- Tests are `t/*.rakutest`; version and release notes live in `Changes`; `mi6 release` manages releases.
- `.precomp/` is precompilation cache output and must never be committed or edited.
