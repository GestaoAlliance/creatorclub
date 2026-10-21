"use client";

import { ArrowLeft, ArrowRight, AtSign, Check, LoaderCircle, Package, Sparkles, Store, Ticket, UserRound, type LucideIcon } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type CSSProperties } from "react";
import { SIGNUP_ADDRESS_OPTIONAL, SIGNUP_ADDRESS_PARTS, SIGNUP_QUESTIONS, SIGNUP_SECTIONS, SIGNUP_STEPS, signupConsentText, signupCouponPreview, withBrand, type SignupQuestion } from "@/domain";
import { UFS } from "@/lib/shipments/address";
import { signupAction, type SignupState } from "./actions";

export type SignupBrand = { name: string; slug: string; color: string; accent?: string | null };

const BY_KEY = new Map(SIGNUP_QUESTIONS.map((q) => [q.key, q]));
const REQUIRED = SIGNUP_QUESTIONS.filter((q) => q.required && q.kind !== "multi").map((q) => q.key);
/** Ícone de cada bloco (com etapas, número no bloco confundiria). */
const SECTION_ICON: Record<string, LucideIcon> = { voce: UserRound, conteudo: Sparkles, marcas: Store, envio: Package };
const SECTION = new Map(SIGNUP_SECTIONS.map((s) => [s.id, s]));
/** Etapa (0 ou 1) de cada pergunta e do consentimento (que fica na última). */
const STEP_OF = new Map<string, number>([
  ...SIGNUP_STEPS.flatMap((st, i) => st.sections.flatMap((id) => SECTION.get(id)!.keys.map((k) => [k, i] as [string, number]))),
  ["consent", SIGNUP_STEPS.length - 1],
]);
for (const k of SIGNUP_ADDRESS_PARTS) STEP_OF.set(k, STEP_OF.get("address")!);

const input =
  "w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-[15px] text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-[var(--b)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--b)_15%,transparent)] aria-[invalid=true]:border-red-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:focus:border-white dark:focus:ring-white/10";
const option =
  "group flex cursor-pointer items-center gap-3 rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium transition hover:border-stone-500 has-[:checked]:border-[var(--b)] has-[:checked]:bg-[var(--b)] has-[:checked]:text-white has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[color-mix(in_srgb,var(--b)_25%,transparent)] dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-white/40";
const dot =
  "grid size-5 shrink-0 place-content-center rounded-full border border-stone-300 transition group-has-[:checked]:border-transparent group-has-[:checked]:bg-white dark:border-white/25";

/** WhatsApp no formato (11) 91234-5678 enquanto a pessoa digita. */
function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Respostas obrigatórias já preenchidas (para a barra de progresso e o "ok" de cada bloco). */
function answeredKeys(form: HTMLFormElement) {
  const data = new FormData(form);
  const done = new Set<string>();
  for (const q of SIGNUP_QUESTIONS) if (data.getAll(q.key).some((v) => String(v).trim())) done.add(q.key);
  if (SIGNUP_ADDRESS_PARTS.every((k) => SIGNUP_ADDRESS_OPTIONAL.includes(k) || String(data.get(k) ?? "").trim())) done.add("address");
  if (data.get("consent") === "sim") done.add("consent");
  return done;
}

function Label({ q, brand }: { q: SignupQuestion; brand: string }) {
  return (
    <span className="text-[15px] font-medium text-stone-900 dark:text-stone-100">
      {withBrand(q.label, brand)}
      {!q.required && <span className="ml-1.5 text-xs font-normal text-stone-500">opcional</span>}
    </span>
  );
}

function Err({ msg }: { msg?: string | undefined }) {
  return msg ? (
    <span role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
      {msg}
    </span>
  ) : null;
}

/** CEP no formato 00000-000 enquanto a pessoa digita. */
const formatZip = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

type ZipLookup = "idle" | "loading" | "found" | "notfound" | "error";

/**
 * Endereço em campos (D-SIGNUPADDR): CEP primeiro; com os 8 números o formulário busca no ViaCEP e completa rua, bairro,
 * cidade e UF (a pessoa pode corrigir). Sem resposta, preenche à mão. Cada parte vai num campo próprio do formulário.
 */
