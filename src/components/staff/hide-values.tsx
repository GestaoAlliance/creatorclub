"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "cc-hide-values";

/**
 * "Olho" do dashboard: esconde os valores em dinheiro (classe `money`, e o gráfico) para mostrar a tela a alguém.
 * Lembra a escolha neste navegador.
 */
export function HideValuesToggle() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-hide-values", hidden);
  }, [hidden]);
  function toggle() {
    const next = !hidden;
    setHidden(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {}
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={hidden} aria-label={hidden ? "Mostrar valores" : "Esconder valores"} title={hidden ? "Mostrar valores" : "Esconder valores"} className="glass grid size-9 place-content-center rounded-full">
      {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
