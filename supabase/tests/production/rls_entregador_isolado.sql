-- Teste transacional de RLS para uma identidade exclusivamente entregadora.
-- Pode ser executado no SQL Editor: todas as fixtures são revertidas no final.

begin;

insert into auth.users (id, raw_app_meta_data, raw_user_meta_data)
values (
  '00000000-0000-4000-8000-000000000042'::uuid,
  '{"role":"entregador"}'::jsonb,
  '{}'::jsonb
);

-- O trigger de cadastro cria um perfil de cliente. Removê-lo dentro desta
-- transação garante que a identidade de teste tenha somente o papel entregador.
delete from public.usuarios
where id = '00000000-0000-4000-8000-000000000042'::uuid;

insert into public.entregadores (id, nome, telefone, aprovado, online)
values (
  '00000000-0000-4000-8000-000000000042'::uuid,
  'QA RLS Entregador',
  '00000000000',
  true,
  false
);

select set_config(
  'qa.pedido_id',
  (
    select p.id::text
    from public.pedidos p
    where exists (
      select 1
      from public.pedido_itens i
      where i.pedido_id = p.id
    )
    order by p.created_at desc
    limit 1
  ),
  true
);

update public.pedidos
set entregador_id = '00000000-0000-4000-8000-000000000042'::uuid
where id = current_setting('qa.pedido_id')::uuid;

insert into public.entrega_ofertas (pedido_id, entregador_id)
values (
  current_setting('qa.pedido_id')::uuid,
  '00000000-0000-4000-8000-000000000042'::uuid
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000042","role":"authenticated","app_metadata":{"role":"entregador"}}',
  true
);

set local role authenticated;

select
  auth.uid() = '00000000-0000-4000-8000-000000000042'::uuid as identidade_correta,
  (select count(*) from public.entregadores) = 1 as ve_somente_proprio_cadastro,
  (select count(*) from public.usuarios) = 0 as nao_ve_perfis_clientes,
  (select count(*) from public.pedidos) = 1 as ve_somente_pedido_atribuido,
  (select count(*) from public.pedido_itens) > 0 as ve_itens_do_pedido_atribuido,
  (select count(*) from public.entrega_ofertas) = 1 as ve_somente_oferta_propria,
  (
    select count(*)
    from public.historico_status_pedido
    where pedido_id <> current_setting('qa.pedido_id')::uuid
  ) = 0 as nao_ve_historico_de_outros_pedidos,
  not has_table_privilege(
    'anon',
    'public.historico_status_pedido',
    'select'
  ) as anon_sem_select_historico;

reset role;
rollback;
