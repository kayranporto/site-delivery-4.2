# Configuração do Supabase — Multi Delivery

## Princípios

- Use projetos separados para desenvolvimento, homologação e produção.
- Nunca publique `service_role`, secret key ou credenciais do Mercado Pago.
- A chave pública do cliente depende de RLS corretamente configurado.
- Toda alteração de schema deve ser versionada por migration e validada antes da produção.
- Arquivos em `supabase/migrations` usam o formato canônico `<timestamp>_<nome>.sql`, compatível com o histórico do Supabase CLI.

## Histórico de migrations

Em 14/08/2026, o histórico local foi reconciliado com `supabase_migrations.schema_migrations` para eliminar divergência entre versões sequenciais antigas (`001_...`, `002_...`) e versões timestampadas registradas pelo Supabase.

As 16 migrations de fundação foram preservadas integralmente e receberam timestamps anteriores à primeira migration originalmente registrada no ambiente remoto:

```text
20260801000100_delivery_core.sql
...
20260801001600_operacao_catalogo_e_escala.sql
```

Essas 16 versões foram marcadas no histórico remoto como **já aplicadas**. O SQL de fundação não foi executado novamente durante a reconciliação. Os blobs Git originais permanecem como fonte canônica do conteúdo.

Migrations posteriores usam exatamente os timestamps registrados no ambiente remoto, por exemplo:

```text
20260805224542_production_hardening_v3_6.sql
20260810141127_operacao_restaurante_4_2_7.sql
20260813222945_funcionarios_rbac_4_3.sql
20260814005954_multiunidade_publica_4_3.sql
20260814215807_frete_distancia_unidade_4_4.sql
```

Não volte a criar migrations com prefixos sequenciais curtos. Para novas alterações, gere um timestamp único e mantenha o mesmo arquivo/versionamento em todos os ambientes.

## Instalação nova

1. Crie o projeto Supabase.
2. Configure as opções do Auth e as URLs permitidas.
3. Aplique os arquivos de `supabase/migrations` em ordem crescente de timestamp.
4. Execute `CONFIGURAR-ADMIN.sql` depois de substituir o e-mail de exemplo.
5. Revise Security Advisor e Performance Advisor.
6. Confirme RLS nas tabelas públicas que armazenam dados privados ou multi-tenant.
7. Configure Storage, webhooks e Edge Functions.
8. Execute os testes funcionais de `../docs/operations/PRODUCAO.md`.

Não aplique `SETUP-COMPLETO.sql` e todas as migrations cegamente no mesmo banco sem verificar a versão de origem. Em bancos existentes, use somente migrations ainda não aplicadas.

## Verificações após migration

No SQL Editor, confirme RLS:

```sql
select relname, relrowsecurity
from pg_class
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public'
  and relkind = 'r'
order by relname;
```

Confirme também funções e modo de segurança:

```sql
select proname, prosecdef
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where pg_namespace.nspname in ('public', 'private')
order by proname;
```

Revise manualmente qualquer função `SECURITY DEFINER`, seus grants e seu `search_path`.

Para auditar a cadeia aplicada:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

A lista deve corresponder aos timestamps existentes em `supabase/migrations`.

## Data API

A exposição de tabelas pela Data API e RLS são controles distintos. Caso o projeto use configuração restritiva de schemas/tabelas, ajuste também os grants de `anon` e `authenticated`; nunca conceda acesso público sem RLS compatível.

## Administração

A autorização administrativa deve permanecer em `app_metadata`, não em `user_metadata`. Depois de alterar o papel administrativo, encerre as sessões existentes e entre novamente para obter claims atualizadas.
