// The "Quoting Constructs" saga — Raku's quote family, per
// docs.raku.org/language/quoting. Output-checked dom levels (no prelude).

const LEVELS = [
    {
        type: "dom",
        name: "Two Kinds of Quotes",
        goal: "Print the same sentence with single and double quotes and watch what interpolates.",
        steps: [
            "Single quotes '…' are literal: $gem stays $gem.",
            "Double quotes \"…\" interpolate variables — and any code inside { }.",
            "Print one of each, plus a string with {2 + 3} evaluated inside.",
        ],
        explain: [
            "Raku has a whole *family* of quoting constructs, and the two everyday members set the " +
            "pattern: `'…'` means *as written* — no variables, almost no escapes — while `\"…\"` " +
            "means *fill in the blanks*.",
            "Double quotes interpolate sigiled variables (`$gem`), and — the part other languages " +
            "envy — **any expression inside braces**: `\"total: {2 + 3}\"` prints `total: 5`. " +
            "That's real code in there, not a template mini-language.",
            "Arrays and hashes need a subscript-ish form to interpolate (`\"@gems[]\"`, " +
            "`\"%h<key>\"`) so that email addresses don't explode — a deliberate design kindness.",
        ],
        starter: `my $gem = "ruby";\n\n# print it with each kind of quote, and interpolate some math…\nsay 'single: $gem';\n`,
        hint: "say \"double: $gem\";  say \"math: {2 + 3}\";",
        solution: `my $gem = "ruby";\nsay 'single: $gem';\nsay "double: $gem";\nsay "math: {2 + 3}";`,
        check(preview, ctx) {
            return /\$gem/.test(ctx.output) && /ruby/.test(ctx.output) && /\b5\b/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "the output should show a literal $gem (single quotes), an interpolated ruby, and 5 from {2 + 3}" };
        },
    },
    {
        type: "dom",
        name: "Words, Not Strings",
        // rakupp's interpolating word-quote (« »/<< >>) doesn't interpolate, so
        // this level needs perl6.js. Non-blocking on rakupp (see levelBlocked).
        perl6Only: true,
        goal: "Build word lists with < > — and with « » when a word needs interpolation or spaces.",
        steps: [
            "<ruby emerald sapphire> is a list of three words — no quotes, no commas.",
            "<< … >> (or « … ») interpolates, and a quoted \"two words\" stays ONE element.",
            "Print how many elements each list has, and one element from each.",
        ],
        explain: [
            "`<ruby emerald sapphire>` splits on whitespace into a list of words — the tidiest " +
            "way to write string lists, and you've used it all through the other sagas.",
            "Its bigger sibling `<< … >>` (fancy form `« … »`) adds interpolation *and* quote " +
            "protection: inside it, `\"count: $n\"` interpolates `$n` and stays **one element** " +
            "despite the space — the embedded quotes group it.",
            "Bonus trivia: numeric-looking words like `<42>` become *allomorphs* — values that " +
            "are simultaneously a string and a number. More on that in the last level.",
        ],
        starter: `my @gems = <ruby emerald sapphire>;\nsay @gems.elems;\nsay @gems[1];\n\nmy $count = 3;\n# a << >> list where one element is "count: $count"…\n`,
        hint: "my @tags = << \"count: $count\" solo >>;  say @tags.elems;  say @tags[0];",
        solution: `my @gems = <ruby emerald sapphire>;\nsay @gems.elems;\nsay @gems[1];\nmy $count = 3;\nmy @tags = << "count: $count" solo >>;\nsay @tags.elems;\nsay @tags[0];`,
        check(preview, ctx) {
            return /\b3\b/.test(ctx.output) && /emerald/.test(ctx.output)
                && /\b2\b/.test(ctx.output) && /count: 3/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected 3 and emerald from the < > list, and 2 elements with “count: 3” from the << >> list" };
        },
    },
    {
        type: "dom",
        name: "Heredocs",
        goal: "Write a multi-line letter with q:to — indentation trims itself.",
        steps: [
            "qq:to/END/; starts a heredoc that runs until a line containing END.",
            "Indent the body as deep as you like: the closing marker's indentation is stripped from every line.",
            "qq interpolates inside it — sign the letter with a variable.",
        ],
        explain: [
            "Heredocs are the `:to` adverb on ordinary quoting: `q:to/END/` is a literal " +
            "multi-line string, `qq:to/END/` an interpolating one — the marker word is yours to " +
            "choose.",
            "The clever part is **indentation handling**: however deep you indent the closing " +
            "marker, that much leading whitespace is removed from every line. Your code stays " +
            "beautifully indented; your string comes out flush.",
            "The semicolon goes on the *opening* line (`my $x = qq:to/END/;`) — the statement ends " +
            "there; the text follows. A classic first-heredoc stumble.",
        ],
        starter: `my $who = "Camelia";\n\nmy $letter = qq:to/END/;\n    Dear $who,\n    You found all the gems.\n    END\n\nsay $letter;\n`,
        hint: "It already works — Run it, then try indenting the whole body deeper and watch the output stay flush.",
        solution: `my $who = "Camelia";\nmy $letter = qq:to/END/;\n    Dear $who,\n    You found all the gems.\n    END\nsay $letter;`,
        check(preview, ctx) {
            return /Dear Camelia,/.test(ctx.output) && /You found all the gems\./.test(ctx.output)
                ? { success: true }
                : { success: false, message: "the letter should greet Camelia (interpolated) and contain its second line" };
        },
    },
    {
        type: "dom",
        name: "The Q Family",
        goal: "Meet the three levels of rawness: Q (everything literal), q (backslash only), qq (everything alive).",
        steps: [
            "Q[…] is as literal as it gets: \\n stays two characters, $vars stay text.",
            "q[…] allows only backslash-escaping the delimiter.",
            "qq[…] is the full double-quote experience — any delimiter you like.",
        ],
        explain: [
            "All quoting is one construct with adverbs, and `Q` is its raw heart: **nothing** is " +
            "special inside `Q[…]` — no escapes, no variables. `\\n` is a backslash and an n. " +
            "Perfect for regex-like payloads and Windows paths.",
            "`q[…]` turns on exactly one power: backslash may escape the delimiter (and itself). " +
            "`qq[…]` turns on everything double quotes do. And `'…'`/`\"…\"` are just shorthands " +
            "for `q`/`qq`.",
            "Delimiters are nearly free-choice: `q{…}`, `q[…]`, `q!…!`, `q(…)` — pick whatever " +
            "doesn't appear in your text and skip the escaping entirely.",
        ],
        starter: `# three flavors of the same idea…\nsay Q[totally raw: \\n and $vars stay];\nsay q[backslash works: \\] done];\nsay qq[interpolated: {1 + 1}];\n`,
        hint: "It runs as-is — compare the three lines, then try breaking each rule.",
        solution: `say Q[totally raw: \\n and $vars stay];\nsay q[backslash works: \\] done];\nsay qq[interpolated: {1 + 1}];`,
        check(preview, ctx) {
            return /\\n/.test(ctx.output) && /\$vars/.test(ctx.output)
                && /\] done/.test(ctx.output) && /\b2\b/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected a literal \\n and $vars (Q), an escaped ] (q), and 2 (qq)" };
        },
    },
    {
        type: "dom",
        name: "Adverbs à la Carte",
        goal: "Mix your own quote: qq:w for interpolated word lists, and allomorphs — values that are two types at once.",
        steps: [
            "Adverbs compose: qq:w{…} interpolates FIRST, then splits into words.",
            "<3/4> converts to a real Rat — do math on it, then check .^name.",
            "Print the word count, a word, the math result, and the allomorph's type name.",
        ],
        explain: [
            "Every quote form is `Q` plus adverbs: `:b` backslashes, `:s` scalars, `:c` closures, " +
            "`:w` word-splitting, `:ww` word-splitting with quote protection… `qq` is just " +
            "`Q:b:s:a:h:f:c` spelled comfortably. You can order à la carte: `qq:w{one $n three}` " +
            "interpolates `$n` and *then* splits into words.",
            "`< >` quietly applies `:v` — value conversion — so `<42>` and `<3/4>` become " +
            "numbers you can compute with directly; on current Rakudos they are **allomorphs** " +
            "(`IntStr`, `RatStr`: string and number simultaneously), while this in-browser build " +
            "answers plain `Rat`. Either way, `<3/4> + 0.25` is `1` — word lists are safe to use " +
            "as numbers.",
            "That's the quoting toolbox: two workhorse quotes, word lists, heredocs, the raw `Q`, " +
            "and adverbs to compose anything between. From here, docs.raku.org/language/quoting " +
            "has the full menu. 🦋",
        ],
        starter: `my $n = 2;\nmy @w = qq:w{one $n three};\nsay @w.elems;\nsay @w[1];\n\nmy $ratio = <3/4>;\n# do math with it, then reveal its type with .^name…\n`,
        hint: "say $ratio + 0.25;  say $ratio.^name;",
        solution: `my $n = 2;\nmy @w = qq:w{one $n three};\nsay @w.elems;\nsay @w[1];\nmy $ratio = <3/4>;\nsay $ratio + 0.25;\nsay $ratio.^name;`,
        check(preview, ctx) {
            return /\b3\b/.test(ctx.output) && /\b2\b/.test(ctx.output)
                && /\b1\b/.test(ctx.output) && /\bRat(Str)?\b/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected 3 words, the interpolated 2, the sum 1, and a Rat-ish type name" };
        },
    },
];

export default {
    id: "quoting",
    title: "Quoting Constructs",
    description: "From '…' to Q:to heredocs — Raku's whole quote family, one adverb at a time.",
    levels: LEVELS,
};
