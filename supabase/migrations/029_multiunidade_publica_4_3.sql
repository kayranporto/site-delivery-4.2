-- Multi Delivery 4.3: seleção pública de unidade e checkout roteado por unidade.

begin;

create or replace function public.empresa_unidades_publicas(p_empresa_id text)
returns table(
  id uuid,
  nome text,
  cidade text,
  uf text,
  principal boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.nome, u.cidade, u.uf, u.principal
  from public.empresa_unidades u
  where u.empresa_id::text = p_empresa_id::text
    and u.ativa = true
    and exists (
      select 1
      from public.empresas e
      where e.id::text = p_empresa_id::text
        and e.publicado = true
        and e.status = true
    )
  order by u.principal desc, u.nome;
$$;

revoke all on function public.empresa_unidades_publicas(text)
  from public, anon, authenticated, service_role;
grant execute on function public.empresa_unidades_publicas(text)
  to anon, authenticated, service_role;

create or replace function public.criar_pedido_operacional_unidade(
  p_empresa_id text,
  p_unidade_id uuid,
  p_endereco_id uuid,
  p_pagamento text,
  p_observacoes text,
  p_cupom text,
  p_itens jsonb,
  p_agendado_para timestamptz,
  p_chave_cliente uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_pedido_id uuid;
  v_existente public.pedidos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Faça login para finalizar o pedido.';
  end if;

  if p_unidade_id is null then
    raise exception 'Selecione uma unidade válida.';
  end if;

  if not exists (
    select 1
    from public.empresa_unidades u
    join public.empresas e on e.id::text = u.empresa_id::text
    where u.id = p_unidade_id
      and u.empresa_id::text = p_empresa_id::text
      and u.ativa = true
      and e.publicado = true
      and e.status = true
  ) then
    raise exception 'A unidade selecionada não está disponível.';
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido precisa ter itens.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_itens) item
    left join public.produtos p
      on p.id::text = item ->> 'produto_id'
    where p.id is null
       or p.empresa_id::text <> p_empresa_id::text
       or p.unidade_id is distinct from p_unidade_id
       or p.disponivel is distinct from true
  ) then
    raise exception 'O carrinho contém produto indisponível ou de outra unidade.';
  end if;

  if p_chave_cliente is not null then
    select p.* into v_existente
    from public.pedidos p
    where p.usuario_id = auth.uid()
      and p.chave_cliente = p_chave_cliente
    limit 1;

    if found and v_existente.unidade_id is distinct from p_unidade_id then
      raise exception 'Este checkout já foi utilizado em outra unidade.';
    end if;
  end if;

  v_resultado := public.criar_pedido_operacional(
    p_empresa_id,
    p_endereco_id,
    p_pagamento,
    p_observacoes,
    p_cupom,
    p_itens,
    p_agendado_para,
    p_chave_cliente
  );

  v_pedido_id := nullif(v_resultado ->> 'id', '')::uuid;
  if v_pedido_id is null then
    raise exception 'O pedido não retornou um identificador válido.';
  end if;

  update public.pedidos
  set unidade_id = p_unidade_id,
      updated_at = now()
  where id = v_pedido_id
    and usuario_id = auth.uid();

  return v_resultado || jsonb_build_object(
    'unidade_id', p_unidade_id,
    'unidade_nome', (
      select u.nome from public.empresa_unidades u where u.id = p_unidade_id
    )
  );
end;
$$;

revoke all on function public.criar_pedido_operacional_unidade(
  text, uuid, uuid, text, text, text, jsonb, timestamptz, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.criar_pedido_operacional_unidade(
  text, uuid, uuid, text, text, text, jsonb, timestamptz, uuid
) to authenticated;

commit;
