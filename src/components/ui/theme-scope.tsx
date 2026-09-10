"use client";

/**
 * The console's dark palette is SCOPED to an element ([data-console] /
 * [data-backoffice]) while the rest of the app stays light. Anything that
 * portals — a dialog — has to land INSIDE that element or it renders light on
 * dark. The scoped root provides a ref to itself; portals read it when they
 * open (by then it is mounted), so nothing queries the document during render.
 */
import { createContext, useContext, type RefObject } from "react";

export const ThemeScope = createContext<RefObject<HTMLElement | null> | null>(null);

/** The element a portal should mount into, if a scoped theme is in force. */
export function useThemeScope(): HTMLElement | undefined {
  return useContext(ThemeScope)?.current ?? undefined;
}
