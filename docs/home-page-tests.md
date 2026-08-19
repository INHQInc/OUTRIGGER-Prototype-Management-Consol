# Home Page Tests — working file

Running record for the Outrigger home page A/B programme. Every proposal here must be
backed by experiment data or explicitly marked as unevidenced. This file becomes the
source for a PPTX of recommended next tests.

**Rule for this document:** anything suggested — mine, Verndale's, or hybrid — states the
evidence from the hero experiment, or says plainly that it has none.

---

## 1 · The experiment we are reasoning from

**Home Page Hero No Offer** — experience-led hero ("World's best ocean views") vs
discount-led control ("Ocean views on sale / 40% off"). Bound 2026-08-03.
**12,804 per arm · 18 days · powered to ±18.2%.** Still LIVE at time of writing.

### Settled
| Metric | Control | Variation | Lift | p |
|---|---|---|---|---|
| **Hero CTA Click** | 3.87% (496) | 1.62% (210) | **−58.1%** | <0.0001 |

### The redistribution — 286 clicks lost, ~260 recovered
| Metric | Control | Variation | Δ | Lift |
|---|---|---|---|---|
| Destination Exploration Tab | 864 | 946 | +82 | +8.3% |
| Navigation (Explore menu) | 1,509 | 1,589 | +80 | +4.2% |
| Property Title Clicked | 496 | 558 | +62 | +11.3% |
| Destination Drop Down Item | 375 | 427 | +52 | +12.7% |
| Booking Complete | 158 | 181 | +23 | +13.3% |
| **Property "Book Now"** | 294 | 295 | **+1** | −0.7% |
| **Offer CTA Click** | 198 | 199 | **+1** | −0.6% |
| Property "Learn More" | 163 | 155 | −8 | −5.9% |
| Destination Highlights Button | 199 | 187 | −12 | −7.0% |
| **BE: Rooms & Rates** | 547 | 526 | **−21** | −4.9% |

### Ruled out (tight intervals around zero — settled nulls, not unknowns)
Scroll depth **flat to negative at all four levels**: 25% −0.3%, 50% −0.7%, 75% −0.9%,
100% −2.6%; composite −1.0%. **Adding content below the fold is ruled out** — it would be
served to the same eyeballs.

### Derived signals (not significant — treat as leads)
- **Bookings per BE arrival: 28.9% → 34.4%** (158/547 vs 181/526). Fewer, better-qualified
  arrivals. *Unconfirmed:* assumes bookings pass through that page; there are ≥4 other routes.
- **Offer demand is inelastic to the hero.** Offer engagement composite +2.2%, p=0.86 when
  the offer left the hero entirely. The 40%-off headline was not earning its position.

### Power for the next test
711/arm/day. Primary candidate **BE: Rooms & Rates** baseline 4.27% → ~9,600/arm →
**~14 days** for a 20% relative move. **Booking Complete** at 1.23% needs ~36,000/arm
(~8 weeks) — **can never be the decision metric.**

---

## 2 · The core diagnosis

**The home page runs two economies that never touch.**

- *Inspiration*: hero, destination tabs, property tiles, Cirque, 10 stories.
  Exits: `Learn more`, `Oahu highlights`, `Learn More`, `View more stories` — all content.
- *Commerce*: header BOOK NOW, sticky BOOK NOW, tile Book Now, 5× `Check availability`.
  Entries: all assume you already know where and when.

The old offer hero was the door between them. v1 removed it — correctly — and built no
replacement. Redirected attention now circulates in inspiration and leaves.

**Verndale reached the same diagnosis independently:** *"The homepage should move from being
a collection of promotions, destinations, stories and selling points to becoming a guided
journey from inspiration to action."*

---

## 3 · Technical findings (verified)

### Booking engine — Sabre SynXis
- Host `reservation.outrigger.com`, chain `18497`. **Honours date params — verified live.**
- Canonical set: `arrive · depart · adult · child · rooms · chain · dest · level · locale`
- `?chain=18497&arrive=2026-10-02&depart=2026-10-05&adult=2` → lands on **"Select a Hotel"**:
  a property grid with photography, location, **from-rate per night**, sort control,
  VIEW RATES per card, and social proof ("Booked in last 27 minutes").
- **Existing site links carry `chain·dest·nights·promo·filter·adult·level` but NEVER a date.**
  This is very likely why tile Book Now gained 1 click in 18 days — it lands on a blank form.
- `dest=ORH` did **not** filter to Hawai'i (normalised to `level=chain`, returned worldwide).
  Island scoping needs the right region code or `level=hotel&hotel=<SabreID>`. **OPEN.**

### SynXis widgets already on the home page
- `shs-widgets-calendar` — **instantiated** (`<sabre-shs-widgets-calendar api=…>`)
- `shs-widgets-searchbar` — script loaded, **never used**
- `shs-widgets-best-price` — script loaded, **never used**. If it renders a rate, cards get
  from-rates as a component call, not an integration. **OPEN — unverified.**

### Property data
- Home page carries a `destinationselection` JSON: **16 properties, 5 destinations**
  (Hawaii 8 across O'ahu 4 / Maui 2 / Hawai'i Island 1 / Kaua'i 1; Thailand 4; Fiji 2;
  Mauritius 1; Maldives 1). Hierarchy is **irregular** — only Hawaii has a region tier.
- Per property: `PropertyName · PropertyDescription · PropertySabreID · PropertyCity/State ·
  Url · Images · HeroImageUrl`
- **Empty on every property:** `PropertyHighlights.Amenities` = `[]`, `Prices` = fallback span,
  `PricingInfo` all null with `IsFallback: true`, `data-average-nightly-rate="0"`.
  → The price pipeline **exists and is switched off or broken.** Worth one question to whoever
  owns the CMS integration.
- **No coordinates on the home page.** They DO exist on every property page as schema.org
  `GeoCoordinates`. Harvested 16/16, amenities 15/16 (Phi Phi returns none — different template).
