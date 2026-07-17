// The "Types & the MOP" saga — gradual typing, subsets, roles, and the
// metaobject protocol, per docs.raku.org/language/typesystem and /mop.

const LEVELS = [
    {
        type: "dom",
        name: "Ask Anything Its Type",
        goal: "Interrogate values with .^name, and let a typed variable defend itself.",
        steps: [
            "Every value answers .^name (and .WHAT returns the type object itself).",
            "42 is Int, \"hi\" is Str — and 1/3 is Rat, an honest fraction, not a float!",
            "my Int $count constrains the container: assigning a Str dies. Catch it with try.",
        ],
        explain: [
            "Raku is *gradually typed*: untyped code just works, and types appear exactly where " +
            "you want guarantees. Every value knows what it is — `.^name` asks its type's name, " +
            "`.WHAT` returns the type object itself.",
            "The `.^` twigil means “ask the metaobject” — `42.^name` is really " +
            "`42.HOW.name(42)`, a question to the object that *implements* Int. That's the " +
            "metaobject protocol (MOP) you'll meet properly in the later levels.",
            "One answer worth savoring: `(1/3).^name` is `Rat` — a rational number, kept exact. " +
            "`0.1 + 0.2 == 0.3` is True in Raku; floating point is opt-in via `Num` (e.g. `pi`).",
            "A typed container enforces itself at runtime: `my Int $count` refuses a Str with a " +
            "type error — the constraint lives on the *container*, guarding every future " +
            "assignment.",
        ],
        starter: `say 42.^name;\nsay "hi".^name;\nsay (1/3).^name;\nsay pi.^name;\n\nmy Int $count = 42;\n# try assigning a Str to it, catch the refusal…\n`,
        hint: "try { $count = \"nope\" };  say $! ?? 'type guard works' !! 'oops';",
        solution: `say 42.^name;\nsay "hi".^name;\nsay (1/3).^name;\nsay pi.^name;\nmy Int $count = 42;\ntry { $count = "nope" };\nsay $! ?? 'type guard works' !! 'oops';`,
        check(preview, ctx) {
            return /Int/.test(ctx.output) && /Str/.test(ctx.output) && /Rat/.test(ctx.output)
                && /Num/.test(ctx.output) && /type guard works/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected the four type names (Int, Str, Rat, Num) and the caught type error" };
        },
    },
    {
        type: "dom",
        name: "Types of Your Own: subset",
        goal: "Mint an Even type with a where-clause and let a signature enforce it.",
        steps: [
            "my subset Even of Int where * %% 2; — a new type in one line.",
            "Smartmatch tests membership: 4 ~~ Even.",
            "Use it in a signature — sub half(Even $n) — and watch it reject a 3.",
        ],
        explain: [
            "`subset` carves new types out of existing ones with an arbitrary predicate: " +
            "`my subset Even of Int where * %% 2;` (`%%` is “divisible by”). One line, and " +
            "`Even` participates in the whole type system.",
            "It smartmatches (`4 ~~ Even`), it constrains variables (`my Even $e`), and — most " +
            "usefully — it guards signatures: `sub half(Even $n)` makes bad input fail at the " +
            "boundary, before your logic runs. Validation *is* the type.",
            "The `where` clause takes any expression — `subset Port of Int where 1..65535`, " +
            "`subset Gem of Str where * ∈ @known-gems` — your business rules, spelled as types.",
        ],
        starter: `my subset Even of Int where * %% 2;\n\nsay 4 ~~ Even ?? '4 is even' !! '4 is odd';\nsay 7 ~~ Even ?? '7 is even' !! '7 is odd';\n\nsub half(Even $n) { $n div 2 }\nsay half(10);\n# feed it a 3 — catch the rejection…\n`,
        hint: "try { half(3) };  say $! ?? 'rejected 3' !! 'accepted?!';",
        solution: `my subset Even of Int where * %% 2;\nsay 4 ~~ Even ?? '4 is even' !! '4 is odd';\nsay 7 ~~ Even ?? '7 is even' !! '7 is odd';\nsub half(Even $n) { $n div 2 }\nsay half(10);\ntry { half(3) };\nsay $! ?? 'rejected 3' !! 'accepted?!';`,
        check(preview, ctx) {
            return /4 is even/.test(ctx.output) && /7 is odd/.test(ctx.output)
                && /\b5\b/.test(ctx.output) && /rejected 3/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected the two membership answers, half(10) = 5, and the rejected 3" };
        },
    },
    {
        type: "dom",
        name: "Roles: Composition over Inheritance",
        goal: "Write a Shiny role, compose it into a Gem class, and introspect what got mixed in.",
        steps: [
            "my role Shiny { method sparkle { … } } — a bundle of behavior.",
            "my class Gem does Shiny { has $.name } — composed, not inherited.",
            "Ask the class what roles it does: Gem.^roles.",
        ],
        explain: [
            "A `role` is a reusable slice of behavior; `does` composes it into a class at " +
            "compile time. Unlike inheritance, composition is *flat and checked*: two roles " +
            "providing the same method is a compile-time conflict you must resolve — no silent " +
            "overriding, no diamond mysteries.",
            "Inside a role, `self` is whatever class it lands in — so `Shiny.sparkle` can use " +
            "`self.name` and trust composition to supply it.",
            "Roles triple as interfaces (`$obj ~~ Shiny`), as mixins at runtime (`$value but " +
            "Shiny`), and even as punned classes (`Shiny.new` conjures a class from the role). " +
            "Most idiomatic Raku code prefers many small roles over deep class trees.",
        ],
        starter: `my role Shiny {\n    method sparkle { "✨ {self.name} sparkles!" }\n}\n\nmy class Gem does Shiny {\n    has $.name;\n}\n\n# make a ruby sparkle, then ask Gem which roles it does…\n`,
        hint: "say Gem.new(name => 'ruby').sparkle;  say Gem.^roles.map(*.^name).join(',');",
        solution: `my role Shiny {\n    method sparkle { "✨ {self.name} sparkles!" }\n}\nmy class Gem does Shiny {\n    has $.name;\n}\nsay Gem.new(name => 'ruby').sparkle;\nsay Gem.^roles.map(*.^name).join(',');`,
        check(preview, ctx) {
            return /ruby sparkles/.test(ctx.output) && /Shiny/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected the sparkle line mentioning ruby, and Shiny in the composed-roles list" };
        },
    },
    {
        type: "dom",
        name: "X-Ray Vision: Introspection",
        goal: "Ask a class for its methods, its attributes, and its ancestry — no documentation required.",
        steps: [
            ".^methods lists method objects — map .name over them.",
            ".^attributes shows storage: note the real name is $!legs.",
            ".^mro is the method resolution order: YourClass → Any → Mu.",
        ],
        explain: [
            "Everything `.^` goes to the *metaobject* — the object that implements the class. " +
            "`Critter.^methods` returns actual method objects (grab `».name` for the names); " +
            "`.^attributes` the attribute objects; `.^mro` the inheritance chain.",
            "Note the attribute's true name: `$!legs`. The public `$.legs` you declare is sugar — " +
            "a private `$!legs` plus a generated accessor *method* (you'll see `legs` in the " +
            "method list!). The MOP shows the truth behind the sugar.",
            "Everything ends in `Any` and then `Mu` — the most undefined thing in the language " +
            "(the name is the joke: the Zen 無, “nothing”). This is how debuggers, dumpers and " +
            "IDEs see Raku — and it's just method calls.",
        ],
        starter: `my class Critter {\n    has $.legs;\n    method walk { "stomp" }\n    method fly  { "whoosh" }\n}\n\n# list its methods, attributes and ancestry…\nsay Critter.^methods».name.sort.join(',');\n`,
        hint: "say Critter.^attributes».name.join(',');  say Critter.^mro.map(*.^name).join(' → ');",
        solution: `my class Critter {\n    has $.legs;\n    method walk { "stomp" }\n    method fly  { "whoosh" }\n}\nsay Critter.^methods».name.sort.join(',');\nsay Critter.^attributes».name.join(',');\nsay Critter.^mro.map(*.^name).join(' → ');`,
        check(preview, ctx) {
            return /fly/.test(ctx.output) && /walk/.test(ctx.output)
                && /\$!legs/.test(ctx.output) && /Critter/.test(ctx.output)
                && /Any/.test(ctx.output) && /Mu/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected fly and walk among the methods, $!legs among attributes, and the Critter→Any→Mu ancestry" };
        },
    },
    {
        type: "dom",
        name: "Rewrite the Class at Runtime",
        goal: "Give a finished class a brand-new method — while the program runs.",
        steps: [
            "Robot.^add_method('greet', my method greet { … }) injects a method object — naming it makes introspection honest.",
            "Recompose with Robot.^compose; — then instances can call it.",
            "Verify with .^methods that greet is really there now.",
        ],
        explain: [
            "The MOP isn't read-only. `.^add_method` hands the metaobject a new method at " +
            "runtime; `.^compose` finalizes the change. The class definition was never special — " +
            "`class` syntax is a convenience API over exactly these calls.",
            "This is the engine under Raku's most magical features: `but` mixins, punned roles, " +
            "mocking libraries, ORMs generating accessors — all of them are MOP calls like the " +
            "one you're about to make.",
            "You can go further and build types from nothing (`Metamodel::ClassHOW.new_type`), " +
            "but wield it with respect: the MOP skips the safety rails of regular Raku. " +
            "docs.raku.org/language/mop is the deep end. That's the saga: types you can query, " +
            "shrink, compose — and, when you truly need it, rewrite. 🦋",
        ],
        starter: `my class Robot { }\n\nRobot.^add_method('greet', my method greet { say "BEEP BOOP" });\nRobot.^compose;\n\n# call the method that didn't exist a moment ago…\n`,
        hint: "Robot.new.greet;  say Robot.^methods».name.join(',');",
        solution: `my class Robot { }\nRobot.^add_method('greet', my method greet { say "BEEP BOOP" });\nRobot.^compose;\nRobot.new.greet;\nsay Robot.^methods».name.join(',');`,
        check(preview, ctx) {
            return /BEEP BOOP/.test(ctx.output) && /greet/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected the runtime-added greet method to run (BEEP BOOP) and to appear in .^methods" };
        },
    },
];

export default {
    id: "types-mop",
    title: "Types & the MOP",
    description: "Gradual typing, subset types, roles — and the metaobject protocol underneath.",
    levels: LEVELS,
};
