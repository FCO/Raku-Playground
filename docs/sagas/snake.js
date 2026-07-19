// "Snake Arena" — a Battlesnake-style coding game, ported to Raku.
// (Inspired by Battlesnake, https://play.battlesnake.com/, and the classic Snake.)
//
// A challenge saga (type: "snake"): you write `sub move($you, $board)` that
// returns a direction ('up'|'down'|'left'|'right') once per tick. Everything runs
// as ONE Raku program inside the Web Worker — the engine (docs/snake-engine.js)
// ticks time, advances the snake, resolves collisions and streams the resulting
// event log; the main thread only animates it. Each level's `solution` is run by
// the headless verification, so keep the seeds/goals tuned to it.
//
// Level fields: W/H (grid), seed, ticks (cap), food (simultaneous food),
// start:{x,y,dir}, optional opponent:{x,y,dir,delay}. `budget` is the win
// condition — { survive: N } (alive at tick N) · { food: N } (eat N) ·
// { length: N } (grow to length N; a death *after* reaching it still counts).
// `goal` is the display line.
//
// The API (kebab-case Raku):
//   move($you, $board) -> 'up' | 'down' | 'left' | 'right'
//   Coordinates: (0,0) is bottom-left; 'up' increases y.
//   $you   : .head (a Pos), .body (list of Pos, head first), .length, .id
//   Pos    : .x, .y, .dist-to($other)  (Manhattan distance)
//   $board : .width, .height, .food (list of Pos), .snakes (list of $you-like views),
//            .in-bounds($x, $y), .occupied($x, $y),
//            .nearest-food($from)  -> the closest food Pos (or an undefined Pos),
//            .step-toward($from, $to) -> a direction string toward $to (greedy),
//            .neighbor($pos, $dir) -> the Pos one step away (may be off-board)
//   State that must persist between ticks lives in ordinary file-scope `my`
//   variables in your program — they survive from one move() call to the next.

const CREDIT =
    "This saga is inspired by **Battlesnake** (https://play.battlesnake.com/) and " +
    "the classic Snake. You write one function, `move`, that the engine calls every " +
    "tick to steer your snake.";

const API =
    "`move($you, $board)` returns a direction: `'up'`, `'down'`, `'left'` or " +
    "`'right'`. `(0,0)` is the bottom-left cell and `'up'` increases *y*. `$you.head` " +
    "is where your snake's head is (a `Pos` with `.x`/`.y`); `$you.body` is the whole " +
    "snake, head first. `$board` knows the `.width`/`.height`, the `.food` and the " +
    "`.snakes`, and offers helpers: `.neighbor($pos, $dir)` (the cell one step away), " +
    "`.in-bounds($x, $y)`, `.occupied($x, $y)`, `.nearest-food($from)` and " +
    "`.step-toward($from, $to)`.";

// Reused across the food-seeking levels — greedy toward the nearest food, taking
// the first direction that stays on the board and off every snake.
const GREEDY_SOLUTION =
    `sub move($you, $board) {\n` +
    `    my $head = $you.head;\n` +
    `    my $food = $board.nearest-food($head);\n` +
    `    my $want = $board.step-toward($head, $food);\n` +
    `    my @order = $want, |<up right down left>.grep(* ne $want);\n` +
    `    for @order -> $dir {\n` +
    `        my $n = $board.neighbor($head, $dir);\n` +
    `        next unless $board.in-bounds($n.x, $n.y);\n` +
    `        next if $board.occupied($n.x, $n.y);\n` +
    `        return $dir;\n` +
    `    }\n` +
    `    $want;\n` +
    `}\n`;

const GREEDY_STARTER =
    `sub move($you, $board) {\n` +
    `    my $head = $you.head;\n` +
    `    my $food = $board.nearest-food($head);        # closest food (a Pos)\n` +
    `    my $want = $board.step-toward($head, $food);   # a direction toward it\n` +
    `    # Try $want first, then the other directions — return the first one\n` +
    `    # that is in-bounds and not occupied by a snake.\n` +
    `    $want;\n` +
    `}\n`;

const GREEDY_HINT =
    "my @order = $want, |<up right down left>.grep(* ne $want); " +
    "for @order -> $dir { my $n = $board.neighbor($head, $dir); " +
    "return $dir if $board.in-bounds($n.x, $n.y) && !$board.occupied($n.x, $n.y); }";

