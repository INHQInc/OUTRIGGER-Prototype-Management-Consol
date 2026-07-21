"use client";

import { useState } from "react";
import { AddSiteModal } from "./AddSite";

/** "+ Add website" button + the add-site modal. */
export function AddSiteButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover transition-colors">+ Add website</button>
      <AddSiteModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