function AddressFields({ q, values, errors, brand }: { q: SignupQuestion; values: Record<string, string>; errors: Record<string, string>; brand: string }) {
  const [a, setA] = useState<Record<string, string>>(() => Object.fromEntries(SIGNUP_ADDRESS_PARTS.map((k) => [k, values[k] ?? ""])));
  const [lookup, setLookup] = useState<ZipLookup>("idle");
  const numberRef = useRef<HTMLInputElement>(null);
  const asked = useRef("");
  const set = (k: string, v: string) => setA((cur) => ({ ...cur, [k]: v }));

  const search = async (zip: string) => {
    if (zip.length !== 8 || asked.current === zip) return;
    asked.current = zip;
    setLookup("loading");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
      const data = (await res.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (asked.current !== zip) return;
      if (!res.ok || data.erro) return setLookup("notfound");
      setA((cur) => ({
        ...cur,
        addrStreet: data.logradouro || (cur.addrStreet ?? ""),
        addrDistrict: data.bairro || (cur.addrDistrict ?? ""),
        addrCity: data.localidade || (cur.addrCity ?? ""),
        addrState: data.uf || (cur.addrState ?? ""),
      }));
      setLookup("found");
      requestAnimationFrame(() => numberRef.current?.focus());
    } catch {
      if (asked.current === zip) setLookup("error");
    }
  };

  const box = (k: string, label: string, extra: Record<string, unknown> = {}, className = "") => (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm text-stone-600 dark:text-stone-300">
        {label}
        {SIGNUP_ADDRESS_OPTIONAL.includes(k as (typeof SIGNUP_ADDRESS_PARTS)[number]) && <span className="ml-1.5 text-xs text-stone-500">opcional</span>}
      </span>
      <input
        name={k}
        value={a[k]}
        onChange={(e) => set(k, e.target.value)}
        required={!SIGNUP_ADDRESS_OPTIONAL.includes(k as (typeof SIGNUP_ADDRESS_PARTS)[number])}
        maxLength={160}
        aria-invalid={errors[k] ? true : undefined}
        className={input}
        {...extra}
      />
      <Err msg={errors[k]} />
    </label>
  );

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3">
        <Label q={q} brand={brand} />
      </legend>
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5 sm:max-w-56">
          <span className="text-sm text-stone-600 dark:text-stone-300">CEP</span>
          <span className="relative">
            <input
              name="addrZip"
              value={formatZip(a.addrZip ?? "")}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                set("addrZip", d);
                if (d.length === 8) void search(d);
                else setLookup("idle");
              }}
              required
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              pattern="\d{5}-?\d{3}"
              title="CEP com 8 números"
              aria-invalid={errors.addrZip ? true : undefined}
              className={input}
            />
            {lookup === "loading" && <LoaderCircle className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-stone-400" />}
            {lookup === "found" && <Check className="pop absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--b)]" strokeWidth={3} />}
          </span>
        </label>
        <span aria-live="polite" className="text-xs text-stone-500">
          {lookup === "notfound"
            ? "Não encontramos esse CEP: confira os números ou preencha o endereço abaixo."
            : lookup === "error"
              ? "Não conseguimos buscar o CEP agora: preencha o endereço abaixo."
              : lookup === "found"
                ? "Endereço encontrado: confira e complete com o número."
                : "Digite o CEP e a gente preenche o resto."}
        </span>
        <Err msg={errors.addrZip} />
      </div>
      <div className="grid grid-cols-6 gap-4">
        {box("addrStreet", "Rua ou avenida", { autoComplete: "address-line1" }, "col-span-6 sm:col-span-4")}
        {box("addrNumber", "Número", { ref: numberRef, placeholder: "Ex.: 123 ou s/n", maxLength: 20 }, "col-span-6 sm:col-span-2")}
        {box("addrComplement", "Complemento", { autoComplete: "address-line2", placeholder: "Apto, bloco, ponto de referência" }, "col-span-6")}
        {box("addrDistrict", "Bairro", {}, "col-span-6 sm:col-span-3")}
        {box("addrCity", "Cidade", { autoComplete: "address-level2" }, "col-span-4 sm:col-span-2")}
        <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <span className="text-sm text-stone-600 dark:text-stone-300">UF</span>
          <select
            name="addrState"
            value={a.addrState}
            onChange={(e) => set("addrState", e.target.value)}
            required
            aria-invalid={errors.addrState ? true : undefined}
            className={`${input} px-3`}
          >
            <option value="" disabled>—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
          <Err msg={errors.addrState} />
        </label>
      </div>
      <Err msg={errors.address} />
    </fieldset>
  );
}

