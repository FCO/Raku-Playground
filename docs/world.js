// The puzzle world: levels, simulation, Raku command prelude, renderer and
// playback engine. Commands are *recorded* while the (synchronous) Raku eval
// runs — the JS sim advances instantly and answers queries — then played back
// as animations afterwards, because nothing can paint while evalP6 blocks.

const TILE = 64;
const COMMAND_LIMIT = 1000;

const DIRS = {
    N: { dx: 0, dy: -1, deg: 270 },
    E: { dx: 1, dy: 0, deg: 0 },
    S: { dx: 0, dy: 1, deg: 90 },
    W: { dx: -1, dy: 0, deg: 180 },
};
const LEFT_OF = { N: "W", W: "S", S: "E", E: "N" };
const RIGHT_OF = { N: "E", E: "S", S: "W", W: "N" };

// Single line on purpose: user code starts on line 2, so compile-error line
// numbers are off by exactly one (documented). Queries compare == 1 because
// numeric coercion across the JS boundary is more reliable than JS booleans.
export const PRELUDE =
    `use MONKEY-SEE-NO-EVAL; ` +
    // discard EVAL's value and return True: PG.command yields JS undefined, which
    // crosses into Raku as Mu and explodes if user code touches it (e.g. `move-forward x 3`)
    `sub run-cmd($c) { EVAL :lang<JavaScript>, "return PG.command('$c')"; True }; ` +
    `sub ask($q) { (EVAL :lang<JavaScript>, "return PG.query('$q')") == 1 }; ` +
    // terms, not subs: as listops they would slurp what follows — `until is-blocked { … }`
    // takes the block as an argument, `move-forward xx 2` takes `xx` as an undeclared routine
    `sub term:<move-forward> { run-cmd 'move-forward' }; ` +
    `sub term:<turn-left> { run-cmd 'turn-left' }; ` +
    `sub term:<turn-right> { run-cmd 'turn-right' }; ` +
    `sub term:<collect-gem> { run-cmd 'collect-gem' }; ` +
    `sub term:<is-blocked> { ask 'is-blocked' }; ` +
    `sub term:<is-blocked-left> { ask 'is-blocked-left' }; ` +
    `sub term:<is-blocked-right> { ask 'is-blocked-right' }; ` +
    `sub term:<is-on-gem> { ask 'is-on-gem' }; ` +
    // numeric query (Int, not Bool): 0 is falsy, so `while gems-left { … }` works
    `sub term:<gems-left> { +(EVAL :lang<JavaScript>, "return PG.query('gems-left')") };`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function nextLevelButton(onClick) {
    const btn = document.createElement("button");
    btn.className = "next-level";
    btn.textContent = "Next level →";
    btn.addEventListener("click", onClick);
    return btn;
}

export class World {
    constructor(level, container) {
        this.level = level;
        this.container = container;
        this.totalGems = level.grid.join("").split("G").length - 1;
        this.reset();
    }

    // ---------- simulation / recording ----------

    reset() {
        const { x, y, facing } = this.level.start;
        this.sim = { x, y, facing, dead: false, collected: 0, gems: new Set() };
        this.level.grid.forEach((row, gy) => {
            [...row].forEach((ch, gx) => {
                if (ch === "G") this.sim.gems.add(`${gx},${gy}`);
            });
        });
        this.commands = [];
        this.playIndex = 0;
        this.issued = 0;
        this.arrowFacing = facing;
        this.shownCollected = 0;
    }

    tileAt(x, y) {
        return this.level.grid[y]?.[x] ?? " ";
    }

    walkable(x, y) {
        return "#G".includes(this.tileAt(x, y)) ||
            (x === this.level.start.x && y === this.level.start.y);
    }

    command(name) {
        // count every issued command, including ones dropped after a fall —
        // otherwise a post-fall loop records nothing and spins forever
        if (++this.issued > COMMAND_LIMIT)
            throw new Error(`Runaway program: more than ${COMMAND_LIMIT} commands issued`);
        if (this.sim.dead) return;
        const s = this.sim;
        switch (name) {
            case "move-forward": {
                const { dx, dy } = DIRS[s.facing];
                const [tx, ty] = [s.x + dx, s.y + dy];
                if (this.walkable(tx, ty)) {
                    s.x = tx; s.y = ty;
                    this.commands.push({ name, x: tx, y: ty });
                } else if (this.tileAt(tx, ty) === "W") {
                    this.commands.push({ name, bump: true, facing: s.facing });
                } else {
                    s.dead = true;
                    this.commands.push({ name, fall: true, x: tx, y: ty });
                }
                break;
            }
            case "turn-left":
            case "turn-right":
                s.facing = (name === "turn-left" ? LEFT_OF : RIGHT_OF)[s.facing];
                this.commands.push({ name, facing: s.facing });
                break;
            case "collect-gem": {
                const key = `${s.x},${s.y}`;
                if (s.gems.has(key)) {
                    s.gems.delete(key);
                    s.collected++;
                    this.commands.push({ name, got: true, x: s.x, y: s.y });
                } else {
                    this.commands.push({ name, got: false, x: s.x, y: s.y });
                }
                break;
            }
            default:
                throw new Error(`Unknown command: ${name}`);
        }
    }

