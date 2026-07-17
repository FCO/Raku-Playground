// The "Phasers" saga — code that runs WHEN, not just where, per
// docs.raku.org/language/phasers. Output-order checks (relaxed wording).

const LEVELS = [
    {
        type: "dom",
        name: "Before the Program Runs",
        goal: "Print three lines in the WRONG textual order — and let phasers put them right.",
        steps: [
            "BEGIN runs at compile time — before ANY normal code, wherever you write it.",
            "INIT runs at runtime, as soon as possible — still before the code above it.",
            "Write them BELOW a normal say and watch the output order flip.",
        ],
        explain: [
            "Phasers are blocks that run at a *phase* of the program's life instead of where " +
            "they appear in the text. The program-level ones: `BEGIN` (compile time, as soon as " +
            "possible), `CHECK` (compile time, as late as possible), `INIT` (runtime, as soon " +
            "as possible) and `END` (runtime, as late as possible).",
            "So a `BEGIN say …` written on the *last* line still prints *first* — the compiler " +
            "runs it while compiling. `INIT` fires when execution starts, still ahead of any " +
            "plain statement above it in the file.",
            "Real uses: `BEGIN` for expensive constants baked in at compile time, `INIT` for " +
            "runtime setup, `END` for cleanup and final reports. (In the playground each Run " +
            "compiles then executes, so you get the full lifecycle every time.)",
        ],
        starter: `say "1: plain runtime code";\n\n# now add, BELOW this line, a BEGIN and an INIT that print —\n# then check the ORDER of the output…\n`,
        hint: "BEGIN say \"0: compile time!\";  INIT say \"0.5: init\";  END say \"2: the very end\";",
        solution: `say "1: plain runtime code";\nBEGIN say "0: compile time!";\nINIT say "0.5: init";\nEND say "2: the very end";`,
        check(preview, ctx) {
            const compile = ctx.output.indexOf("compile");
            const init = ctx.output.indexOf("init");
            const runtime = ctx.output.indexOf("runtime");
            return compile >= 0 && init >= 0 && runtime >= 0 && compile < init && init < runtime
                ? { success: true }
                : { success: false, message: "the BEGIN line must print before the INIT line, and both before the plain say — even written below it" };
        },
    },
    {
        type: "dom",
        name: "Guarding a Block: ENTER and LEAVE",
        goal: "Wrap a sub with ENTER/LEAVE and observe the exact in-and-out order.",
        steps: [
            "ENTER fires every time the block is entered; LEAVE every time it's left.",
            "LEAVE runs even when the block dies or returns early — that's the point.",
            "Call the sub and study the order: enter, inside, leave — then the returned value.",
        ],
        explain: [
            "`ENTER` and `LEAVE` bracket a block's every execution. `LEAVE` is the star: it runs " +
            "on *any* exit — normal return, `last`, or a thrown exception mid-flight — which " +
            "makes it Raku's native “finally”, attached to the block itself instead of a " +
            "try-ceremony.",
            "Classic uses: releasing locks and closing handles (`LEAVE $file.close`), timing " +
            "(`ENTER my $t = now; LEAVE say now - $t`), restoring state. The cleanup lives right " +
            "next to the setup.",
            "Note the printed order: the block's value is returned first, but `LEAVE` fires " +
            "*before* the caller gets to use it — leave happens at the block boundary. Multiple " +
            "LEAVEs run in reverse declaration order: teardown mirrors setup.",
        ],
        starter: `sub visit {\n    ENTER say "enter";\n    LEAVE say "leave";\n    say "inside";\n    'the result'\n}\n\n# call it and print what it returns…\n`,
        hint: "say visit();",
        solution: `sub visit {\n    ENTER say "enter";\n    LEAVE say "leave";\n    say "inside";\n    'the result'\n}\nsay visit();`,
        check(preview, ctx) {
            const enter = ctx.output.indexOf("enter");
            const inside = ctx.output.indexOf("inside");
            const leave = ctx.output.indexOf("leave");
            return enter >= 0 && inside >= 0 && leave >= 0 && enter < inside && inside < leave
                && /the result/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected the order enter → inside → leave, plus the returned value printed" };
        },
    },
    {
        type: "dom",
        name: "Loop Lifecycles: FIRST, NEXT, LAST",
        goal: "Put lifecycle hooks inside one loop: once at the start, once per lap, once at the end.",
        steps: [
            "FIRST runs on the first iteration only; LAST after the final one.",
            "NEXT runs at the end of EVERY iteration.",
            "Loop 1..3 with all three and a body print — predict the output before running.",
        ],
        explain: [
            "Loops have their own phase structure: `FIRST` fires once at loop start, `NEXT` at " +
            "the *end* of each iteration (also when you call `next` explicitly), and `LAST` " +
            "once, after the final iteration (also on `last`).",
            "They replace the classic counter-and-flag boilerplate: printing separators between " +
            "items (`NEXT say '---'`), initializing on first pass, summarizing at the end — all " +
            "without tracking `$is-first` by hand.",
            "They compose with `ENTER`/`LEAVE` (which fire per iteration, since each lap enters " +
            "the block) — the docs page has the full order chart; the rule of thumb is: " +
            "*initializers in declaration order, finalizers reversed*.",
        ],
        starter: `for 1..3 -> $i {\n    FIRST say "first!";\n    LAST  say "last!";\n    NEXT  say "after lap $i";\n    say "body $i";\n}\n`,
        hint: "It runs as-is — predict the exact order first, then Run and compare.",
        solution: `for 1..3 -> $i {\n    FIRST say "first!";\n    LAST  say "last!";\n    NEXT  say "after lap $i";\n    say "body $i";\n}`,
        check(preview, ctx) {
            const firsts = (ctx.output.match(/first!/g) ?? []).length;
            const lastPos = ctx.output.indexOf("last!");
            const body3 = ctx.output.indexOf("body 3");
            return firsts === 1 && /body 2/.test(ctx.output) && /after lap 3/.test(ctx.output)
                && lastPos > body3 && body3 >= 0
                ? { success: true }
                : { success: false, message: "expected first! exactly once, a NEXT line after every lap, and last! after body 3" };
        },
    },
    {
        type: "dom",
        name: "CATCH: Exceptions Are a Phase Too",
        goal: "Let a sub die for big inputs — and calmly report the failure from a CATCH block inside it.",
        steps: [
            "CATCH lives INSIDE the block it guards — no try wrapper needed.",
            "Inside CATCH, match the exception: default { … } handles anything; .message has the text.",
            "A handled block yields Nil — perfect for a // fallback at the call site.",
        ],
        explain: [
            "`CATCH` is where exceptions and phasers meet: a block placed *inside* the scope it " +
            "protects, running when that scope throws. No pyramid of try/except wrappers — the " +
            "handler lives with the code it guards.",
            "Inside `CATCH` you pattern-match the exception like a `given`: `when X::AdHoc { … }` " +
            "for specific types, `default { … }` for the rest; the exception is `$_`, so " +
            "`.message` reads its text. Unmatched exceptions keep propagating — you only catch " +
            "what you claim to understand.",
            "Once handled, the surrounding block returns `Nil` — which chains beautifully with " +
            "the defined-or operator: `risky(5) // 'fallback'` reads “try it; if nothing came " +
            "back, use this”.",
        ],
        starter: `sub risky($n) {\n    CATCH { default { say "caught: {.message}" } }\n    die "gem #$n is too hot!" if $n > 2;\n    "gem #$n is safe"\n}\n\nsay risky(1);\n# now risky(5) — with a // fallback…\n`,
        hint: "say risky(5) // 'no gem today';",
        solution: `sub risky($n) {\n    CATCH { default { say "caught: {.message}" } }\n    die "gem #$n is too hot!" if $n > 2;\n    "gem #$n is safe"\n}\nsay risky(1);\nsay risky(5) // 'no gem today';`,
        check(preview, ctx) {
            return /gem #1 is safe/.test(ctx.output) && /caught: .*too hot/.test(ctx.output)
                && /no gem today/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected the safe gem, the caught message, and the // fallback" };
        },
    },
    {
        type: "dom",
        name: "KEEP and UNDO",
        goal: "One sub, two endings: KEEP fires on success, UNDO on failure — LEAVE fires on both.",
        steps: [
            "KEEP runs only when the block exits successfully; UNDO only when it fails.",
            "LEAVE runs either way — count how many times it prints.",
            "Call the sub once succeeding and once dying (wrapped in try).",
        ],
        explain: [
            "`KEEP` and `UNDO` split `LEAVE` by outcome: exit successfully and `KEEP` runs; " +
            "exit by exception or failure and `UNDO` runs. `LEAVE` itself remains unconditional.",
            "This is transaction shape, built into blocks: acquire in the body, commit in " +
            "`KEEP`, roll back in `UNDO` — and the rollback logic sits next to the acquisition " +
            "it undoes, not in a distant error handler.",
            "That completes the phaser family: program phases (`BEGIN`/`INIT`/`END`), block " +
            "phases (`ENTER`/`LEAVE`/`KEEP`/`UNDO`), loop phases (`FIRST`/`NEXT`/`LAST`), and " +
            "the exceptional ones (`CATCH`/`CONTROL`). Code that runs *when* — not just where. 🦋",
        ],
        starter: `sub attempt($ok) {\n    KEEP  say "kept (success)";\n    UNDO  say "undone (failure)";\n    LEAVE say "leaving either way";\n    die "boom" unless $ok;\n    "fine"\n}\n\nsay attempt(True);\n# now make it fail — safely…\n`,
        hint: "try attempt(False);  say \"survived\";",
        solution: `sub attempt($ok) {\n    KEEP  say "kept (success)";\n    UNDO  say "undone (failure)";\n    LEAVE say "leaving either way";\n    die "boom" unless $ok;\n    "fine"\n}\nsay attempt(True);\ntry attempt(False);\nsay "survived";`,
        check(preview, ctx) {
            const leaves = (ctx.output.match(/leaving either way/g) ?? []).length;
            return /kept/.test(ctx.output) && /undone/.test(ctx.output) && leaves === 2
                && /survived/.test(ctx.output)
                ? { success: true }
                : { success: false, message: "expected kept once, undone once, “leaving either way” twice, and the program to survive" };
        },
    },
];

export default {
    id: "phasers",
    title: "Phasers",
    description: "BEGIN to END, ENTER to LEAVE: code that runs when, not just where.",
    levels: LEVELS,
};