- **The map prototype's `COORDS` has 26 properties** — includes "by Outrigger" condos
  (Kiahuna Plantation, Waipouli, Royal Kahana, Kapalua Villas, Napili Shores, Palms at Wailea,
  Kaanapali Eldorado, Regency on Beachwalk, Waikiki Shore). It has an `isCondo()` split.
  **OPEN QUESTION: do condos belong in the explorer? 16 or 26 decides the navigation.**
- **Data bug:** outrigger.com JSON-LD gives Surin Beach `97.15982` — ~120 km west of Phuket,
  open ocean. Correct ≈ `98.286`. Already corrected in the map prototype; now corrected in
  `docs/outrigger-properties.js`. **Should be fixed at source.**

### Assets produced
- `docs/outrigger-properties.js` — 16 properties: dest/region/name/sabreId/lat/lng/city/url/desc/
  amenities, plus `outriggerBookingUrl()` (dated deep link), `outriggerBounds()`
  (antimeridian-safe), `outriggerDistinctive()` (amenity diff).
- **Antimeridian gotcha:** estate spans Mauritius 57°E → Hawai'i −159°. Raw longitudes span
  337° so `fitBounds` draws the long way round the globe. Normalise negatives by +360 → 147°.

### Existing map prototype — `INHQInc/outrigger-prototypes` branch `prototype/josh-s-cool-protype`
Substantial and reusable: hand-built Outrigger-branded Mapbox style, **lazy Mapbox load on
scroll-into-view** (cost already handled), SVG fallback basemap if Mapbox is blocked,
clustering, label declutter, reduced-motion, injection-timing contract for OPMC + Optimizely.
Mapbox token is a `pk.` public token (safe client-side).
**Changes needed:** `discoverProperties()` scrapes DOM cards → use the lookup;
**card CTA is "Visit property" → a page** (line ~418) → change to dated SynXis link.

---

## 4 · Verndale's material

### Content audit — strategic themes (Checkpoint 1)
1. Better communicate what makes Outrigger different
2. Help travellers choose with confidence
3. Build a stronger brand narrative across the site
4. Elevate authentic experiences as a competitive advantage
5. Reinforce the value of booking direct throughout the journey

### Homepage summary (Checkpoint 2)
> "The homepage should move from being a collection of promotions, destinations, stories and
> selling points to **becoming a guided journey from inspiration to action.**"

Must serve four intents: **book a stay · compare destinations/resorts · find inspiration &
experiences · decide if Outrigger is right for them.**

**Business goals:** increase direct bookings · build brand awareness and differentiation ·
move visitors from consideration to the next stage.

> "The recommendation is **not** to add more content. It is to give every part of the homepage
> a defined role within the customer journey and **remove or deprioritize** content that does
> not support that journey."

*(This matches our scroll finding exactly — two independent methods, same answer.)*

### Homepage 2.0 — proposed structure
1. **The Outrigger Promise** — brand awareness + direct booking
2. **Choose Your Journey** — funnel progression; orientation to book / explore / discover
3. **Why Outrigger** — brand awareness + consideration
4. **Find the Place That Fits** — consideration + resort discovery, organised by traveller interest
5. **Experience the Destination** — brand preference + consideration
6. **Make the Trip Possible** — conversion; offers, packages, planning
7. **Book Outrigger with Confidence** — direct booking; addresses hesitation
8. **Continue the Journey** — engagement + future conversion

**Operating model:** "A fixed narrative with a flexible editorial layer."
Fixed = Promise, Intent, Brand, Destinations, Experience, Planning, Action.
Flexible = featured destinations, seasonal stories, offers, campaigns, experiences, cultural content.
> "New content should refresh an existing role in the story rather than create another
> competing section."

### Page annotations (numbered on the marked-up home page)
- **2 — Value prop / five brand pillars:** renowned beach locations · the must-see beach bar ·
  authentic live music · signature experiences · commitment to conservation
- **3 — Destination selector:** "Would love ability to view all your locations for a
  birds-eye-view of where your properties [are] (I also missed the drop down at first)."
  Headline options: Explore Our Destinations / Choose Your Destination / Pick Your Paradise
- **4 — Property tile CTAs:** "Book Now may feel too aggressive on the home page." Consider
  softer variants (Explore Dates, View Options, Plan Your Stay); progressive CTAs; personalisation
  (returning → Book Now, new → Check Availability); microcopy ("No payment required",
  "Free cancellation"). Also: "Explore Property" / "View Property" instead of "Learn more".
- **5 — Top Offers:** add a book-direct value headline for people who validate here then book on
  OTAs. Reference: Marriott Bonvoy "The Best Rates Are Always Here" + 4 benefit icons.
- **6 — Cirque block:** add "Signature Experiences Start Here" section; showcase more than Cirque
  since 'Auana is Waikīkī-only.
- **7 — Discover paradise:** rename (Travel Inspiration / Vacation Ideas). And: let people search
  by **vacation type** — adventure · wellness & spa · romantic · family. Reference: Marriott
  "Your Next Somewhere".
- **8 — Gift cards:** benefit-led headline; answer does it expire / does it work at any hotel.
- **8 — Email signup:** benefit-driven headline with scannable bullets.

---

## 5 · Priority ranking

Ranked by evidence strength × effect potential ÷ build cost.

| # | Proposal | Source | Evidence | Effect | Build | Verdict |
|---|---|---|---|---|---|---|
| **P1** | Carry dates into the booking engine | **New (ours)** | Strong | High | Low | Do first |
| **P2** | Birds-eye view of all locations → the explorer | Verndale 3 | Strong | High | Med | Ship |
| **P3** | Softer CTA than "Book Now" | Verndale 4 | Strong | Med-Hi | Low | Yes + delete one CTA |
| **P4** | Search by vacation type | Verndale 7 | Indirect | High | High | Fold into explorer |
| **P5** | Book-direct value block | Verndale 5 | Mixed | Med | Med | Microcopy first |
| **P6** | "Signature Experiences" section | Verndale 6 | **Against** | Med | Med | Right idea, wrong vehicle |
| **P7** | Rename "Discover paradise" | Verndale 7 | Low ceiling | Low | Low | Repurpose the slot |
| **P8** | Value prop / brand pillars | Verndale 2 | None yet | Med | Med | Risky — sits on proven ground |
| **P9** | Gift cards & email copy | Verndale 8 | Tiny | Low | Low | Content fix, not a test |

