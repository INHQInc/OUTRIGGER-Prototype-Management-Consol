/**
 * THE PRISM — the product's mark, and its argument in one shape.
 *
 * One undifferentiated beam goes in; three separable rays come out. That is
 * literally what this console does to a release: a change ships as a single
 * undifferentiated "it feels better", and the prism is the apparatus that
 * splits it into bands you can name and measure. The name came first (the
 * subdomain is prism.brandgraphai.com) and the mark had to earn it rather than
 * decorate it.
 *
 * IT IS MONOCHROME ON PURPOSE. A spectrum would be the obvious drawing, and
 * it's exactly the drawing this app can't have: colour here is a status
 * vocabulary with four meanings (principle §1b), and a logo that spends red,
 * amber and green on decoration teaches the reader that colour is decoration.
 * The split is carried by OPACITY instead — same information, no claim on the
 * status palette. `currentColor` throughout, so it inverts with the theme and
 * works on the accent tile, in a header, or knocked out of a dark ground.
 */
export function PrismMark({ className = "", strokeWidth = 1.6 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {/* IN: one beam, nothing distinguishable about it yet. It STOPS SHORT of
          the left face — a beam drawn over the glass reads as a mistake, not as
          light entering it. */}
      <path d="M1.7 12.4h4.5" opacity=".85" />
      {/* The apparatus. Narrow and left of centre, so the fan has somewhere to
          go: the output is the point of the mark, not the triangle. */}
      <path d="M11 5 16.5 18H5.5Z" strokeWidth={strokeWidth + 0.2} />
      {/* OUT: the same light, in bands you can tell apart. All three leave from
          ONE point on the right face and diverge hard. Staggering the exits
          (which is what actually happens in glass) reads as three unrelated
          strokes at 28px; a common origin reads as one thing splitting, which
          is the idea. The fan tilts below the entry line, so it's a deviation
          rather than a starburst. */}
      <path d="M14.4 13 22.3 10.6" />
      <path d="M14.4 13 22.3 14.2" opacity=".75" />
      <path d="M14.4 13 22.3 17.8" opacity=".55" />
    </svg>
  );
}

/** The mark on its accent tile — the lockup used wherever the app names itself. */
export function PrismLogo({ size = "w-7 h-7" }: { size?: string }) {
  return (
    <span className={`${size} rounded-md bg-accent text-accent-fg flex items-center justify-center shrink-0`}>
      <PrismMark className="w-[18px] h-[18px]" />
    </span>
  );
}
