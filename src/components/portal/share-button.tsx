"use client";

import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";

/** Compartilhar pelo celular (WhatsApp, Instagram…). Só aparece onde o navegador oferece. */
export function ShareButton({ text, url }: { text: string; url: string }) {
  const [can, setCan] = useState(false);
  useEffect(() => setCan(typeof navigator !== "undefined" && "share" in navigator), []);
  if (!can) return null;
  return (
    <button
      type="button"
      onClick={() => navigator.share({ text, url }).catch(() => {})}
      className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
    >
      <Share2 className="size-3.5" />
      Compartilhar
    </button>
  );
}
