// The "Learn Raku" saga: a 16-level guided tour of Raku syntax.
// See CLAUDE.md for the level format; `solution` is run by the headless
// verification and must beat the level.

// Grid legend: '#' path, 'G' path with gem, 'W' rock (blocks, bump),
// '~' water (fall), ' ' void (fall).
// `explain` is an array of paragraphs; text in `backticks` renders as code.
// `solution` is the reference answer — the headless verification runs every
// level's solution and requires the success banner.
const LEVELS = [
    {
        name: "Issuing Commands",
        goal: "Use Raku commands to tell Camelia 🦋 to move and collect a gem.",
        steps: [
            "Look for the gem in the puzzle world.",
            "Enter the correct combination of move-forward and collect-gem commands.",
            "Press Run.",
        ],
        explain: [
            "Welcome to Raku! A Raku program is a sequence of statements, and each statement ends " +
            "with a semicolon: `;`. When you press Run, Camelia performs your statements in order, " +
            "from top to bottom.",
            "`move-forward` and `collect-gem` are commands (in Raku they are called terms — words " +
            "that stand on their own, no parentheses needed). Notice the names: Raku identifiers " +
            "can contain hyphens, so `move-forward` is one word. This kebab-case style is very Raku.",
            "Lines starting with `#` are comments — Raku ignores them; they are notes for humans.",
            "Try it: you can also print while you play. Add `say \"here I go!\";` anywhere and watch " +
            "the output pane below the world.",
        ],
        grid: [
            "~~~~~~",
            "~###G~",
            "~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `# Move Camelia to the gem and collect it\nmove-forward;\n`,
        hint: "Camelia needs three move-forward commands to reach the gem, then collect-gem.",
        solution: "move-forward;\nmove-forward;\nmove-forward;\ncollect-gem;",
    },
    {
        name: "Turning Around Corners",
        goal: "The path turns! Use turn-left to change Camelia's direction.",
        steps: [
            "Move Camelia to the corner.",
            "Use turn-left to face the gem.",
            "Keep moving, then collect-gem.",
        ],
        explain: [
            "Camelia always moves in the direction she is facing — the little white arrow shows it. " +
            "`turn-left` and `turn-right` rotate her 90° without moving her.",
            "Order matters! Statements run strictly one after another, so `move-forward; turn-left;` " +
            "is very different from `turn-left; move-forward;`. Programming is mostly about putting " +
            "the right steps in the right order.",
            "Careful near the edges: if Camelia walks into the water, the run ends with a splash and " +
            "you try again. Failure is cheap here — that's the point of a playground.",
        ],
        grid: [
            "~~~G~~",
            "~~~#~~",
            "~###~~",
            "~~~~~~",
        ],
        start: { x: 1, y: 2, facing: "E" },
        starter: `move-forward;\nmove-forward;\n# now turn…\n`,
        hint: "Two move-forward, one turn-left, two more move-forward, then collect-gem.",
        solution: "move-forward;\nmove-forward;\nturn-left;\nmove-forward;\nmove-forward;\ncollect-gem;",
    },
    {
        name: "Repeat With xx",
        goal: "Five tiles ahead — but typing move-forward five times is beneath you. Use the xx operator.",
        steps: [
            "Count the tiles to the gem.",
            "Write move-forward xx 5 — one statement, five moves.",
            "Collect the gem.",
        ],
        explain: [
            "Raku has an operator just for repetition: `xx`. The statement `move-forward xx 5` " +
            "performs `move-forward` five times.",
            "Here is the neat part: `xx` re-evaluates its left side for every repetition (it is " +
            "“thunky”). That's why each repetition is a fresh move, and why in ordinary Raku " +
            "`rand xx 3` gives three different random numbers.",
            "Its cousin `x` repeats strings instead: `say \"ha\" x 3;` prints `hahaha`. Careful " +
            "with the difference: `move-forward x 3` (one `x`) evaluates the move just once and " +
            "repeats the resulting text — Camelia takes a single step. When you want the action " +
            "repeated, it's always `xx`.",
        ],
        grid: [
            "~~~~~~~~",
            "~#####G~",
            "~~~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `# One statement can move her five times…\n`,
        hint: "move-forward xx 5; collect-gem;",
        solution: "move-forward xx 5;\ncollect-gem;",
    },
    {
        name: "Loops: for ^4",
        goal: "Four corners, four gems. Don't repeat yourself — loop the Raku way: for ^4 { … }.",
        steps: [
            "Work out the commands for one side of the square.",
            "Wrap them in for ^4 { … } to repeat four times.",
            "Press Run.",
        ],
        explain: [
            "When you want to repeat several statements, put them in a block — curly braces `{ … }` — " +
            "and give the block to `for`.",
            "`^4` is a Range containing 0, 1, 2, 3 (“up to four, excluding it”). So " +
            "`for ^4 { … }` runs the block four times. You could also write `for 1..4 { … }` — " +
            "same four laps.",
            "Unlike many languages, Raku needs no parentheses around the loop condition: " +
            "`for ^4 { }` — bare and clean.",
            "Watch the world while it plays: one loop, four sides of the square. If your side " +
            "sequence works once, the loop makes it work four times.",
        ],
        grid: [
            "~~~~~",
            "~G#G~",
            "~#~#~",
            "~G#G~",
            "~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `for ^4 {\n    # move twice, collect the gem, turn…\n}\n`,
        hint: "for ^4 { move-forward; move-forward; collect-gem; turn-right }",
        solution: "for ^4 { move-forward; move-forward; collect-gem; turn-right }",
    },
    {
        name: "Keep Going: until",
        goal: "The corridor's length is a mystery. Walk until the way is blocked, then collect.",
        steps: [
            "Don't count tiles — you can't rely on the count.",
            "Use until is-blocked { … } to keep moving while the way is clear.",
            "The gem waits at the dead end.",
        ],
        explain: [
            "Time to ask the world questions. `is-blocked` is a query: it answers `True` when Camelia " +
            "can't move forward (water or a rock ahead), `False` otherwise. `True` and `False` are " +
            "Raku's Bool values.",
            "`until COND { … }` repeats the block as long as the condition is false — it reads like " +
            "English: “until you are blocked, move forward.”",
            "`until` is simply the negated twin of `while`: `until is-blocked { … }` means exactly " +
            "`while !is-blocked { … }`. The prefix `!` flips a Bool.",
            "Loops that ask questions are the real thing: the same program now works on corridors of " +
            "any length. That's the difference between typing commands and writing programs.",
        ],
        grid: [
            "~~~~~~~~~~",
            "~#######G~",
            "~~~~~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `until is-blocked {\n    # keep walking…\n}\n# you arrived — now what?\n`,
        hint: "until is-blocked { move-forward }; collect-gem;",
        solution: "until is-blocked { move-forward }\ncollect-gem;",
    },
    {
        name: "Only When: if",
        goal: "Gems on some tiles, not others. Collect only when standing on one.",
        steps: [
            "Walk the corridor until the rock stops you.",
            "After each step, collect a gem only if there is one.",
            "Use is-on-gem to decide.",
        ],
        explain: [
            "`is-on-gem` answers `True` when a gem is on Camelia's tile. To act on it you have two " +
            "spellings. The block form: `if is-on-gem { collect-gem }`.",
            "And the statement modifier — condition at the end: `collect-gem if is-on-gem;`. Raku " +
            "loves this postfix style; it reads like a sentence and is perfect for one-liners.",
            "There is also `unless`, the negated `if`: `say \"keep going\" unless is-blocked;`. " +
            "Use whichever reads best — that's an explicit Raku design value (TIMTOWTDI: there is " +
            "more than one way to do it).",
            "This level ends at a rock 🪨 rather than water — bumping into it is harmless, and " +
            "`is-blocked` is `True` in front of it, just like water.",
        ],
        grid: [
            "~~~~~~~~~",
            "~#G#G#G#W",
            "~~~~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `until is-blocked {\n    move-forward;\n    # collect when on a gem…\n}\n`,
        hint: "until is-blocked { move-forward; collect-gem if is-on-gem }",
        solution: "until is-blocked {\n    move-forward;\n    collect-gem if is-on-gem;\n}",
    },
    {
        name: "Your Own Words: subs",
        goal: "A zigzag staircase, three identical zigs. Teach Raku a new word: sub zig { … }.",
        steps: [
            "Work out the four commands of one zig (up one step of the staircase).",
            "Define sub zig { … } with those commands.",
            "Call zig three times — a for loop works nicely — then collect the gem.",
        ],
        explain: [
            "You are not limited to the words Raku ships with — `sub` defines your own. " +
            "`sub zig { move-forward; turn-left; }` teaches Raku a new command called `zig`, and " +
            "then `zig;` runs it, wherever and however often you like.",
            "Like the built-in commands here, your sub's name can be kebab-case: " +
            "`sub climb-one-step { … }` is a perfectly good Raku name. Naming a repeated pattern is " +
            "the single most powerful idea in programming — once the pattern has a name, you think " +
            "in zigs, not in individual moves.",
            "Call your sub in a loop: `for ^3 { zig }`. (One caution: a bare call like `zig` " +
            "followed by more words on the same line may swallow them as arguments — when mixing a " +
            "call with operators, write `zig()` with parentheses.)",
        ],
        grid: [
            "~~~~~~",
            "~~~~G~",
            "~~~##~",
            "~~##~~",
            "~##~~~",
            "~~~~~~",
        ],
        start: { x: 1, y: 4, facing: "E" },
        starter: `sub zig {\n    # one zig: forward, up, and face east again…\n}\n\nfor ^3 { zig }\n# don't forget the gem!\n`,
        hint: "sub zig { move-forward; turn-left; move-forward; turn-right }  then  for ^3 { zig }; collect-gem;",
        solution: "sub zig {\n    move-forward;\n    turn-left;\n    move-forward;\n    turn-right;\n}\nfor ^3 { zig }\ncollect-gem;",
    },
    {
        name: "Left or Right: elsif/else",
        goal: "A winding corridor. At every step decide: straight on, or turn — until you stand on the gem.",
        steps: [
            "Loop until is-on-gem.",
            "Each turn of the loop: if the way ahead is clear, move; otherwise turn toward the open side.",
            "Chain the decisions with if / elsif / else.",
        ],
        explain: [
            "Real decisions have more than two outcomes. Raku chains them with `if` … `elsif` … " +
            "`else` (note the spelling: `elsif`, not “else if”).",
            "The corridor-walker recipe: `if !is-blocked { move-forward } elsif is-blocked-left " +
            "{ turn-right } else { turn-left }` — go straight when possible, otherwise turn toward " +
            "whichever side is open.",
            "`is-blocked-left` and `is-blocked-right` peek sideways without turning. Combined with " +
            "prefix `!` (not), you can describe every situation the corridor can throw at you.",
            "Wrap the whole decision in `until is-on-gem { … }` and Camelia finds her own way — you " +
            "wrote an algorithm, not a route. Change the maze and the same code still works.",
        ],
        grid: [
            "~~~~~~~",
            "~~~##G~",
            "~~~#~~~",
            "~###~~~",
            "~~~~~~~",
        ],
        start: { x: 1, y: 3, facing: "E" },
        starter: `until is-on-gem {\n    if !is-blocked {\n        move-forward;\n    }\n    # elsif …? else …?\n}\ncollect-gem;\n`,
        hint: "until is-on-gem { if !is-blocked { move-forward } elsif is-blocked-left { turn-right } else { turn-left } }; collect-gem;",
        solution: "until is-on-gem {\n    if !is-blocked { move-forward }\n    elsif is-blocked-left { turn-right }\n    else { turn-left }\n}\ncollect-gem;",
    },
    {
        name: "Counting Steps: pointy blocks",
        goal: "A spiral whose sides grow: 1 step, 2 steps, 3 steps. Let the loop variable do the counting.",
        steps: [
            "The sides measure 1, 2 and 3 tiles — a growing pattern.",
            "Loop over the range 1..3 and catch each number in a variable: for 1..3 -> $n { … }.",
            "Move $n steps each lap (xx can repeat by a variable!), then turn-left.",
        ],
        explain: [
            "So far our loops repeated blindly. A pointy block lets the loop hand you the current " +
            "value: `for 1..3 -> $n { … }` runs the block with `$n` set to 1, then 2, then 3. The " +
            "arrow `->` introduces the block's parameter.",
            "`$n` is a variable — the `$` sigil marks “a single value”. Sigils are a Raku " +
            "signature move: they tell you at a glance what kind of thing a name holds.",
            "Operators happily take variables: `move-forward xx $n` moves 1 step on the first lap, " +
            "2 on the second, 3 on the third. The pattern in the world becomes a pattern in the code.",
            "Variables interpolate right inside double-quoted strings: `say \"side $n done\";` — " +
            "add it to your loop and watch the output pane count with you.",
            "You can also declare your own with `my`: `my $laps = 3; for 1..$laps -> $n { … }`.",
        ],
        grid: [
            "~~~~~~",
            "~G###~",
            "~~~~#~",
            "~~~##~",
            "~~~~~~",
        ],
        start: { x: 3, y: 3, facing: "E" },
        starter: `for 1..3 -> $n {\n    say "side $n";\n    # move $n steps, then turn…\n}\n# and the gem?\n`,
        hint: "for 1..3 -> $n { move-forward xx $n; turn-left }; collect-gem;",
        solution: "for 1..3 -> $n {\n    move-forward xx $n;\n    turn-left;\n}\ncollect-gem;",
    },
    {
        name: "At Least Once: repeat",
        goal: "Some things must happen before you can check anything. Use repeat { … } until — the body always runs first.",
        steps: [
            "Move and collect inside a repeat block.",
            "Put the condition at the end: repeat { … } until is-blocked;",
            "The block runs before the first check — perfect when you must take at least one step.",
        ],
        explain: [
            "`until` and `while` check the condition before the block runs — so the block might " +
            "never run at all. Sometimes that's wrong: Camelia must step off the starting tile " +
            "before there is anything to check.",
            "`repeat { … } until COND;` runs the block first, then checks — the body is guaranteed " +
            "at least one run. It also comes in a `repeat { … } while COND;` flavor. (Other " +
            "languages call this do/while.)",
            "Meet `unless` too — the negated `if`: `unless is-blocked { move-forward }` reads " +
            "“move, unless the way is blocked”. Note: `unless` deliberately has no `else` in Raku — " +
            "if you need one, you wanted `if` with the condition flipped.",
            "These negated forms (`until`, `unless`) exist so your code can say what you mean " +
            "without `!` gymnastics. Pick the word that reads like the sentence in your head.",
        ],
        grid: [
            "~~~~~~~~~~",
            "~#G##G#GW~",
            "~~~~~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `repeat {\n    # step, then collect if there's a gem…\n} until is-blocked;\n`,
        hint: "repeat { move-forward; collect-gem if is-on-gem } until is-blocked;",
        solution: "repeat {\n    move-forward;\n    collect-gem if is-on-gem;\n} until is-blocked;",
    },
    {
        name: "While There Are Gems",
        goal: "A circular track never blocks you — loop while gems-left is still a number above zero.",
        steps: [
            "gems-left tells you how many gems remain — it's a number, not a Bool.",
            "In Raku, 0 is false and every other number is true.",
            "while gems-left { … } keeps lapping the track until the count hits zero.",
        ],
        explain: [
            "New query: `gems-left` answers with a number — an `Int`. Try `say gems-left;` and " +
            "watch the output pane.",
            "Here is a Raku superpower: any value can act as a Bool. For numbers, `0` is false and " +
            "everything else is true. So `while gems-left { … }` literally reads “while there are " +
            "gems left” — no `> 0` needed (though `while gems-left > 0 { … }` works too).",
            "On a circular track `is-blocked` alone can't stop you — you'd fly laps forever. The " +
            "stopping condition must come from the world's state: the gem count.",
            "Corners still need care: `turn-right if is-blocked;` before each step keeps Camelia on " +
            "the track. Statement modifiers keep the loop body tidy.",
        ],
        grid: [
            "~~~~~",
            "~#G#~",
            "~#~G~",
            "~#G#~",
            "~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `while gems-left {\n    turn-right if is-blocked;\n    # step and collect…\n}\n`,
        hint: "while gems-left { turn-right if is-blocked; move-forward; collect-gem if is-on-gem }",
        solution: "while gems-left {\n    turn-right if is-blocked;\n    move-forward;\n    collect-gem if is-on-gem;\n}",
    },
    {
        name: "Escape the loop: next & last",
        goal: "The bare loop { … } runs forever — unless you break out. Steer it with next and last.",
        steps: [
            "loop { … } repeats with no condition at all.",
            "next skips the rest of this lap; last exits the loop for good.",
            "Collect every gem, and last out when none are left.",
        ],
        explain: [
            "`loop { … }` is Raku's unconditional loop: it just runs, forever. All the control " +
            "comes from inside — that's what `next` and `last` are for.",
            "`next` abandons the current lap and starts the next one. `last` leaves the loop " +
            "entirely. Both read best with statement modifiers: `next unless is-on-gem;` — “nothing " +
            "here, move along”.",
            "A word of warning you can now appreciate: a `loop { }` that neither moves nor exits " +
            "will spin forever and freeze the page. The runaway guard stops loops that keep issuing " +
            "commands, but a loop that does nothing at all is beyond rescue — the Stop is on you.",
            "(For C fans: `loop (my $i = 0; $i < 5; $i++) { … }` also exists — init; condition; " +
            "step — but the bare form plus `next`/`last` is often clearer.)",
        ],
        grid: [
            "~~~~~~~~~~",
            "~#G#G#G##~",
            "~~~~~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `loop {\n    move-forward;\n    # skip if no gem… collect… stop when done…\n}\n`,
        hint: "loop { move-forward; next unless is-on-gem; collect-gem; last unless gems-left }",
        solution: "loop {\n    move-forward;\n    next unless is-on-gem;\n    collect-gem;\n    last unless gems-left;\n}",
    },
    {
        name: "Choosing: given/when",
        goal: "Narrate the hunt: given gems-left, say something different when 0, when 1, and otherwise.",
        steps: [
            "Walk and collect as usual (until is-blocked).",
            "After each step, use given gems-left { … } to pick a message.",
            "when 0 { … }, when 1 { … }, default { … } — watch the output pane tell the story.",
        ],
        explain: [
            "`given` puts a value “on the table”: inside its block, that value becomes the topic, " +
            "`$_`. Then each `when` compares the topic against its pattern and runs its block on " +
            "the first match; `default` catches everything else.",
            "The comparison is smartmatch (`~~`) — much richer than equality. `when 0` matches the " +
            "number 0; `when 1..2` matches a range; `when Int` would match any integer; in wider " +
            "Raku, `when /gem/` matches a regex. One construct, many kinds of question.",
            "Only the first matching `when` runs — after it, execution leaves the `given` block " +
            "automatically. No fall-through, no break needed.",
            "You'll find `given`/`when` all over real Raku code wherever a chain of " +
            "`if/elsif/elsif…` would be comparing the same value each time.",
        ],
        grid: [
            "~~~~~~~~",
            "~#G#G#W~",
            "~~~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `until is-blocked {\n    move-forward;\n    collect-gem if is-on-gem;\n    given gems-left {\n        # when 0 { … } when 1 { … } default { … }\n    }\n}\n`,
        hint: "given gems-left { when 0 { say \"all clear!\" } when 1 { say \"one to go\" } default { say \"keep hunting\" } }",
        solution: "until is-blocked {\n    move-forward;\n    collect-gem if is-on-gem;\n    given gems-left {\n        when 0  { say \"all clear!\" }\n        when 1  { say \"one to go\" }\n        default { say \"keep hunting\" }\n    }\n}",
    },
    {
        name: "Named Arguments",
        goal: "One sub, two behaviors: stride($n, :$collect) — pass :collect on the gem sides, skip it elsewhere.",
        steps: [
            "The long sides (5 tiles) carry gems; the short sides (3 tiles) don't.",
            "Give stride a named parameter: sub stride($n, :$collect) { … }.",
            "Call it as stride 5, :collect; on gem sides and plain stride 3; elsewhere.",
        ],
        explain: [
            "Parameters can be named. In `sub stride($n, :$collect) { … }`, `$n` is positional " +
            "(passed by place) and `:$collect` is named (passed by name). Named arguments make call " +
            "sites self-documenting: `stride 5, :collect;` says what the True is for.",
            "`:collect` is adverb syntax — shorthand for `collect => True`. Its negation is " +
            "`:!collect` (explicitly False). Leave it out and `$collect` is simply not set — which " +
            "is false-ish, so `if $collect { … }` skips.",
            "Inside the sub, combine it with what you know: `collect-gem if $collect and " +
            "is-on-gem;` — `and` is the low-precedence, readable cousin of `&&`.",
            "Named parameters shine as subs grow. `stride(5, True)` forces readers to memorize " +
            "positions; `stride 5, :collect` explains itself forever.",
        ],
        grid: [
            "~~~~~~~~",
            "~#G#G##~",
            "~#~~~~#~",
            "~#~~~~#~",
            "~#G#G##~",
            "~~~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `sub stride($n, :$collect) {\n    for ^$n {\n        move-forward;\n        # collect only if asked to…\n    }\n}\n\nfor ^2 {\n    stride 5, :collect;\n    turn-right;\n    stride 3;\n    turn-right;\n}\n`,
        hint: "Inside the loop: collect-gem if $collect and is-on-gem;",
        solution: "sub stride($n, :$collect) {\n    for ^$n {\n        move-forward;\n        collect-gem if $collect and is-on-gem;\n    }\n}\nfor ^2 {\n    stride 5, :collect;\n    turn-right;\n    stride 3;\n    turn-right;\n}",
    },
    {
        name: "With or Without",
        goal: "Definedness is its own question. Meet with, the defined-or // and the ?? !! ternary.",
        steps: [
            "Each step, build a value that is either a string or Nil: is-on-gem ?? \"a gem\" !! Nil.",
            "with $find { … } runs only when the value is defined — and $_ is the value.",
            "Report the other case using // (defined-or).",
        ],
        explain: [
            "`COND ?? A !! B` is Raku's ternary: pick `A` when the condition is true, else `B`. " +
            "Here `is-on-gem ?? \"a gem\" !! Nil` yields either a string or `Nil` — the classic " +
            "“nothing there” value.",
            "`if` asks “is it true?”; `with` asks a different question: “is it defined?”. " +
            "`with $find { say \"found $_!\" }` runs only when `$find` holds something — and " +
            "topicalizes it, so `$_` is the found value inside. Its negative twin is `without`.",
            "`//` is the defined-or operator: `$find // \"nothing\"` gives `$find` when defined, " +
            "otherwise the fallback. It's how Raku spells default values: `my $name = %config<name> " +
            "// \"anonymous\";`.",
            "Why not just truthiness? Because `0` and `\"\"` are false but perfectly good, defined " +
            "values. `with` and `//` let “absent” be different from “falsy” — a distinction Raku " +
            "takes seriously.",
        ],
        grid: [
            "~~~~~~~~~",
            "~##G#G#W~",
            "~~~~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `until is-blocked {\n    move-forward;\n    my $find = is-on-gem ?? "a gem" !! Nil;\n    # with $find { … }  and report with // …\n}\n`,
        hint: "with $find { say \"found $_!\"; collect-gem }  and  say \"here: \" ~ ($find // \"nothing\");",
        solution: "until is-blocked {\n    move-forward;\n    my $find = is-on-gem ?? \"a gem\" !! Nil;\n    with $find { say \"found $_!\"; collect-gem }\n    say \"here: \" ~ ($find // \"nothing\");\n}",
    },
    {
        name: "The Gauntlet",
        goal: "One big island, five gems around the shore. Use everything: a sub with a parameter, loops, conditionals.",
        steps: [
            "The shore is a rectangle: long side 5 tiles, short side 3 tiles.",
            "Define sub stride($n) that moves $n times, collecting gems along the way.",
            "Walk the rectangle: twice around { stride 5; turn-right; stride 3; turn-right }.",
        ],
        explain: [
            "The last island. No new syntax — this one is about composing what you already own " +
            "into something that reads like a plan.",
            "Structure it top-down: `sub stride($n) { for ^$n { move-forward; collect-gem if " +
            "is-on-gem } }`, then the whole journey is two lines of intent: `for ^2 { stride 5; " +
            "turn-right; stride 3; turn-right }`. Reading it tells you what happens — that's what " +
            "all the syntax was for.",
            "Your Raku toolbox: statements and `;` · comments `#` · terms · `xx` repetition · " +
            "blocks `{ }` · `for` with ranges `^n` and `1..n` · pointy blocks `-> $n` · " +
            "`while`/`until` and `repeat` · `loop` with `next`/`last` · `if`/`elsif`/`else`/" +
            "`unless` · statement modifiers · `given`/`when`/`default` · `with`/`without` and `//` · " +
            "`?? !!` · `!` negation · truthiness (0 is false!) · `sub`, positional and named " +
            "parameters, adverbs `:collect` · `$`-sigiled variables, `my` · `say` with interpolation.",
            "That's a genuine start on a genuine language. From here: Free play mode is yours — and " +
            "docs.raku.org continues the journey where these islands end. 🦋",
        ],
        grid: [
            "~~~~~~~~",
            "~##G##G~",
            "~G~~~~#~",
            "~#~~~~G~",
            "~###G##~",
            "~~~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `sub stride($n) {\n    # $n times: move, and collect if on a gem…\n}\n\nfor ^2 {\n    stride 5;\n    turn-right;\n    stride 3;\n    turn-right;\n}\n`,
        hint: "sub stride($n) { for ^$n { move-forward; collect-gem if is-on-gem } }  then walk the rectangle with for ^2 { stride 5; turn-right; stride 3; turn-right }",
        solution: "sub stride($n) {\n    for ^$n {\n        move-forward;\n        collect-gem if is-on-gem;\n    }\n}\nfor ^2 {\n    stride 5;\n    turn-right;\n    stride 3;\n    turn-right;\n}",
    },
];

export default {
    id: "learn-raku",
    title: "Learn Raku",
    description: "A guided tour of Raku syntax, one island at a time.",
    levels: LEVELS,
};
