// The "Build Websites" saga: learn MemoizedDOM (github.com/FCO/MemoizedDOM),
// a memoized declarative DOM library for Raku. These are `type: "dom"` levels:
// the world is the preview pane and success is a check() over the rendered DOM.
//
// The saga prelude inlines the MemoizedDOM framework (same code the library's
// todo6 browser sample uses — `use MemoizedDOM` needs installed modules, which
// the in-browser Rakudo doesn't have). It is prepended to every run, so error
// line numbers are offset by 1 (it is joined onto few physical lines).

const FRAMEWORK = `
EVAL :lang<JavaScript>, 'HTMLElement.prototype.defined = function() { return true }';
my \\JSDOC = EVAL :lang<JavaScript>, 'return document';
my class Element {
    has @.cache;
    has $.owner is required;
    has $.tag;
    has $.dom-element = JSDOC.createElement($!tag);
    multi method add-event-listener(Str $event, &handler) { $!dom-element.addEventListener: $event, &handler }
    multi method add-event-listener(Str $event, Str $handler) { nextwith $event, $!owner.^lookup($handler).assuming: $!owner }
    method class-name is rw { $!dom-element<class> }
    method input-value($val) { $!dom-element<value> = $val }
    method set-type(Str $type) { $!dom-element<type> = $type }
    method style(*%styles) { for %styles.kv -> $name, $value { $!dom-element<style>{$name} = $value } }
    method set-content(*@content) {
        while $!dom-element<firstChild> { $!dom-element.removeChild: $!dom-element<firstChild> }
        $!dom-element.appendChild: $_ for @content.map({ .?get-tag-data // $_ }).map({ .?dom-element // JSDOC.createTextNode: .Str })
    }
    method checked(Bool $checked) { $!dom-element<checked> = $checked ?? "checked" !! "" }
}
my role Tag does Callable {
    has @!cache;
    has Element $.root;
    method CALL-ME(|c) {
        if @*cache.defined and $*counter.defined and @*cache[$*counter++]:exists {
            my $cached = @*cache[$*counter-1];
            for c.hash.kv -> $attr, $value { try $cached."$attr"() = $value }
            return $cached
        }
        my $tag = ::?CLASS.new: |c;
        @*cache.push: $tag with @*cache;
        $tag
    }
    method mount-on($root) {
        $!root = Element.new: :dom-element($root), :owner(self);
        self.call-render
    }
    method create-element(Str $tag) { Element.new: :$tag, :owner(self) }
    multi method element($tag, $inner? is copy, :$class is copy, :$style is copy, :%event, :$type, :$value is copy, :$checked is copy) {
        my &inner; my @inner; my @dyn-inner; my &set-value; my &class; my &style; my @styles; my @callable; my &checked;
        given $inner {
            when Callable { &inner = $inner; $inner = Nil }
            when Positional { @inner = @$inner }
            default { @inner = $inner }
        }
        if @inner.any ~~ Callable { @dyn-inner = @inner; @inner = () }
        if $value ~~ Callable { &set-value = $value; $value = Nil }
        if $class ~~ Callable { &class = $class; $class = Nil }
        with $style {
            when Callable { &style = $style; $style = Nil }
            when Associative { (.value ~~ Callable ?? @callable !! @styles).push: $_ for .pairs }
        }
        if $checked ~~ Callable { &checked = $checked; $checked = Nil }
        my $el;
        if @*cache[$*counter++]:exists { $el = @*cache[$*counter - 1] } else {
            given $el = self.create-element: $tag {
                $el.class-name = $_ with $class;
                $el.set-content: @inner if @inner;
                $el.input-value: $_ with $value;
                $el.set-type: $_ with $type;
                $el.style: |$_ for @styles;
                $el.add-event-listener: .key, .value for %event;
                $el.checked: $_ with $checked;
            }
            @*cache.push: $el;
        }
        {
            my @*cache := $el.cache;
            my $*counter = 0;
            $el.set-content: .() with &inner;
            $el.set-content: @dyn-inner.map: { $_ ~~ Callable ?? .() !! $_ } if @dyn-inner;
            with &class { $el.class-name = $_ with .() }
            $el.input-value: .() with &set-value;
            $el.style: |.() with &style;
            $el.style: |$_ for @callable.map: { .key => .value.() };
            $el.checked: .() with &checked;
        }
        $el
    }
    method get-tag-data {
        my $*counter = 0;
        my @*cache := @!cache;
        my $*parent = self;
        self.render
    }
    method call-render { $!root.set-content: self.get-tag-data }
    method render { ... }
}
sub h1(*@inner, *%pars) { $*parent.element("h1", @inner, |%pars) }
sub h2(*@inner, *%pars) { $*parent.element("h2", @inner, |%pars) }
sub p(*@inner, *%pars) { $*parent.element("p", @inner, |%pars) }
sub div(*@inner, *%pars) { $*parent.element("div", @inner, |%pars) }
sub span(*@inner, *%pars) { $*parent.element("span", @inner, |%pars) }
sub ul(*@inner, *%pars) { $*parent.element("ul", @inner, |%pars) }
sub li(*@inner, *%pars) { $*parent.element("li", @inner, |%pars) }
sub form(*@inner, *%pars) { $*parent.element("form", @inner, |%pars) }
sub input(*@inner, *%pars) { $*parent.element("input", @inner, |%pars) }
sub button(*@inner, *%pars) { $*parent.element("button", @inner, |%pars) }
sub term:<preview> { EVAL :lang<JavaScript>, 'return PREVIEW' }
`.trim().split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    // joined onto one line, a block-final `}` no longer ends the statement — add `;`
    .map((l) => (l.endsWith("}") ? l + ";" : l))
    .join(" ");