    query(name) {
        const s = this.sim;
        const facingFor = {
            "is-blocked": s.facing,
            "is-blocked-left": LEFT_OF[s.facing],
            "is-blocked-right": RIGHT_OF[s.facing],
        }[name];
        if (facingFor) {
            const { dx, dy } = DIRS[facingFor];
            return this.walkable(s.x + dx, s.y + dy) ? 0 : 1;
        }
        if (name === "is-on-gem") return s.gems.has(`${s.x},${s.y}`) ? 1 : 0;
        if (name === "gems-left") return s.gems.size;
        throw new Error(`Unknown query: ${name}`);
    }

    result() {
        if (this.sim.dead) return { success: false, fell: true };
        return { success: this.sim.collected === this.totalGems, fell: false };
    }

    // ---------- rendering ----------

    render() {
        const rows = this.level.grid.length;
        const cols = Math.max(...this.level.grid.map((r) => r.length));
        const { x, y, facing } = this.level.start;

        this.container.innerHTML = "";

        const hud = document.createElement("div");
        hud.className = "hud";
        this.hudGems = document.createElement("span");
        this.hudGems.textContent = `💎 0/${this.totalGems}`;
        hud.appendChild(this.hudGems);
        this.container.appendChild(hud);

        const scene = document.createElement("div");
        scene.className = "scene";
        this.board = document.createElement("div");
        this.board.className = "board";
        this.board.style.width = `${cols * TILE}px`;
        this.board.style.height = `${rows * TILE}px`;
        scene.appendChild(this.board);
        this.container.appendChild(scene);

        this.gemEls = new Map();
        this.level.grid.forEach((row, gy) => {
            [...row].forEach((ch, gx) => {
                const tile = document.createElement("div");
                tile.className = "tile " + ({ "~": "water", " ": "void", W: "rock" }[ch] ?? "path");
                tile.style.left = `${gx * TILE}px`;
                tile.style.top = `${gy * TILE}px`;
                this.board.appendChild(tile);
                if (ch === "W") {
                    const rock = this.upright("🪨", "rock-sprite", gx, gy);
                    this.board.appendChild(rock);
                }
                if (ch === "G") {
                    const gem = this.upright("💎", "gem", gx, gy);
                    this.board.appendChild(gem);
                    this.gemEls.set(`${gx},${gy}`, gem);
                }
            });
        });

        this.arrow = document.createElement("div");
        this.arrow.className = "facing-arrow";
        this.arrow.textContent = "➤";
        this.board.appendChild(this.arrow);

        this.camelia = document.createElement("div");
        this.camelia.className = "camelia";
        // fx: bump/shake · upright: camera billboard · bobber: hover
        this.camelia.innerHTML =
            `<span class="fx"><span class="upright"><span class="bobber"><span class="butterfly">` +
            `<span class="wing hind left"></span><span class="wing hind right"></span>` +
            `<span class="wing fore left"></span><span class="wing fore right"></span>` +
            `<span class="bfly-body"></span><span class="bfly-head"></span>` +
            `</span></span></span></span>`;
        this.head = this.camelia.querySelector(".bfly-head");
        this.board.appendChild(this.camelia);

        this.banner = document.createElement("div");
        this.banner.className = "banner";
        this.banner.hidden = true;
        this.container.appendChild(this.banner);

        this.placeSprite(x, y, facing, 0);
        this.fitBoard();
    }

    // Scale the board down (never up) so its projected footprint fits the
    // scene — without this, phones show a clipped corner of the island.
    fitBoard() {
        const scene = this.board.parentElement;
        this.board.style.setProperty("--scale", 1);
        const bb = this.board.getBoundingClientRect(); // measured at scale 1
        if (!bb.width || !scene.clientWidth) return;
        const scale = Math.min(1,
            (scene.clientWidth * 0.92) / bb.width,
            (scene.clientHeight * 0.92) / bb.height);
        this.board.style.setProperty("--scale", scale.toFixed(3));
    }

    upright(emoji, cls, gx, gy) {
        const el = document.createElement("div");
        el.className = `sprite ${cls}`;
        el.style.left = `${gx * TILE}px`;
        el.style.top = `${gy * TILE}px`;
        // .lift is the animation layer: keyframes translate/scale it without
        // having to restate .upright's counter-rotation transform
        el.innerHTML = `<span class="upright"><span class="lift">${emoji}</span></span>`;
        return el;
    }

