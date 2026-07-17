#!/usr/bin/env raku

# Minimal zero-dependency static file server — Raku serving the Raku
# playground. Used by playwright.config.js and for local development:
#
#     raku tools/serve.raku            # serves docs/ on :8000
#     raku tools/serve.raku --port=9000 --dir=dist

my constant %MIME =
    html => 'text/html; charset=utf-8',
    js   => 'text/javascript; charset=utf-8',
    mjs  => 'text/javascript; charset=utf-8',
    css  => 'text/css; charset=utf-8',
    json => 'application/json',
    svg  => 'image/svg+xml',
    png  => 'image/png',
    jpg  => 'image/jpeg',
    gif  => 'image/gif',
    ico  => 'image/x-icon',
    wasm => 'application/wasm',
    txt  => 'text/plain; charset=utf-8',
;

sub MAIN(Int :$port = 8000, Str :$dir = 'docs') {
    my $root = $dir.IO.absolute.IO;
    die "no such directory: $root" unless $root.d;
    my $listener = IO::Socket::INET.new(:listen, :localhost<0.0.0.0>, :localport($port));
    say "Serving $root on http://localhost:$port (Ctrl-C to stop)";
    loop {
        my $conn = $listener.accept;
        start handle($conn, $root);
    }
}

sub handle($conn, IO::Path $root) {
    LEAVE { try $conn.close }
    CATCH { default { } }   # a broken connection must not kill the server

    my $request = $conn.get or return;
    my ($method, $raw-path) = $request.split(' ');
    my $accepts-gzip = False;
    while my $line = $conn.get {   # read headers up to the blank line
        $accepts-gzip = True
            if $line.lc.contains('accept-encoding') && $line.lc.contains('gzip');
    }

    my $path = $raw-path.split('?')[0]
        .subst(/'%' (<:AHex> ** 2)/, { chr(:16(~$0)) }, :g);
    $path = '/index.html' if $path eq '/';
    my $file = ($root ~ $path).IO;

    if $path.contains('..') || $method ne 'GET' | 'HEAD' || !$file.f {
        respond($conn, $method, '404 Not Found', %MIME<txt>, 'Not Found'.encode);
    } else {
        my $type = %MIME{$file.extension.lc} // 'application/octet-stream';
        # Big JS assets (perl6.js) are ~77 MB raw / ~10 MB gzipped — serve a
        # cached .gz when the client accepts it (mirrors GitHub Pages, and
        # keeps local iteration fast). Falls back to the raw file on any error.
        my $gz = ($accepts-gzip && $file.extension.lc eq 'js' && $file.s > 1_000_000)
            ?? ensure-gz($file) !! Nil;
        if $gz {
            respond($conn, $method, '200 OK', $type, $gz.slurp(:bin), :encoding<gzip>);
        } else {
            respond($conn, $method, '200 OK', $type, $file.slurp(:bin));
        }
    }
}

# Return an up-to-date gzipped sibling of $file, generating it via the system
# `gzip` if missing/stale. Returns Nil on any failure so the caller serves raw.
sub ensure-gz(IO::Path $file --> IO::Path) {
    my $gz = ($file.absolute ~ '.gz').IO;
    return $gz if $gz.e && $gz.modified >= $file.modified;
    my $ok = try {
        my $proc = run 'gzip', '-c', $file.absolute, :out, :bin;
        my $blob = $proc.out.slurp(:close);
        die 'gzip failed' unless $proc.exitcode == 0;
        $gz.spurt: $blob;
        True;
    };
    $ok && $gz.e ?? $gz !! Nil;
}

sub respond($conn, $method, $status, $type, Blob $body, :$encoding) {
    my $head = "HTTP/1.1 $status\r\n"
        ~ "Content-Type: $type\r\n"
        ~ "Content-Length: {$body.bytes}\r\n";
    $head ~= "Content-Encoding: $encoding\r\nVary: Accept-Encoding\r\n" if $encoding;
    $head ~= "Connection: close\r\n\r\n";
    $conn.write: $head.encode('ascii');
    $conn.write: $body unless $method eq 'HEAD';
}
