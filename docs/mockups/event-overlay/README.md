# Tracked events on the live page — mockup

*24 Sep 2026. A mockup; nothing in `src/` uses it yet.*

Open a variation with `opmc_metrics=1` and every element tied to the
experiment's Optimizely events is drawn on the live page: a see-through box per
element, one colour per event, and a line to the event's name. You can click
around the variation and watch elements appear as they're revealed. Events with
nothing to click on the page are listed first, so a broken selector shows up
before the test starts instead of after.

First tried on the Map destination selector (experiment 6619287249485824,
variation 6490208667959296).

## Try it

1. Open <https://prep.outrigger.com/?opmc=destination-selector-with-map&opmc_metrics=1>.
2. In the browser console run `document.body.style.visibility = "visible"`.
   prep keeps the page hidden while it waits on a SynXis script that never
   loads. Our loader isn't the cause.
3. Set `window.__OPMC_EVENTS__` to the contents of
   `destination-selector-with-map.json`, then paste `overlay.js`.

## What the panel shows

| Group | Meaning |
|---|---|
| Not seen yet | Nothing on the page matches yet. Click around; if it never appears, the event can't fire here. |
| Hidden on this page | Elements match but none is visible, so nobody can click them. |
| On screen now | Boxed on the page right now. |
| On the page, scroll to see | Matches below or above the fold. |
| Seen earlier | Appeared during this visit, gone now (a closed popover, a switched view). |

A row also warns when an event matches elements outside the test's area, or
when one element is counted by more than one event.

- Callouts drag. Double-click one to put it back.
- The panel floats or docks left, bottom or right like browser dev tools. It
  remembers the choice.
- Clicking a row scrolls to that event's element.

## Where the events come from

Optimizely REST v2, read only: `GET /experiments/{id}` gives `metrics[].event_id`,
then `GET /events/{id}` gives `config.selector` for click events.

## What it found on the Map variation

- **Map - Explore Destination CTA Click** only counts the first destination
  tile (`article:nth-of-type(1)`).
- The four **Default - …** events match nothing visible in the Map variation.
  That's expected, because the map replaces the default selector.
- The property tile's "Learn More" in the Map variation is counted only by
  **Default - Property Learn More Click** (`.card-view-property`).
- Popover and list-tile events appear only after you open a popover or switch
  to the list.

## In the product

- A "Visualize events" link per variation in the analytics section opens that
  variation with `opmc_metrics=1`.
- The loader sees `opmc_metrics=1` and draws the overlay. A console endpoint
  returns the experiment's events from Optimizely.
