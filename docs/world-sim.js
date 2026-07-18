// The puzzle-world SIMULATION — pure logic, no DOM. Lives here so it can run
// inside the Web Worker alongside Rakudo (imported via importScripts, so it
// attaches WorldSim to the global `self` rather than using ES exports). The
// renderer/playback half stays on the main thread in world.js and replays the
// commands this produces. Kept in lockstep with the command shapes world.js
// animates in applyStep().

(function (glob) {
    const COMMAND_LIMIT = 1000;

    const DIRS = {
        N: { dx: 0, dy: -1 },
        E: { dx: 1, dy: 0 },
        S: { dx: 0, dy: 1 },
        W: { dx: -1, dy: 0 },
    };
    const LEFT_OF = { N: "W", W: "S", S: "E", E: "N" };
    const RIGHT_OF = { N: "E", E: "S", S: "W", W: "N" };

    class WorldSim {
        constructor(level) {
            this.level = level;
            this.totalGems = level.grid.join("").split("G").length - 1;
            this.reset();
        }

        reset() {
            const { x, y, facing } = this.level.start;
            this.sim = { x, y, facing, dead: false, collected: 0, gems: new Set() };
            this.level.grid.forEach((row, gy) => {
                [...row].forEach((ch, gx) => {
                    if (ch === "G") this.sim.gems.add(`${gx},${gy}`);
                });
            });
            this.issued = 0;
        }

        tileAt(x, y) {
            return this.level.grid[y]?.[x] ?? " ";
        }

        walkable(x, y) {
            return "#G".includes(this.tileAt(x, y)) ||
                (x === this.level.start.x && y === this.level.start.y);
        }

        // Advance the sim and return the recorded command (the object the main
        // thread animates), or null when it was dropped (issued after a fall).
        command(name, line) {
            if (++this.issued > COMMAND_LIMIT)
                throw new Error(`Runaway program: more than ${COMMAND_LIMIT} commands issued`);
            if (this.sim.dead) return null;
            const s = this.sim;
            let cmd;
            switch (name) {
                case "move-forward": {
                    const { dx, dy } = DIRS[s.facing];
                    const [tx, ty] = [s.x + dx, s.y + dy];
                    if (this.walkable(tx, ty)) {
                        s.x = tx; s.y = ty;
                        cmd = { name, x: tx, y: ty };
                    } else if (this.tileAt(tx, ty) === "W") {
                        cmd = { name, bump: true, facing: s.facing };
                    } else {
                        s.dead = true;
                        cmd = { name, fall: true, x: tx, y: ty };
                    }
                    break;
                }
                case "turn-left":
                case "turn-right":
                    s.facing = (name === "turn-left" ? LEFT_OF : RIGHT_OF)[s.facing];
                    cmd = { name, facing: s.facing };
                    break;
                case "collect-gem": {
                    const key = `${s.x},${s.y}`;
                    if (s.gems.has(key)) {
                        s.gems.delete(key);
                        s.collected++;
                        cmd = { name, got: true, x: s.x, y: s.y };
                    } else {
                        cmd = { name, got: false, x: s.x, y: s.y };
                    }
                    break;
                }
                default:
                    throw new Error(`Unknown command: ${name}`);
            }
            if (line != null) cmd.line = line;
            return cmd;
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
            const s = this.sim;
            const base = { x: s.x, y: s.y, facing: s.facing, dead: s.dead, collected: s.collected };
            if (s.dead) return { ...base, success: false, fell: true };
            return { ...base, success: s.collected === this.totalGems, fell: false };
        }
    }

    glob.WorldSim = WorldSim;
})(typeof self !== "undefined" ? self : this);
