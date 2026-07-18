// One-time esbuild entry for docs/vendor/codemirror.js (see CLAUDE.md).
// Re-exports CodeMirror 6 + a bundled, offline Shiki highlighter (real Raku
// TextMate grammar via the JS regex engine — no WASM, no CDN) plus a set of
// Shiki themes for the editor's theme chooser.
export { EditorView, basicSetup } from "codemirror";
export { keymap } from "@codemirror/view";
export { Compartment } from "@codemirror/state";

export { createHighlighterCore } from "shiki/core";
export { createJavaScriptRegexEngine } from "shiki/engine/javascript";
export { default as shikiExt, synchronousHighlightEffect } from "codemirror-shiki";
export { default as rakuLang } from "@shikijs/langs/raku";

// Themes as resolved objects (STATIC imports → esbuild inlines them; no dynamic
// import() chunks, so the single-file build stays one self-contained file).
import oneDarkPro from "@shikijs/themes/one-dark-pro";
import dracula from "@shikijs/themes/dracula";
import nord from "@shikijs/themes/nord";
import githubDark from "@shikijs/themes/github-dark";
import catppuccin from "@shikijs/themes/catppuccin-mocha";
import vitesse from "@shikijs/themes/vitesse-dark";

// id (Shiki theme name) → { label, theme }. Order = dropdown order; first is default.
export const THEMES = {
    "one-dark-pro": { label: "One Dark Pro", theme: oneDarkPro },
    "dracula": { label: "Dracula", theme: dracula },
    "nord": { label: "Nord", theme: nord },
    "github-dark": { label: "GitHub Dark", theme: githubDark },
    "catppuccin-mocha": { label: "Catppuccin", theme: catppuccin },
    "vitesse-dark": { label: "Vitesse Dark", theme: vitesse },
};
