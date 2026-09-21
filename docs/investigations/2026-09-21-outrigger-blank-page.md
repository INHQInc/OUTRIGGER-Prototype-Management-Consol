# www.outrigger.com renders blank — diagnosis and stopgap

*21 Sep 2026. Not an OPMC/Prism fault. Evidence below.*

## What breaks

A vendor script on every page hangs:

```
https://be.synxis.com/public/widgets/libs/v2/shs-widgets-searchbar/web-component-with-libs.js
```

`curl -m 25` returns **status 000, 0 bytes** — the connection opens and Sabre never
responds. Its siblings on the same host are healthy (`shs-widgets-calendar` 200 in
0.32s / 911KB, `shs-widgets-best-price` 200 in 0.23s / 255KB), so be.synxis.com is up
and only the searchbar bundle is dead. The hyphenated spelling
(`shs-widgets-search-bar/...js`) hangs too, so it is the resource, not the path.

The tag is static and carries no `async` or `defer`:

```html
<script charset="utf-8" src="https://be.synxis.com/public/widgets/libs/v2/shs-widgets-searchbar/web-component-with-libs.js">
```

## Why that blanks the page

The tag sits at **99.2%** of the document, after jQuery (70.3%), the footer markup
(65.7%) and `PasswordProtection.js` (98.4%). Being parser-blocking, the browser stops
there and `document.readyState` never leaves `loading`.

Outrigger's pages ship `class="... hidden-body"` from the server and `main.css` defines
`.hidden-body { visibility: hidden; }`. The only code that removes it is
`PasswordProtection.js`, inside a jQuery DOM-ready callback. DOM-ready never fires, so
the class is never removed and the page stays invisible with `jQuery.isReady === false`.

Measured on www: `readyState: "loading"` at 250 seconds, body `visibility: hidden`,
full DOM present (1889 elements, footer included).

## Ruled out

| Suspect | Evidence it is not the cause |
|---|---|
| OPMC / Prism loader | `async`, returns 200 in 0.4s, exits without `?opmc=`. Production carries **no tag of ours** and fails identically. |
| Optimizely | `?optimizely_disable=true` left `window.optimizely` undefined; page still hung at 71s. |
| GTM | Same container `GTM-M84QDRN` on prep and prod; prod property page reached DOM-ready in 1.08s with it. |
| The console 404s | Two fonts and one SVG. Cosmetic, unrelated to parsing. |

## Stopgap — paste into Optimizely Project JavaScript

Runs at 10.2% of the document, long before the blocking tag. It waits until the
blocking script actually appears in the DOM, which is the moment the parser reaches it
and therefore the moment everything above it is parsed. No guessed timeout.

```js
(function () {
  if (window.__ogGuard) return; window.__ogGuard = 1;
  var SEL = 'script[src*="shs-widgets-searchbar"]';
  var t = setInterval(function () {
    if (document.readyState !== 'loading') { clearInterval(t); return; } // healthy page, do nothing
    if (!document.querySelector(SEL)) return;                            // parser not there yet
    clearInterval(t);
    if (document.body) document.body.classList.remove('hidden-body');
    document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));
    setTimeout(function () {
      try { window.dispatchEvent(new Event('load')); } catch (e) {}
    }, 500);
  }, 100);
  setTimeout(function () { clearInterval(t); }, 60000);
})();
```

**Measured on www.outrigger.com, injected at document start:** guard fires at **663ms**,
body `visibility: visible`, `jQuery.isReady` true, `has-plugin-quantity` added by a
ready handler, 3 carousels initialised, footer present, 1891 elements. For comparison a
healthy page reaches DOM-ready at ~1,080ms, so this is no slower than normal.

### What it does not fix

- `document.readyState` stays `loading` — it cannot be set. The tab keeps showing a
  loading spinner, and anything gated on `readyState === 'complete'` still will not run.
- The **booking search bar widget itself stays dead**, because its bundle is the thing
  that will not load. The separate Sabre booking widget and BOOK NOW are present.
- Console fills with repeated *"Blocked script execution in 'about:blank' … sandboxed"*
  messages once the site's JS runs against a still-open document. Noise, not breakage.
- It is keyed to this one URL fragment. If Sabre renames the asset the guard stops
  matching, which is the safe direction to fail.


## Deployed 21 Sep 2026 — verified live

Shipped in Optimizely project **21089662478**, as `custom_code` on variation
**"GA4 Test Variation #1"** of the experiment **"Googl Analytics Test"**
(view 24611740622). Traffic allocation is a single range to `endOfRange: 10000`,
so it is a 100% rollout; the Original variation carries no actions and gets no traffic.

Measured on www.outrigger.com with a fresh profile:

| Event | Time |
|---|---|
| Guard code executes | 520ms |
| `hidden-body` removed, page visible | 633ms |
| Healthy page DOM-ready, for comparison | ~1,080ms |

Stable across repeated samples from 6s to 31s. Content is on screen sooner than a
healthy page reaches DOM-ready, so any remaining "slow" feel is the page's own weight
(hero video, ~240 requests) plus the fact that `readyState` never leaves `loading`, so
the browser's loading spinner never stops.

### One fragility worth fixing

The site's visibility now depends on an experiment named "Googl Analytics Test". If
anyone pauses it, concludes it, edits that variation, or changes its traffic
allocation, **every page goes dark again**, and the person doing it will have no idea
that is what they are touching.

This project has no Project JavaScript configured (`projectJavaScript` is absent from
the bundle). That is where this belongs: it runs for all visitors, executes before
experiment evaluation, and is not coupled to any experiment's lifecycle. Move it there
and delete the variation code.

## The real fix (Outrigger, not us)

1. Add `defer` to that script tag, or drop the searchbar widget until Sabre restores the
   file. A vendor asset should never be able to block parsing.
2. Stop gating visibility on a single DOM-ready callback with no fallback. Any tag that
   misbehaves takes the whole site dark.
3. Raise the dead bundle with Sabre/SynXis.
