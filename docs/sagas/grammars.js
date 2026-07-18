// The "Regexes & Grammars" saga — Raku's crown jewels. `type: "dom"` levels:
// the preview pane shows the specimen text with every match highlighted
// (the prelude's show-matches helper renders through window.RX_RENDER), and
// checks verify both the highlighted marks and the printed output.

// The runtime runs in a Web Worker (no DOM), so show-matches can't build the
// highlight itself. It matches in pure Raku, then emits the specimen + match
// ranges on a sentinel stdout line ("@@RX@@<codepoints>@<from,to;…>") that the
// worker turns into a render message; the main thread draws the <pre>/<mark>s
// (see renderMatches in playground.js). Marker/delimiter are ASCII (NQP_STDOUT
// HTML-encodes non-ASCII); the payload is codepoints/integers — the one Raku→JS
// channel that's reliable here (arbitrary string args are not). The
// human-readable summary is a normal `say`.
const PRELUDE = `
sub show-matches(Str $text, $rx) {
    my @m = $text.match($rx, :g);
    say '@@RX@@' ~ $text.ords.join(',') ~ '@' ~ @m.map({ .from ~ ',' ~ .to }).join(';');
    say @m ?? "{+@m} match{+@m == 1 ?? '' !! 'es'}: " ~ @m».Str.join(' | ') !! 'no matches';
    @m
}
`.trim().split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.endsWith("}") ? l + ";" : l))
    .join(" ");

