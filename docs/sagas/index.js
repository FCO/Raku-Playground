// Saga registry. To add a saga: create docs/sagas/<id>.js exporting
// { id, title, description, levels } (see learn-raku.js for the level
// format) and import it here — that's the whole procedure.

import learnRaku from "./learn-raku.js";
import memoizedDom from "./memoized-dom.js";
import gemRush from "./gem-rush.js";

export const SAGAS = [
    learnRaku,
    memoizedDom,
    gemRush,
];
