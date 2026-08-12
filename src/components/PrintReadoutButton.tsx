"use client";

/**
 * Save-as-PDF, done by the reader's own browser.
 *
 * That browser is a real renderer with the reader's real fonts, so the PDF it
 * produces is faithful at zero cost to our deployment — no Chromium in the
 * bundle, no /tmp expansion, no cold start. The server-side PDF exists for the
 * SCHEDULED path, where nobody is present to press anything; this covers the
 * case where someone is.
 */
export function PrintReadoutButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden"
      style={{
        background: "#101820", color: "#FFFFFF", border: 0, borderRadius: "6px",
        padding: "9px 14px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      Save as PDF
    </button>
  );
}
