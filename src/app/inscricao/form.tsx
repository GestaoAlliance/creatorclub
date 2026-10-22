"use client";

import { Check, Circle, Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { SIGNUP_COUPON_MAX, SIGNUP_QUESTIONS, SIGNUP_SECTIONS, signupConsentText, signupCouponPreview, signupCouponValid } from "@/domain";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/rules";
import { UFS } from "@/lib/shipments/address";
import { checkCouponAction, signupAction, type CouponCheck, type SignupState } from "./actions";

export type SignupBrand = { name: string; slug: string; color: string; accent?: string | null };

const BY_KEY = new Map(SIGNUP_QUESTIONS.map((q) => [q.key, q]));

const input =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-[var(--b)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--b)_15%,transparent)] aria-[invalid=true]:border-red-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:focus:border-white dark:focus:ring-white/10";

/** Máscaras enquanto a pessoa digita. */
const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);
const MASK: Record<string, (v: string) => string> = {
  cpf: (v) => digits(v, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"),
  cnpj: (v) => digits(v, 14).replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2"),
  phone: (v) => {
    const d = digits(v, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  },
  addrZip: (v) => {
    const d = digits(v, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  },
};
const PLACEHOLDER: Record<string, string> = {
  fullName: "Seu nome completo",
  cpf: "000.000.000-00",
  cnpj: "00.000.000/0000-00",
  email: "seu@email.com",
  phone: "(00) 00000-0000",
  instagram: "usuario",
  tiktok: "usuario",
  coupon: "SEUCUPOM10",
  addrZip: "00000-000",
  addrComplement: "Apto 101",
};

function Err({ msg }: { msg?: string | undefined }) {
  return msg ? <span role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{msg}</span> : null;
}

function Field(p: { label: string; optional?: boolean; hint?: ReactNode; error?: string | undefined; className?: string; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 ${p.className ?? ""}`}>
      <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
        {p.label}
        {p.optional && <span className="ml-1 font-normal text-stone-500">(opcional)</span>}
      </span>
      {p.children}
      {p.hint && <span className="text-xs text-stone-500">{p.hint}</span>}
      <Err msg={p.error} />
    </label>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string | undefined; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-stone-200 pt-6 first:border-0 first:pt-0 dark:border-white/10">
      <header>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

type ZipLookup = "idle" | "loading" | "found" | "notfound" | "error";

/**
 * Cadastro de creator de uma marca (D-SIGNUPACCOUNT): uma página, no modelo da referência do responsável. Endereço com
 * CEP primeiro (D-SIGNUPADDR), cupom conferido na hora (D-SIGNUPACCOUNT) e a senha do login no fim.
 */
export function SignupForm({ hunterCode, brand }: { hunterCode: string | null; brand: SignupBrand }) {
  const [state, action, pending] = useActionState(signupAction, { n: 0 } as SignupState);
  const errors = state.errors ?? {};
  const [v, setV] = useState<Record<string, string>>(() => state.values ?? {});
  const [zip, setZip] = useState<ZipLookup>("idle");
  const [coupon, setCoupon] = useState<CouponCheck | null>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const asked = useRef("");
  const numberRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const set = (k: string, value: string) => setV((cur) => ({ ...cur, [k]: value }));

  // Depois de um envio com erro: volta o que foi digitado e leva ao primeiro campo marcado.
  useEffect(() => {
    if (state.values) setV(state.values);
    if (!state.errors) return;
    requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.focus({ preventScroll: true });
    });
  }, [state]);

  // Cupom: confere no sistema meio segundo depois de parar de digitar.
  useEffect(() => {
    const code = signupCouponPreview(v.coupon ?? "");
    if (!code) return setCoupon(null);
    if (!signupCouponValid(code)) return setCoupon({ code, state: "invalid" });
    const t = setTimeout(() => void checkCouponAction(brand.slug, code).then(setCoupon), 500);
    return () => clearTimeout(t);
  }, [v.coupon, brand.slug]);

  const searchZip = async (d: string) => {
    if (d.length !== 8 || asked.current === d) return;
    asked.current = d;
    setZip("loading");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const data = (await res.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (asked.current !== d) return;
      if (!res.ok || data.erro) return setZip("notfound");
      setV((cur) => ({
        ...cur,
        addrStreet: data.logradouro || (cur.addrStreet ?? ""),
        addrDistrict: data.bairro || (cur.addrDistrict ?? ""),
        addrCity: data.localidade || (cur.addrCity ?? ""),
        addrState: data.uf || (cur.addrState ?? ""),
      }));
      setZip("found");
      requestAnimationFrame(() => numberRef.current?.focus());
    } catch {
      if (asked.current === d) setZip("error");
    }
  };

  const text = (k: string, extra: Record<string, unknown> = {}) => (
    <input
      name={k}
      value={v[k] ?? ""}
      onChange={(e) => set(k, MASK[k] ? MASK[k](e.target.value) : e.target.value)}
      placeholder={PLACEHOLDER[k]}
      aria-invalid={errors[k] ? true : undefined}
      maxLength={160}
      className={input}
      {...extra}
    />
  );
  const q = (k: string) => BY_KEY.get(k)!;
  const handle = (k: "instagram" | "tiktok") => (
    <span className="flex">
      <span className="grid place-content-center rounded-l-xl border border-r-0 border-stone-300 bg-stone-50 px-3 text-sm text-stone-500 dark:border-white/15 dark:bg-white/5">@</span>
      {text(k, { required: q(k).required, autoComplete: "off", className: `${input} rounded-l-none`, onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value.replace(/^@+/, "")) })}
    </span>
  );
  const couponCode = signupCouponPreview(v.coupon ?? "");
  const couponBlocked = coupon !== null && coupon.code === couponCode && coupon.state !== "ok";
  const sec = (id: string) => SIGNUP_SECTIONS.find((s) => s.id === id)!;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      <input type="hidden" name="marca" value={brand.slug} />
      {hunterCode && <input type="hidden" name="h" value={hunterCode} />}
      {/* Campo que só robô preenche (fica fora da tela). */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site
          <input name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Block title={sec("dados").title}>
        <Field label={q("fullName").label} error={errors.fullName}>{text("fullName", { required: true, autoComplete: "name" })}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={q("cpf").label} error={errors.cpf}>{text("cpf", { required: true, inputMode: "numeric", autoComplete: "off" })}</Field>
          <Field label={q("cnpj").label} optional hint={q("cnpj").hint} error={errors.cnpj}>{text("cnpj", { inputMode: "numeric", autoComplete: "off" })}</Field>
        </div>
      </Block>

      <Block title={sec("contato").title}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={q("email").label} hint={q("email").hint} error={errors.email}>{text("email", { type: "email", required: true, autoComplete: "email" })}</Field>
          <Field label={q("phone").label} error={errors.phone}>{text("phone", { type: "tel", required: true, inputMode: "numeric", autoComplete: "tel" })}</Field>
        </div>
      </Block>

      <Block title={sec("redes").title} hint={sec("redes").hint}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={q("instagram").label} error={errors.instagram}>{handle("instagram")}</Field>
          <Field label={q("tiktok").label} optional error={errors.tiktok}>{handle("tiktok")}</Field>
        </div>
      </Block>

      <Block title={sec("cupom").title} hint={sec("cupom").hint}>
        <Field
          label="Cupom"
          className="sm:max-w-[calc(50%-0.5rem)]"
          error={errors.coupon}
          hint={
            couponBlocked && coupon?.state === "taken" ? (
              <span className="flex items-center gap-1 font-medium text-red-600 dark:text-red-400"><X className="size-3.5" /> {couponCode} já está em uso. Escolha outro.</span>
            ) : coupon?.state === "ok" && coupon.code === couponCode ? (
              <span className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400"><Check className="size-3.5" /> {couponCode} está disponível.</span>
            ) : (
              q("coupon").hint
            )
          }
        >
          {text("coupon", {
            required: true,
            maxLength: SIGNUP_COUPON_MAX,
            autoComplete: "off",
            className: `${input} font-mono uppercase tracking-wider`,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => set("coupon", signupCouponPreview(e.target.value)),
          })}
        </Field>
      </Block>

      <Block title={sec("endereco").title} hint={sec("endereco").hint}>
        <Field
          label="CEP"
          className="sm:max-w-[calc(50%-0.5rem)]"
          error={errors.addrZip}
          hint={
            zip === "notfound" ? "Não encontramos esse CEP: confira ou preencha o endereço abaixo." : zip === "error" ? "Não deu para buscar o CEP agora: preencha o endereço abaixo." : "Preencha o CEP e completamos o resto."
          }
        >
          <span className="relative">
            {text("addrZip", {
              required: true,
              inputMode: "numeric",
              autoComplete: "postal-code",
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const masked = MASK.addrZip!(e.target.value);
                set("addrZip", masked);
                const d = digits(masked, 8);
                if (d.length === 8) void searchZip(d);
                else setZip("idle");
              },
            })}
            {zip === "loading" && <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-stone-400" />}
            {zip === "found" && <Check className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--b)]" strokeWidth={3} />}
          </span>
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Rua" className="col-span-2" error={errors.addrStreet}>{text("addrStreet", { required: true, autoComplete: "address-line1" })}</Field>
          <Field label="Número" error={errors.addrNumber}>{text("addrNumber", { required: true, maxLength: 20, ref: numberRef })}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Complemento" optional error={errors.addrComplement}>{text("addrComplement", { maxLength: 80, autoComplete: "address-line2" })}</Field>
          <Field label="Bairro" error={errors.addrDistrict}>{text("addrDistrict", { required: true, maxLength: 80 })}</Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Cidade" className="col-span-2" error={errors.addrCity}>{text("addrCity", { required: true, maxLength: 80, autoComplete: "address-level2" })}</Field>
          <Field label="UF" error={errors.addrState}>
            <select name="addrState" value={v.addrState ?? ""} onChange={(e) => set("addrState", e.target.value)} required aria-invalid={errors.addrState ? true : undefined} className={input}>
              <option value="" disabled>—</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </Field>
        </div>
      </Block>

      <Block title="Senha">
        <Field
          label="Crie uma senha"
          className="sm:max-w-[calc(50%-0.5rem)]"
          error={errors.password}
          hint={
            <span className={`flex items-center gap-1.5 ${password.length >= PASSWORD_MIN_LENGTH ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
              {password.length >= PASSWORD_MIN_LENGTH ? <Check className="size-3.5" strokeWidth={3} /> : <Circle className="size-3.5" />} Mínimo de {PASSWORD_MIN_LENGTH} caracteres
            </span>
          }
        >
          <span className="relative">
            <input
              name="password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              className={`${input} pr-11`}
            />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Esconder senha" : "Mostrar senha"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stone-500 hover:bg-stone-500/10">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </Field>
      </Block>

      <div className="flex flex-col gap-3 border-t border-stone-200 pt-6 dark:border-white/10">
        {errors._form && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{errors._form}</p>}
        {state.errors && !errors._form && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">Confira os campos marcados em vermelho.</p>}
        <button disabled={pending || couponBlocked} className="h-12 rounded-xl bg-[var(--b)] text-[15px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40">
          {pending ? "Criando conta…" : "Criar conta"}
        </button>
        {couponBlocked && <p className="text-center text-xs text-stone-500">Para criar a conta, escolha um cupom disponível.</p>}
        <p className="text-center text-[11px] leading-relaxed text-stone-500">Ao criar a conta: {signupConsentText(brand.name)}</p>
        <p className="text-center text-sm text-stone-600 dark:text-stone-400">
          Já tem conta?{" "}
          <Link href="/entrar" className="font-semibold text-[var(--b)] hover:underline">Entrar</Link>
        </p>
      </div>
    </form>
  );
}
