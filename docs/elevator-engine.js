// The Elevator saga: an event-driven simulation that runs ENTIRELY in Raku,
// inside the Web Worker, in one evalP6 call. The player writes `init` / `update`
// and registers handlers on Elevator/Floor objects; a Raku-hosted engine drives
// time, moves cars, spawns/moves people and fires those handlers — all
// synchronously in the worker. The only thing that crosses to the main thread is
// a stream of *presentation events*, shipped on the reliable stdout channel with
// a "@@EV@@" sentinel (like grammars' "@@RX@@"): the worker parses them, tallies
// a result, and forwards each event here, where Building replays them as
// animation. No SharedArrayBuffer, no JS↔Raku callbacks — see CLAUDE.md.
//
// Inspired by Elevator Saga (https://play.elevatorsaga.com/) by Magnus Wolffelt.

import { sleep, nextLevelButton } from "./world.js";

// ---------------------------------------------------------------------------
// The Raku engine. Injected AFTER the user's code (so their compile-error line
// numbers stay correct) and after the per-level config constants. It defines the
// Elevator/Floor/Person classes, a seeded RNG, and a fixed-timestep driver that
// calls the user's `init`/`update` and fires their handlers, emitting an event
// log via `say '@@EV@@…'` lines. Classes are `my`-scoped (an `our`/plain class
// would redeclare across the playground's repeated evalP6 runs). No EVAL is used
// — pure Raku plus stdout, which keeps it fast and dodges the WrappedJSObject
// interop traps.
//
// Event grammar (one flush = one line, ';'-separated events, '|'-separated
// fields; all fields are integers, ms for times):
//   s|0|floors|elevators|capacity                 setup
//   p|t|personId|floor|dest|dir(1=up,0=down)       passenger spawns (presses call)
//   m|t|elevator|toFloor|durMs                     car begins a move leg
//   t|t|elevator|floor                             car stops (doors open) — a "move"
//   b|t|elevator|floor|personId|dest|waitMs        passenger boards
//   a|t|elevator|floor|personId                    passenger alights (transported)
//   e|t|transported|moves|maxWaitMs|avgWaitMs       end of run
export const ELEVATOR_ENGINE = String.raw`
my class Person {
    has $.id;
    has $.origin;
    has $.dest;
    has $.dir;
    has $.spawned;
}
my class Floor {
    has $.num;
    has %!handlers;
    method floor-num { $!num }
    method on($ev, &cb) { %!handlers{$ev}.push(&cb) }
    method fire($ev, *@a) { for @(%!handlers{$ev} // []) -> &cb { cb(|@a) } }
}
my class Elevator {
    has $.idx;
    has $.capacity;
    has $.pos is rw = 0e0;
    has @.queue;
    has @!riders;
    has %!handlers;
    has $.up-ind is rw = False;
    has $.down-ind is rw = False;
    has $.dwell is rw = 0e0;
    has $.leg-target is rw = -1;
    has $.at-floor is rw = 0;
    has $.idle-fired is rw = False;
    method on($ev, &cb) { %!handlers{$ev}.push(&cb) }
    method fire($ev, *@a) { for @(%!handlers{$ev} // []) -> &cb { cb(|@a) } }
    method riders-count { @!riders.elems }
    method add-rider($p) { @!riders.push($p) }
    method alight-at($f) { my @out = @!riders.grep(*.dest == $f); @!riders = @!riders.grep(*.dest != $f); @out }
    method current-floor { $!pos.round }
    method go-to-floor($f, $priority = False) {
        return if $f < 0 || $f >= $FLOORS;
        $!idle-fired = False;
        if $priority {
            @!queue.unshift($f) unless @!queue && @!queue[0] == $f;
        } else {
            @!queue.push($f) unless $f == any(@!queue);
        }
    }
    method stop { @!queue = () }
    method destination-queue { @!queue }
    method check-destination-queue { $!idle-fired = False }
    method destination-direction {
        return 'stopped' unless @!queue;
        my $t = @!queue[0];
        $t > $!pos ?? 'up' !! ($t < $!pos ?? 'down' !! 'stopped')
    }
    method load-factor { self.riders-count / $!capacity }
    method max-passenger-count { $!capacity }
    method pressed-floors { @!riders.map(*.dest).unique.sort.List }
    method going-up-indicator($v = Nil) {
        return $!up-ind unless $v.defined;
        $!up-ind = ?$v; self
    }
    method going-down-indicator($v = Nil) {
        return $!down-ind unless $v.defined;
        $!down-ind = ?$v; self
    }
}

my $seed = $SEED.Int;
my sub rnd { $seed = ($seed * 1103515245 + 12345) % 2147483648; $seed / 2147483648 }
my sub rndint($n) { (rnd() * $n).Int }

my @elevators;
my @floors;
my @waiting;
my @spawns;
my $NOW = 0e0;
my $pid = 0;
my $transported = 0;
my $moves = 0;
my @waits;
my @evbuf;
my $DWELL = 0.6e0;
my $SPEED = 2.2e0;

my sub now-ms { ($NOW * 1000).Int }
my sub ev($type, *@a) { @evbuf.push($type ~ '|' ~ @a.join('|')) }
my sub flush { return unless @evbuf; say '@@EV@@' ~ @evbuf.join(';'); @evbuf = () }

my sub build-spawns {
    my @s;
    for ^$SPAWN-COUNT -> $i {
        my $t = ($i + rnd()) * $GOAL-T / ($SPAWN-COUNT + 1);
        my $o = rndint($FLOORS);
        my $d = rndint($FLOORS);
        $d = ($o + 1 + rndint($FLOORS - 1)) % $FLOORS if $d == $o;
        @s.push({ t => $t, origin => $o, dest => $d });
    }
    @s.sort(*.<t>).List
}

my sub spawn-person(%s) {
    my $id = ++$pid;
    my $dir = %s<dest> > %s<origin> ?? 1 !! 0;
    @waiting.push(Person.new(id => $id, origin => %s<origin>, dest => %s<dest>, dir => $dir, spawned => $NOW));
    ev('p', now-ms(), $id, %s<origin>, %s<dest>, $dir);
    @floors[%s<origin>].fire($dir == 1 ?? 'up-button-pressed' !! 'down-button-pressed');
}

my sub wants-board($e, $p) {
    return True unless $e.up-ind || $e.down-ind;
    return True if $e.up-ind && $p.dir == 1;
    return True if $e.down-ind && $p.dir == 0;
    False
}

my sub board-at($e, $f) {
    my @here = @waiting.grep(*.origin == $f);
    for @here -> $p {
        last if $e.riders-count >= $e.capacity;
        next unless wants-board($e, $p);
        @waiting = @waiting.grep(*.id != $p.id);
        $e.add-rider($p);
        ev('b', now-ms(), $e.idx, $f, $p.id, $p.dest, (($NOW - $p.spawned) * 1000).Int);
        $e.fire('floor-button-pressed', $p.dest);
    }
}

my sub arrive($e, $f) {
    $e.leg-target = -1;
    $e.dwell = $DWELL;
    $e.idle-fired = False;
    ev('t', now-ms(), $e.idx, $f);
    for $e.alight-at($f).list -> $p {
        $transported++;
        @waits.push($NOW - $p.spawned);
        ev('a', now-ms(), $e.idx, $f, $p.id);
    }
    $e.fire('stopped-at-floor', $f);
    board-at($e, $f);
}

my sub step-elevator($e, $dt) {
    if $e.dwell > 0 {
        $e.dwell = $e.dwell - $dt;
        $e.dwell = 0e0 if $e.dwell < 0;
        return;
    }
    unless $e.queue {
        unless $e.idle-fired { $e.idle-fired = True; $e.fire('idle') }
        return;
    }
    my $target = $e.queue[0];
    my $old = $e.pos;
    my $dir = $target <=> $e.pos;
    if $dir == Same {
        $e.queue.shift;
        $moves++;
        arrive($e, $target);
        return;
    }
    my $step = ($dir == More ?? 1 !! -1) * $SPEED * $dt;
    $e.pos = $e.pos + $step;
    if ($step > 0 && $e.pos >= $target) || ($step < 0 && $e.pos <= $target) {
        $e.pos = $target + 0e0;
        $e.queue.shift;
        $e.at-floor = $target;
        $moves++;
        arrive($e, $target);
    } else {
        if $e.leg-target != $target {
            $e.leg-target = $target;
            my $dur = abs($target - $old) / $SPEED;
            ev('m', now-ms(), $e.idx, $target, ($dur * 1000).Int);
        }
        my $nf = $e.pos.round;
        if $nf != $e.at-floor && $nf != $target {
            $e.at-floor = $nf;
            $e.fire('passing-floor', $nf, $step > 0 ?? 'up' !! 'down');
        }
    }
}

my sub elevator-run(&user-init, &user-update) {
    @floors = (^$FLOORS).map({ Floor.new(num => $_) });
    @elevators = (^$ELEVATORS).map(-> $i { Elevator.new(idx => $i, capacity => (@CAPACITY[$i] // @CAPACITY[*-1])) });
    @spawns = build-spawns();
    ev('s', 0, $FLOORS, $ELEVATORS, @CAPACITY[0]);
    flush();
    user-init(@elevators, @floors);
    my $dt = 0.1e0;
    my $guard = 0;
    while $NOW <= $GOAL-T + 0.0001 {
        die "Simulation runaway" if ++$guard > 100000;
        while @spawns && @spawns[0]<t> <= $NOW { spawn-person(@spawns.shift) }
        for @elevators -> $e { step-elevator($e, $dt) }
        user-update($dt, @elevators, @floors);
        flush();
        $NOW = $NOW + $dt;
        last if $transported >= $GOAL-N;
    }
    my $maxw = @waits ?? (@waits.max * 1000).Int !! 0;
    my $avgw = @waits ?? (@waits.sum / @waits.elems * 1000).Int !! 0;
    ev('e', now-ms(), $transported, $moves, $maxw, $avgw);
    flush();
}

elevator-run(&init, &update);
`;