function Field({ q, value, error, brand }: { q: SignupQuestion; value: string; error?: string | undefined; brand: string }) {
  const [coupon, setCoupon] = useState(signupCouponPreview(value));
  const invalid = error ? true : undefined;

  if (q.kind === "choice") {
    const short = q.options!.every((o) => o.length <= 4);
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3">
          <Label q={q} brand={brand} />
        </legend>
        <div className={`grid gap-2 ${short ? "grid-cols-2" : "sm:grid-cols-2"}`}>
          {q.options!.map((o) => (
            <label key={o} className={option}>
              <input
                type="radio"
                name={q.key}
                value={o}
                defaultChecked={value === o}
                required={q.required}
                aria-invalid={invalid}
                className="sr-only"
              />
              <span className={dot}>
                <Check className="pop hidden size-3 text-[var(--b)] group-has-[:checked]:block" strokeWidth={3.5} />
              </span>
              {o}
            </label>
          ))}
        </div>
        <Err msg={error} />
      </fieldset>
    );
  }

  const common = {
    name: q.key,
    defaultValue: value,
    required: q.required,
    "aria-invalid": invalid,
  };
  return (
    <label className="flex flex-col gap-2">
      <Label q={q} brand={brand} />
      {q.kind === "long" ? (
        <textarea {...common} rows={4} maxLength={1500} className={`${input} resize-y leading-relaxed`} />
      ) : q.key === "instagram" ? (
        <span className="relative">
          <AtSign className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input {...common} maxLength={300} autoComplete="off" placeholder="seuperfil" className={`${input} pl-10`} />
        </span>
      ) : q.key === "coupon" ? (
        <span className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            {...common}
            maxLength={8}
            pattern="[A-Za-z]{2,8}"
            title="Só letras, de 2 a 8"
            autoComplete="off"
            placeholder="Ex.: MARIA"
            onInput={(e) => {
              // Só letras, até 8: número, espaço e símbolo somem enquanto a pessoa digita (D-SIGNUPCOUPON).
              const clean = signupCouponPreview(e.currentTarget.value);
              e.currentTarget.value = clean;
              setCoupon(clean);
            }}
            className={`${input} uppercase sm:flex-1`}
          />
          <span
            aria-live="polite"
            className="flex h-12 items-center gap-2 self-start rounded-xl border border-dashed border-white/40 bg-[var(--b)] px-4 font-mono text-sm font-semibold tracking-[0.2em] text-white sm:self-auto"
          >
            <Ticket className="size-4 opacity-60" />
            {coupon || "SEUCUPOM"}
          </span>
        </span>
      ) : (
        <input
          {...common}
          type={q.kind === "email" ? "email" : q.kind === "tel" ? "tel" : "text"}
          inputMode={q.kind === "tel" || q.key === "cpf" || q.key === "cnpj" ? "numeric" : undefined}
          maxLength={300}
          placeholder={q.kind === "tel" ? "(11) 91234-5678" : q.kind === "email" ? "voce@email.com" : undefined}
          onInput={q.kind === "tel" ? (e) => (e.currentTarget.value = formatPhone(e.currentTarget.value)) : undefined}
          autoComplete={q.key === "fullName" ? "name" : q.kind === "email" ? "email" : q.kind === "tel" ? "tel" : "off"}
          className={input}
        />
      )}
      {q.hint && q.key !== "instagram" && q.kind !== "tel" && <span className="text-xs text-stone-500">{q.hint}</span>}
      <Err msg={error} />
    </label>
  );
}

/** Tela de "inscrição recebida", com uma pequena explosão nas cores da marca. */
function Done({ brand }: { brand: SignupBrand }) {
  return (
    <section className="rise relative flex flex-col items-center gap-3 overflow-hidden rounded-[2rem] bg-white px-6 py-14 text-center shadow-xl dark:bg-white/[0.04] dark:ring-1 dark:ring-white/10">
      <div className="relative grid size-20 place-content-center">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <span
              key={i}
              aria-hidden
              className="burst absolute left-1/2 top-1/2 size-2.5 rounded-full"
              style={
                {
                  background: i % 3 === 2 ? (brand.accent ?? brand.color) : brand.color,
                  "--bx": `${Math.cos(a) * 90}px`,
                  "--by": `${Math.sin(a) * 90}px`,
                  animationDelay: "150ms",
                } as CSSProperties
              }
            />
          );
        })}
        <span className="pop grid size-20 place-content-center rounded-full bg-[var(--b)] text-white">
          <Check className="size-9" strokeWidth={3} />
        </span>
      </div>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight">Inscrição recebida!</h2>
      <p className="max-w-sm text-stone-600 dark:text-stone-400">Agora é com a gente: a equipe vai analisar o seu perfil e, caso você seja aprovado(a), te enviaremos um WhatsApp.</p>
    </section>
  );
}

