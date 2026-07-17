// The "Containers" saga — scalar containers, binding vs assignment,
// itemization and immutability, per docs.raku.org/language/containers.

const LEVELS = [
    {
        type: "dom",
        name: "The Box Behind the Variable",
        goal: "Prove that $variables are boxes: bind two names to ONE box and watch them move together.",
        steps: [
            "= assigns a value INTO a container; := binds a name TO something.",
            "my $b := $a; makes $b the very same box as $a — assign through one, read through the other.",
            ".VAR shows the container itself: $a.VAR.^name is Scalar.",
        ],
        explain: [
            "A `$` variable is not the value — it's a **Scalar container** holding the value. " +
            "Assignment (`=`) puts a new value *into* the box; binding (`:=`) wires a name " +
            "directly *to* something.",
            "So after `my $b := $a`, there is one box with two names: assign `99` through `$b` " +
            "and `$a` says `99` too. (Bind to a plain value instead — `my $c := 42` — and the " +
            "name has no box at all: assigning to it is an error.)",
            "`.VAR` lifts the curtain: `$a.VAR.^name` answers `Scalar`, the container's own " +
            "type. Sigilless names (`my \\c = 42`) skip the box entirely — they always bind.",
            "Most of Raku quietly *decontainerizes* — operations see the value, not the box — " +
            "which is why you can ignore all this most days. The next levels are about the days " +
            "you can't.",
        ],
        starter: `my $a = 1;\nmy $b := $a;   # same box, second name\n$b = 99;\n\n# what does $a say now? what IS $a, container-wise?\nsay $a;\n`,
        hint: "say $a.VAR.^name;  my \\c = 42;  say c;",
        solution: `my $a = 1;\nmy $b := $a;\n$b = 99;\nsay $a;\nsay $a.VAR.^name;\nmy \\c = 42;\nsay c;`,
        check(preview, ctx) {
            return /\b99\b/.test(ctx.output) && /Scalar/.test(ctx.output) && /\b42\b/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected 99 through the shared box, the container type Scalar, and the sigilless 42" };
        },
    },
    {
        type: "dom",
        name: "One Thing or Many?",
        goal: "The classic gotcha: a list in a $scalar iterates as ONE item. Count the loop turns both ways.",
        steps: [
            "Put an array into a $scalar and for-loop it: how many iterations?",
            "Prefix @ (or .list) to un-item it: for @$item { } iterates the elements.",
            "Count both with a counter and print the two numbers.",
        ],
        explain: [
            "A Scalar container *itemizes* whatever it holds: an array inside `$item` is “one " +
            "thing” as far as iteration is concerned. `for $item { }` runs **once** — with the " +
            "whole array as the topic.",
            "To iterate the elements, remove the itemization: `for @$item { }` (the `@` prefix " +
            "coerces to list context), or `$item.list`, or slip it with `|$item`.",
            "This isn't a trap for trap's sake — it's what lets you store a whole array as a " +
            "single hash value or pass it around unflattened. The sigil at the *use site* " +
            "declares which meaning you want.",
            "Note `.elems` asks the *value* (3 — decontainerized), while `for` asks the " +
            "*container* (1 item). Same variable, two honest answers to two different questions.",
        ],
        starter: `my @list = 1, 2, 3;\nmy $item = @list;   # the whole array, itemized in one box\n\nmy $n = 0;\n$n++ for $item;\nsay "as item: $n";\n\n# now count it as a LIST…\n`,
        hint: "$n = 0;  $n++ for @$item;  say \"as list: $n\";  say $item.elems;",
        solution: `my @list = 1, 2, 3;\nmy $item = @list;\nmy $n = 0;\n$n++ for $item;\nsay "as item: $n";\n$n = 0;\n$n++ for @$item;\nsay "as list: $n";\nsay $item.elems;`,
        check(preview, ctx) {
            return /item:\s*1/.test(ctx.output) && /list:\s*3/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected 1 iteration as an item and 3 as a list (label them “as item:” / “as list:”)" };
        },
    },
    {
        type: "dom",
        name: "Borrowing vs Copying",
        goal: "Write one sub that changes its caller's variable, and one that provably can't.",
        steps: [
            "Parameters are read-only by default — assignment inside a sub is an error.",
            "is rw hands the sub the caller's actual container: changes stick.",
            "is copy hands it a fresh box: change freely, the caller never notices.",
        ],
        explain: [
            "Raku parameters bind read-only by default — a sub can *look at* your value but not " +
            "touch your box. Mutation is opt-in, and the signature says which contract you get.",
            "`sub double($x is rw) { $x *= 2 }` receives the **caller's own container** — after " +
            "`double($v)`, `$v` has doubled. `is copy` is the opposite promise: a private copy, " +
            "mutable inside, invisible outside.",
            "The contracts are enforced, not documentation: pass a literal to an `is rw` " +
            "parameter (`double(21)`) and you get an error — literals have no container to " +
            "borrow. The signature *is* the API.",
        ],
        starter: `sub double($x is rw) { $x *= 2 }\n\nmy $v = 21;\ndouble($v);\nsay $v;\n\n# now a sub with 'is copy' — prove the caller's var survives…\n`,
        hint: "sub bump($y is copy) { $y += 1; $y }  say bump($w);  say $w;",
        solution: `sub double($x is rw) { $x *= 2 }\nmy $v = 21;\ndouble($v);\nsay $v;\nsub bump($y is copy) { $y += 1; $y }\nmy $w = 10;\nsay bump($w);\nsay $w;`,
        check(preview, ctx) {
            return /\b42\b/.test(ctx.output) && /\b11\b/.test(ctx.output) && /\b10\b/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected 42 (is rw doubled the caller's var), 11 (the copy, bumped), and 10 (the original, untouched)" };
        },
    },
    {
        type: "dom",
        name: "Flattening and <>",
        goal: "Nested lists: when does (1, (2, 3), 4) count as 3 things, and how do you get the 4?",
        steps: [
            "An itemized list counts its inner list as one element: .elems says 3.",
            "flat($x<>) — decont with <>, then flatten — reaches all 4.",
            "An explicitly itemized $(2, 3) inside an array RESISTS flat — index into it instead.",
        ],
        explain: [
            "`(1, (2, 3), 4)` has three elements — the middle one *is* a list. Whether nested " +
            "structure flattens is governed entirely by containers, and Raku never flattens " +
            "behind your back.",
            "`flat` flattens — but not through Scalar containers. Your `$x` box itemizes the " +
            "whole list, so first decontainerize with the postfix `<>` operator: `flat($x<>)` " +
            "counts 4.",
            "Inside an array, every slot is a Scalar — so to *protect* a sublist you itemize it " +
            "explicitly with `$(2, 3)`, and even `flat` respects that. Reach inside with " +
            "ordinary indexing: `@a[1].elems` is 2.",
            "One idea — boxes stop flattening — explains `flat`, slips (`|`), and every “why is " +
            "my list nested?!” moment you'll ever have.",
        ],
        starter: `my $x = (1, (2, 3), 4);\nsay $x.elems;          # the inner list is ONE element\n\n# now count all four with flat + <> …\n`,
        hint: "say flat($x<>).elems;   then try  my @a = 1, $(2, 3), 4;  say flat(@a).elems;  say @a[1].elems;",
        solution: `my $x = (1, (2, 3), 4);\nsay $x.elems;\nsay flat($x<>).elems;\nmy @a = 1, $(2, 3), 4;\nsay flat(@a).elems;\nsay @a[1].elems;`,
        check(preview, ctx) {
            return /\b3\b/.test(ctx.output) && /\b4\b/.test(ctx.output) && /\b2\b/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected 3 (itemized), 4 (flat after <>), 3 again (protected $()), and 2 (inside the sublist)" };
        },
    },
    {
        type: "dom",
        name: "Immutable by Design",
        goal: "Mutate an Array, get refused by a List, and mint a constant.",
        steps: [
            "Arrays put a fresh Scalar in every slot — assignment to @arr[0] just works.",
            "Lists don't: try { $list[0] = 99 } fails — inspect $! to prove it.",
            "constant names a value fixed at compile time.",
        ],
        explain: [
            "Now the last level's idea pays off: an `Array` wraps **every element in its own " +
            "Scalar container** — that's precisely what makes `@arr[0] = 99` possible. A `List` " +
            "doesn't — its structure is immutable, so element assignment dies.",
            "`try { … }` turns that death into a value: the error lands in `$!`, and you decide " +
            "what it means. Immutability in Raku is honest — it fails loudly instead of " +
            "copy-on-writing behind your back.",
            "`constant GEMS = 3;` binds at compile time — no sigil needed, no container, no " +
            "changes ever. Between mutable Arrays, immutable Lists, bindings and constants, you " +
            "choose exactly how frozen each piece of your data is — that's the containers story. 🦋",
        ],
        starter: `my @arr = 1, 2, 3;\n@arr[0] = 99;\nsay @arr[0];\n\nmy $list = (1, 2, 3);\n# try to change $list[0] — catch the refusal and report it…\n`,
        hint: "try { $list[0] = 99 };  say $! ?? 'list refused: immutable' !! 'changed?!';  say $list[0];  constant GEMS = 3;  say GEMS;",
        solution: `my @arr = 1, 2, 3;\n@arr[0] = 99;\nsay @arr[0];\nmy $list = (1, 2, 3);\ntry { $list[0] = 99 };\nsay $! ?? 'list refused: immutable' !! 'changed?!';\nsay $list[0];\nconstant GEMS = 3;\nsay GEMS;`,
        check(preview, ctx) {
            return /\b99\b/.test(ctx.output) && /refused|immutable/i.test(ctx.output) && /\b1\b/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected the Array mutated to 99, the List refusing (report it), and its element still 1" };
        },
    },
];

export default {
    id: "containers",
    title: "Containers",
    description: "The boxes behind Raku variables: binding, itemization, flattening, immutability.",
    levels: LEVELS,
};
