-- Multi Delivery: cobre FKs de multiunidade sinalizadas pelo Performance Advisor.
-- O índice composto de empresa_horarios também cobre a FK isolada de unidade_id.

begin;

create index if not exists categorias_unidade_empresa_fkey_idx
  on public.categorias(unidade_id, empresa_id);

create index if not exists empresa_funcionarios_criado_por_idx
  on public.empresa_funcionarios(criado_por);

create index if not exists empresa_horarios_unidade_empresa_fkey_idx
  on public.empresa_horarios(unidade_id, empresa_id);

create index if not exists empresa_pausas_unidade_empresa_fkey_idx
  on public.empresa_pausas(unidade_id, empresa_id);

create index if not exists empresa_regioes_unidade_empresa_fkey_idx
  on public.empresa_regioes(unidade_id, empresa_id);

create index if not exists pedidos_unidade_empresa_fkey_idx
  on public.pedidos(unidade_id, empresa_id);

create index if not exists produtos_unidade_empresa_fkey_idx
  on public.produtos(unidade_id, empresa_id);

commit;
