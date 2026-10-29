"use client";

import { Check, Circle, Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { formatBrPhone, HEARD_FROM_OPTIONS, mustShipToCnpj, PAYOUT_PJ, NICHES, TAX_REGIMES, SIGNUP_COUPON_MAX, SIGNUP_QUESTIONS, SIGNUP_SECTIONS, signupConsentText, signupCouponPreview, signupCouponValid } from "@/domain";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/rules";
import { UFS } from "@/lib/shipments/address";
import { checkCouponAction, cnpjAddressAction, requestAccessAction, signupAction, type CouponCheck, type SignupState } from "./actions";

export type SignupBrand = { name: string; slug: string; color: string; accent?: string | null };

const BY_KEY = new Map(SIGNUP_QUESTIONS.map((q) => [q.key, q]));

const input =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-[var(--b)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--b)_15%,transparent)] aria-[invalid=true]:border-red-500 read-only:bg-stone-100 read-only:text-stone-600 disabled:bg-stone-100 dark:border-white/15 dark:read-only:bg-white/[0.02] dark:bg-white/[0.04] dark:text-white dark:focus:border-white dark:focus:ring-white/10";

/** Máscaras enquanto a pessoa digita. */
const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);
const MASK: Record<string, (v: string) => string> = {
  cpf: (v) => digits(v, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"),
  cnpj: (v) => digits(v, 14).replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2"),
  phone: formatBrPhone, // tira o +55 do país (D-PHONE)
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
  phone: "(31) 99999-9999",
  instagram: "usuario",
  tiktok: "usuario",
  youtube: "seucanal",
  kwai: "usuario",
  mediaKitUrl: "https://",
  coupon: "SEUNOME",
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
export function SignupForm({ hunterCode, campaign = null, brand }: { hunterCode: string | null; campaign?: string | null; brand: SignupBrand }) {
  const [state, action, pending] = useActionState(signupAction, { n: 0 } as SignupState);
  const errors = state.errors ?? {};
  const [v, setV] = useState<Record<string, string>>(() => state.values ?? {});
  const [zip, setZip] = useState<ZipLookup>("idle");
  const [coupon, setCoupon] = useState<CouponCheck | null>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const asked = useRef("");
  // D-PJADDR: empresa que não é MEI recebe no endereço do CNPJ (vem da Receita e fica travado).
  const [cnpjAddr, setCnpjAddr] = useState<{ cnpj: string; legalName: string } | { cnpj: string; state: "loading" | "notfound" | "unavailable" } | null>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const set = (k: string, value: string) => setV((cur) => ({ ...cur, [k]: value }));
  /** D-CONTRACTFLOW: escolha de uma opção em botões (como no TikTok Shop). */
  const chips = (key: string) => (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium text-stone-900 dark:text-stone-100">{q(key).label}</legend>
      <div className="flex flex-wrap gap-2">
        {(q(key).options ?? []).map((o) => (
          <label key={o} className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition ${v[key] === o ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_10%,transparent)] font-medium" : "border-stone-300 dark:border-white/15"}`}>
            <input type="radio" name={key} value={o} checked={v[key] === o} onChange={() => set(key, o)} required className="sr-only" />
            {o}
          </label>
        ))}
      </div>
      {q(key).hint && <p className="text-xs text-stone-500">{q(key).hint}</p>}
      {errors[key] && <p className="text-xs text-red-700 dark:text-red-400">{errors[key]}</p>}
    </fieldset>
  );

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

  const cnpjDigits = v.payoutAs === PAYOUT_PJ ? (v.cnpj ?? "").replace(/\D/g, "") : "";
  const needsCnpjAddr = mustShipToCnpj(cnpjDigits, v.taxRegime);
  useEffect(() => {
    if (!needsCnpjAddr) return setCnpjAddr(null);
    let alive = true;
    setCnpjAddr({ cnpj: cnpjDigits, state: "loading" });
    void cnpjAddressAction(cnpjDigits).then((r) => {
      if (!alive) return;
      if ("state" in r) return setCnpjAddr({ cnpj: cnpjDigits, state: r.state });
      const a = r.address;
      setV((cur) => ({ ...cur, addrZip: `${a.zip.slice(0, 5)}-${a.zip.slice(5)}`, addrStreet: a.street, addrNumber: a.number, addrComplement: a.complement ?? "", addrDistrict: a.district, addrCity: a.city, addrState: a.state }));
      setCnpjAddr({ cnpj: cnpjDigits, legalName: r.legalName });
    });
    return () => {
      alive = false;
    };
  }, [needsCnpjAddr, cnpjDigits]);
  const addrLocked = cnpjAddr !== null && "legalName" in cnpjAddr;

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
  const handle = (k: "instagram" | "tiktok" | "youtube" | "kwai") => (
    <span className="flex">
      <span className="grid place-content-center rounded-l-xl border border-r-0 border-stone-300 bg-stone-50 px-3 text-sm text-stone-500 dark:border-white/15 dark:bg-white/5">@</span>
      {text(k, { required: BY_KEY.get(k)?.required ?? false, autoComplete: "off", className: `${input} rounded-l-none`, onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value.replace(/^@+/, "")) })}
    </span>
  );
  const couponCode = signupCouponPreview(v.coupon ?? "");
  const couponBlocked = coupon !== null && coupon.code === couponCode && coupon.state !== "ok";
  const sec = (id: string) => SIGNUP_SECTIONS.find((s) => s.id === id)!;

  if (state.existing === "request") return <AccessRequest values={state.values ?? {}} />;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      <input type="hidden" name="marca" value={brand.slug} />
      {hunterCode && <input type="hidden" name="h" value={hunterCode} />}
      {campaign && <input type="hidden" name="origem" value={campaign} />}
      {/* Campo que só robô preenche (fica fora da tela). */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site
          <input name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Block title={sec("dados").title}>
        <Field label={q("fullName").label} error={errors.fullName}>{text("fullName", { required: true, autoComplete: "name" })}</Field>
        <Field label={q("cpf").label} error={errors.cpf} className="sm:max-w-[calc(50%-0.5rem)]">{text("cpf", { required: true, inputMode: "numeric", autoComplete: "off" })}</Field>
        {chips("payoutAs")}
        {v.payoutAs === PAYOUT_PJ && (
          <Field label={q("cnpj").label} hint={q("cnpj").hint} error={errors.cnpj} className="sm:max-w-[calc(50%-0.5rem)]">{text("cnpj", { required: true, inputMode: "numeric", autoComplete: "off" })}</Field>
        )}
        {v.payoutAs === PAYOUT_PJ && cnpjDigits.length > 0 && (
          <Field label={q("taxRegime").label} error={errors.taxRegime} className="sm:max-w-[calc(50%-0.5rem)]" hint="MEI pode receber os produtos em outro endereço; empresa no Simples ou outro regime recebe no endereço do CNPJ.">
            <select name="taxRegime" value={v.taxRegime ?? ""} onChange={(e) => set("taxRegime", e.target.value)} required aria-invalid={errors.taxRegime ? true : undefined} className={input}>
              <option value="" disabled>Escolha</option>
              {Object.entries(TAX_REGIMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        )}
        <Field label={q("birthDate").label} optional hint="Para a equipe comemorar com você." error={errors.birthDate} className="sm:max-w-[calc(50%-0.5rem)]">
          {text("birthDate", { type: "date", autoComplete: "bday" })}
        </Field>
      </Block>

      <Block title={sec("contato").title}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={q("email").label} hint={q("email").hint} error={errors.email}>{text("email", { type: "email", required: true, autoComplete: "email" })}</Field>
          <Field label={q("phone").label} hint="Só DDD e número, sem o +55." error={errors.phone}>{text("phone", { type: "tel", required: true, inputMode: "numeric", autoComplete: "tel" })}</Field>
        </div>
      </Block>

      <Block title={sec("redes").title} hint={sec("redes").hint}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={q("instagram").label} error={errors.instagram}>{handle("instagram")}</Field>
          <div className="flex flex-col gap-4">
            <Field label={q("tiktok").label} optional error={errors.tiktok}>{handle("tiktok")}</Field>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium text-stone-900 dark:text-stone-100">{q("tiktokShop").label} <span className="font-normal text-stone-500">(opcional)</span></legend>
              <div className="flex gap-2">
                {["Sim", "Não"].map((o) => (
                  <label key={o} className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition ${v.tiktokShop === o ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_10%,transparent)] font-medium" : "border-stone-300 dark:border-white/15"}`}>
                    <input type="radio" name="tiktokShop" value={o} checked={v.tiktokShop === o} onChange={() => set("tiktokShop", o)} className="sr-only" />
                    {o}
                  </label>
                ))}
              </div>
              {errors.tiktokShop && <p className="text-xs text-red-700 dark:text-red-400">{errors.tiktokShop}</p>}
            </fieldset>
          </div>
          <Field label="YouTube" optional error={errors.youtube}>{handle("youtube")}</Field>
          <Field label="Kwai" optional error={errors.kwai}>{handle("kwai")}</Field>
        </div>
      </Block>

      {/* M4.3 (D-PROFILEFIELDS): perfil opcional. */}
      <Block title="Sobre você" hint="Tudo opcional. Ajuda a equipe a conhecer o seu trabalho.">
        {/* D-ORIGIN: como conheceu a marca (opcional). */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Como conheceu a marca?" optional>
            <select name="heardFrom" value={v.heardFrom ?? ""} onChange={(e) => set("heardFrom", e.target.value)} className={input}>
              <option value="">Escolha</option>
              {HEARD_FROM_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          {v.heardFrom === "Outro" && <Field label="Conta para a gente" optional>{text("heardFromOther", { maxLength: 80 })}</Field>}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-900 dark:text-stone-100">Nicho do seu conteúdo <span className="font-normal text-stone-500">(pode marcar mais de um)</span></legend>
          <div className="flex flex-wrap gap-2">
            {NICHES.map((n) => {
              const on = (v.niches ?? "").split("|").includes(n);
              return (
                <label key={n} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_10%,transparent)] font-medium" : "border-stone-300 dark:border-white/15"}`}>
                  <input
                    type="checkbox"
                    name="niches"
                    value={n}
                    checked={on}
                    onChange={() => set("niches", (on ? (v.niches ?? "").split("|").filter((x) => x && x !== n) : [...(v.niches ?? "").split("|").filter(Boolean), n]).join("|"))}
                    className="sr-only"
                  />
                  {n}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registro profissional" optional hint="CRN, CRM, CRF… se você é profissional de saúde." error={errors.professionalId}>
            {text("professionalId", { maxLength: 40, autoComplete: "off" })}
          </Field>
          <Field label="Link do mídia kit" optional hint="Drive, Canva ou site com os seus números." error={errors.mediaKitUrl}>
            {text("mediaKitUrl", { inputMode: "url", maxLength: 500, autoComplete: "off" })}
          </Field>
        </div>
        <Field label="Alergias ou restrições" optional hint="Para montarmos o seu kit (ex.: lactose, glúten)." error={errors.allergies}>
          {text("allergies", { maxLength: 300, autoComplete: "off" })}
        </Field>
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
        {cnpjAddr && (
          <p className="rounded-xl bg-stone-100 px-3.5 py-2.5 text-xs text-stone-600 dark:bg-white/5 dark:text-stone-300">
            {"legalName" in cnpjAddr
              ? `Os produtos vão para o endereço do CNPJ (${cnpjAddr.legalName}), como manda a nota fiscal. Para mudar, fale com a equipe.`
              : cnpjAddr.state === "loading"
                ? "Buscando o endereço do seu CNPJ na Receita…"
                : cnpjAddr.state === "notfound"
                  ? "Não encontramos este CNPJ na Receita: confira os números."
                  : "Não deu para buscar o endereço do CNPJ agora. Preencha com o endereço do CNPJ."}
          </p>
        )}
        <Field
          label="CEP"
          className="sm:max-w-[calc(50%-0.5rem)]"
          error={errors.addrZip}
          hint={
            zip === "notfound" ? "Não encontramos esse CEP: confira ou preencha o endereço abaixo." : zip === "error" ? "Não deu para buscar o CEP agora: preencha o endereço abaixo." : "Preencha o CEP e completamos o resto."
          }
        >
          <span className="relative">
            {text("addrZip", { readOnly: addrLocked, 
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
          <Field label="Rua" className="col-span-2" error={errors.addrStreet}>{text("addrStreet", { readOnly: addrLocked,  required: true, autoComplete: "address-line1" })}</Field>
          <Field label="Número" error={errors.addrNumber}>{text("addrNumber", { readOnly: addrLocked,  required: true, maxLength: 20, ref: numberRef })}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Complemento" optional error={errors.addrComplement}>{text("addrComplement", { readOnly: addrLocked,  maxLength: 80, autoComplete: "address-line2" })}</Field>
          <Field label="Bairro" error={errors.addrDistrict}>{text("addrDistrict", { readOnly: addrLocked,  required: true, maxLength: 80 })}</Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Cidade" className="col-span-2" error={errors.addrCity}>{text("addrCity", { readOnly: addrLocked,  required: true, maxLength: 80, autoComplete: "address-level2" })}</Field>
          <Field label="UF" error={errors.addrState}>
            <select name="addrState" value={v.addrState ?? ""} onChange={(e) => set("addrState", e.target.value)} disabled={addrLocked} required aria-invalid={errors.addrState ? true : undefined} className={input}>
              <option value="" disabled>—</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
            {addrLocked && <input type="hidden" name="addrState" value={v.addrState ?? ""} />}
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

/**
 * D-ACCESSREQ: quem já está no Creator Club (importada ou aprovada) e nunca criou a senha não faz outro cadastro: pede
 * o link de acesso, e a equipe vê o pedido em Ações e manda o convite.
 */
function AccessRequest({ values }: { values: Record<string, string> }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = (values.fullName ?? "").trim().split(/\s+/)[0];
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-6 text-center dark:border-white/10 dark:bg-white/[0.04]">
      {sent ? (
        <>
          <p className="text-lg font-semibold">Pedido enviado! 💜</p>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            A equipe vai te mandar o link para criar a sua senha pelo WhatsApp ou e-mail. Ele vale 7 dias e funciona uma vez.
          </p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold">{first ? `${first}, você` : "Você"} já faz parte do Creator Club! 💜</p>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Encontramos o seu cadastro: só falta criar a sua senha. Toque no botão e a equipe te manda o link de acesso.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await requestAccessAction(values);
              setSent(true);
            }}
            className="h-12 rounded-xl bg-[var(--b)] text-[15px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Enviando…" : "Pedir meu link de acesso"}
          </button>
        </>
      )}
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Já criou a senha?{" "}
        <Link href="/entrar" className="font-semibold text-[var(--b)] hover:underline">Entrar</Link>
      </p>
    </div>
  );
}