const LEVELS = [
    {
        type: "dom",
        name: "First Match",
        goal: "Write your first regex: find the gem hidden in the sentence.",
        steps: [
            "A regex literal is written between slashes: /gem/.",
            "show-matches($text, /gem/) highlights every match in the preview and prints what it found.",
            "Press Run and watch the specimen light up.",
        ],
        explain: [
            "Regexes are patterns for matching text, and in Raku they are not strings — they are " +
            "code, written between slashes: `/gem/` matches the letters g-e-m anywhere in a string.",
            "The everyday way to use one is smartmatch: `\"I found a gem\" ~~ /gem/` returns a " +
            "`Match` object (truthy) on success or `Nil` (falsy) on failure. `if $text ~~ /gem/ " +
            "{ … }` reads exactly like the sentence it is.",
            "One thing PCRE veterans must hear early: **whitespace inside a Raku regex is " +
            "insignificant**. `/g e m/` matches exactly the same as `/gem/` — spaces are for the " +
            "human. When you mean a literal space, quote it: `/'two words'/` — quoted strings " +
            "inside a regex match literally.",
            "This saga gives you `show-matches($text, /…/)`: it highlights every match in the " +
            "preview pane, prints the list to the output, and returns the matches. All the " +
            "specimen text lives in your editor — change it and experiment!",
        ],
        starter: `my $text = "Camelia hid a gem under the bridge.";\n\n# highlight the gem…\nshow-matches($text, /gem/);\n`,
        hint: "show-matches($text, /gem/);",
        solution: `my $text = "Camelia hid a gem under the bridge.";\nshow-matches($text, /gem/);`,
        check(preview, ctx) {
            const marks = [...preview.querySelectorAll("mark")].map((m) => m.textContent);
            return marks.length === 1 && marks[0] === "gem" && /1 match: gem/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected exactly one highlighted “gem”" };
        },
    },
    {
        type: "dom",
        name: "Digits and Quantifiers",
        goal: "Highlight every number in the sentence — however many digits long.",
        steps: [
            "\\d matches one digit; \\w a word character; . any character.",
            "Quantifiers repeat what precedes them: + is “one or more”, * “zero or more”, ? “optional”.",
            "\\d+ therefore matches a whole number. Find all four.",
        ],
        explain: [
            "Character shortcuts: `\\d` a digit, `\\w` a word character (letter, digit, underscore), " +
            "`\\s` whitespace, `.` anything. Capitalized negates: `\\D` is any non-digit.",
            "On their own they match a single character. Quantifiers give them reach: `\\d+` is one " +
            "or more digits — a whole number — while `\\d*` tolerates none, and `\\d?` means " +
            "at-most-one.",
            "`show-matches` finds every occurrence (in classic regex talk, it matches *globally* — " +
            "the `:g` adverb, which you'll meet properly soon). Watch how `\\d+` grabs `1987` as " +
            "ONE match, not four: quantifiers are greedy, taking as much as they can.",
        ],
        starter: `my $text = "In 1987 Larry planted 2 seeds; by 1990 they were 100 ideas tall.";\n\n# match whole numbers…\nshow-matches($text, /\\d/);\n`,
        hint: "show-matches($text, /\\d+/);",
        solution: `my $text = "In 1987 Larry planted 2 seeds; by 1990 they were 100 ideas tall.";\nshow-matches($text, /\\d+/);`,
        check(preview, ctx) {
            const marks = [...preview.querySelectorAll("mark")].map((m) => m.textContent);
            return marks.join(",") === "1987,2,1990,100"
                ? { success: true }
                : { success: false, message: "expected the four whole numbers 1987, 2, 1990, 100 highlighted", got: marks };
        },
    },
    {
        type: "dom",
        name: "Character Classes",
        goal: "Highlight every Capitalized word — using Raku's character classes and word boundaries.",
        steps: [
            "Raku char classes wear angle brackets: <[abc]> — plain [ ] is just grouping!",
            "<:Lu> matches any Unicode uppercase letter; << is a word's left boundary.",
            "Combine: << <:Lu> \\w* — a word that starts with an uppercase letter.",
        ],
        explain: [
            "Here Raku breaks hardest with PCRE tradition: square brackets `[ ]` are **grouping** " +
            "in Raku regexes (non-capturing). Character classes wear angle brackets instead: " +
            "`<[aeiou]>` is a vowel, `<[a..f0..9]>` a hex digit, and `<-[,]>` (with a minus) is " +
            "anything *except* a comma.",
            "Unicode properties come free: `<:Lu>` matches any uppercase letter, `<:N>` any " +
            "number — in any script, not just ASCII.",
            "`<<` and `>>` anchor to word boundaries (left and right). `^` and `$` anchor to the " +
            "string's start and end. Anchors match *positions*, consuming nothing.",
            "So `/ << <:Lu> \\w* /` reads: at a word start, one uppercase letter, then the rest of " +
            "the word. Whitespace insignificance means you can space it out until it reads well — " +
            "that's the intended style.",
        ],
        starter: `my $text = "raku Regexes Are not scary, said Camelia to Larry.";\n\n# words that start with an uppercase letter…\nshow-matches($text, / <:Lu> /);\n`,
        hint: "show-matches($text, / << <:Lu> \\w* /);",
        solution: `my $text = "raku Regexes Are not scary, said Camelia to Larry.";\nshow-matches($text, / << <:Lu> \\w* /);`,
        check(preview, ctx) {
            const marks = [...preview.querySelectorAll("mark")].map((m) => m.textContent);
            return marks.join(",") === "Regexes,Are,Camelia,Larry"
                ? { success: true }
                : { success: false, message: "expected Regexes, Are, Camelia and Larry highlighted", got: marks };
        },
    },
    {
        type: "dom",
        name: "Captures",
        goal: "Highlight both email addresses — and print just their host parts using a named capture.",
        steps: [
            "Literal characters that mean something in regex syntax get quoted: '@' (bare @ starts an array!).",
            "$<host>=[ … ] names a capture; read it from a match as $m<host>.",
            "show-matches returns the matches — loop over them: say .<host> for @m;",
        ],
        explain: [
            "Parentheses `( … )` capture what they match, numbered from `$0` (Raku counts from " +
            "zero, even here). Square brackets `[ … ]` group *without* capturing.",
            "Better than numbers: names. `$<host>=[ \\w+ '.' \\w+ ]` captures the bracketed part " +
            "as `host`, and afterwards the match object answers `$m<host>` — match objects act " +
            "like hashes of their named captures (and arrays of their numbered ones).",
            "Note the quoting: `'@'` and `'.'` — a bare `@` would try to interpolate an array, and " +
            "a bare `.` matches anything. In Raku regexes, anything that isn't a word character " +
            "should be quoted to match literally — the regex compiler will even tell you when you " +
            "forget.",
            "`show-matches` hands back the match list, so you can both see the highlights and dig " +
            "into each match: `say .<host> for @m;` — `.<host>` is `$_.<host>` with the topic.",
        ],
        starter: `my $text = "Write to fernando@raku.org or camelia@butterfly.dev today.";\n\nmy @m = show-matches($text, / \\w+ '@' \\w+ '.' \\w+ /);\n# now name the host capture and print it for each match…\n`,
        hint: "my @m = show-matches($text, / \\w+ '@' $<host>=[ \\w+ '.' \\w+ ] /);  then  say .<host> for @m;",
        solution: `my $text = "Write to fernando@raku.org or camelia@butterfly.dev today.";\nmy @m = show-matches($text, / \\w+ '@' $<host>=[ \\w+ '.' \\w+ ] /);\nsay .<host> for @m;`,
        check(preview, ctx) {
            const marks = [...preview.querySelectorAll("mark")].map((m) => m.textContent);
            return marks.length === 2 && marks.every((m) => m.includes("@"))
                && /raku\.org/.test(ctx.output) && /butterfly\.dev/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected both emails highlighted and both hosts printed", got: marks };
        },
    },
    {
        type: "dom",
        name: "Adverbs",
        goal: "The specimen spells ruby three different ways. Catch them all with one case-insensitive regex.",
        steps: [
            "Adverbs tune a regex: :i ignores case, :g matches globally, :s makes whitespace significant.",
            "They go right after the opening slash: /:i ruby/.",
            "Alternation | picks between branches: /:i ruby | emerald/.",
        ],
        explain: [
            "Adverbs are Raku's regex switches, and they read like words instead of trailing " +
            "letter soup: `/:i ruby/` matches case-insensitively; `m:g/…/` matches globally " +
            "(that's what `show-matches` uses on your behalf); `:s` makes literal whitespace in " +
            "the pattern significant again.",
            "Alternation uses `|`: `/ ruby | emerald | opal /` — and Raku's `|` tries all branches " +
            "and prefers the **longest** match, unlike PCRE's first-wins (that one is spelled " +
            "`||` here, when you really want it).",
            "You can also write a regex as a value with `rx/…/` and pass it around in a variable — " +
            "regexes are first-class code objects, which is exactly why grammars (next level!) can " +
            "be built out of them.",
        ],
        starter: `my $text = "She found a Ruby, then a ruby, then a RUBY!";\n\n# one regex, all three spellings…\nshow-matches($text, /ruby/);\n`,
        hint: "show-matches($text, /:i ruby/);",
        solution: `my $text = "She found a Ruby, then a ruby, then a RUBY!";\nshow-matches($text, /:i ruby/);`,
        check(preview, ctx) {
            const marks = [...preview.querySelectorAll("mark")].map((m) => m.textContent);
            return marks.length === 3 && /3 matches/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected all three spellings of ruby highlighted", got: marks };
        },
    },
    {
        type: "dom",
        name: "Your First Grammar",
        goal: "Level up: a grammar is a named, structured bundle of regexes. Parse “42 gems” into its parts.",
        steps: [
            "my grammar Loot { … } holds named tokens; parsing starts at token TOP.",
            "Tokens call each other: <count> in TOP runs token count and captures under that name.",
            "Loot.parse($text) returns a match tree — read $m<count> and $m<what>.",
        ],
        explain: [
            "This is the feature Raku is famous for. A `grammar` is a class whose methods are " +
            "regexes — `token`, `rule` and `regex` declarations — and parsing means matching the " +
            "special token `TOP` against the whole string.",
            "Inside a token, `<count>` *calls* the token named count — and captures whatever it " +
            "matched under that name, building a tree: `$m<count>` is itself a full match object. " +
            "Grammars are regexes that compose, the thing plain regexes are notoriously bad at.",
            "`token` never backtracks (fast and predictable); `regex` may; `rule` is a token with " +
            "`:s` sigspace — literal whitespace in a rule matches actual whitespace, perfect for " +
            "grammars of human-ish text.",
            "Why `my grammar`? Same story as classes in the MemoizedDOM saga: the playground " +
            "re-declares on every Run, and `my` keeps the declaration local to the run.",
        ],
        starter: `my $text = "42 gems";\n\nmy grammar Loot {\n    token TOP   { <count> \\s+ <what> }\n    token count { \\d+ }\n    token what  { \\w+ }\n}\n\nmy $m = Loot.parse($text);\n# print the parts: $m<count> and $m<what>…\n`,
        hint: "say \"count = $m<count>\"; say \"what = $m<what>\";",
        solution: `my $text = "42 gems";\nmy grammar Loot {\n    token TOP   { <count> \\s+ <what> }\n    token count { \\d+ }\n    token what  { \\w+ }\n}\nmy $m = Loot.parse($text);\nsay "count = $m<count>";\nsay "what = $m<what>";`,
        check(preview, ctx) {
            // formatting is free — both parsed values must appear in the output
            return /\b42\b/.test(ctx.output) && /gems/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "print both parsed parts — the output should contain 42 and gems (any format)" };
        },
    },
    {
        type: "dom",
        name: "Lists with % Separators",
        goal: "Parse a comma-separated list of gems — with the quantifier modifier made for exactly this.",
        steps: [
            "<gem>+ % ',' means: one or more <gem>, separated by commas.",
            "The match key collects them all: $m<gem> is a list of matches.",
            "Print how many, and join their texts.",
        ],
        explain: [
            "Every language makes you hand-roll “item, item, item” parsing. Raku made it syntax: " +
            "`<gem>+ % ','` is one-or-more gems *separated by* commas — no trailing comma " +
            "allowed. Its sibling `%%` also permits a trailing separator.",
            "When a token matches multiple times, its captures stack up as a list: `$m<gem>` here " +
            "holds four match objects. `$m<gem>».Str` calls `.Str` on each — the hyper operator " +
            "`»` you can read as “for all of them”.",
            "Try breaking it: add a space after a comma and watch the parse fail (`parse` returns " +
            "`Nil`). Then fix it by making TOP a `rule` (whitespace-tolerant) or matching `','` " +
            "followed by `\\s*` — grammars fail honestly, which is what makes them debuggable.",
        ],
        starter: `my $text = "ruby,emerald,sapphire,topaz";\n\nmy grammar GemList {\n    token TOP { <gem>+ % ',' }\n    token gem { \\w+ }\n}\n\nmy $m = GemList.parse($text);\n# how many gems? which?\n`,
        hint: "say \"{+$m<gem>} gems\"; say $m<gem>».Str.join(\" / \");",
        solution: `my $text = "ruby,emerald,sapphire,topaz";\nmy grammar GemList {\n    token TOP { <gem>+ % ',' }\n    token gem { \\w+ }\n}\nmy $m = GemList.parse($text);\nsay "{+$m<gem>} gems";\nsay $m<gem>».Str.join(" / ");`,
        check(preview, ctx) {
            // any separator/format is fine — the count and all four names must show up
            const names = ["ruby", "emerald", "sapphire", "topaz"];
            return /\b4\b/.test(ctx.output) && names.every((n) => ctx.output.includes(n))
                ? { success: true }
                : { success: false, message: "the output should contain the count (4) and all four gem names — any format you like" };
        },
    },
    {
        type: "dom",
        name: "Actions: Make It Mean Something",
        goal: "Parse the whole inventory and compute the total — grammars build trees, actions turn them into answers.",
        steps: [
            "An actions class has methods named after tokens; each gets the match and can make() a value.",
            "Parse with :actions(Tally) — then $m.made is whatever TOP made.",
            "lot makes its count; TOP makes the sum: [+] $<lot>».made.",
        ],
        explain: [
            "Matching tells you the text is valid; *actions* turn it into data. Pass " +
            "`:actions(SomeClass)` to `.parse` and after each token matches, the method with the " +
            "same name runs, receiving the match as `$/`.",
            "Inside, `make VALUE` attaches a value to that node, and `.made` reads it back — so " +
            "parents aggregate children: `method TOP($/) { make [+] $<lot>».made }` sums whatever " +
            "each lot made. (`[+]` is the reduction metaoperator: `[+] 1,2,3` is 6.)",
            "This grammar+actions pair is the real architecture of real parsers — Raku's own " +
            "compiler parses Raku with a grammar exactly like this, just bigger.",
            "That's the saga: regexes that read like code, grammars that compose them, actions " +
            "that turn text into answers. docs.raku.org/language/grammars continues from here. 🦋",
        ],
        starter: `my $text = "3 rubies, 2 emeralds, 7 opals";\n\nmy grammar Inventory {\n    token TOP { <lot>+ % ', ' }\n    token lot { $<n>=[\\d+] \\s+ $<gem>=[\\w+] }\n}\n\nmy class Tally {\n    method lot($/) { make +$<n> }\n    # method TOP($/) { … make the sum … }\n}\n\nmy $m = Inventory.parse($text, :actions(Tally));\nsay "total gems: {$m.made}";\n`,
        hint: "method TOP($/) { make [+] $<lot>».made }",
        solution: `my $text = "3 rubies, 2 emeralds, 7 opals";\nmy grammar Inventory {\n    token TOP { <lot>+ % ', ' }\n    token lot { $<n>=[\\d+] \\s+ $<gem>=[\\w+] }\n}\nmy class Tally {\n    method lot($/) { make +$<n> }\n    method TOP($/) { make [+] $<lot>».made }\n}\nmy $m = Inventory.parse($text, :actions(Tally));\nsay "total gems: {$m.made}";`,
        check(preview, ctx) {
            // wording is yours — the computed total must appear
            return /\b12\b/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "print the total the actions computed — 3 + 2 + 7 = 12 should appear in the output" };
        },
    },
];

export default {
    id: "grammars",
    title: "Regexes & Grammars",
    description: "Raku's crown jewels: patterns that read like code, grammars that parse anything.",
    prelude: PRELUDE,
    levels: LEVELS,
};