const LEVELS = [
    {
        type: "snake",
        name: "First Slither",
        goal: "Stay alive for 35 ticks — just don't crash into a wall or yourself.",
        W: 11, H: 9, seed: 101, ticks: 35, food: 2,
        start: { x: 5, y: 4, dir: "up" },
        budget: { survive: 35 },
        steps: [
            "Write sub move($you, $board) — it returns 'up', 'down', 'left' or 'right' each tick.",
            "$board.neighbor($you.head, $dir) gives the cell one step that way (a Pos with .x/.y).",
            "Return the first direction that is $board.in-bounds and not $board.occupied.",
        ],
        explain: [
            CREDIT,
            API,
            "Your snake moves forward on its own every tick — your job is to pick the *direction*. " +
            "The only ways to die are hitting a wall (off the board) or your own body, so the whole " +
            "level is: **find a safe cell and go there**.",
            "Loop over `<up right down left>`; for each, ask `$board.neighbor($head, $dir)` for the " +
            "target cell and keep it only if `$board.in-bounds($n.x, $n.y)` and not " +
            "`$board.occupied($n.x, $n.y)`. Return that direction. (You can't turn straight back on " +
            "yourself anyway — the engine ignores a 180° reversal.)",
        ],
        starter:
            `# Return a direction each tick: 'up', 'down', 'left' or 'right'.\n` +
            `sub move($you, $board) {\n` +
            `    my $head = $you.head;\n` +
            `    # Try each direction; return the first SAFE one.\n` +
            `    'up';\n` +
            `}\n`,
        hint: "for <up right down left> -> $dir { my $n = $board.neighbor($you.head, $dir); return $dir if $board.in-bounds($n.x, $n.y) && !$board.occupied($n.x, $n.y); }",
        solution:
            `sub move($you, $board) {\n` +
            `    my $head = $you.head;\n` +
            `    for <up right down left> -> $dir {\n` +
            `        my $n = $board.neighbor($head, $dir);\n` +
            `        return $dir if $board.in-bounds($n.x, $n.y) && !$board.occupied($n.x, $n.y);\n` +
            `    }\n` +
            `    'up';\n` +
            `}\n`,
    },
    {
        type: "snake",
        name: "Snack Time",
        goal: "Hunt down 3 pieces of food.",
        W: 11, H: 9, seed: 101, ticks: 90, food: 3,
        start: { x: 5, y: 4, dir: "up" },
        budget: { food: 3 },
        steps: [
            "$board.nearest-food($you.head) returns the closest food (a Pos).",
            "$board.step-toward($head, $food) returns a direction that heads toward it.",
            "Try that direction first, but fall back to any safe direction so you never crash.",
        ],
        explain: [
            "Now you want to *reach* food, not just survive. `$board.nearest-food($head)` finds the " +
            "closest one and `$board.step-toward($head, $food)` hands you a direction that shrinks the " +
            "distance — a greedy chase.",
            "Greedy alone can walk you into a wall or your own tail, so keep the safety check from the " +
            "last level: try the food-ward direction **first**, then the others, and return the first " +
            "that is in-bounds and unoccupied. Building the try-order is a one-liner: " +
            "`my @order = $want, |<up right down left>.grep(* ne $want);`.",
            "Eating grows your snake by one segment; a fresh piece of food appears each time.",
        ],
        starter: GREEDY_STARTER,
        hint: GREEDY_HINT,
        solution: GREEDY_SOLUTION,
    },
    {
        type: "snake",
        name: "Growth Spurt",
        goal: "Grow your snake to length 6.",
        W: 11, H: 9, seed: 101, ticks: 90, food: 3,
        start: { x: 5, y: 4, dir: "up" },
        budget: { length: 6 },
        steps: [
            "Same greedy chase — every food you eat adds a segment.",
            "You start at length 3, so three good meals reach length 6.",
            "$you.length (or $you.body.elems) tells you how long you are right now.",
        ],
        explain: [
            "Length is just three plus the food you've eaten, so the greedy hunter from *Snack Time* " +
            "gets you there — keep chasing `nearest-food` and stay safe.",
            "As you get longer, that safety check earns its keep: your own body is a growing obstacle, " +
            "and `$board.occupied` already treats every snake segment (yours included) as a wall to " +
            "avoid.",
            "`$you.length` reports your current size, and `$you.body` is the list of `Pos` from head to " +
            "tail if you want to reason about your shape.",
        ],
        starter: GREEDY_STARTER,
        hint: GREEDY_HINT,
        solution: GREEDY_SOLUTION,
    },
    {
        type: "snake",
        name: "Tight Quarters",
        goal: "Reach length 7 on a cramped board — mind your own tail.",
        W: 9, H: 8, seed: 101, ticks: 120, food: 2,
        start: { x: 4, y: 4, dir: "up" },
        budget: { length: 7 },
        steps: [
            "The board is smaller now, so a length-7 snake fills a lot of it.",
            "The safety check that skips $board.occupied cells is what keeps you off your own body.",
            "Greedy-first, safe-fallback is still the whole strategy.",
        ],
        explain: [
            "Small board, long snake: this is where careless greedy pathing coils you into a corner. " +
            "The same greedy-with-safety move keeps working, because it never steps onto an occupied " +
            "cell — and once you're seven long, most of the occupied cells are *you*.",
            "If you want to be cleverer, `$board.occupied` and `$you.body` let you look several moves " +
            "ahead — but the simple version clears the level.",
            "`$board.step-toward` only points *toward* food; the safety loop is what turns a suicidal " +
            "beeline into a survivable path.",
        ],
        starter: GREEDY_STARTER,
        hint: GREEDY_HINT,
        solution: GREEDY_SOLUTION,
    },
    {
        type: "snake",
        name: "Feeding Frenzy",
        goal: "A board full of food — gobble up 8 pieces.",
        W: 13, H: 11, seed: 101, ticks: 100, food: 5,
        start: { x: 6, y: 5, dir: "up" },
        budget: { food: 8 },
        steps: [
            "Five pieces of food are on the board at once — nearest-food keeps you efficient.",
            "Every meal respawns a new piece, so there's always something to chase.",
            "Same greedy-first, safe-fallback move; it just eats faster here.",
        ],
        explain: [
            "With five foods out at a time, `nearest-food` always has a close target, so the greedy " +
            "hunter racks up meals quickly. Eight pieces takes you to length 11.",
            "This is a good place to notice that `nearest-food` re-picks the closest target *every " +
            "tick* — so as you swerve for safety, you naturally retarget whichever food is now nearest.",
            "That's the whole game loop: read the board, pick the best safe step, repeat — exactly " +
            "like a real Battlesnake at https://play.battlesnake.com/. 🐍",
        ],
        starter: GREEDY_STARTER,
        hint: GREEDY_HINT,
        solution: GREEDY_SOLUTION,
    },
    {
        type: "snake",
        name: "Rival Run",
        goal: "Share the arena with a rival snake — reach length 5 before it gets in your way.",
        W: 15, H: 11, seed: 101, ticks: 70, food: 3,
        start: { x: 3, y: 5, dir: "up" },
        opponent: { x: 11, y: 5, dir: "down", delay: 14 },
        budget: { length: 5 },
        steps: [
            "A second snake shares the board — $board.snakes lists everyone (you included).",
            "$board.occupied already avoids ITS body too; also steer clear of the cell next to its head.",
            "Grab two quick meals to reach length 5 — the rival wakes up after a moment.",
        ],
        explain: [
            "Now you're not alone. `$board.snakes` is every snake on the board — filter out your own " +
            "`.id` to find the rival: `my @rivals = $board.snakes.grep(*.id != $you.id);`.",
            "`$board.occupied` already keeps you off the rival's body. The extra danger is a *head-on* " +
            "collision: if you step into a cell right next to the rival's head, it might move there too. " +
            "So also skip a candidate cell when a rival head is one step away and at least as long as " +
            "you: `next if @rivals.first({ .head.dist-to($n) <= 1 && .length >= $you.length });`.",
            "The rival hesitates for a moment before it starts hunting, so a brisk greedy run to length " +
            "5 gets you there. That's the saga — an event-driven Snake AI in Raku. 🐍🏁",
        ],
        starter:
            `sub move($you, $board) {\n` +
            `    my $head = $you.head;\n` +
            `    my @rivals = $board.snakes.grep(*.id != $you.id);\n` +
            `    my $want = $board.step-toward($head, $board.nearest-food($head));\n` +
            `    my @order = $want, |<up right down left>.grep(* ne $want);\n` +
            `    # Return the first direction that is in-bounds, unoccupied, AND not\n` +
            `    # next to a rival head at least as long as you.\n` +
            `    $want;\n` +
            `}\n`,
        hint: "for @order -> $dir { my $n = $board.neighbor($head, $dir); next unless $board.in-bounds($n.x, $n.y); next if $board.occupied($n.x, $n.y); next if @rivals.first({ .head.dist-to($n) <= 1 && .length >= $you.length }); return $dir; }",
        solution:
            `sub move($you, $board) {\n` +
            `    my $head = $you.head;\n` +
            `    my @rivals = $board.snakes.grep(*.id != $you.id);\n` +
            `    my $want = $board.step-toward($head, $board.nearest-food($head));\n` +
            `    my @order = $want, |<up right down left>.grep(* ne $want);\n` +
            `    for @order -> $dir {\n` +
            `        my $n = $board.neighbor($head, $dir);\n` +
            `        next unless $board.in-bounds($n.x, $n.y);\n` +
            `        next if $board.occupied($n.x, $n.y);\n` +
            `        next if @rivals.first({ .head.dist-to($n) <= 1 && .length >= $you.length });\n` +
            `        return $dir;\n` +
            `    }\n` +
            `    # Boxed in — take any cell that isn't a wall or a body.\n` +
            `    for @order -> $dir {\n` +
            `        my $n = $board.neighbor($head, $dir);\n` +
            `        return $dir if $board.in-bounds($n.x, $n.y) && !$board.occupied($n.x, $n.y);\n` +
            `    }\n` +
            `    $want;\n` +
            `}\n`,
    },
];

export default {
    id: "snake",
    title: "Snake Arena",
    description: "Program a snake to hunt food and outlast a rival (a Battlesnake-style game).",
    levels: LEVELS,
};
