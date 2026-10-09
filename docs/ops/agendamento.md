# Agendamento (pg_cron do Supabase) — D-CRON

O banco chama o worker do app a cada minuto. O worker executa a fila (`src/lib/jobs/`) e agenda a reconciliação
de cada loja a cada 15 min (`src/lib/shopify/reconcile.ts`). Não fica em migração: URL e segredo mudam por
ambiente, e o segredo nunca entra no repositório.

## Pré-requisitos

1. Gerar o segredo: `openssl rand -base64 48` (mínimo 32 caracteres).
2. Vercel → projeto `creatorclub` → Settings → Environment Variables: `JOBS_SECRET` (Production, tipo Secret) →
   redeploy da `main`.
3. Supabase → projeto `Creator Club` → o mesmo valor no Vault, com o nome `jobs_secret`.

## SQL (rodar uma vez por ambiente, no SQL Editor ou pelo conector)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Uma vez; para trocar o segredo: select vault.update_secret(id, '<novo>') ... (id em vault.secrets).
select vault.create_secret('<JOBS_SECRET>', 'jobs_secret', 'Creator Club: chamadas do pg_cron ao worker');

select cron.schedule(
  'creatorclub-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://creatorclub-six.vercel.app/api/jobs/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

## Conferir

```sql
-- Agendamentos e últimas execuções do pg_cron
select jobid, jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- Respostas do app (200 = ok; 401 = segredo diferente entre Vercel e Vault)
select status_code, content, created from net._http_response order by created desc limit 5;
```

## Parar

```sql
select cron.unschedule('creatorclub-worker');
```
