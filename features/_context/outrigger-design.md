# Outrigger Design Context — for prototype authoring

*Extracted from the captured `outrigger` CSS (`snapshots/outrigger/assets/*.css`) on 2026-07-18. This is the brand reference for building on-brand prototypes. When in doubt, **reuse the target page's own classes** — this file is for net-new elements.*

> **Golden rule:** a prototype should look like it was always part of the page. Prefer the page's existing components/classes; only invent markup when nothing fits, and when you do, use these tokens and namespace everything under `.opmc-<key>`.

---

## 1. Color palette (real `--clr-*` values)

**Primary / brand core**
| Token | Hex | Use |
|---|---|---|
| Turquoise (deep navy) | `#0b2f47` | Primary brand color — headings, primary buttons, dark sections. The Outrigger "navy". |
| Deep turquoise | `#004561` | Secondary dark, hovers on navy. |
| Ocean blue | `#10607b` | Mid-tone accents. |
| Aqua | `#3EB1C8` | Bright accent — highlights, icons, active states. |
| Seafoam | `#AFE5E1` | Soft accent — eyebrows, tags, tinted backgrounds. |

**Warm accents**
| Token | Hex | Use |
|---|---|---|
| Coral | `#ee675a` | Warm CTA / emphasis accent. |
| Light coral | `#F59682` | Softer coral. |
| Dawn | `#F7C2A9` | Warm tint / gradient stop. |

**Neutrals**
| Token | Hex | Use |
|---|---|---|
| Black Rock (ink) | `#252525` | Default body text. |
| Sand | `#F1EFED` | Primary light background for sections. |
| White off | `#dfd9d0` | Warm border / divider. |
| White snow | `#f7f7f5` | Near-white background. |
| Gray | `#89827a` | Muted text. |
| Light brown | `#908883` | Muted secondary text/borders. |
| White | `#ffffff` | — |

**Utility (use sparingly — mostly legacy/blog)**
`--clr-blue #0095da` · `--clr-link-blue #00b9ff` · `--clr-green #004444` · `--clr-field-error #eb0000`

**Copy-paste token block** (this is what the `new-feature` scaffold seeds into `overlay.css`):
```css
--oc-turquoise: #0b2f47;
--oc-deep-turquoise: #004561;
--oc-ocean: #10607b;
--oc-aqua: #3EB1C8;
--oc-seafoam: #AFE5E1;
--oc-coral: #ee675a;
--oc-sand: #F1EFED;
--oc-ink: #252525;
--oc-muted: #89827a;
```

---

## 2. Typography

Outrigger uses two proprietary families plus Montserrat as the workhorse fallback:

| Role | Family | Notes |
|---|---|---|
| **Display / headings** | `"Duplicate Ionic"` | Weights in use: Light, Regular, Medium, Bold, Black. Used for H1–H3, hero titles. |
| **Body / UI** | `"Duplicate Sans"` | Weights: Light, Regular, Medium, Bold, Black. Body copy, buttons, labels. |
| **Fallback / legacy** | `"Montserrat"` | Heavily used across the site; safe fallback when the Duplicate faces aren't available. |

**⚠ Font availability:** the Duplicate faces are proprietary and only load from the real site / the captured clone. In the console preview (which serves the clone's assets) they render correctly; in a bare deploy they may not. **Always include the fallback chain** so text never breaks:

```css
/* headings */  font-family: "Duplicate Ionic", "Montserrat", Georgia, serif;
/* body / ui */ font-family: "Duplicate Sans", "Montserrat", system-ui, sans-serif;
```

**Scale (practical defaults for net-new blocks):**
- Hero/section title: `clamp(28px, 4vw, 44px)`, line-height `1.1`, color turquoise.
- Body: `18px`, line-height `1.5`.
- Eyebrow/label: `12px`, `letter-spacing: 0.14em`, `text-transform: uppercase`, color turquoise or aqua.

---

## 3. Buttons / CTAs

The site drives buttons off `--btn-clr` (text) over a brand fill. Two dominant patterns:

- **Primary (dark):** turquoise `#0b2f47` fill, white text, `border-radius: 5px`, hover to a darker navy (`#06202f`).
- **Inverse (on dark):** white/transparent fill, dark text (`--clr-black-rock`).

Net-new CTA baseline:
```css
.opmc-<key>__cta {
  display: inline-block;
  padding: 14px 28px;
  border-radius: 5px;
  background: #0b2f47;
  color: #fff;
  font-family: "Duplicate Sans", "Montserrat", system-ui, sans-serif;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.2s ease;
}
.opmc-<key>__cta:hover { background: #06202f; }
```

---

## 4. Shape & spacing

- **Border radius:** the site mixes `5px` (buttons/cards), `10px` (larger cards), `0.375rem` (~6px, Bootstrap default), and `0` (flush/full-bleed). Default to **`5px`** for buttons and small cards, **`10px`** for large cards. Circles use `50%`.
- **Container:** content maxes around **1200px**, centered, with ~20px horizontal padding on mobile.
- **Section rhythm:** generous vertical padding (~48–80px) for standalone injected sections.
- **Box model:** the site is Bootstrap-based (`--bs-*` vars everywhere). Set `box-sizing: border-box` on your namespaced root to stay consistent.

---

## 5. Authoring conventions (how prototypes are built here)

1. **Namespace everything** under `.opmc-<key>` (the scaffold does this). Never write bare tag selectors or global classes — they leak into the real page.
2. **Reuse the page's components first.** Open the target snapshot HTML (`snapshots/outrigger/pages/<slug>/<version>/index.html`), find the closest existing component (card, button, section), and mirror its classes so the prototype inherits real styles for free. Fall back to these tokens only for genuinely new UI.
3. **Anchor to a stable selector.** The scaffold defaults to `.hero` + `after`. Use the console's click-to-pick element picker (`/features/<key>`) to choose a robust anchor; the selector-robustness lint will flag fragile ones.
4. **Keep JS guarded & idempotent** (the scaffold's IIFE checks `window.__opmc[KEY]`) — overlays can be injected more than once (preview, deploy, Optimizely).
5. **Mobile matters** — Outrigger traffic is heavily mobile. Use fluid type (`clamp`) and test the preview at narrow widths.

---

## 6. Where this maps to the roadmap

This file is the **local, hand-authored version of pillar P1/P2 "design-system awareness"** from `docs/PRODUCT-ROADMAP.md`. Productizing it later = auto-ingesting a customer's tokens/component library instead of maintaining this by hand. For Outrigger today, keep it current: if you spot a token or pattern worth reusing, add it here.
