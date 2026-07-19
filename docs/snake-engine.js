// The Snake Arena saga: a Battlesnake-style coding game that runs ENTIRELY in
// Raku, inside the Web Worker, in one evalP6 call. The player writes
// `sub move($you, $board)` returning a direction ('up'|'down'|'left'|'right');
// a Raku-hosted engine ticks time, advances the snake(s), resolves collisions,
// and streams *presentation events* on the reliable stdout channel with a
// "@@SN@@" sentinel (mirrors elevator's "@@EV@@" and grammars' "@@RX@@"): the
// worker parses them, tallies a result (SnakePresenter), and forwards each here,
// where Arena replays them as animation. No SharedArrayBuffer, no JS↔Raku
// callbacks — pure Raku plus stdout. See CLAUDE.md.
//
// Inspired by Battlesnake (https://play.battlesnake.com/) and the classic Snake.

import { sleep, nextLevelButton } from "./world.js";

// ---------------------------------------------------------------------------
// The Raku engine. Injected AFTER the user's code (so their compile-error line
// numbers stay correct) and after the per-level config constants. All classes
// are `my`-scoped (an `our`/plain class would redeclare across the playground's
// repeated evalP6 runs — see CLAUDE.md). No EVAL is used — pure Raku plus stdout.
//
// Coordinates: (0,0) bottom-left, x∈[0,W), y∈[0,H); up = +y (matches Battlesnake
// and the bottom-based CSS the renderer uses). Cells are encoded as y*W+x
// internally; the API hands the player decoded Pos objects.
//
// Direction ints: 0 up · 1 right · 2 down · 3 left.
//
// Event grammar (one flush = one line, ';'-separated events, '|'-separated
// integer fields; `t` is the tick number):
//   s|0|width|height                         setup
//   f|t|foodId|x|y                           food appears
//   k|t|snakeId|len|x0|y0|x1|y1|…            snake body this tick (head first)
//   x|t|snakeId|foodId                       food eaten
//   d|t|snakeId|cause                        death (0 wall,1 self,2 collision)
//   e|t|playerLen|playerFood                 end of run
export const SNAKE_ENGINE = String.raw`
my class Pos {
    has Int $.x;
    has Int $.y;
    method dist-to(Pos $o) { abs($!x - $o.x) + abs($!y - $o.y) }
}
my class SnakeView {
    has Int $.id;
    has @.body;              # array of Pos, head first
    method head { @!body[0] }
    method length { @!body.elems }
}
my class Board {
    has Int $.width;
    has Int $.height;
    has @.food;              # array of Pos
    has @.snakes;            # array of SnakeView (alive snakes)
    method in-bounds(Int $x, Int $y) { 0 <= $x < $!width && 0 <= $y < $!height }
    method occupied(Int $x, Int $y) {
        so @!snakes.first({ .body.first({ .x == $x && .y == $y }).defined })
    }
    method nearest-food(Pos $from) {
        return Pos unless @!food;
        @!food.sort({ $from.dist-to($_) })[0]
    }
    # a direction string that reduces the distance from $from to $to (greedy;
    # may be unsafe — the player composes safety from in-bounds/occupied).
    method step-toward(Pos $from, Pos $to) {
        return 'up' unless $to.defined;
        my $dx = $to.x - $from.x;
        my $dy = $to.y - $from.y;
        if abs($dx) >= abs($dy) && $dx != 0 { return $dx > 0 ?? 'right' !! 'left' }
        if $dy != 0 { return $dy > 0 ?? 'up' !! 'down' }
        return $dx > 0 ?? 'right' !! 'left';
    }
    # the cell one step in $dir from $p (may be out of bounds — check in-bounds).
    method neighbor(Pos $p, Str $dir) {
        my $d = $dir.lc;
        return Pos.new(x => $p.x,     y => $p.y + 1) if $d eq 'up';
        return Pos.new(x => $p.x + 1, y => $p.y)     if $d eq 'right';
        return Pos.new(x => $p.x,     y => $p.y - 1) if $d eq 'down';
        return Pos.new(x => $p.x - 1, y => $p.y)     if $d eq 'left';
        $p
    }
}

# engine-internal snake (mutable); the API only ever sees a fresh SnakeView.
my class Runner {
    has Int $.id;
    has @.cells;             # encoded ints, head first (mutated via .unshift/.pop)
    has Int $.dir is rw;
    has Bool $.alive is rw = True;
    has Int $.food-eaten is rw = 0;
    has Int $.max-len is rw = 0;
    has Bool $.ate is rw = False;
    has Int $.eaten-id is rw = -1;
}

my $seed = $SEED.Int;
my sub rnd { $seed = ($seed * 1103515245 + 12345) % 2147483648; $seed / 2147483648 }
my sub rndint($n) { (rnd() * $n).Int }

my @runners;
my @foods;                   # each: { id => Int, c => Int (encoded) }
my $food-id = 0;
my $tick = 0;
my @evbuf;

my sub ev($type, *@a) { @evbuf.push($type ~ '|' ~ @a.join('|')) }
my sub flush { return unless @evbuf; say '@@SN@@' ~ @evbuf.join(';'); @evbuf = () }

my sub dir-to-int(Str $s) {
    my $d = $s.lc;
    return 0 if $d eq 'up';
    return 1 if $d eq 'right';
    return 2 if $d eq 'down';
    return 3 if $d eq 'left';
    -1
}

my sub cell-x(Int $c) { $c % $W }
my sub cell-y(Int $c) { $c div $W }
my sub body-coords(@cells) { @cells.map({ ($_ % $W, $_ div $W) }).flat }

my sub snake-occupies(Int $c) {
    so @runners.first({ .alive && .cells.first(* == $c).defined })
}
my sub food-index-at(Int $c) {
    for ^@foods.elems -> $i { return $i if @foods[$i]<c> == $c }
    -1
}

# a random empty cell (not on a snake or existing food); -1 if the board is full.
my sub free-cell {
    for ^200 {
        my $c = rndint($W * $H);
        next if snake-occupies($c);
        next if food-index-at($c) >= 0;
        return $c;
    }
    -1
}

my sub build-initial(Int $sx, Int $sy, Int $dir, Int $len) {
    my ($bx, $by) = (0, 0);           # step from head back along the body
    $by = -1 if $dir == 0;
    $bx = -1 if $dir == 1;
    $by =  1 if $dir == 2;
    $bx =  1 if $dir == 3;
    my @c;
    for ^$len -> $i { @c.push( ($sy + $by * $i) * $W + ($sx + $bx * $i) ) }
    @c
}

my sub snapshot-snake(Runner $r) {
    SnakeView.new(id => $r.id, body => $r.cells.map({ Pos.new(x => $_ % $W, y => $_ div $W) }).Array)
}
my sub build-board {
    Board.new(
        width  => $W,
        height => $H,
        food   => @foods.map({ Pos.new(x => .<c> % $W, y => .<c> div $W) }).Array,
        snakes => @runners.grep(*.alive).map({ snapshot-snake($_) }).Array,
    )
}

# the built-in rival (only present when $OPP): greedy toward food, avoids walls
# but NOT bodies — so it eventually traps itself. The player is meant to outlast it.
my sub opp-dir(Runner $r, $board) {
    my $head = Pos.new(x => $r.cells[0] % $W, y => $r.cells[0] div $W);
    my $goal = $board.nearest-food($head);
    my $want = $goal.defined ?? $board.step-toward($head, $goal) !! 'up';
    for $want, <up right down left>.grep(* ne $want) -> $d {
        my $n = $board.neighbor($head, $d);
        return $d if $board.in-bounds($n.x, $n.y);
    }
    $want
}

my sub kill-snake(Runner $r, Int $cause) {
    return unless $r.alive;
    $r.alive = False;
    ev('d', $tick, $r.id, $cause);
}

my sub snake-run(&user-move) {
    @runners.push(Runner.new(id => 0, cells => build-initial($SX, $SY, $SDIR, 3), dir => $SDIR));
    if $OPP {
        @runners.push(Runner.new(id => 1, cells => build-initial($OX, $OY, $ODIR, 3), dir => $ODIR));
    }
    for ^$FOOD { my $c = free-cell(); if $c >= 0 { @foods.push({ id => ++$food-id, c => $c }) } }

    ev('s', 0, $W, $H);
    for @foods -> $f { ev('f', 0, $f<id>, $f<c> % $W, $f<c> div $W) }
    for @runners -> $r { ev('k', 0, $r.id, $r.cells.elems, |body-coords($r.cells)) }
    flush();

    while $tick < $TICKS {
        $tick++;
        my $board = build-board();

        # 1. decide each snake's heading (ignore a 180° reversal or a bad return).
        #    The rival stays idle (skipped) until it "wakes" after $ODELAY ticks.
        for @runners.grep(*.alive) -> $r {
            next if $r.id == 1 && $tick <= $ODELAY;
            my $intended = $r.id == 0 ?? user-move(snapshot-snake($r), $board) !! opp-dir($r, $board);
            my $di = dir-to-int(~($intended // ''));
            $di = $r.dir if $di == -1 || $di == ($r.dir + 2) % 4;
            $r.dir = $di;
        }

        # 2. move heads; grow on food, else drop the tail. Out-of-bounds → wall death.
        for @runners.grep(*.alive) -> $r {
            next if $r.id == 1 && $tick <= $ODELAY;
            $r.ate = False;
            my $x = $r.cells[0] % $W;
            my $y = $r.cells[0] div $W;
            $y++ if $r.dir == 0;
            $x++ if $r.dir == 1;
            $y-- if $r.dir == 2;
            $x-- if $r.dir == 3;
            unless 0 <= $x < $W && 0 <= $y < $H {
                kill-snake($r, 0);      # wall
                next;
            }
            my $nc = $y * $W + $x;
            $r.cells.unshift($nc);
            my $fi = food-index-at($nc);
            if $fi >= 0 {
                $r.ate = True;
                $r.eaten-id = @foods[$fi]<id>;
                @foods.splice($fi, 1);
            } else {
                $r.cells.pop;
            }
        }

        # 3. eliminations on the post-move bodies (self / other-snake collisions).
        #    Two heads on one cell each sit in the other's body → both die.
        for @runners.grep(*.alive) -> $r {
            my $head = $r.cells[0];
            if $r.cells[1 .. *].first(* == $head).defined {
                kill-snake($r, 1);      # self
                next;
            }
            for @runners.grep({ .alive && .id != $r.id }) -> $o {
                if $o.cells.first(* == $head).defined { kill-snake($r, 2); last }   # collision
            }
        }

        # 4. survivors that ate: score, respawn food; then emit each body.
        for @runners -> $r {
            next unless $r.alive;
            if $r.ate {
                ev('x', $tick, $r.id, $r.eaten-id);
                $r.food-eaten++;
                my $c = free-cell();
                if $c >= 0 { @foods.push({ id => ++$food-id, c => $c }); ev('f', $tick, $food-id, $c % $W, $c div $W) }
            }
            $r.max-len = $r.max-len max $r.cells.elems;
            ev('k', $tick, $r.id, $r.cells.elems, |body-coords($r.cells));
        }
        flush();

        last unless @runners[0].alive;
        last if $STOP-FOOD > 0 && @runners[0].food-eaten >= $STOP-FOOD;
        last if $STOP-LEN  > 0 && @runners[0].cells.elems >= $STOP-LEN;
    }

    ev('e', $tick, @runners[0].cells.elems, @runners[0].food-eaten);
    flush();
}

snake-run(&move);
`;

