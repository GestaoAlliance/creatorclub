import type { SVGProps } from "react";

/**
 * Ícones das redes (o lucide não traz marcas): Instagram, TikTok e WhatsApp, em linha fina como os outros ícones.
 * Usados na lista e na ficha da creator (modelo da referência).
 */
type P = SVGProps<SVGSVGElement>;
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function InstagramIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function TikTokIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
      <path d="M14 3c.4 2.6 2.3 4.5 5 4.8" />
    </svg>
  );
}

export function WhatsAppIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.1L4 20z" />
      <path d="M9.2 8.6c.2-.4.5-.4.8-.4h.5c.2 0 .4.1.5.4l.6 1.4c.1.3 0 .5-.2.7l-.4.4c.5 1 1.3 1.8 2.3 2.3l.4-.4c.2-.2.5-.3.7-.2l1.4.6c.3.1.4.3.4.5v.5c0 .3 0 .6-.4.8-.7.4-1.6.5-2.6.1a8 8 0 0 1-4.6-4.6c-.4-1-.3-1.9.1-2.6z" fill="currentColor" stroke="none" />
    </svg>
  );
}
