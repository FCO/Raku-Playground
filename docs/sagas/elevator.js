// The "Elevator Saga" — a Raku port of Elevator Saga
// (https://play.elevatorsaga.com/, by Magnus Wolffelt & contributors).
//
// A challenge saga (type: "elevator"): you write `sub init(@elevators, @floors)`
// and `sub update($dt, @elevators, @floors)`, register event handlers on the
// elevator/floor objects, and steer the cars to move people. Everything runs as
// ONE Raku program inside the Web Worker — the engine (docs/elevator-engine.js)
// drives time and fires your handlers; the main thread only animates the
// resulting event stream. Each level's `solution` is run by the headless
// verification, so keep the seeds/goals tuned to it.
//
// Level fields: floors/elevators/capacity/seed/spawns describe the world;
// `budget` { transport, time, maxMoves?, maxWait? } is the win condition (also
// fed to the Raku config and the worker presenter). `goal` is the display line.
//
// The object API (kebab-case Raku, mirroring the original):
//   Elevator: go-to-floor($n, $priority?), stop, current-floor, load-factor,
//             max-passenger-count, pressed-floors, destination-direction,
//             destination-queue, check-destination-queue,
//             going-up-indicator($v?), going-down-indicator($v?),
//             on($event, &cb)  — events: idle, floor-button-pressed,
//             stopped-at-floor, passing-floor($floor, $dir)
//   Floor:    floor-num, on($event, &cb)  — events: up-button-pressed,
//             down-button-pressed

const CREDIT =
    "This saga is a Raku port of **Elevator Saga** by Magnus Wolffelt — play the " +
    "JavaScript original at https://play.elevatorsaga.com/ . The API mirrors it, " +
    "kebab-cased: you write `init` and `update` and register event handlers.";

const HOWITWORKS =
    "Your program runs as one Raku unit. `init(@elevators, @floors)` sets things up " +
    "once — usually registering handlers with `$e.on('idle', { … })`. `update($dt, " +
    "@elevators, @floors)` then runs every simulation step. The engine moves the " +
    "cars, spawns people and fires your handlers; you just decide where cars go with " +
    "`$e.go-to-floor($n)`.";

