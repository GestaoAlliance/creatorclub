"use client";

import { Moon, Sun } from "lucide-react";

// Troca claro/escuro e guarda a escolha neste navegador. O ícone certo aparece via CSS (sem piscar).
export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Navegador sem armazenamento: a troca vale só nesta página.
    }
  }
  return (
    <button type="button" onClick={toggle} aria-label="Alternar tema claro/escuro" className="glass grid size-10 place-content-center rounded-full">
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </button>
  );
}