    placeSprite(x, y, facing, ms) {
        for (const el of [this.camelia, this.arrow]) {
            el.style.transitionDuration = `${ms}ms`;
            el.style.left = `${x * TILE}px`;
            el.style.top = `${y * TILE}px`;
        }
        // rotate, then push toward the leading edge so the arrow peeks out from under Camelia
        this.arrow.style.transform = `rotate(${DIRS[facing].deg}deg) translateX(${TILE * 0.36}px)`;
        this.setHeading(facing, ms);
    }

    // Camelia stands upright at all times (any body rotation reads as her
    // falling over). She stares where she is going with her EYES: project the
    // board-space facing vector through the current board rotation and shift
    // her pupils toward it (the eye gradients read --look-x/--look-y).
    setHeading(facing, _ms = 0) {
        const cs = getComputedStyle(this.container);
        const rz = (parseFloat(cs.getPropertyValue("--rotZ")) || 45) * Math.PI / 180;
        const rx = (parseFloat(cs.getPropertyValue("--rotX")) || 55) * Math.PI / 180;
        const { dx, dy } = DIRS[facing];
        const vx = dx * Math.cos(rz) - dy * Math.sin(rz);
        const vy = (dx * Math.sin(rz) + dy * Math.cos(rz)) * Math.cos(rx);
        const len = Math.hypot(vx, vy) || 1;
        this.head.style.setProperty("--look-x", `${(vx / len * 2.2).toFixed(2)}px`);
        this.head.style.setProperty("--look-y", `${(vy / len * 2.2).toFixed(2)}px`);
    }

    // ---------- playback ----------

    async applyStep(cmd, stepMs) {
        const fx = this.camelia.querySelector(".fx");
        switch (cmd.name) {
            case "move-forward":
                if (cmd.bump) {
                    const { dx, dy } = DIRS[cmd.facing];
                    fx.style.setProperty("--bx", `${dx * TILE * 0.3}px`);
                    fx.style.setProperty("--by", `${dy * TILE * 0.3}px`);
                    fx.classList.remove("bump");
                    void fx.offsetWidth; // restart animation
                    fx.classList.add("bump");
                    await sleep(stepMs);
                } else if (cmd.fall) {
                    this.placeSprite(cmd.x, cmd.y, this.arrowFacing ?? "E", stepMs * 0.8);
                    await sleep(stepMs * 0.8);
                    this.camelia.classList.add("fall");
                    await sleep(stepMs * 1.5);
                } else {
                    this.placeSprite(cmd.x, cmd.y, this.arrowFacing ?? this.level.start.facing, stepMs * 0.8);
                    await sleep(stepMs);
                }
                break;
            case "turn-left":
            case "turn-right":
                this.arrowFacing = cmd.facing;
                this.arrow.style.transitionDuration = `${stepMs * 0.6}ms`;
                this.arrow.style.transform = `rotate(${DIRS[cmd.facing].deg}deg) translateX(${TILE * 0.36}px)`;
                this.setHeading(cmd.facing, stepMs * 0.6);
                await sleep(stepMs * 0.6);
                break;
            case "collect-gem":
                if (cmd.got) {
                    const gem = this.gemEls.get(`${cmd.x},${cmd.y}`);
                    if (gem) {
                        gem.classList.add("collected");
                        setTimeout(() => gem.remove(), 600);
                    }
                    this.shownCollected = (this.shownCollected ?? 0) + 1;
                    this.hudGems.textContent = `💎 ${this.shownCollected}/${this.totalGems}`;
                } else {
                    fx.classList.remove("nothing");
                    void fx.offsetWidth;
                    fx.classList.add("nothing");
                }
                await sleep(stepMs);
                break;
        }
    }

    // Applies the next recorded command; returns true while more remain.
    async stepOnce(stepMs = 300) {
        if (this.playIndex >= this.commands.length) return false;
        const cmd = this.commands[this.playIndex++];
        await this.applyStep(cmd, stepMs);
        return this.playIndex < this.commands.length;
    }

    async playAll(stepMs) {
        while (await this.stepOnce(stepMs)) { /* keep stepping */ }
        this.finish();
    }

    finish() {
        const { success, fell } = this.result();
        const left = this.totalGems - this.sim.collected;
        this.banner.textContent = fell
            ? "💦 Splash! Camelia fell in the water. Try again!"
            : success
                ? "Congratulations! 🎉 All gems collected!"
                : `${left} 💎 left — try again!`;
        this.banner.className = `banner ${success ? "success" : "failure"}`;
        if (success && this.onNext) this.banner.append(" ", nextLevelButton(() => this.onNext()));
        this.banner.hidden = false;
        this.onFinished?.(this.result());
    }
}
