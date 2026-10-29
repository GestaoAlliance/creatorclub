"use client";

/** Botão "Imprimir" da página de etiquetas (some no papel). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white">
      Imprimir
    </button>
  );
}