// ---------------------------------------------------------------------------
// Main-thread renderer + playback. Draws the building (floors, shafts, cars),
// buffers the streamed events, and replays them on a wall-clock timeline scaled
// from sim-time so cars slide smoothly and the HUD ticks like the original.

const FLOOR_H = 56;

export class Building {
    constructor(level, container) {
        this.level = level;
        this.container = container;
        this.floors = level.floors;
        this.numElevators = level.elevators;
        this.reset();
    }

    reset() {
        this.events = [];        // streamed from the worker via onCommand
        this.playIndex = 0;
        this.finalResult = null;
        this.transported = 0;
        this.moves = 0;
        this.waits = [];
        this.elapsed = 0;
        this._pb = 0.28;
        this.aborted = false;       // set by abort() to halt playback (Stop button)
        this.waitEls = new Map();   // personId -> waiting dot element
        this.riderEls = new Map();  // personId -> rider dot element
    }

    // Halt the sleep-paced replay loop. The whole sim runs in the worker in one
    // evalP6 call, so by the time these events animate the worker is already idle
    // — this, not runtime.cancel, is what the Stop button interrupts.
    abort() { this.aborted = true; }

    isEmpty() { return this.events.length === 0; }

    render() {
        const c = this.container;
        c.innerHTML = "";

        this.hud = document.createElement("div");
        this.hud.className = "bldg-hud";
        c.appendChild(this.hud);

        const stage = document.createElement("div");
        stage.className = "bldg-stage";
        const shafts = document.createElement("div");
        shafts.className = "bldg-shafts";
        const H = this.floors * FLOOR_H;
        shafts.style.height = `${H}px`;
        shafts.style.width = `${100 + this.numElevators * 60 + 20}px`;

        this.waitStrips = [];
        for (let f = 0; f < this.floors; f++) {
            const row = document.createElement("div");
            row.className = "bldg-floor";
            row.style.bottom = `${f * FLOOR_H}px`;
            const label = document.createElement("span");
            label.className = "bldg-floor-label";
            label.textContent = f;
            row.appendChild(label);
            const wait = document.createElement("div");
            wait.className = "bldg-wait";
            row.appendChild(wait);
            this.waitStrips[f] = wait;
            shafts.appendChild(row);
        }

        this.cars = [];
        for (let e = 0; e < this.numElevators; e++) {
            const shaft = document.createElement("div");
            shaft.className = "bldg-shaft";
            shaft.style.left = `${100 + e * 60}px`;
            shaft.style.height = `${H}px`;
            const car = document.createElement("div");
            car.className = "bldg-car";
            car.style.bottom = "0px";
            car.innerHTML = `<div class="bldg-riders"></div>`;
            shaft.appendChild(car);
            shafts.appendChild(shaft);
            this.cars[e] = car;
        }

        stage.appendChild(shafts);
        c.appendChild(stage);

        this.banner = document.createElement("div");
        this.banner.className = "banner";
        this.banner.hidden = true;
        c.appendChild(this.banner);

        this.updateHud();
    }

