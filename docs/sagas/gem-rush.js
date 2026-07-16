// The "Gem Rush" saga: challenge islands. No new syntax — trickier worlds
// that put the Learn Raku toolbox to work.

const LEVELS = [
    {
        name: "Ring of Riches",
        goal: "Seven gems around the ring. Lap it and take everything.",
        steps: [
            "The ring never blocks you for long — corners do.",
            "Loop while gems remain; turn when blocked.",
        ],
        explain: [
            "A challenge island: you already know everything you need. " +
            "`while gems-left { … }` with `turn-right if is-blocked;` laps any ring.",
        ],
        grid: [
            "~~~~~",
            "~#GG~",
            "~G~G~",
            "~GGG~",
            "~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `# seven gems, one loop…\n`,
        hint: "while gems-left { turn-right if is-blocked; move-forward; collect-gem if is-on-gem }",
        solution: "while gems-left {\n    turn-right if is-blocked;\n    move-forward;\n    collect-gem if is-on-gem;\n}",
    },
    {
        name: "The Longest Walk",
        goal: "A long, long corridor. Gems are scattered — the rock marks the end.",
        steps: [
            "Don't count tiles.",
            "Walk until blocked, collecting as you go.",
        ],
        explain: [
            "Length is unknown by design: this corridor wants `until is-blocked { … }` with a " +
            "conditional collect. If you counted, count again — then don't count.",
        ],
        grid: [
            "~~~~~~~~~~~~",
            "~#G##G###G#W",
            "~~~~~~~~~~~~",
        ],
        start: { x: 1, y: 1, facing: "E" },
        starter: `# walk far, grab everything…\n`,
        hint: "until is-blocked { move-forward; collect-gem if is-on-gem }",
        solution: "until is-blocked {\n    move-forward;\n    collect-gem if is-on-gem;\n}",
    },
    {
        name: "Stairway to Heaven",
        goal: "Four flights of stairs, a gem on every landing. Name the pattern, then repeat it.",
        steps: [
            "One flight: forward, up, and collect at the landing.",
            "Define it as a sub, then loop it four times.",
        ],
        explain: [
            "The staircase is four identical zigs — `sub` the pattern, `for ^4` the climb. " +
            "Naming a repeated shape is the whole trick.",
        ],
        grid: [
            "~~~~~~~",
            "~~~~~G~",
            "~~~~G#~",
            "~~~G#~~",
            "~~G#~~~",
            "~##~~~~",
            "~~~~~~~",
        ],
        start: { x: 1, y: 5, facing: "E" },
        starter: `sub flight {\n    # forward, turn, up, turn, collect…\n}\n`,
        hint: "sub flight { move-forward; turn-left; move-forward; turn-right; collect-gem if is-on-gem }  then  for ^4 { flight }",
        solution: "sub flight {\n    move-forward;\n    turn-left;\n    move-forward;\n    turn-right;\n    collect-gem if is-on-gem;\n}\nfor ^4 { flight }",
    },
];

export default {
    id: "gem-rush",
    title: "Gem Rush",
    description: "Challenge islands — no new syntax, just trickier worlds.",
    levels: LEVELS,
};
