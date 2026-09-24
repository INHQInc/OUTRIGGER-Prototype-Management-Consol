# Tracked events on the live page — mockup

*24 Sep 2026. A mockup; nothing in `src/` uses it yet.*

Open a variation on prep with `opmc_metrics=1` and every element tied to the
experiment's Optimizely events is drawn on the page: a see-through box per
element, one colour per event, and a line to the event's name. Click around
and elements appear as the variation reveals them. Events with nothing to
click are listed first, so a broken selector shows up before the test starts.

First tried on the Map destination selector (experiment 6619287249485824).

## Decided with Bryan, 24 Sep

- **Prep only.** It runs on prep, through our loader, and only when the
  address has `opmc_metrics=1`. Without the flag nothing loads and our app
  isn't called.
- **Nothing goes to Optimizely or production.** No metrics code is added to
  the experiment or the live site. The code we push into Optimizely stays the
  prototype build.
- **Set aside: Optimizely's own preview of www.** Links that pick a variation
  are off on the Outrigger Prod project. The other way in, a check in the
  experiment's shared code, would put metrics code into the live test.
- **Set aside for now: a browser bookmark.**

## Try it

1. Open <https://prep.outrigger.com/?opmc=destination-selector-with-map&opmc_metrics=1>.
2. In the browser console run `document.body.style.visibility = "visible"`.
   prep keeps the page hidden while it waits on a SynXis script that never
   loads. Our loader isn't the cause.
3. Set `window.__OPMC_EVENTS__` to the contents of
   `destination-selector-with-map.json`, then paste `overlay.js`.

In the mockup, paste it again after each variation switch. In the product the
loader draws it on every page that asks.

## The panel

- **Variation.** Switches between the experiment's variations. Picking the
  original ("Default Destination Selector") opens the page without our
  changes, so you see the control and which events can fire there.
- **Build.** When the page runs a different build from the one pushed into
  Optimizely, the panel says so. Today prep's `?opmc=` runs `42835989cc20`,
  while the Map variation in Optimizely holds `3cc97bb27092`.
- **Groups.** Each event sits in one of these:

| Group | Meaning |
|---|---|
| Not seen yet | Nothing on the page matches yet. Click around; if it never appears, the event can't fire here. |
| Hidden on this page | Elements match but none is visible yet. Click around; if they never show, the event can't fire here. |
| On screen now | Boxed on the page right now. |
| On the page, scroll to see | Matches above or below what's on screen. |
| Seen earlier | Appeared during this visit, gone now (a closed popover, a switched view). |

A row also warns when an event matches elements outside the test's area, or
when one element is counted by more than one event.

- **Callouts drag.** Double-click one to put it back.
- **The panel docks.** It floats or docks left, bottom or right like browser
  dev tools, and remembers the choice. The eye icon hides the boxes.
- **Rows scroll.** Clicking a row scrolls to that event's element.

## Where the events come from

The Optimizely REST v2 API, read only. `GET /experiments/{id}` gives each
metric's `event_id`, and `GET /events/{id}` gives `config.selector` for click
events.

## What it found

In the Map variation:

- **Map - Explore Destination CTA Click** only counts the first destination
  tile (`article:nth-of-type(1)`).
- **Default - Property Learn More Click** is the only event that counts the
  "Learn More" link on the Map's property tiles. Its selector
  (`.card-view-property`) matches them too. The other Default events have
  nothing visible to click in this variation.
- **Popover and list-tile events** appear only after you open a popover or
  switch to the list.
- **The popover's "Learn More" is counted twice.** Both **Map - Popover
  Property Learn More Click** and **Default - Property Learn More Click**
  match it, so one click adds to both events.

In the control (Default Destination Selector), at desktop width:

- **Four of the five Default events** have elements on screen, all inside the
  test's area.
- **Default - Drop Down Click** matches 5 items, none visible at this width.
- **The nine Map events** match nothing, as expected.

## In the product

- **The loader on prep draws the overlay.** It does this only when the address
  has `opmc_metrics=1`. Our app supplies the event list, read from Optimizely's
  API and cached.
- **"Visualize events" in the analytics section** opens the variation on prep
  with the flag.
- **The control keeps the test's key.** The loader needs `?opmc=` to know
  which events to show, so the switcher will keep the key and add a flag that
  tells the loader to skip our changes. The mockup drops `?opmc=` instead,
  because the live loader doesn't know that flag yet.
- **Prep can't copy everything.** It doesn't apply Optimizely's page and
  audience rules (this test only runs on www.outrigger.com). Differences
  between prep's page and www's won't show here.