// ---------------------------------------------------------------------------
// Main-thread renderer + playback. Draws the grid, buffers the streamed events,
// and replays them on a wall-clock timeline scaled from tick time (mirrors
// elevator's Building).

const CELL = 22;        // px per grid cell (keep in sync with .arena-* CSS)
const TICK_MS = 110;    // sim-ms per tick, before the playback-speed scale

export class Arena {
    constructor(level, container) {
        this.level = level;
        this.container = container;
        this.W = level.W;
        this.H = level.H;
        this.numSnakes = level.opponent ? 2 : 1;
        this.reset();
    }

    reset() {
        this.events = [];       // streamed from the worker via onCommand
        this.playIndex = 0;
        this.finalResult = null;
        this.tick = 0;
        this.pLen = 3;
        this.pFood = 0;
        this._pb = 0.28;
        this.aborted = false;
        this.foodEls = new Map();   // foodId  -> element
        this.snakeEls = new Map();  // snakeId -> [segment elements]
    }

    abort() { this.aborted = true; }
    isEmpty() { return this.events.length === 0; }

    render() {
        const c = this.container;
        c.innerHTML = "";

        this.hud = document.createElement("div");
        this.hud.className = "bldg-hud";       // reuse the elevator HUD chrome
        c.appendChild(this.hud);

        const stage = document.createElement("div");
        stage.className = "arena-stage";
        this.grid = document.createElement("div");
        this.grid.className = "arena-grid";
        this.grid.style.width = `${this.W * CELL}px`;
        this.grid.style.height = `${this.H * CELL}px`;
        stage.appendChild(this.grid);
        c.appendChild(stage);

        this.banner = document.createElement("div");
        this.banner.className = "banner";
        this.banner.hidden = true;
        c.appendChild(this.banner);

        this.updateHud();
    }

