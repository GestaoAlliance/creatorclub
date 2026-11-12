/**
 * Miniatura do produto (D-PRODUCTTHUMB): a foto em destaque da Shopify (ou a foto local do catálogo); sem foto, a
 * inicial num círculo. Usada em todos os rankings de produtos.
 */
export function ProductThumb({ src, title, size = "md" }: { src: string | null | undefined; title: string; size?: "sm" | "md" | "lg" }) {
  const box = size === "sm" ? "size-7" : size === "lg" ? "size-14" : "size-9";
  if (src)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto da Shopify (CDN deles), já no tamanho da miniatura
      <img src={src} alt="" loading="lazy" decoding="async" className={`${box} shrink-0 rounded-full bg-white object-contain p-0.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:bg-white/90`} />
    );
  return (
    <span aria-hidden className={`${box} grid shrink-0 place-content-center rounded-full bg-stone-500/12 text-xs font-semibold text-stone-500`}>
      {title.trim().charAt(0).toUpperCase()}
    </span>
  );
}
