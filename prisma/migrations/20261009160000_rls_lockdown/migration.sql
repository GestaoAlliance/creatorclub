-- No Supabase, o schema public fica exposto pela Data API (PostgREST) aos papéis anon e authenticated.
-- O app só acessa o banco pelo servidor, como dono das tabelas (o dono ignora RLS).
-- RLS ligado e sem nenhuma política: pela Data API nada é lido nem escrito.
-- Tabela nova precisa ligar RLS na própria migração (teste de integração "rls" cobra).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
