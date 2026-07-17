[![Actions Status](https://github.com/FCO/Raku-Playground/actions/workflows/test.yml/badge.svg)](https://github.com/FCO/Raku-Playground/actions)

NAME
====

Raku::Playground - a browser-based Raku playground (Rakudo compiled to JavaScript)

SYNOPSIS
========

**▶ Play it now: [https://fco.github.io/Raku-Playground/](https://fco.github.io/Raku-Playground/)**

    # or serve the playground locally (in Raku, of course)
    raku tools/serve.raku
    # then open http://localhost:8000

DESCRIPTION
===========

Raku::Playground is a Swift-Playgrounds-inspired page that runs Raku entirely in the browser: a CodeMirror editor, a Run button, an output pane, and an animated puzzle world, powered by Rakudo compiled to JavaScript (`docs/perl6.js`). No backend is needed — the whole playground is a static site under `docs/`, ready for GitHub Pages.

Guide Camelia 🦋 through *sagas* — sets of levels. The 16-level *Learn Raku* saga is a guided tour of Raku syntax (statements, `xx`, `for`, `until`, conditionals, subs, `given`/`when`, named parameters, `with` and more) with rich explanations on every level; *Regexes & Grammars* covers Raku's crown jewels — from `/gem/` to grammars with actions, with every match highlighted live in the preview pane; *Build Websites* teaches [MemoizedDOM](https://github.com/FCO/MemoizedDOM) — declarative, memoized web pages in Raku, rendered live in the preview pane; *Gem Rush* adds challenge islands. Locked progression per saga, adjustable playback speed, step-through, and a click-and-drag 3D world. New sagas are single JavaScript files dropped into `docs/sagas/`:

```raku
until is-blocked {
    move-forward;
    collect-gem if is-on-gem;
}
```

Commands: `move-forward`, `turn-left`, `turn-right`, `collect-gem`, and the queries `is-blocked`, `is-blocked-left`, `is-blocked-right`, `is-on-gem`, and `gems-left` (an `Int` — so `while gems-left { … }` just works).

In *Free play* mode, Raku code can render UI into the preview pane:

```raku
my \doc     = EVAL :lang<JavaScript>, 'return document';
my \preview = EVAL :lang<JavaScript>, 'return PREVIEW';
my \h = doc.createElement('h2');
h.appendChild: doc.createTextNode('Hello from Raku!');
preview.appendChild: h;
```

Note the runtime bundle is ~77 MB, so the first load takes a while.

AUTHOR
======

Fernando Correa de Oliveira <fco@cpan.org>

COPYRIGHT AND LICENSE
=====================

Copyright 2026 Fernando Correa de Oliveira

This library is free software; you can redistribute it and/or modify it under the Artistic License 2.0.

