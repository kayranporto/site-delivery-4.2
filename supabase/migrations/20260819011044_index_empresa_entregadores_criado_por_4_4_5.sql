-- Multi Delivery 4.4.5: cobre a FK criado_por usada ao remover usuários.

begin;

create index if not exists empresa_entregadores_criado_por_idx
  on public.empresa_entregadores(criado_por);

commit;