    updateHud() {
        const g = this.level.budget || {};
        const maxW = this.waits.length ? Math.max(...this.waits) : 0;
        const avgW = this.waits.length ? this.waits.reduce((a, b) => a + b, 0) / this.waits.length : 0;
        const stats = [
            `🧍 ${this.transported}/${g.transport ?? "?"}`,
            `⏱ ${(this.elapsed / 1000).toFixed(1)}s${g.time ? " / " + g.time + "s" : ""}`,
            `avg ${(avgW / 1000).toFixed(1)}s`,
            `max ${(maxW / 1000).toFixed(1)}s${g.maxWait ? " / " + g.maxWait + "s" : ""}`,
            `⇅ ${this.moves}${g.maxMoves ? " / " + g.maxMoves : ""}`,
        ];
        this.hud.replaceChildren(...stats.map((s) => {
            const el = document.createElement("span");
            el.className = "bldg-stat";
            el.textContent = s;
            return el;
        }));
    }

    // ---------- playback ----------

    // speed select: 800 slow · 400 normal · 80 fast → wall ms per sim ms
    pbFor(speed) {
        return ({ 800: 0.5, 400: 0.28, 80: 0.08 })[speed] ?? 0.28;
    }

    applyEvent(ev) {
        const a = ev.a;
        switch (ev.ev) {
            case "s": break;
            case "p": this.spawnDot(a[0], a[1], a[2], a[3]); break;
            case "m": this.moveCar(a[0], a[1], a[2]); break;
            case "t": this.stopCar(a[0], a[1]); break;
            case "b": this.doBoard(a[0], a[2], a[4]); break;
            case "a": this.doAlight(a[2]); break;
            case "e": break;
        }
        if (ev.t > this.elapsed) this.elapsed = ev.t;
        this.updateHud();
    }

