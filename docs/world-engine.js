// The puzzle-world engine for the **rakupp** runtime (the WASM Raku interpreter,
// docs/rakujs.*). Unlike perl6.js, rakupp has no JS backend — no
// `EVAL :lang<JavaScript>` and no `self.PG` bridge — so the puzzle world can't be
// a JS sim the Raku prelude phones into (that's what docs/world-sim.js +
// docs/world.js PRELUDE do on the perl6 runtime). Instead the **whole sim runs in
// Raku**, in one `rakupp_run`, exactly like the elevator/snake engines: it holds
// grid/position/gems, answers queries in-Raku synchronously, and streams each
// executed command out on the reliable stdout channel with a "@@PZ@@" sentinel
// (like "@@EV@@"/"@@SN@@"). raku-worker.js parses those lines, feeds a
// WorldPresenter (honest result), and forwards each as a command; docs/world.js's
// World replays them as animation — the command shapes are identical to what the
// perl6 WorldSim emits, so playback code is shared and unchanged.
//
// rakupp specifics learned by testing the interpreter (v0.9.0):
//  - `sub term:<…>` is NOT supported (a bareword resolves to a string list, the
//    body never runs), so the commands/queries are **plain subs**. rakupp does not
//    slurp a following block/`xx`/statement-modifier into a no-arg sub the way
//    Rakudo's listops do, so `until is-blocked { … }`, `move-forward xx 5`,
//    `collect-gem for ^4` all parse correctly with plain subs. The one gap vs.
//    terms: two bare commands on separate lines with no `;` between them slurp
//    (`move-forward⏎say …` → `move-forward(say …)`) — every taught example and
//    every level `solution` uses `;`, so this doesn't bite in practice.
//  - all symbols are `my`-scoped (matches the perl6 preludes' convention).

// Per-level config: one physical line so it barely shifts user line numbers.
// Grid rows → a Raku list; start cell + facing → constants the engine reads.
export function worldConfig(level) {
    const rows = level.grid
        .map((r) => "'" + r.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'")
        .join(", ");
    const s = level.start;
    return `my @GRID = (${rows}); my $SX = ${s.x}; my $SY = ${s.y}; my $FACING0 = '${s.facing}';`;
}

// The Raku engine + command/query prelude. Injected AFTER the config (which
// declares @GRID/$SX/$SY/$FACING0) and BEFORE the user's code (so the command
// subs are declared when user code compiles). Ported 1:1 from docs/world-sim.js:
// same walkable rule (start cell always walkable), same runaway guard (1000
// commands), same "step onto water/void ⇒ fall, drop later commands" behaviour.
export const WORLD_ENGINE = String.raw`
my $px = $SX; my $py = $SY; my $facing = $FACING0;
my $dead = False; my $issued = 0;
my %gems;
for @GRID.kv -> $gy, $row {
    for $row.comb.kv -> $gx, $ch {
        %gems{"$gx,$gy"} = True if $ch eq 'G';
    }
}
my %DX = 'N', 0, 'E', 1, 'S', 0, 'W', -1;
my %DY = 'N', -1, 'E', 0, 'S', 1, 'W', 0;
my %LEFT = 'N', 'W', 'W', 'S', 'S', 'E', 'E', 'N';
my %RIGHT = 'N', 'E', 'E', 'S', 'S', 'W', 'W', 'N';

sub tile-at($x, $y) {
    return ' ' if $y < 0 || $y >= @GRID.elems;
    my $row = @GRID[$y];
    return ' ' if $x < 0 || $x >= $row.chars;
    $row.substr($x, 1);
}
sub walkable($x, $y) {
    my $t = tile-at($x, $y);
    ($t eq '#' || $t eq 'G') || ($x == $SX && $y == $SY);
}
sub pz($line) { say "@@PZ@@$line" }

sub do-command($name) {
    $issued = $issued + 1;
    if $issued > 1000 { pz 'X'; exit }
    return if $dead;
    if $name eq 'move-forward' {
        my $tx = $px + %DX{$facing};
        my $ty = $py + %DY{$facing};
        if walkable($tx, $ty) {
            $px = $tx; $py = $ty;
            pz "m|$tx|$ty";
        } elsif tile-at($tx, $ty) eq 'W' {
            pz "mb|$facing";
        } else {
            $dead = True;
            pz "mf|$tx|$ty";
        }
    } elsif $name eq 'turn-left' {
        $facing = %LEFT{$facing};
        pz "tl|$facing";
    } elsif $name eq 'turn-right' {
        $facing = %RIGHT{$facing};
        pz "tr|$facing";
    } elsif $name eq 'collect-gem' {
        my $k = "$px,$py";
        if %gems{$k} {
            %gems{$k}:delete;
            pz "cg|$px|$py";
        } else {
            pz "cn|$px|$py";
        }
    }
}

sub do-query($name) {
    if $name eq 'is-blocked'       { return walkable($px + %DX{$facing}, $py + %DY{$facing}) ?? 0 !! 1 }
    if $name eq 'is-blocked-left'  { my $f = %LEFT{$facing};  return walkable($px + %DX{$f}, $py + %DY{$f}) ?? 0 !! 1 }
    if $name eq 'is-blocked-right' { my $f = %RIGHT{$facing}; return walkable($px + %DX{$f}, $py + %DY{$f}) ?? 0 !! 1 }
    if $name eq 'is-on-gem'        { return %gems{"$px,$py"} ?? 1 !! 0 }
    if $name eq 'gems-left'        { return %gems.elems }
    return 0;
}

sub move-forward  { do-command 'move-forward';  True }
sub turn-left     { do-command 'turn-left';     True }
sub turn-right    { do-command 'turn-right';    True }
sub collect-gem   { do-command 'collect-gem';   True }
sub is-blocked        { do-query('is-blocked') == 1 }
sub is-blocked-left   { do-query('is-blocked-left') == 1 }
sub is-blocked-right  { do-query('is-blocked-right') == 1 }
sub is-on-gem         { do-query('is-on-gem') == 1 }
sub gems-left         { do-query('gems-left') }
`;