    updateHud() {
        const g = this.level.budget || {};
        const stats = [`🐍 len ${this.pLen}`, `🍎 ${this.pFood}`];
        if (g.food != null)   stats[1] = `🍎 ${this.pFood}/${g.food}`;
        if (g.length != null) stats[0] = `🐍 len ${this.pLen}/${g.length}`;
        stats.push(`⏱ ${this.tick}${g.survive != null ? " / " + g.survive : g.ticks ? " / " + g.ticks : ""}`);
        this.hud.replaceChildren(...stats.map((s) => {
            const el = document.createElement("span");
            el.className = "bldg-stat";
            el.textContent = s;
            return el;
        }));
    }

    // (x,y) with (0,0) bottom-left → CSS left/bottom inside the grid.
    place(el, x, y) {
        el.style.left = `${x * CELL}px`;
        el.style.bottom = `${y * CELL}px`;
    }

    applyEvent(ev) {
        const a = ev.a;
        switch (ev.ev) {
            case "s": break;
            case "f": this.addFood(a[0], a[1], a[2]); break;
            case "k": this.drawSnake(a[0], a[1], a.slice(2)); break;
            case "x": this.removeFood(a[1]); break;
            case "d": this.killSnake(a[0]); break;
            case "e": break;
        }
        if (ev.t > this.tick) this.tick = ev.t;
        this.updateHud();
    }