    spawnDot(id, floor, dest, dir) {
        const dot = document.createElement("span");
        dot.className = `bldg-person ${dir ? "up" : "down"}`;
        dot.textContent = dest;
        this.waitStrips[floor]?.appendChild(dot);
        this.waitEls.set(id, dot);
    }

    moveCar(idx, toFloor, durMs) {
        const car = this.cars[idx];
        if (!car) return;
        car.classList.remove("doors-open");
        car.style.transitionDuration = `${Math.max(0, durMs * this._pb)}ms`;
        car.style.bottom = `${toFloor * FLOOR_H}px`;
    }

    stopCar(idx, floor) {
        const car = this.cars[idx];
        if (!car) return;
        car.style.bottom = `${floor * FLOOR_H}px`;
        car.classList.add("doors-open");
        this.moves++;
    }

    doBoard(idx, pid, waitMs) {
        this.waits.push(waitMs);
        const dot = this.waitEls.get(pid);
        const car = this.cars[idx];
        if (dot && car) {
            dot.classList.add("rider");
            car.querySelector(".bldg-riders").appendChild(dot);
        }
        this.waitEls.delete(pid);
        this.riderEls.set(pid, dot);
    }

    doAlight(pid) {
        this.transported++;
        const dot = this.riderEls.get(pid);
        if (dot) {
            dot.classList.add("arrived");
            setTimeout(() => dot.remove(), 400);
        }
        this.riderEls.delete(pid);
    }

    async stepOnce() {
        if (this.playIndex >= this.events.length) return false;
        this._pb = 0; // instant when stepping
        this.applyEvent(this.events[this.playIndex++]);
        return this.playIndex < this.events.length;
    }

    async playAll(speed) {
        this._pb = this.pbFor(speed);
        this.events.sort((x, y) => x.t - y.t);
        let last = 0;
        for (const ev of this.events) {
            if (this.aborted) return;
            const wait = Math.max(0, (ev.t - last) * this._pb);
            if (wait > 0) await sleep(wait);
            if (this.aborted) return;
            last = ev.t;
            this.applyEvent(ev);
        }
        this.finish();
    }

    finish() {
        const res = this.finalResult ?? { success: false, transported: this.transported };
        const g = this.level.budget || {};
        this.banner.className = `banner ${res.success ? "success" : "failure"}`;
        this.banner.textContent = res.success
            ? `Level complete! 🎉 Transported ${res.transported} people in ${(this.elapsed / 1000).toFixed(0)}s.`
            : `Transported ${res.transported ?? this.transported}/${g.transport} — try again!`;
        if (res.success && this.onNext) this.banner.append(" ", nextLevelButton(() => this.onNext()));
        this.banner.hidden = false;
        this.sim = res;
        this.onFinished?.(res);
    }
}
