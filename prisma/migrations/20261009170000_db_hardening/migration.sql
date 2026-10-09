-- Aviso do verificador de segurança do Supabase no staging (2026-10-09):
-- função de gatilho com search_path fixo, sem depender do search_path de quem dispara o gatilho.
-- (btree_gist fica no schema da migração: mover a extensão exige ser dono dos tipos dela,
-- o que o papel postgres do Supabase não é. Risco aceito: só operadores de índice, sem dados.)
ALTER FUNCTION forbid_update_delete() SET search_path = '';
