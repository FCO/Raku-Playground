// The "Data Structures" saga — arrays, hashes, pairs, sets/bags and lazy
// sequences, per docs.raku.org/language/list and friends. Output-checked.

const LEVELS = [
    {
        type: "dom",
        name: "Arrays",
        goal: "Stock the gem pouch: push, count, and reach for the last element with *-1.",
        steps: [
            "my @gems = <ruby emerald>; — @ is the array sigil.",
            "@gems.push: 'topaz'; adds one; .elems counts.",
            "@gems[*-1] is the last element — a WhateverCode index; slices like @gems[0,2] work too.",
        ],
        explain: [
            "Arrays wear the `@` sigil and answer methods: `.push`, `.pop`, `.shift`, " +
            "`.unshift`, `.elems`, `.join`, `.sort`, `.reverse`…",
            "Indexing counts from zero, and negative-style access is spelled `@gems[*-1]` — the " +
            "`*` is *whatever the size is*, so `*-1` is always the last element and `*-2` the one " +
            "before, no matter how the array grows.",
            "Slices take lists of indices: `@gems[0, 2]` is two elements at once — assignment " +
            "works through slices too.",
        ],
        starter: `my @gems = <ruby emerald>;\n@gems.push: 'topaz';\n\n# how many? what's last? slice the first and last…\nsay @gems.elems;\n`,
        hint: "say @gems[*-1];  say @gems[0, *-1].join(',');",
        solution: `my @gems = <ruby emerald>;\n@gems.push: 'topaz';\nsay @gems.elems;\nsay @gems[*-1];\nsay @gems[0, *-1].join(',');`,
        check(preview, ctx) {
            return /\b3\b/.test(ctx.output) && /topaz/.test(ctx.output) && /ruby/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected the count (3), the last element (topaz), and a slice mentioning ruby" };
        },
    },
    {
        type: "dom",
        name: "Hashes",
        goal: "Price the gems: store, look up, test existence, and loop in sorted order.",
        steps: [
            "my %price = ruby => 100, emerald => 75; — % is the hash sigil.",
            "%price<topaz> = 30; adds a key; %price<opal>:exists asks without creating.",
            "Loop deterministically: for %price.sort(*.key) -> $p { … $p.key … $p.value … }",
        ],
        explain: [
            "Hashes map keys to values under the `%` sigil. Literal keys use angle brackets — " +
            "`%price<ruby>` — and computed keys use braces: `%price{$gem}`.",
            "`:exists` is an *adverb on the subscript*: `%price<opal>:exists` answers " +
            "True/False without accidentally creating the key — a whole class of bugs Raku " +
            "designed away.",
            "Hash iteration order is deliberately unordered — sort it yourself: " +
            "`%price.sort(*.key)` yields Pair objects with `.key` and `.value`. (`*.key` is a " +
            "WhateverCode lambda — shorthand for `-> $p { $p.key }`.)",
        ],
        starter: `my %price = ruby => 100, emerald => 75;\n%price<topaz> = 30;\n\nsay %price.elems;\nsay %price<ruby>;\n# does opal exist? loop the prices sorted by key…\n`,
        hint: "say %price<opal>:exists ?? 'yes' !! 'no';  for %price.sort(*.key) -> $p { say \"{$p.key} costs {$p.value}\" }",
        solution: `my %price = ruby => 100, emerald => 75;\n%price<topaz> = 30;\nsay %price.elems;\nsay %price<ruby>;\nsay %price<opal>:exists ?? 'yes' !! 'no';\nfor %price.sort(*.key) -> $p {\n    say "{$p.key} costs {$p.value}";\n}`,
        check(preview, ctx) {
            return /\b3\b/.test(ctx.output) && /\b100\b/.test(ctx.output)
                && /\bno\b/.test(ctx.output) && /\b75\b/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected 3 entries, ruby's 100, a “no” for opal, and emerald's 75 in the loop" };
        },
    },
    {
        type: "dom",
        name: "Pairs and Ranking",
        goal: "Find the top scorer — hashes of Pairs sort and max like anything else.",
        steps: [
            "%score.max(*.value) returns the whole winning Pair — .key and .value.",
            "Sort descending by value: %score.sort(-*.value).",
            "Print the champion and the full ranking.",
        ],
        explain: [
            "A `Pair` is a first-class value — `larry => 10` exists on its own, and a Hash is " +
            "simply a bag of them. That's why hash methods hand you Pairs to play with.",
            "`.max(*.value)` and `.min`, `.sort`, `.grep`, `.map` all take that same " +
            "`*.something` shorthand. `sort(-*.value)` negates for descending numeric order — " +
            "one character instead of a comparator ritual.",
            "This composability is the theme of the whole saga: containers plus uniform methods " +
            "plus tiny lambdas — data wrangling without ceremony.",
        ],
        starter: `my %score = camelia => 9, larry => 10, dan => 8;\n\n# who won? print their name and score, then the ranking…\n`,
        hint: "my $top = %score.max(*.value);  say $top.key;  say $top.value;  for %score.sort(-*.value) -> $p { say $p.key }",
        solution: `my %score = camelia => 9, larry => 10, dan => 8;\nmy $top = %score.max(*.value);\nsay $top.key;\nsay $top.value;\nfor %score.sort(-*.value) -> $p {\n    say $p.key;\n}`,
        check(preview, ctx) {
            return /larry/.test(ctx.output) && /\b10\b/.test(ctx.output)
                && /camelia/.test(ctx.output) && /dan/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected larry with 10 as the top, and everyone in the ranking" };
        },
    },
    {
        type: "dom",
        name: "Bags and Sets",
        goal: "Count word frequencies with a Bag, and ask a Set a membership question.",
        steps: [
            "\"…\".words.Bag counts occurrences: $bag<the> is how many times “the” appeared.",
            ".keys.elems is the distinct-word count.",
            "set <ruby topaz> plus the (elem) operator answers membership.",
        ],
        explain: [
            "Sets, Bags and Mixes are real collection types, not a library afterthought. A `Set` " +
            "holds membership, a `Bag` holds *counts*, a `Mix` holds weights.",
            "Word frequency — the classic interview exercise — is a method call: " +
            "`$text.words.Bag`. Subscript a bag with a key and you get its count, zero for " +
            "absent keys, no existence-checking dance.",
            "Set operators come in Unicode (`∈`, `∪`, `⊆`) and ASCII spellings — `(elem)`, " +
            "`(|)`, `(<=)` — and work across all three types. `.keys`, `.elems`, `.total` " +
            "complete the picture.",
        ],
        starter: `my $words = "the cat saw the hat and the cat".words.Bag;\n\n# how many “the”? how many “cat”? how many DISTINCT words?\nsay $words<the>;\n\nmy $pouch = set <ruby topaz>;\n# is ruby in the pouch?\n`,
        hint: "say $words<cat>;  say $words.keys.elems;  say ('ruby' (elem) $pouch) ?? 'has ruby' !! 'no ruby';",
        solution: `my $words = "the cat saw the hat and the cat".words.Bag;\nsay $words<the>;\nsay $words<cat>;\nsay $words.keys.elems;\nmy $pouch = set <ruby topaz>;\nsay ('ruby' (elem) $pouch) ?? 'has ruby' !! 'no ruby';`,
        check(preview, ctx) {
            return /\b3\b/.test(ctx.output) && /\b2\b/.test(ctx.output)
                && /\b5\b/.test(ctx.output) && /has ruby/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected counts 3 (the), 2 (cat), 5 distinct words, and “has ruby”" };
        },
    },
    {
        type: "dom",
        name: "Lazy Sequences",
        goal: "Define ALL the Fibonacci numbers — then take only what you need.",
        steps: [
            "(1..Inf) is EVERY positive integer — .map and .grep over it stay lazy.",
            "Bind to a sigilless name (my \\squares = …) and index: squares[4] computes exactly one element.",
            "The sequence operator deduces finite rules by itself: 1, 2, 4 ... 64.",
        ],
        explain: [
            "*Lazy* means computed on demand: `(1..Inf).map(* ** 2)` is **every square number**, " +
            "and it costs nothing until you look — `squares[4]` computes exactly five elements " +
            "and stops. `.grep(* %% 7)` filters an infinite stream the same way.",
            "Bind lazy things to sigilless names (`my \\squares = …`): binding attaches the name " +
            "straight to the sequence — no container, no copying (the Containers saga explains " +
            "why). `[^6]` then slices the first six (`^6` is the range 0..5 — the same `^` you " +
            "loop with).",
            "The sequence operator `...` builds lists from a rule and can *deduce* it: " +
            "`1, 2, 4 ... 64` spots the doubling by itself. On current Rakudos it also takes " +
            "custom rules and runs forever — the famous Fibonacci one-liner is " +
            "`1, 1, * + * ... *` — but this in-browser build hangs on custom generators, so " +
            "here we stay with deduced, finite rules.",
            "Infinity as a data structure, filters that never finish and never need to — the " +
            "closing trick of the saga. 🦋",
        ],
        starter: `my \\squares = (1..Inf).map(* ** 2);\nsay squares[4];\nsay squares[^6].join(' ');\n\n# every multiple of 7, lazily — then let ... deduce a doubling rule up to 64…\n`,
        hint: "my \\sevens = (1..Inf).grep(* %% 7);  say sevens[^5].join(' ');  my \\powers = 1, 2, 4 ... 64;  say powers.join(' ');",
        solution: `my \\squares = (1..Inf).map(* ** 2);\nsay squares[4];\nsay squares[^6].join(' ');\nmy \\sevens = (1..Inf).grep(* %% 7);\nsay sevens[^5].join(' ');\nmy \\powers = 1, 2, 4 ... 64;\nsay powers.join(' ');`,
        check(preview, ctx) {
            return /\b25\b/.test(ctx.output) && /9 16 25 36/.test(ctx.output)
                && /7 14 21 28 35/.test(ctx.output) && /8 16 32 64/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected the 5th square (25), six squares, five multiples of 7, and the deduced powers of two" };
        },
    },
];

export default {
    id: "data-structures",
    title: "Data Structures",
    description: "Arrays, hashes, pairs, bags, sets — and sequences that go on forever.",
    levels: LEVELS,
};
