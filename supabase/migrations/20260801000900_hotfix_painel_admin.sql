-- Multi Delivery 3.1.1: correção rápida para painel administrativo.
-- Pode ser executada mais de uma vez. Execute depois da 008.

begin;

alter table public.pedidos
  add column if not exists agendado_para timestamptz,
  add column if not exists entregador_id uuid references auth.users(id) on delete set null,
  add column if not exists pagamento_modalidade text not null default 'na_entrega',
  add column if not exists pagamento_provider text,
  add column if not exists pagamento_referencia text,
  add column if not exists pagamento_url text,
  add column if not exists pagamento_atualizado_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pedidos'::regclass
      and conname = 'pedidos_pagamento_modalidade_check'
  ) then
    alter table public.pedidos
      add constraint pedidos_pagamento_modalidade_check
      check (pagamento_modalidade in ('na_entrega', 'online')) not valid;
  end if;
end $$;

create index if not exists pedidos_entregador_status_idx
  on public.pedidos(entregador_id, status, created_at desc);
create index if not exists pedidos_agendados_idx
  on public.pedidos(agendado_para) where agendado_para is not null;
create unique index if not exists pedidos_pagamento_referencia_idx
  on public.pedidos(pagamento_provider, pagamento_referencia)
  where pagamento_referencia is not null;

comment on column public.pedidos.pagamento_modalidade is
  'Forma de cobrança: na_entrega ou online.';

commit;

notify pgrst, 'reload schema';
