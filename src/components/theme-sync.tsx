"use client";

import { useEffect } from "react";

/** Reaplica a escolha de tema depois que o React monta a página (ele pode refazer o <html> sem o atributo). */
export function ThemeSync() {
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    } catch {}
  }, []);
  return null;
}
