-- M1.1 (D-WDAPPROVE): saque em duas etapas. O novo valor do enum fica numa migração só dele: o Postgres não deixa usar
-- um valor de enum na mesma transação em que ele foi criado (as travas que usam APPROVED vêm na próxima).
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'APPROVED' AFTER 'REQUESTED';