/** Formulário de inscrição de uma marca (D-SIGNUP, D-SIGNUPSTEPS, D-SIGNUPBRAND): as mesmas perguntas do Google, em duas
 *  etapas, na cor da marca. Um formulário só (as etapas só escondem blocos), então o envio continua igual. */
export function SignupForm({ hunterCode, brand }: { hunterCode: string | null; brand: SignupBrand }) {
  const [state, action, pending] = useActionState(signupAction, {
    n: 0,
  } as SignupState);
  const ref = useRef<HTMLFormElement>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(0);
  const v = state.values ?? {};
  const last = SIGNUP_STEPS.length - 1;

  const goTo = (n: number) => {
    setStep(n);
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Só avança se as respostas obrigatórias desta etapa estão preenchidas (o navegador aponta o que falta).
  const next = () => {
    const fields = ref.current?.querySelectorAll<HTMLInputElement>(`[data-step="${step}"] input, [data-step="${step}"] textarea, [data-step="${step}"] select`) ?? [];
    for (const el of fields) if (!el.checkValidity()) return void el.reportValidity();
    goTo(step + 1);
  };

  const refresh = () => {
    const form = ref.current;
    if (!form) return;
    setDone(answeredKeys(form));
  };

  // Entrada dos blocos ao rolar a página.
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    root.setAttribute("data-reveal", "on");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.setAttribute("data-shown", "true"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -8% 0px" },
    );
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [state.n, step]);

  // Depois de um envio com erro: recalcula o progresso e leva a pessoa ao primeiro campo marcado.
  useEffect(() => {
    refresh();
    if (!state.errors) return;
    const keys = Object.keys(state.errors);
    const target = Math.min(...keys.map((k) => STEP_OF.get(k) ?? last));
    setStep(target);
    requestAnimationFrame(() => {
      const first = ref.current?.querySelector<HTMLElement>(`[data-step="${target}"] [aria-invalid=true]`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.focus({ preventScroll: true });
    });
  }, [state.n, state.errors, last]);

  if (state.done) return <Done brand={brand} />;

  const total = REQUIRED.length + 1;
  const count = REQUIRED.filter((k) => done.has(k)).length + (done.has("consent") ? 1 : 0);
  const pct = Math.round((count / total) * 100);

  return (
    <form key={state.n} ref={ref} action={action} onInput={refresh} onChange={refresh} className="flex flex-col gap-5">
      <input type="hidden" name="marca" value={brand.slug} />
      {hunterCode && <input type="hidden" name="h" value={hunterCode} />}
      {/* Campo que só robô preenche (fica fora da tela). */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site
          <input name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="glass sticky top-3 z-20 flex flex-col gap-3 rounded-3xl px-5 py-4">
        <ol className="flex items-center gap-2">
          {SIGNUP_STEPS.map((st, i) => (
            <li key={st.title} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => i < step && goTo(i)}
                disabled={i >= step}
                aria-current={i === step ? "step" : undefined}
                className="flex min-w-0 items-center gap-2 text-left disabled:cursor-default"
              >
                <span
                  className={`grid size-7 shrink-0 place-content-center rounded-full text-xs font-semibold tabular-nums transition ${i <= step ? "bg-[var(--b)] text-white" : "ring-1 ring-stone-300 text-stone-500 dark:ring-white/20"}`}
                >
                  {i < step ? <Check className="pop size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={`truncate text-sm ${i === step ? "font-semibold" : "hidden text-stone-500 sm:inline"}`}>{st.title}</span>
              </button>
              {i < last && <span className={`h-px flex-1 transition ${i < step ? "bg-[var(--b)]" : "bg-stone-300 dark:bg-white/15"}`} />}
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-300/60 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--b)] transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-stone-600 dark:text-stone-300">
            {count === total ? "Tudo pronto!" : `${count} de ${total}`}
          </span>
        </div>
      </div>

      {SIGNUP_STEPS.map((st, n) => (
        <div key={st.title} data-step={n} hidden={n !== step} className="flex flex-col gap-5">
          {st.sections.map((id) => {
            const s = SECTION.get(id)!;
            const Icon = SECTION_ICON[s.id] ?? UserRound;
            const complete = s.keys.every((k) => !BY_KEY.get(k)?.required || done.has(k));
            return (
              <section
                key={s.id}
                className="reveal flex flex-col gap-7 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-stone-200 md:p-9 dark:bg-white/[0.03] dark:ring-white/10"
              >
                <header className="flex items-start gap-4">
                  <span
                    className={`grid size-10 shrink-0 place-content-center rounded-full text-sm font-semibold tabular-nums transition ${complete ? "bg-[var(--b)] text-white" : "ring-1 ring-stone-300 dark:ring-white/20"}`}
                  >
                    {complete ? <Check key="ok" className="pop size-4" strokeWidth={3} /> : <Icon className="size-4" />}
                  </span>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{withBrand(s.title, brand.name)}</h2>
                    <p className="mt-0.5 text-sm text-stone-500">{withBrand(s.hint, brand.name)}</p>
                  </div>
                </header>
                {s.keys.map((k) => {
                  const q = BY_KEY.get(k)!;
                  if (k === "address") return <AddressFields key={k} q={q} values={v} errors={state.errors ?? {}} brand={brand.name} />;
                  return <Field key={k} q={q} value={v[k] ?? ""} error={state.errors?.[k]} brand={brand.name} />;
                })}
              </section>
            );
          })}
          {n < last && (
            <div className="flex items-center gap-3">
              {n > 0 && (
                <button
                  type="button"
                  onClick={() => goTo(n - 1)}
                  className="flex h-14 items-center gap-2 rounded-full px-6 text-sm font-semibold ring-1 ring-stone-300 transition hover:ring-stone-500 dark:ring-white/20"
                >
                  <ArrowLeft className="size-4" /> Voltar
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="group flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--b)] text-base font-semibold text-white shadow-lg transition hover:shadow-xl active:scale-[0.99]"
              >
                Continuar <ArrowRight className="size-5 transition group-hover:translate-x-1" />
              </button>
            </div>
          )}
        </div>
      ))}

      <section
        data-step={last}
        hidden={step !== last}
        className="reveal flex flex-col gap-4 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-stone-200 md:p-9 dark:bg-white/[0.03] dark:ring-white/10"
      >
        <label className="group flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
          <input type="checkbox" name="consent" value="sim" required defaultChecked={v.consent === "sim"} className="peer sr-only" />
          <span className="mt-0.5 grid size-5 shrink-0 place-content-center rounded-md border border-stone-400 transition group-has-[:checked]:border-[var(--b)] group-has-[:checked]:bg-[var(--b)] group-has-[:focus-visible]:ring-4 group-has-[:focus-visible]:ring-[color-mix(in_srgb,var(--b)_25%,transparent)] dark:border-white/30">
            <Check className="pop hidden size-3.5 text-white group-has-[:checked]:block" strokeWidth={3.5} />
          </span>
          <span>{signupConsentText(brand.name)}</span>
        </label>
        <Err msg={state.errors?.consent} />
        {state.errors?._form && (
          <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
            {state.errors._form}
          </p>
        )}
        {state.errors && !state.errors._form && (
          <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
            Faltou alguma coisa: confira os campos marcados em vermelho.
          </p>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => goTo(last - 1)}
            className="flex h-14 items-center gap-2 rounded-full px-6 text-sm font-semibold ring-1 ring-stone-300 transition hover:ring-stone-500 dark:ring-white/20"
          >
            <ArrowLeft className="size-4" /> Voltar
          </button>
          <button
            disabled={pending}
            className="group relative flex h-14 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full bg-[var(--b)] text-base font-semibold text-white shadow-lg transition hover:shadow-xl active:scale-[0.99] disabled:opacity-60"
          >
            <span
              aria-hidden
              className="sheen pointer-events-none absolute inset-0 opacity-30"
              style={{
                backgroundImage: `linear-gradient(110deg, transparent 30%, ${brand.accent ?? "#ffffff"}, transparent 70%)`,
              }}
            />
            <span className="relative">{pending ? "Enviando…" : "Quero fazer parte"}</span>
            {!pending && <ArrowRight className="relative size-5 transition group-hover:translate-x-1" />}
          </button>
        </div>
      </section>
    </form>
  );
}
