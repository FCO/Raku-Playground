unit class Raku::Playground;


=begin pod

=head1 NAME

Raku::Playground - a browser-based Raku playground (Rakudo compiled to JavaScript)

=head1 SYNOPSIS

=begin code

# serve the playground locally
python3 -m http.server 8000 --directory docs
# then open http://localhost:8000

=end code

=head1 DESCRIPTION

Raku::Playground is a Swift-Playgrounds-inspired page that runs Raku entirely
in the browser: a CodeMirror editor, a Run button, an output pane, and an
animated puzzle world, powered by Rakudo compiled to JavaScript
(C<docs/perl6.js>). No backend is needed — the whole playground is a static
site under C<docs/>, ready for GitHub Pages.

Guide Camelia 🦋 through 16 I<Learn Raku> levels — a guided tour of Raku
syntax (statements, C<xx>, C<for>, C<until>, conditionals, subs, C<given>/
C<when>, named parameters, C<with> and more) with rich explanations on every
level, locked progression, adjustable playback speed, step-through, and a
click-and-drag 3D world:

=begin code :lang<raku>

until is-blocked {
    move-forward;
    collect-gem if is-on-gem;
}

=end code

Commands: C<move-forward>, C<turn-left>, C<turn-right>, C<collect-gem>, and
the queries C<is-blocked>, C<is-blocked-left>, C<is-blocked-right>,
C<is-on-gem>.

In I<Free play> mode, Raku code can render UI into the preview pane:

=begin code :lang<raku>

my \doc     = EVAL :lang<JavaScript>, 'return document';
my \preview = EVAL :lang<JavaScript>, 'return PREVIEW';
my \h = doc.createElement('h2');
h.appendChild: doc.createTextNode('Hello from Raku!');
preview.appendChild: h;

=end code

Note the runtime bundle is ~77 MB, so the first load takes a while.

=head1 AUTHOR

Fernando Correa de Oliveira <fco@cpan.org>

=head1 COPYRIGHT AND LICENSE

Copyright 2026 Fernando Correa de Oliveira

This library is free software; you can redistribute it and/or modify it under the Artistic License 2.0.

=end pod
