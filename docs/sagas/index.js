// Saga registry. To add a saga: create docs/sagas/<id>.js exporting
// { id, title, description, levels } (see learn-raku.js for the level
// format) and import it here — that's the whole procedure.

import learnRaku from "./learn-raku.js";
import quoting from "./quoting.js";
import dataStructures from "./data-structures.js";
import containers from "./containers.js";
import typesMop from "./types-mop.js";
import phasers from "./phasers.js";
import grammars from "./grammars.js";
import elevator from "./elevator.js";
import gemRush from "./gem-rush.js";

// Note: the runtime runs in a Web Worker (no DOM), so DOM-manipulating sagas
// aren't supported. The former "memoized-dom" saga was removed for this reason;
// grammars stays because it renders via a message to the main thread, not DOM.
export const SAGAS = [
    learnRaku,
    quoting,
    dataStructures,
    containers,
    typesMop,
    phasers,
    grammars,
    elevator,
    gemRush,
];
