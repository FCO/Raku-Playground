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
    while $conn.get { }     # drain the header lines up to the blank one

    my $path = $raw-path.split('?')[0]
        .subst(/'%' (<:AHex> ** 2)/, { chr(:16(~$0)) }, :g);
    $path = '/index.html' if $path eq '/';
    my $file = ($root ~ $path).IO;

    if $path.contains('..') || $method ne 'GET' | 'HEAD' || !$file.f {
        respond($conn, $method, '404 Not Found', %MIME<txt>, 'Not Found'.encode);
    } else {
        my $type = %MIME{$file.extension.lc} // 'application/octet-stream';
        respond($conn, $method, '200 OK', $type, $file.slurp(:bin));
    }
}

sub respond($conn, $method, $status, $type, Blob $body) {
    $conn.write: ("HTTP/1.1 $status\r\n"
        ~ "Content-Type: $type\r\n"
        ~ "Content-Length: {$body.bytes}\r\n"
        ~ "Connection: close\r\n\r\n").encode('ascii');
    $conn.write: $body unless $method eq 'HEAD';
}
