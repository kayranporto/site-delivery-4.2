-- Multi Delivery 4.3: unidade_id sempre deve pertencer à mesma empresa_id.

begin;

alter table public.empresa_unidades
  add constraint empresa_unidades_id_empresa_key unique (id, empresa_id);

alter table public.produtos
  add constraint produtos_unidade_empresa_fkey
  foreign key (unidade_id, empresa_id)
  references public.empresa_unidades(id, empresa_id);

alter table public.categorias
  add constraint categorias_unidade_empresa_fkey
  foreign key (unidade_id, empresa_id)
  references public.empresa_unidades(id, empresa_id);

alter table public.pedidos
  add constraint pedidos_unidade_empresa_fkey
  foreign key (unidade_id, empresa_id)
  references public.empresa_unidades(id, empresa_id);

alter table public.empresa_horarios
  add constraint empresa_horarios_unidade_empresa_fkey
  foreign key (unidade_id, empresa_id)
  references public.empresa_unidades(id, empresa_id)
  on delete cascade;

alter table public.empresa_pausas
  add constraint empresa_pausas_unidade_empresa_fkey
  foreign key (unidade_id, empresa_id)
  references public.empresa_unidades(id, empresa_id)
  on delete cascade;

alter table public.empresa_regioes
  add constraint empresa_regioes_unidade_empresa_fkey
  foreign key (unidade_id, empresa_id)
  references public.empresa_unidades(id, empresa_id)
  on delete cascade;

commit;