### P1 — Carry dates into the booking engine · **NEW, not in the audit**
**Evidence:** Book Now 294→295 (+1 in 18 days). Offer CTA 198→199. Both already reach the
engine; both land on an empty form. Engine honours `arrive`/`depart` — verified. Every property
has a `PropertySabreID` on the page.
**Build:** capture island + rough month once; append dates to existing links. No new component,
no rate feed, no CMS change.

### P2 — The explorer (Verndale's birds-eye view)
**Evidence:** tabs +8.3%, dropdown +12.7% (biggest gains on the page); Destination Highlights
exit −7.0%. Guests open it and refuse what it offers.
**Modified:** two views — **Grid** (inspiration) and **Map** (decision; the list is the map's
left pane, sharing one zoom so it's always "what's in view"). Replaces the existing selector —
hide the old component in the variation, inject the new one. Map opens at **world scale**
(the four Waikīkī properties land on the same pixel at estate scale; the real question is
Hawai'i vs Thailand vs Fiji). Absorb the dropdown as a "jump", don't replace it. Mapbox behind
a `[Map View]` toggle / lazy load for cost.
**Navigation rule for the irregular hierarchy:** *the row always shows the children of wherever
you are.* Regions if it has them, nothing more if it has properties. Counts on chips
("Mauritius 1", "Hawai'i 8") turn the asymmetry into information.

### P3 — One CTA per card, "Explore Dates"
**Evidence:** Book Now +1 click; Learn More −5.9%; Property Title +11.3% — they want the place,
not the brochure, not the commitment.
**Modified:** delete a CTA rather than rename both. Softening the verb alone won't work —
the destination is still a blank form, so pair with P1. Their microcopy idea
("No payment required") is the cheap version of P5.

### P4 — Vacation type as the explorer's second axis
**Evidence:** indirect. Aligns with audit theme 2 and with the +11.3% compare behaviour.
**Modified:** a filter on one result set, not a new section (scroll rules that out). Put it in
the "Discover paradise" slot. Tagging cost is real — amenities exist on property pages, need
harvesting plus ~20 synonym groups ("Swimming pool" vs "Outdoor pool & hot tub").

### P5 — Book-direct
**Evidence, mixed:** offer engagement was FLAT (+2.2%, p=0.86) when the offer left the hero →
rate messaging is inelastic here. BUT their hypothesis is OTA leakage, which is untested and is
audit theme 5.
**Modified:** test microcopy under the CTA first — no scroll cost, isolates the reassurance
effect. Fund the block only if it moves. Measure on **BE arrivals**, never on offer clicks.

### P6 — Signature experiences
**Evidence against the vehicle:** contradicts Verndale's own "don't add content" principle and
the flat scroll data. Cirque block already earns little; stories 0.46%.
**Modified:** put the signature experience **on the property card**, not in a section. The
differentiators are already in the amenity data — Monkeypod Kitchen (Reef), Duke's + Blue Note
(Waikiki Beach), 'Auana (Beachcomber), Appetito (Paradise), Holokai Catamaran. Computed as the
card's second line via the amenity diff. Answers their own "showcase more than Cirque" point at
zero page length.

### P7 — Discover paradise
**Evidence:** critique is fair but the block earns 0.46% and is falling −8.8%.
**Modified:** don't rename — **repurpose the slot for P4**. Verndale's two halves of annotation
7 solve each other: weakest real estate becomes home to their strongest idea.

### P8 — Brand pillars
**Evidence:** none yet. Sits adjacent to the one settled result (hero −58.1%, p<0.0001).
**Modified:** run after P1–P3; pre-register **Hero CTA Click must stay down** as a hard guardrail.

### P9 — Gift cards / email
**Evidence:** Gift Card 0.21%, −1.1%. Fix them because they're right; don't spend test capacity.

---

## 6 · Standing measurement frame for every test above

- **Primary:** `Visit Page: Booking Engine: Rooms & Rates` (baseline 4.27%), expected INCREASE.
  ~14 days for a 20% relative move.
- **Guardrails:** Hero CTA Click (must stay down) · Destination explorer engagement ·
  Property tile engagement · Offer engagement · Scroll depth engagement ·
  Bookings per BE arrival (34.4% — volume must not cost quality).
- **Anti-goal / stop condition:** *explorer engagements per Rooms & Rates arrival must NOT
  increase.* If it rises we built a better toy. This is the metric v1 lacked.
- **Watched, not decisive:** Booking Complete.

**New instrumentation required before the explorer can be adjudicated:** view switch
(grid/map), filter+sort applied, explorer→rates exit tagged with originating view, shortlist add.
Without the first and third, the anti-goal ratio cannot be computed.

---

## 7 · Open questions

1. **Do condos belong in the explorer?** 16 (JSON) vs 26 (map prototype). Decides whether
   navigation is flat-and-filtered or drill/search.
2. **What does `shs-widgets-best-price` render?** Loaded, never instantiated. If it gives a
   from-rate, cards get rates for free.
3. **How do we scope the engine to one island?** `dest=ORH` doesn't filter.
4. **Do all bookings pass through `Visit Page: Booking Engine: Rooms & Rates`?** Decides whether
   the primary metric measures the whole funnel and whether 34.4% is a real comparison.
5. **Mobile share of home page traffic** — decides how much the split-pane/hover problem matters.
6. **Capture bar: hero or above the explorer?** Hero catches everyone; explorer catches the engaged.

---

## 8 · What I would say to Verndale

The audit is strong on **clarity** — what each block says, whether it sets expectations. Nearly
every annotation is right on its own terms, and two are strongly confirmed by the data
("Book Now may feel too aggressive"; "birds-eye view of your locations").

Where it doesn't reach is **mechanism**: what happens when a guest presses the thing. The largest
finding on this page is that four separate routes into the booking engine all arrive without
dates. No amount of better copy on those buttons fixes it, and no content audit would find it.

Their Homepage 2.0 structure is a **destination, not a test** — you can't A/B a rebuild. Use it
as the scoring rubric: P2+P4 *are* "Find the Place That Fits"; P1+P3 *are* "Make the Trip
Possible"; P5 *is* "Book with Confidence".

---

## 9 · Artifacts produced this session

| Doc | URL |
|---|---|
| Verndale, prioritised | https://claude.ai/code/artifact/24f55bee-259c-4b93-a6b9-40849d9046d8 |
| Grid and Map (explorer mockups) | https://claude.ai/code/artifact/3e5a9460-9b11-4ee5-97ad-9ab01edb09f2 |
| Five Doors (5 big ideas) | https://claude.ai/code/artifact/5daefdb3-4aa2-4c1c-aea4-8f56df9a6382 |
| The Missing Door (v2 evaluation) | https://claude.ai/code/artifact/337bfc44-54f1-4a7f-9d14-b325d57aba09 |
| After the Hero Test (post-experiment brief) | https://claude.ai/code/artifact/1bef58e8-a1fa-4db4-a97d-de05739085de |
| The Dated Explorer (pre-registration) | https://claude.ai/code/artifact/5ccb2262-dc58-4711-a2ad-5e7123871618 |
| Three Views One Exit (explorer spec) | https://claude.ai/code/artifact/a7eec46d-f76b-4d10-93e6-1ed092411ba6 |

Local files: `docs/outrigger-properties.js` · `docs/verndale-priorities.html` ·
`docs/explorer-v2.html` · `docs/five-doors.html` · `docs/hero-v2.html` ·
`docs/after-the-hero-test.html` · `docs/explorer-brief.html` · `docs/explorer-spec.html` ·
`docs/prototype-flow.html` · `docs/pm-card-directions.html`

**Next step when resuming:** ideate remaining hybrid ideas, then generate the PPTX of
recommended next tests from section 5.

---

# 10 · DECISIONS — 2026-08-19

| Was | Decision |
|---|---|
| **P1** Carry dates into the booking engine | **NOT HAPPENING.** Removed from the programme. |
| **P2** Birds-eye view / the explorer | **DEFERRED** — too complicated for now. Later test. |
| **P4** Search by vacation type | **Reshaped** → a wide home page banner using the existing **Trip Planner** feature. |

### What killing P1 costs — state it plainly
P1 was P3's partner. The original argument was: *softening the CTA verb alone won't fix it,
because the destination is still an empty search form.* Without P1, **P3 becomes a
lower-confidence test** — we're changing the label on a door but not what's behind it.

It also removes the cheapest bridge between the two economies. The remaining bridges are the
explorer (deferred) and the trip planner banner (new). **Nothing currently in the near-term
programme carries a guest's dates.** Worth revisiting P1 if the reason it's blocked is
effort rather than policy — it was the highest evidence-to-cost item on the list.

### Trip Planner — what it actually is
Home page markup: `"favorites": { "label": "Trip Planner", "showFavourites": "true", … }`.
It is a **favourites / save-for-later** feature, not a vacation-type chooser. Repos also carry
`prototype/favorites` and `prototype/trip-planner` branches (the latter is a site snapshot).

**Measurement consequence — important.** Saving is not booking. A banner that successfully
drives Trip Planner starts could *depress* Rooms & Rates arrivals while being good for
long-term conversion. If we test it against the standing primary metric it may look like a
loss when it isn't — or worse, look like a win on engagement while costing bookings.

**Three ways to handle it, in order of preference:**
1. **Vacation type routes to properties, saving is secondary.** Pick "romantic" → matching
   properties → See rates. The Trip Planner is the optional save, not the destination. Keeps
   the standing primary metric honest.
2. **Test it on its own metric** (Trip Planner starts / saves per visitor) as an engagement
   test, with Rooms & Rates arrivals as a **guardrail that must not fall**.
3. Run it as a pure awareness play and accept it isn't a booking test. Least useful.

**Open question:** is the intent (a) promote the existing favourites feature, or (b) build a
vacation-type chooser that happens to live near it? These are different tests with different
metrics. → **needs answering before the brief.**

---

## 11 · Revised near-term ranking

| # | Test | Evidence | Build | Note |
|---|---|---|---|---|
| **N1** | **Rebuild the property tile** | **Strong ×3** | Low | New lead — see below |
| **N2** | Trip Planner / vacation-type banner | Indirect | Med | Metric question above must be settled first |
| **N3** | Book-direct microcopy under the CTA | Mixed | Low | Unaffected by P1's removal |
| **N4** | Brand pillars / value prop | None yet | Med | Guardrail: Hero CTA must stay down |
| later | The explorer (old P2) | Strong | Med-Hi | Deferred by decision, not by evidence |
| later | Carry dates (old P1) | Strong | Low | Removed by decision, not by evidence |

### N1 — Rebuild the property tile · **the new lead test**
With the explorer deferred, the signature-experiences idea (old P6) has no vehicle — so give
it the same one as the CTA change. **One component, one test, three independent data points
all pointing at it:**

| Signal | Reading |
|---|---|
| Property Title **+11.3%** | They want the place |
| Property "Learn More" **−5.9%** | They don't want the brochure |
| Property "Book Now" **+1 click / 18 days** | They won't commit from here |

**The change:** one action per tile instead of two competing ones — *"Explore Dates"* per
Verndale's annotation 4 — and replace the marketing sentence with the **distinctive detail**
computed from the amenity diff: Monkeypod Kitchen (Reef) · Duke's + Blue Note (Waikiki Beach)
· 'Auana by Cirque du Soleil (Beachcomber) · Appetito (Paradise) · Holokai Catamaran.

That delivers Verndale's annotation 6 ("showcase other examples since 'Auana is only at
Waikiki") at **zero page length** — which respects their own "do not add content" principle
and our flat scroll finding.

**Why this is now the strongest near-term test:** cheapest build, three converging signals,
fully powered by data already in `docs/outrigger-properties.js`, needs no booking-engine
change, and survives P1 being off the table.

**Caveat to state in the brief:** without dates, "Explore Dates" still lands on a search form.
Expect a smaller effect than the same change would produce with P1. Pre-register that.

---

# 12 · CORRECTION — "Book Now" is not a link

**Earlier claim (WRONG):** every route into the booking engine arrives without dates and lands
the guest on an empty search form.

**What it actually is.** The property tile's Book Now is not a link to SynXis. It is:

```html
<button data-bs-toggle="offcanvas" data-bs-target="#bookingWidget"
        class="button bw-magic-link"
        data-bw-chain="18497" data-bw-hotel="66403"
        data-bw-label="OUTRIGGER Reef Waikiki Beach Resort"
        data-bw-currency="USD" data-average-nightly-rate="0"
        data-average-nightly-rate-fallback="true">Book Now</button>
```

It opens the **on-site booking widget drawer**, pre-loaded with the property, collects dates,
and hands off via the magic link. **The date capture already exists.** P1 as originally framed
was solving a problem that isn't there.

### The finding survives — the mechanism changes, and improves
Not an empty form at the *destination*. A **date demand at the *start***. A guest comparing four
Waikīkī properties presses Book Now and is asked to commit to dates before deciding *where*.
That is a wall at the beginning of the journey, and it is exactly what Verndale meant by
*"Book Now may feel too aggressive on the home page"* — their instinct was right and the cause
was mis-attributed.

### The cleanest evidence on the page, now readable
Same card, same guests, two paths:

| Path | Gate? | Result |
|---|---|---|
| Property **Title** | none — plain link | **+11.3%** |
| Property **Book Now** | opens a date drawer | **+1 click / 18 days** |

They take the ungated path and refuse the gated one. This is the strongest single piece of
evidence in the experiment and it was only half-read until now.

### Consequences for N1 (rebuild the property tile)
- **"Explore Dates" is the wrong verb** — it promises the very thing causing the friction.
  Prefer Verndale's other suggestion: **"View Property"** / "See this resort" — ungated,
  matching the behaviour that is already winning.
- **Strong variant worth testing: a soft-date drawer.** Same widget, month-level or "flexible"
  default instead of an exact-date grid. Keeps the capture, removes the commitment. The SynXis
  calendar widget is already instantiated on the page.
- **`data-average-nightly-rate="0"` with `fallback="true"`** appears on the button itself —
  further confirmation the price pipeline is wired and switched off. If it were on, the tile
  could show a rate with no new integration.

### Revised N1 hypothesis
Replacing the tile's two competing CTAs with **one ungated action** — and the marketing sentence
with the distinctive detail — will increase progression from the tile, because the data shows
guests already prefer the ungated path by an order of magnitude.

### 12b · Correction to the correction — the routes split two ways

Confirmed by Bryan. **Three of four routes gate on dates; one doesn't and has none.**

| Route | Mechanism | Date behaviour | Measured |
|---|---|---|---|
| Property tiles | opens the on-site widget (`#bookingWidget`) | **forces date selection** | +1 click / 18 days |
| Header BOOK NOW | opens the widget | **forces date selection** | not separately measured |
| Sticky bar BOOK NOW | opens the widget | **forces date selection** | not separately measured |
| **Offer tiles** ×5 | **direct link to SynXis** | **no dates** — `promo` + `nights` only | +1 click / 18 days |

Verified offer links carry `chain · dest · nights · promo · filter · adult · level` and **never
`arrive`/`depart`**, e.g. `?level=hotel&chain=18497&promo=OCEANVIEW&nights=5&dest=ORH`.
Note `dest=ORH` does not filter — SynXis normalises to `level=chain` and returns worldwide.

### The synthesis — both failure modes, same outcome
- **Gated routes** demand a commitment (exact dates) *before* the guest has chosen a property.
- **The ungated route** ships them to a rates engine with **no dates and no property**, i.e. a
  worldwide list with a nights count.

Both are flat. **Neither serves a guest who is still choosing.** That is the finding, and it no
longer depends on which mechanism you look at.

### What this does to P1
P1 only ever applied to **the offer tiles** — the one route where appending `arrive`/`depart`
is both possible and meaningful. It is also the lowest-volume route (198 clicks). So P1 was
always smaller than I framed it, and removing it costs less than section 10 claims.

**The bigger opportunity is the other three routes**, and it is not "carry dates" — it is
**relax the date gate**: month-level or flexible default in the widget instead of an exact-date
grid. Same capture, less commitment.

### Standing evidence for the tile test (unchanged and strengthened)
Same card, same guests: ungated **Property Title +11.3%**, gated **Book Now +1 click**. They
take the ungated path by an order of magnitude. An ungated primary action on the tile
("View Property") is the cheapest way to act on that.

### 12c · Proposal (Bryan): make the offer button open the widget too

**Position: agreed**, and the reason is stronger than consistency.

The offer route's current destination is the worst on the page — `promo` + `nights` + a `dest`
that SynXis discards (`level=chain`), producing a **worldwide list with no dates and no
property**. Routing it through the widget keeps the guest on-site with context intact.

**Risk to name in the brief:** this adds a date gate to the only ungated route, and the
strongest signal in the experiment is that gates lose (ungated Title +11.3% vs gated Book Now
+1 click). **Counter, and it holds:** "Check availability" *promises* dates — a guest pressing
it has already accepted they will supply them. That is different intent from a browser on a
property tile, which is why this change is defensible while the equivalent on the tile is not.

**Two conditions before it ships:**
1. **Verify the widget can carry the promo code.** Offer links carry `promo` and `nights`; the
   widget exposes `data-bw-chain` / `data-bw-hotel` and no promo attribute has been observed.
   If promo cannot pass through, this silently breaks offer attribution and rate accuracy — a
   regression hidden inside a tidy-up. **BLOCKING.**
2. **Do not run it standalone.** Offer CTA baseline 1.55% (198 clicks). A 20% move needs
   ~27,000/arm ≈ **38 days**. Bundle with the tile work and measure both on Rooms & Rates
   arrivals.

**Net effect on the programme:** this replaces P1 entirely. P1 was "give the offer route dates";
this is "give the offer route the same handler as everything else", which is simpler, keeps the
guest on-site, and needs no new capture UI.

### 12d · STANDING PRINCIPLE — every home page CTA uses the widget

Decision (Bryan): **all CTAs on the home page leverage the on-site booking widget.** One
handler, one behaviour, one thing to instrument. Supersedes P1 completely.

**Three consequences.**

**1 · The date gate becomes the single biggest lever on the page.** If every route is gated,
then softening the gate affects **100% of booking intent**, not the 75% it would have before.
Relaxing the widget's default from an exact-date grid to **month-level / flexible** is now
worth more than any individual CTA wording change on the list. It is one change to one
component, and it sits in front of everything.

**2 · The page still needs one ungated path, and it already has the winner.** Property
**Title +11.3%** is a plain link with no gate; Book Now is gated and flat. Do **not** route the
title through the widget. The tile wants **one ungated look action (the name) and one gated
commit action** — which is exactly N1. Gating everything, including the title, would remove
the only path guests are actually taking.

**3 · Instrumentation gets easier and better.** One handler means one event with a `source`
attribute (tile / header / sticky / offer / banner). That gives per-surface attribution the
current setup cannot produce, and it is what makes any of these tests separable afterwards.

**Revised biggest-opportunity list, post-decision:**
| Rank | Change | Why |
|---|---|---|
| 1 | **Soften the widget's date default** (flexible / month) | Sits in front of 100% of booking intent |
| 2 | **N1 — rebuild the property tile** | 3 converging signals; keep the title ungated |
| 3 | Route offers through the widget | Fixes the worst destination on the page (see 12c) |
| 4 | Trip Planner / vacation-type banner | Metric question in §10 still unanswered |

### 12e · The widget cannot carry a promo code — but it is meant to

Confirmed (Bryan): the booking widget **does not currently pass a promo code**, and **it is
intended to**. A defect, not a design limit.

**Consequence: 12c is blocked, not cancelled.** Routing the offer buttons through the widget
today would drop `promo`, breaking offer attribution and showing rack rates against
offer-branded cards. That is a worse regression than the problem it fixes.

**Dependency to raise:** widget owner adds promo pass-through (`data-bw-promo` → magic link).
Until then the offer tiles keep their direct SynXis links.

**Interim win available with no widget dependency.** The offer links are broken independently
of all this: they carry `dest=ORH`, which SynXis discards — normalising to `level=chain` and
returning a **worldwide** list. Fixing the destination is a pure URL change:

```
now   ?level=hotel&chain=18497&promo=OCEANVIEW&nights=5&dest=ORH   → worldwide list
fix   ?level=hotel&chain=18497&promo=OCEANVIEW&nights=5&hotel=<PropertySabreID>
```

Every property already carries `PropertySabreID` on the page. This lands an offer click on a
relevant property instead of the global inventory, needs no widget work, and is independent of
whether 12c ever ships.

**Revised order for the offer route:**
1. Fix the destination params now (URL only, no dependency)
2. Widget gains promo support (external dependency, raise it)
3. Then route offers through the widget per 12c

### 12f · Offer click → pick a property first (Bryan)

**Supersedes the `hotel=<SabreID>` fix in 12e**, which was wrong: offers are portfolio-wide
("Ocean views on sale" applies across many properties), so no single property ID can be baked
into the link.

**The flow:** offer click → *which property?* → then the widget (or engine) with property +
promo attached.

**Why this is the right shape — it matches revealed behaviour.**
Guests pick properties readily (**Property Title +11.3%**) and refuse date commitment
(**Book Now +1 click / 18 days**). Asking for the *property* first and *dates* second orders
the two commitments in the sequence guests already demonstrate they prefer. The current offer
route asks for neither and delivers a worldwide list; the widget-only route asks for dates
first, which is the harder of the two.

**Four things it fixes at once:**
1. Kills the worldwide-list destination — the guest arrives somewhere relevant
2. Asks the *cheap* commitment first, deferring the expensive one
3. Preserves promo attribution without needing widget promo support (**unblocks 12c's
   dependency** — the promo can ride the property choice into the existing direct link)
4. Reuses property data already on the page (`PropertySabreID`, name, image, description)

**And it is a cheap pilot of the deferred explorer.** A property picker scoped to one offer is
the explorer hypothesis in miniature: *does giving guests a property choice before a date demand
increase progression?* If it moves, the full explorer (old P2) is funded by evidence. If it
doesn't, that is a strong signal before anyone builds the big version.

**Design notes**
- Show which properties the offer is actually valid at — not all 16
- Reuse the tile pattern from N1: image, name, one distinctive detail, one action
- Ungated: picking a property must not itself demand dates
- Instrument `offer → property picked → widget opened → engine` as separate steps; this is the
  first place on the page where we can see a funnel rather than a single click

**Status:** strongest near-term candidate alongside N1. No external dependency.

---
---

# ★ CURRENT STATE — START HERE (2026-08-19)

Sections 1–9 are reference. Sections 10–12f are a running log **containing two corrections I
made to my own reasoning** — read this section instead; it supersedes them.

## The experiment (unchanged, authoritative)
Home Page Hero No Offer · 12,804/arm · 18 days · ±18.2% detectable · **still LIVE**.
- **Settled:** Hero CTA Click **−58.1%**, p<0.0001
- **Redistribution:** 286 clicks left the hero; ~260 reappeared in browse actions
  (dest tab +82, nav +80, property title +62, dropdown +52)
- **Every commerce action flat:** Book Now **+1 click**, Offer CTA **+1**, Rooms & Rates **−21**
- **Ruled out:** scroll flat/negative at all four depths → **do not add content below the fold**
- **Quality signal:** bookings per BE arrival 28.9% → 34.4% (unconfirmed)
- **Power:** 711/arm/day. BE Rooms & Rates (4.27%) → ~14 days for a 20% move.
  Booking Complete (1.23%) → ~8 weeks, **can never be the decision metric**

## The one reading everything now rests on
Same card, same guests, two paths:
**Property Title (ungated link) +11.3%** vs **Book Now (opens date-gated widget) +1 click.**
Guests take the ungated path by an order of magnitude. **Cheap commitments first, expensive
ones later.**

## How the page actually works (corrected — I had this wrong twice)
- **Property tiles, header, sticky bar** → open the on-site widget → **force date selection**
- **Offer tiles** → direct SynXis link, **no dates**, and `dest=ORH` is discarded
  (`level=chain`) → **worldwide list**
- Both mechanisms are flat. Opposite causes, same outcome: **neither serves a guest still
  choosing.**
- **Standing principle (decided):** every home page CTA routes through the widget.
  **Exception: the property title stays an ungated link** — it is the only path that works.
- **Widget cannot pass a promo code today, and is meant to.** Defect. Blocks any offer reroute
  that depends on it.

## Decisions taken
| Item | Status |
|---|---|
| Carry dates into the engine (old P1) | **Dropped** — capture already exists in the widget |
| Explorer / birds-eye map (old P2) | **Deferred** — too complicated for now |
| Vacation type (old P4) | **Reshaped** → Trip Planner banner, metric question unresolved |
| All CTAs use the widget | **Adopted** |
| Offer → pick a property first | **Adopted** — strongest near-term candidate |

## The live shortlist
1. **Offer click → pick a property → then dates.** Orders commitments the way guests prefer.
   Fixes the worldwide-list destination, preserves promo without waiting on the widget fix, and
   is a **cheap pilot of the deferred explorer**. No external dependency.
2. **Soften the widget's date default** (month / flexible instead of exact-date grid). With every
   CTA routed through the widget this sits in front of **100% of booking intent** — the largest
   single lever available.
3. **N1 · Rebuild the property tile.** One ungated action ("View Property" — *not* "Explore
   Dates", which promises the friction), marketing sentence replaced by the distinctive detail
   from the amenity diff (Monkeypod / Duke's + Blue Note / 'Auana / Appetito / Holokai).
   Delivers Verndale's annotation 6 at zero page length. Three converging signals.
4. **Trip Planner banner** — blocked on: *promote the favourites feature, or build a
   vacation-type chooser?* Different tests, different primary metrics. Saving ≠ booking.

## Standing measurement frame
- **Primary:** `Visit Page: Booking Engine: Rooms & Rates` (4.27%), INCREASE, ~14 days for 20%
- **Guardrails:** Hero CTA must stay down · destination explorer engagement · property tile
  engagement · offer engagement · scroll depth · bookings per BE arrival (34.4%)
- **Anti-goal:** engagements per BE arrival must **not** increase (catches "better toy")
- **Watched only:** Booking Complete

## Open questions
1. Trip Planner banner — promote favourites, or build a vacation-type chooser?
2. Do condos belong in the explorer? 16 (page JSON) vs 26 (map prototype)
3. Does `shs-widgets-best-price` render a rate? Loaded on the page, never instantiated;
   `data-average-nightly-rate="0"` with `fallback="true"` says the pipeline is wired and off
4. Do all bookings pass through `Visit Page: BE: Rooms & Rates`? Decides whether the primary
   metric sees the whole funnel
5. Mobile share of home page traffic
6. Widget promo pass-through — when?

## Assets
- `docs/outrigger-properties.js` — 16 properties: SabreID, lat/lng, amenities, deep-link
  builder, antimeridian-safe bounds, amenity diff. **Surin longitude corrected** (source data
  is ~120 km wrong; also fixed in the map prototype)
- Map prototype: `INHQInc/outrigger-prototypes` → `prototype/josh-s-cool-protype`. Branded
  Mapbox style, lazy load, SVG fallback, clustering. Change needed: card CTA "Visit property"
  → a real destination
- Artifacts: see §9

**Next action:** finish ideating, then generate the PPTX of recommended tests from the live
shortlist above. Every item must cite its experiment evidence or be marked unevidenced.

---

### ★ addendum · Trip Planner banner placed directly under the destination explorer

**Decision (Bryan):** the Trip Planner banner sits **immediately below the destination explorer**.

**In favour.** It is high on the page, so scroll depth (flat/negative at every level) does not
bury it — a real advantage over any lower placement. And it is adjacent to the moment the
"which trip is this?" question is live, which is when a save is most meaningful.

**The risk, and it comes straight from the data.** The single clearest reading in the
experiment is that **guests take the cheapest available commitment** — ungated Property Title
**+11.3%** against gated Book Now **+1 click**. A *save* is cheaper than a *rates click*. Placed
directly after the explorer, the banner offers an easier alternative at exactly the moment we
want progression.

**So the question is empirical and sharp: does it capture leavers, or divert progressors?**
- Capturing someone who was going to leave anyway = pure gain
- Diverting someone who would have reached rates = a loss disguised as engagement

**How to tell them apart — required for this test:**
| Measure | Direction |
|---|---|
| `Visit Page: BE: Rooms & Rates` | **Primary. Must not fall.** This is the whole question. |
| Trip Planner starts / saves per visitor | Secondary — the thing the banner is for |
| Explorer engagements per BE arrival | **Anti-goal — must not increase** |
| Bookings per BE arrival (34.4%) | Guardrail |

If saves rise **and** BE arrivals hold, it captured leavers — ship it. If saves rise **and** BE
arrivals fall, it diverted progressors — move it below the offers, or make it conditional.

**Cheaper variant worth considering:** show it **conditionally** — after two or more exploration
actions with no rates click. That targets the leaver population directly rather than offering
everyone an easier exit, and it removes the cannibalisation risk instead of measuring it.

**Still unresolved (blocking the brief):** is this promoting the existing **favourites** feature,
or building a **vacation-type chooser**? Different builds, different primary metrics.

---

### ★ addendum · Bundling and attribution

**Question (Bryan):** can we run all of these as one test, or does the outcome stop tying back
to the change?

**Correct instinct — but "one change per test" is the wrong correction.** At 711/arm/day each
test needs ~14 days for a 20% move. Seven sequential tests ≈ five months, over which the page,
the season and the traffic mix all drift. Serialising everything is not rigour, it is slowness
with its own error term.

**The rule is one HYPOTHESIS per test, not one change.**
Bundle when every change serves the same mechanism *and* you would take the same action on the
result. Never bundle changes that test different mechanisms — a win in one masks a loss in the
other.

**Applied to the live shortlist:**

| Test | Contents | Why grouped |
|---|---|---|
| **A** | Rebuild the property tile **+** offer click → pick a property | Same hypothesis: *let guests choose a place before demanding a date.* Same predicted direction, same action either way. Roughly halves the calendar. |
| **B** | Soften the widget's date default | Different lever — reduces the cost of the expensive commitment rather than reordering the two. Also **global**, so it contaminates anything bundled with it. |
| **C** | Trip Planner banner | Different mechanism, and it carries genuine risk of moving the primary **down**. Bundled with A, a win in A would mask exactly the cannibalisation we are worried about. |

**Attribution inside a bundle is recoverable — with instrumentation.**
Events at `offer → property picked → widget opened → engine reached` turn a bundle into a
**funnel rather than a single number**, so you can see which stage moved. This is already listed
as required instrumentation (§6); it is what makes bundling safe rather than sloppy.

**And guardrails catch what attribution misses.** If a bundle moves the primary but breaks a
guardrail, you know something inside it did harm even before you know which part.

**Order:** A first (no dependencies, biggest combined evidence), then B, then C.

---

## 13. Live mock-up on prep.outrigger.com — confirmed facts (2026-08-19)

Built as browser-injected variation JS: [`prototypes/home-page-v2/variation.js`](../prototypes/home-page-v2/variation.js).
All three changes applied and verified against the real DOM.

### 13a. RESOLVED: the widget *does* take the promo code

This closes the open question from §7. The attribute contract, lifted from the
`/offers/campaign/2026/bc/ohr` header CTA:

```html
<button type="button" data-bs-toggle="offcanvas" data-bs-target="#bookingWidget"
        class="button bw-magic-link"
        data-bw-chain="18497"
        data-bw-offer-code="OCEANVIEW"
        data-bw-offer-code-type="Promotion"
        data-bw-length-of-stay="5">Search availability</button>
```

Verified live: clicking it opens the widget with **Apply Special Rate → "Promo Code"**,
the code field populated `OCEANVIEW`, and the widget's own confirmation
**"Success! Your rate has been applied."** Hidden field `promo=OCEANVIEW`.

The promo codes did not need to be authored — they were already sitting in the offer
tiles' outbound hrefs (`?promo=OCEANVIEW&nights=5`), so the variation parses them out
of the existing link and re-emits them as widget attributes. Nothing to maintain.

### 13b. NEW, and it matters for Test B: `data-bw-length-of-stay`

The widget accepts a **stay length** hint. That is a real, existing mechanism for
lowering the date cost — not the flexible/month-view idea, which does not exist in
this widget. Test B's mechanism should be written against this attribute plus a
pre-filled or one-tap arrival, not against a mode the widget does not have.

### 13c. The gate, measured

With the promo applied and the widget open, the hidden fields read
`arrive="Invalid Date"`, `depart="Invalid Date"`. The guest still cannot proceed
without picking both dates from a two-month calendar. The gate in §2 is real and
sits exactly where the diagnosis said it does.

### 13d. What was built

| Change | Result |
|---|---|
| Trip Planner banner under `.destination-selection` | Styled from the site's own `.promotion-banner` (`rgb(0,69,97)`, DuplicateSans 40/52, Montserrat-Light 16/25). Four vacation-type chips + CTA into `#favoritesOffcanvas`. |
| Property tiles | "Book Now" → **View Availability** (widget and every `data-bw-*` preserved); "Learn More" → **View Rooms** → `{property}/rooms-suites`. 8 tiles on Oahu, 6 on Maui. |
| Offer tiles | 9 CTAs switched from `reservation.outrigger.com` links to widget opens carrying the promo. **Zero** direct engine links left on the page. |

All `/rooms-suites` URLs verified 200. The variation re-applies on DOM churn, so
destination tab switches (Oahu → Maui) pick up new tiles with no stale labels or links.

### 13e. One visual note

The banner's dark blue sits **directly above the Top Offers section, which is also
dark navy** — two dark bands with only a faint seam between them. Worth deciding
whether the banner should be lighter, or Top Offers re-grounded, before this is shown
as a finished comp.

---

## 14. Widget ground truth (instrumented, 2026-08-19) — Test B must be rewritten

A dedicated pass read the live widget's DOM and its React props. Findings that
change the test:

**It is ONE combined range calendar, not two date fields.** `react-day-picker`
in range mode inside Sabre's SynXis wrapper: `div.DayPicker.shs-widgets--calendar--component`.
Click 1 sets check-in, click 2 sets check-out — **two interactions**, not four.
Desktop shows two months, mobile one. `fromMonth = today`, so the back arrow is
inert; `pagedNavigation: false`, so forward advances one month per click.

**There is no flexible affordance of any kind.** A sweep of the widget's rendered
text for *flexible / not sure / anytime / undecided / any month / exact dates /
no dates* returned zero hits on both tabs, desktop and mobile. The month-caption
dropdown (Aug 2026 → Jan 2028) is **view navigation only** — selecting Dec 2026
moved the calendar but left Search disabled and the trip summary empty.

**Two gates, and they disagree.** The in-calendar **Search** button is correctly
disabled until both dates are set. The sticky footer **BOOK NOW** is *not gated at
all* — on a clean load it is enabled, and the form's hidden inputs read
`arrive=Invalid Date` / `depart=Invalid Date`. It is a plain native GET submit of
`form#sabreBookingWidgetForm1` (action `reservation.outrigger.com`, `target=_blank`),
so pressing it with no dates would send `arrive=Invalid%20Date&depart=Invalid%20Date`
to the booking engine. **Not clicked** — what the engine does with that is unknown
and worth checking before any date-related test runs.

### What this means for Test B

"One tap instead of four" was wrong on the count — it is two. The lever that
survives is **pre-filling** (arrival, or a full range, that the guest confirms or
changes) rather than reducing taps. `data-bw-length-of-stay` rides on the CTA and
is accepted by the widget, but produces **no visible LOS control** in the calendar,
so it cannot be assumed to do the work on its own — verify what it actually changes
before building on it.