const LEVELS = [
    {
        type: "elevator",
        name: "Ground Shuttle",
        goal: "Move people between three floors: transport 6 passengers before time runs out.",
        floors: 3, elevators: 1, capacity: 4, seed: 71341, spawns: 9,
        budget: { transport: 6, time: 60 },
        steps: [
            "Write sub init(@elevators, @floors) and grab the car: my $e = @elevators[0];",
            "On idle, send it to the next floor up (wrapping to 0 at the top): $e.on('idle', { … }).",
            "When a rider presses a floor inside, honour it: $e.on('floor-button-pressed', -> $n { $e.go-to-floor($n) }).",
        ],
        explain: [
            CREDIT,
            HOWITWORKS,
            "The simplest strategy that works: **sweep every floor**. On each `idle`, send the car to " +
            "`($e.current-floor + 1) % @floors.elems` — 0, 1, 2, 0, 1, 2… It stops everywhere, so it " +
            "picks up whoever is waiting. `go-to-floor` queues a destination; when the queue empties " +
            "the car goes idle and your handler runs again.",
            "Blocks with no arrow take the topic `$_`; handlers that get an argument want a pointy " +
            "block: `-> $n { … }`. That's why `floor-button-pressed` is written `-> $n { … }`.",
        ],
        starter:
            `sub init(@elevators, @floors) {\n` +
            `    my $e = @elevators[0];\n` +
            `    # on idle, sweep to the next floor up (wrap at the top)…\n` +
            `    # on 'floor-button-pressed', go where the rider asked…\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) {\n` +
            `}\n`,
        hint: "$e.on('idle', { $e.go-to-floor( ($e.current-floor + 1) % @floors.elems ) });",
        solution:
            `sub init(@elevators, @floors) {\n` +
            `    my $e = @elevators[0];\n` +
            `    $e.on('idle', { $e.go-to-floor( ($e.current-floor + 1) % @floors.elems ) });\n` +
            `    $e.on('floor-button-pressed', -> $n { $e.go-to-floor($n) });\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
    },
    {
        type: "elevator",
        name: "Answer the Calls",
        goal: "Five floors, one car: transport 9 passengers by answering their calls.",
        floors: 5, elevators: 1, capacity: 4, seed: 4820, spawns: 13,
        budget: { transport: 9, time: 60 },
        steps: [
            "Every floor can call: $f.on('up-button-pressed', { … }) and 'down-button-pressed'.",
            "Remember which floors are calling in a list your handlers share.",
            "On idle, serve the oldest call: $e.go-to-floor(@calls.shift).",
        ],
        explain: [
            "A blind sweep works but wastes trips. Better: **listen for calls**. Each floor fires " +
            "`up-button-pressed` / `down-button-pressed` when someone there is waiting — record the " +
            "floor number, then send the idle car to answer.",
            "Handlers registered in `init` close over the same lexical variables, so a `my @calls` " +
            "declared in `init` is shared between the floor handlers (which push to it) and the " +
            "elevator's `idle` handler (which shifts from it).",
            "Still honour `floor-button-pressed` for riders already aboard — otherwise they never " +
            "reach their floor.",
        ],
        starter:
            `sub init(@elevators, @floors) {\n` +
            `    my $e = @elevators[0];\n` +
            `    my @calls;\n` +
            `    for @floors -> $f {\n` +
            `        # record up/down calls into @calls…\n` +
            `    }\n` +
            `    $e.on('floor-button-pressed', -> $n { $e.go-to-floor($n) });\n` +
            `    # on idle, answer the next call (or park at 0)…\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
        hint: "In the floor loop: $f.on('up-button-pressed', { @calls.push($f.floor-num) }); (and down). On idle: $e.go-to-floor(@calls ?? @calls.shift !! 0);",
        solution:
            `sub init(@elevators, @floors) {\n` +
            `    my $e = @elevators[0];\n` +
            `    my @calls;\n` +
            `    for @floors -> $f {\n` +
            `        $f.on('up-button-pressed', { @calls.push($f.floor-num) unless $f.floor-num == any(@calls) });\n` +
            `        $f.on('down-button-pressed', { @calls.push($f.floor-num) unless $f.floor-num == any(@calls) });\n` +
            `    }\n` +
            `    $e.on('floor-button-pressed', -> $n { $e.go-to-floor($n) });\n` +
            `    $e.on('stopped-at-floor', -> $n { @calls = @calls.grep(* != $n) });\n` +
            `    $e.on('idle', { $e.go-to-floor(@calls ?? @calls.shift !! 0) });\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
    },
    {
        type: "elevator",
        name: "Mind the Capacity",
        goal: "The car holds only 2 — transport 10 passengers by making every trip count.",
        floors: 5, elevators: 1, capacity: 2, seed: 9137, spawns: 15,
        budget: { transport: 10, time: 75 },
        steps: [
            "max-passenger-count and load-factor tell you how full the car is (0 = empty, 1 = full).",
            "pressed-floors lists the floors your current riders want.",
            "A steady sweep still works — the car just fills and empties as it goes.",
        ],
        explain: [
            "Now the car holds only two people, so it can't gulp a whole floor at once — the leftover " +
            "passengers keep their call lit and wait for the next pass.",
            "`load-factor` returns how full the car is (0…1) and `max-passenger-count` its capacity; " +
            "`pressed-floors` is the sorted list of floors the riders inside chose. Use them to decide " +
            "whether to keep collecting or run people to their destinations first.",
            "The reliable baseline is still a full sweep: visit every floor in turn, boarding what " +
            "fits and dropping riders at their floors. It simply takes more laps.",
        ],
        starter:
            `sub init(@elevators, @floors) {\n` +
            `    my $e = @elevators[0];\n` +
            `    # sweep every floor; drop riders where they asked…\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
        hint: "$e.on('idle', { $e.go-to-floor( ($e.current-floor + 1) % @floors.elems ) }); plus floor-button-pressed.",
        solution:
            `sub init(@elevators, @floors) {\n` +
            `    my $e = @elevators[0];\n` +
            `    $e.on('floor-button-pressed', -> $n { $e.go-to-floor($n) });\n` +
            `    $e.on('idle', { $e.go-to-floor( ($e.current-floor + 1) % @floors.elems ) });\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
    },
    {
        type: "elevator",
        name: "Two Cars",
        goal: "Two elevators now — put both to work and move 14 passengers.",
        floors: 6, elevators: 2, capacity: 4, seed: 5521, spawns: 20,
        budget: { transport: 14, time: 70 },
        steps: [
            "@elevators has two cars — loop with .kv to get index and car: for @elevators.kv -> $i, $e { … }.",
            "Give each its own idle + floor-button-pressed handlers.",
            "Stagger them (send one to the top to start) so they don't shadow each other.",
        ],
        explain: [
            "Two cars double your throughput — if you actually use both. Register handlers for **each** " +
            "elevator; the easiest split is to let both sweep independently and simply start them at " +
            "opposite ends so they naturally cover different floors.",
            "`@elevators.kv` yields index/value pairs: `for @elevators.kv -> $i, $e { … }`. Inside, `$e` " +
            "is captured per-iteration, so each car's handlers close over the right elevator.",
            "Kick one car up to the top floor in `init` so they start out of phase — otherwise both " +
            "shadow each other at floor 0.",
        ],
        starter:
            `sub init(@elevators, @floors) {\n` +
            `    for @elevators.kv -> $i, $e {\n` +
            `        # give each car sweep + floor-button handlers…\n` +
            `    }\n` +
            `    # stagger: send the second car to the top…\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
        hint: "Inside the loop: $e.on('idle', { $e.go-to-floor( ($e.current-floor + 1) % @floors.elems ) }); then @elevators[1].go-to-floor(@floors.elems - 1);",
        solution:
            `sub init(@elevators, @floors) {\n` +
            `    for @elevators.kv -> $i, $e {\n` +
            `        $e.on('floor-button-pressed', -> $n { $e.go-to-floor($n) });\n` +
            `        $e.on('idle', { $e.go-to-floor( ($e.current-floor + 1) % @floors.elems ) });\n` +
            `    }\n` +
            `    @elevators[1].go-to-floor(@floors.elems - 1);\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
    },
    {
        type: "elevator",
        name: "Rush Hour",
        goal: "The building is packed — keep both cars sweeping and clear 20 passengers in time.",
        floors: 6, elevators: 2, capacity: 4, seed: 33301, spawns: 30,
        budget: { transport: 20, time: 90 },
        steps: [
            "Same two-car sweep as before — the crowd is bigger, not the idea.",
            "passing-floor($floor, $dir) fires as a car passes each floor; useful for opportunistic stops.",
            "Watch the Avg/Max wait times in the HUD — a good algorithm keeps them low.",
        ],
        explain: [
            "Rush hour is a throughput test: passengers arrive faster than one lap can clear, so both " +
            "cars must stay busy. The independent double-sweep from the last level scales up directly.",
            "For extra polish, `passing-floor($floor, $dir)` fires just before a moving car reaches a " +
            "floor — you can decide to insert a stop with `$e.go-to-floor($floor, True)` (the `True` " +
            "makes it a priority/next stop). Not required to win, but it trims waiting time.",
            "The HUD tracks Transported, Elapsed, Avg wait, Max wait and Moves — the same scoreboard " +
            "the original Elevator Saga shows.",
        ],
        starter:
            `sub init(@elevators, @floors) {\n` +
            `    for @elevators.kv -> $i, $e {\n` +
            `        # both cars sweep; drop riders where asked…\n` +
            `    }\n` +
            `    @elevators[1].go-to-floor(@floors.elems - 1);\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
        hint: "Reuse the Two Cars solution — the same double-sweep clears the crowd.",
        solution:
            `sub init(@elevators, @floors) {\n` +
            `    for @elevators.kv -> $i, $e {\n` +
            `        $e.on('floor-button-pressed', -> $n { $e.go-to-floor($n) });\n` +
            `        $e.on('idle', { $e.go-to-floor( ($e.current-floor + 1) % @floors.elems ) });\n` +
            `    }\n` +
            `    @elevators[1].go-to-floor(@floors.elems - 1);\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
    },
    {
        type: "elevator",
        name: "Lean Machine",
        goal: "Transport 9 passengers in at most 26 moves — only visit floors that need you.",
        floors: 5, elevators: 1, capacity: 4, seed: 6604, spawns: 12,
        budget: { transport: 9, time: 90, maxMoves: 26 },
        steps: [
            "A stop counts as a move. Sweeping every floor burns your budget on empty stops.",
            "Drive the car straight from the calls: go-to-floor the floor that rang.",
            "Skip a floor that's already in your destination-queue so you don't stop twice.",
        ],
        explain: [
            "Efficiency challenge: you have a **move budget**. A move is a stop, and blindly sweeping " +
            "every floor spends moves on floors with nobody on them. Only stop where you're needed.",
            "Ditch the idle sweep entirely: dispatch **directly from the events**. When a floor's call " +
            "button fires, send the car there; when a rider presses a floor, add it — each `unless` " +
            "the floor is already queued (`$n == any($e.destination-queue)`) so you never double-book " +
            "a stop.",
            "That's the whole saga: an event-driven controller in Raku, exactly like the JavaScript " +
            "original at https://play.elevatorsaga.com/ — go compare notes. 🛗",
        ],
        starter:
            `sub init(@elevators, @floors) {\n` +
            `    my $e = @elevators[0];\n` +
            `    for @floors -> $f {\n` +
            `        # when this floor calls, send the car here (unless already queued)…\n` +
            `    }\n` +
            `    $e.on('floor-button-pressed', -> $n { $e.go-to-floor($n) });\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
        hint: "my &call = { $e.go-to-floor($f.floor-num) unless $f.floor-num == any($e.destination-queue) }; $f.on('up-button-pressed', &call); $f.on('down-button-pressed', &call);",
        solution:
            `sub init(@elevators, @floors) {\n` +
            `    my $e = @elevators[0];\n` +
            `    for @floors -> $f {\n` +
            `        my &call = { $e.go-to-floor($f.floor-num) unless $f.floor-num == any($e.destination-queue) };\n` +
            `        $f.on('up-button-pressed', &call);\n` +
            `        $f.on('down-button-pressed', &call);\n` +
            `    }\n` +
            `    $e.on('floor-button-pressed', -> $n { $e.go-to-floor($n) unless $n == any($e.destination-queue) });\n` +
            `}\n\n` +
            `sub update($dt, @elevators, @floors) { }\n`,
    },
];

export default {
    id: "elevator",
    title: "Elevator Saga",
    description: "Program the elevators (a Raku port of play.elevatorsaga.com).",
    levels: LEVELS,
};