    addFood(id, x, y) {
        if (this.foodEls.has(id)) return;
        const el = document.createElement("div");
        el.className = "arena-food";
        this.place(el, x, y);
        this.grid.appendChild(el);
        this.foodEls.set(id, el);
    }

    removeFood(id) {
        const el = this.foodEls.get(id);
        if (el) { el.classList.add("eaten"); setTimeout(() => el.remove(), 250); }
        this.foodEls.delete(id);
    }

    drawSnake(id, len, coords) {
        for (const el of this.snakeEls.get(id) || []) el.remove();
        const segs = [];
        for (let i = 0; i < coords.length; i += 2) {
            const seg = document.createElement("div");
            seg.className = `arena-seg s${id}${i === 0 ? " head" : ""}`;
            this.place(seg, coords[i], coords[i + 1]);
            this.grid.appendChild(seg);
            segs.push(seg);
        }
        this.snakeEls.set(id, segs);
        if (id === 0) { this.pLen = len; }
    }

    killSnake(id) {
        for (const el of this.snakeEls.get(id) || []) el.classList.add("dead");
    }

    // speed select: 800 slow · 400 normal · 80 fast → wall-ms per sim-ms
    pbFor(speed) { return ({ 800: 0.5, 400: 0.28, 80: 0.08 })[speed] ?? 0.28; }

    async stepOnce() {
        if (this.playIndex >= this.events.length) return false;
        // count player food from x-events as we go (HUD)
        const ev = this.events[this.playIndex++];
        if (ev.ev === "x" && ev.a[0] === 0) this.pFood++;
        this.applyEvent(ev);
        return this.playIndex < this.events.length;
    }

    async playAll(speed) {
        this._pb = this.pbFor(speed);
        this.events.sort((x, y) => x.t - y.t);
        let last = 0;
        for (const ev of this.events) {
            if (this.aborted) return;
            const wait = Math.max(0, (ev.t - last) * TICK_MS * this._pb);
            if (wait > 0) await sleep(wait);
            if (this.aborted) return;
            last = ev.t;
            if (ev.ev === "x" && ev.a[0] === 0) this.pFood++;
            this.applyEvent(ev);
        }
        this.finish();
    }

    finish() {
        const res = this.finalResult ?? { success: false };
        const g = this.level.budget || {};
        this.banner.className = `banner ${res.success ? "success" : "failure"}`;
        this.banner.textContent = res.success
            ? `Level complete! 🎉 ${goalRecap(g, res)}`
            : `Not yet — ${failRecap(g, res)}`;
        if (res.success && this.onNext) this.banner.append(" ", nextLevelButton(() => this.onNext()));
        this.banner.hidden = false;
        this.sim = res;
        this.onFinished?.(res);
    }
}

function goalRecap(g, res) {
    if (g.food != null) return `Ate ${res.food} food.`;
    if (g.length != null) return `Grew to length ${res.length}.`;
    return `Survived ${res.ticks} ticks.`;
}
function failRecap(g, res) {
    if (res && res.ended === false) return "your program didn't run to the end — check the output for errors.";
    if (res && res.alive === false) return "your snake died. Try again!";
    if (g.food != null) return `ate ${res?.food ?? 0}/${g.food} food. Try again!`;
    if (g.length != null) return `reached length ${res?.length ?? 3}/${g.length}. Try again!`;
    return "survive to the end. Try again!";
}
