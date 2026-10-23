"use client";

import { useEffect, useState } from "react";

/** D-INSTALLAPP: o portal está aberto pelo ícone da tela de início (como app)? Só no navegador; antes de montar, false. */
export function useStandalone(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setOn(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
  }, []);
  return on;
}