const LEVELS = [
    {
        type: "dom",
        name: "Mount Your First App",
        goal: "Build a component that renders a heading, and mount it on the preview pane.",
        steps: [
            "A component is a class that does Tag and has a render method.",
            "render returns elements built with tag subs: h1(\"…\").",
            "Create the app with App.new and call .mount-on: preview;",
        ],
        explain: [
            "This saga teaches MemoizedDOM (github.com/FCO/MemoizedDOM) — a Raku library for " +
            "building web pages declaratively, the same way the library's in-browser todo demo " +
            "works. In a real project you'd write `use MemoizedDOM;`; the playground preloads the " +
            "framework for you before every run.",
            "A component is a class that `does Tag` and defines one method: `render`. Whatever " +
            "`render` returns becomes DOM. Tag subs — `h1`, `h2`, `p`, `div`, `span`, `ul`, `li`, " +
            "`form`, `input`, `button` — each build one element; their arguments become children.",
            "Why `my class`? A plain `class` is installed globally, and in the playground every " +
            "Run re-declares it — the second Run would die with “Redeclaration of symbol”. " +
            "`my` makes the class lexical (private to this program), which sidesteps that — and " +
            "is a good habit for file-local classes in any Raku script.",
            "`App.new` creates the root component and `.mount-on: preview;` attaches it to the " +
            "preview pane, renders, and your page appears on the right. (Components are also " +
            "*callable* — `Todo(:title<hi>)` — a trick that powers the memoization; the last " +
            "level shows it in action.)",
            "Heads-up: the framework is compiled with your code on every Run, so runs in this " +
            "saga take a few extra seconds — and error line numbers are shifted by one.",
        ],
        starter: `my class App does Tag {\n    method render {\n        # an h1 saying: Hello, web!\n    }\n}\n\nmy $app = App.new;\n$app.mount-on: preview;\n`,
        hint: "method render { h1(\"Hello, web!\") }",
        solution: `my class App does Tag {\n    method render {\n        h1("Hello, web!")\n    }\n}\nmy $app = App.new;\n$app.mount-on: preview;`,
        check(preview) {
            const h = preview.querySelector("h1");
            return h && /Hello, web!/.test(h.textContent)
                ? { success: true }
                : { success: false, message: "the preview needs an <h1> saying “Hello, web!”" };
        },
    },
    {
        type: "dom",
        name: "Nesting Elements",
        goal: "Structure a page: a div containing a heading and a list of three items.",
        steps: [
            "Tag subs take any number of children: div(h1(…), ul(…)).",
            "A ul contains li elements.",
            "Render: div → h1 “My list” + ul → three li: one, two, three.",
        ],
        explain: [
            "Pages are trees, and the code mirrors the tree: children are just arguments. " +
            "`div( h1(\"title\"), ul( li(\"a\"), li(\"b\") ) )` reads exactly like the HTML it " +
            "produces.",
            "Text and elements mix freely — `p(\"total: \", span(\"42\"))` — anything that isn't " +
            "an element becomes a text node.",
            "Raku niceties apply: trailing commas are fine, whitespace is free, and since these " +
            "are ordinary sub calls you can build children with any expression you like.",
        ],
        starter: `my class App does Tag {\n    method render {\n        div(\n            # h1 and a ul with three li…\n        )\n    }\n}\nApp.new.mount-on: preview;\n`,
        hint: "div( h1(\"My list\"), ul( li(\"one\"), li(\"two\"), li(\"three\") ) )",
        solution: `my class App does Tag {\n    method render {\n        div(\n            h1("My list"),\n            ul(\n                li("one"),\n                li("two"),\n                li("three"),\n            ),\n        )\n    }\n}\nApp.new.mount-on: preview;`,
        check(preview) {
            const lis = preview.querySelectorAll("div ul li");
            return preview.querySelector("div h1") && lis.length === 3
                ? { success: true }
                : { success: false, message: "need a div with an h1 and a ul holding exactly 3 li" };
        },
    },
    {
        type: "dom",
        name: "Style It",
        goal: "Make a paragraph big and red with the :style named argument.",
        steps: [
            "Pass :style{ … } with a hash of CSS properties.",
            "Property names are JavaScript-style camelCase: fontSize, not font-size.",
            "Render a p “Big and red” with color red and fontSize 32px.",
        ],
        explain: [
            "Every tag sub accepts named arguments alongside children. `:style{ :color<red>, " +
            ":fontSize<32px> }` sets inline styles — the keys are the JavaScript DOM names " +
            "(`fontSize`, `textDecoration`), because they land directly on `element.style`.",
            "The colon-pair syntax is pure Raku: `:color<red>` is `color => \"red\"`. A hash of " +
            "pairs, nothing magic.",
            "Styles can also be *dynamic* — pass a block instead of a hash and it re-evaluates on " +
            "every render. Hold that thought: it's the heart of the next levels.",
        ],
        starter: `my class App does Tag {\n    method render {\n        p(\n            "Big and red",\n            # :style{ … }\n        )\n    }\n}\nApp.new.mount-on: preview;\n`,
        hint: ":style{ :color<red>, :fontSize<32px> }",
        solution: `my class App does Tag {\n    method render {\n        p(\n            "Big and red",\n            :style{ :color<red>, :fontSize<32px> },\n        )\n    }\n}\nApp.new.mount-on: preview;`,
        check(preview) {
            const p = preview.querySelector("p");
            return p && p.style.color === "red" && p.style.fontSize === "32px"
                ? { success: true }
                : { success: false, message: "the p needs inline color:red and fontSize:32px" };
        },
    },
    {
        type: "dom",
        name: "State and Events",
        goal: "A click counter: a button that increments $!count, and a heading that always shows it.",
        steps: [
            "Give App an attribute: has Int $.count = 0;",
            "Dynamic content is a block: h1({ \"Clicks: $!count\" }) re-renders each time.",
            "Handle clicks with :event{ :click{ $!count++; self.call-render } }.",
        ],
        explain: [
            "Components hold state in ordinary Raku attributes — `has Int $.count = 0;`.",
            "Here is the core idea of MemoizedDOM: pass a *block* where a value could go, and it " +
            "becomes live. `h1({ \"Clicks: $!count\" })` re-evaluates on every render; a plain " +
            "`h1(\"Clicks: $!count\")` would be frozen at its first value.",
            "`:event{ :click{ … } }` attaches listeners; the handler is a plain Raku closure. " +
            "Change your state, then call `self.call-render` to refresh the page.",
            "Why “Memoized”? On re-render the framework does not rebuild the DOM — it walks a " +
            "cache of the elements it already made and only updates what a block now returns " +
            "differently. You write naive re-render-everything code; the library makes it cheap.",
        ],
        starter: `my class App does Tag {\n    has Int $.count = 0;\n\n    method render {\n        div(\n            # live heading + button with a click handler…\n        )\n    }\n}\nApp.new.mount-on: preview;\n`,
        hint: "h1({ \"Clicks: $!count\" }), button(\"click me\", :event{ :click{ $!count++; self.call-render } })",
        solution: `my class App does Tag {\n    has Int $.count = 0;\n\n    method render {\n        div(\n            h1({ "Clicks: $!count" }),\n            button(\n                "click me",\n                :event{ :click{ $!count++; self.call-render } },\n            ),\n        )\n    }\n}\nApp.new.mount-on: preview;`,
        check(preview) {
            // wording is free — the heading must show the count and update on click
            const h = preview.querySelector("h1");
            const btn = preview.querySelector("button, input[type=button]");
            if (!h || !btn) return { success: false, message: "need an h1 (the counter) and a button" };
            if (!/\b0\b/.test(h.textContent))
                return { success: false, message: "the h1 should show the starting count, 0 (any wording)" };
            btn.click();
            return /\b1\b/.test(preview.querySelector("h1").textContent)
                ? { success: true }
                : { success: false, message: "clicking the button should make the h1 show 1 — increment $!count and call-render" };
        },
    },
    {
        type: "dom",
        name: "Render a List",
        goal: "Render a ul from data: one li per element of @!fruits.",
        steps: [
            "has @.fruits = <apple banana cherry>;",
            "A block child may return many elements: ul({ do for @!fruits -> $f { li($f) } }).",
            "One li per fruit — data drives the page.",
        ],
        explain: [
            "Real pages are generated from data. Inside a block child, any Raku expression goes — " +
            "so `do for @!fruits -> $f { li($f) }` yields one `li` per fruit, and the `ul` shows " +
            "them all.",
            "`do for` makes the loop an expression that collects its results (that's the `do`). " +
            "You could equally write `@!fruits.map: { li($_) }` — TIMTOWTDI.",
            "Because the list lives in a block, changing `@!fruits` and calling " +
            "`self.call-render` would update the page — the same live-block rule as the counter, " +
            "applied to structure instead of text.",
        ],
        starter: `my class App does Tag {\n    has @.fruits = <apple banana cherry>;\n\n    method render {\n        # a ul built from @!fruits…\n    }\n}\nApp.new.mount-on: preview;\n`,
        hint: "ul({ do for @!fruits -> $f { li($f) } })",
        solution: `my class App does Tag {\n    has @.fruits = <apple banana cherry>;\n\n    method render {\n        ul({ do for @!fruits -> $f { li($f) } })\n    }\n}\nApp.new.mount-on: preview;`,
        check(preview) {
            const lis = [...preview.querySelectorAll("ul li")].map((li) => li.textContent.trim());
            return lis.length === 3 && lis.includes("apple") && lis.includes("banana") && lis.includes("cherry")
                ? { success: true }
                : { success: false, message: "the ul needs an li for each of: apple, banana, cherry", got: lis };
        },
    },
    {
        type: "dom",
        name: "Components: a Mini Todo",
        goal: "Two components — Todo and App. Click an item to strike it through. The real MemoizedDOM demo, miniature.",
        steps: [
            "Todo does Tag: has $.title, $.done is rw, and &.toggle (a callback from the parent).",
            "Its render: an li with a dynamic :style block and :event{ :click(&!toggle) }.",
            "App renders ul({ do for @!todos -> (:$title!, :$done! is rw) { Todo(:$title, :$done, :toggle{ $done = !$done; self.call-render }) } }).",
        ],
        explain: [
            "Components compose: a `Todo` is a component like `App`, and the parent's render " +
            "simply calls `Todo(...)` with named arguments — that's why `Tag does Callable`. On " +
            "re-render, the memoization cache recognizes the existing `Todo` and *updates its " +
            "attributes* instead of building a new one.",
            "Parents hand children callbacks: `has &.toggle;` in `Todo`, `:toggle{ … }` at the " +
            "call site. The child stays dumb — it renders and reports clicks; the parent owns the " +
            "data and decides what changes. That's the same data-down/actions-up shape React " +
            "popularized, in idiomatic Raku.",
            "Note the signature `-> (Str :$title!, Bool :$done! is rw)`: it destructures each " +
            "todo hash right in the loop, and `is rw` means assigning `$done` writes back into " +
            "`@!todos`. The `:style{ $!done ?? { … } !! { … } }` block picks styles live.",
            "That's the whole library — this level is the todo demo from " +
            "github.com/FCO/MemoizedDOM, miniaturized. From here you can build real pages in " +
            "Free play: `PREVIEW` is yours, and the framework is one prelude away.",
        ],
        starter: `my class Todo does Tag {\n    has Str  $.title;\n    has Bool $.done is rw;\n    has      &.toggle is required;\n\n    method render {\n        li(\n            # dynamic :style + :event click -> &!toggle, then the title…\n        )\n    }\n}\n\nmy class App does Tag {\n    has @.todos = { :title("learn Raku"), :!done },\n                  { :title("build a site"), :!done };\n\n    method render {\n        div(\n            h1("Todo"),\n            # the ul of Todo components…\n        )\n    }\n}\nApp.new.mount-on: preview;\n`,
        hint: "li( :style{ $!done ?? { :textDecoration<line-through> } !! { :textDecoration<none> } }, :event{ :click(&!toggle) }, $!title )",
        solution: `my class Todo does Tag {\n    has Str  $.title;\n    has Bool $.done is rw;\n    has      &.toggle is required;\n\n    method render {\n        li(\n            :style{ $!done ?? { :textDecoration<line-through> } !! { :textDecoration<none> } },\n            :event{ :click(&!toggle) },\n            $!title,\n        )\n    }\n}\n\nmy class App does Tag {\n    has @.todos = { :title("learn Raku"), :!done },\n                  { :title("build a site"), :!done };\n\n    method render {\n        div(\n            h1("Todo"),\n            ul({ do for @!todos -> (Str :$title!, Bool :$done! is rw) {\n                Todo(:$title, :$done, :toggle{ $done = !$done; self.call-render })\n            } }),\n        )\n    }\n}\nApp.new.mount-on: preview;`,
        check(preview) {
            const lis = preview.querySelectorAll("ul li");
            if (lis.length !== 2) return { success: false, message: "need a ul with the 2 todos" };
            lis[0].click();
            const struck = preview.querySelectorAll("ul li")[0];
            return struck.style.textDecoration === "line-through"
                ? { success: true }
                : { success: false, message: "clicking a todo should strike it through (textDecoration: line-through)" };
        },
    },
];

export default {
    id: "memoized-dom",
    title: "Build Websites (MemoizedDOM)",
    description: "Learn MemoizedDOM: declarative, memoized web pages in Raku.",
    prelude: FRAMEWORK,
    levels: LEVELS,
};
