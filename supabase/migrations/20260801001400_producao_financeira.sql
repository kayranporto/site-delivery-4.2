-- Multi Delivery 4.0: endurecimento financeiro, idempotência e checkout atômico.
-- Execute depois de 013_operacao_real.sql.

begin;

-- =========================================================
-- 1) DADOS DE CONCILIAÇÃO E EVENTOS FINANCEIROS
-- =========================================================

alter table public.pedidos
  add column if not exists pagamento_preferencia_id text,
  add column if not exists pagamento_id text,
  add column if not exists pagamento_provider_status text,
  add column if not exists pagamento_valor_confirmado numeric(12,2),
  add column if not exists pagamento_moeda text,
  add column if not exists pagamento_reconciliacao_status text not null default 'nao_iniciada',
  add column if not exists pagamento_reconciliado_em timestamptz;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pedidos'::regclass
      and conname = 'pedidos_reembolso_status_check'
  ) then
    alter table public.pedidos drop constraint pedidos_reembolso_status_check;
  end if;

  alter table public.pedidos add constraint pedidos_reembolso_status_check
    check (reembolso_status in (
      'nao_aplicavel', 'aguardando_pagamento', 'pendente',
      'processando', 'concluido', 'falhou'
    )) not valid;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pedidos'::regclass
      and conname = 'pedidos_pagamento_reconciliacao_check'
  ) then
    alter table public.pedidos add constraint pedidos_pagamento_reconciliacao_check
      check (pagamento_reconciliacao_status in ('nao_iniciada','ok','divergente','erro')) not valid;
  end if;
end $$;

create unique index if not exists pedidos_pagamento_id_unique
  on public.pedidos(pagamento_provider, pagamento_id)
  where pagamento_id is not null;

create unique index if not exists pedidos_pagamento_preferencia_unique
  on public.pedidos(pagamento_provider, pagamento_preferencia_id)
  where pagamento_preferencia_id is not null;

create table if not exists public.pagamento_eventos (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  dedupe_key text not null,
  pedido_id uuid references public.pedidos(id) on delete set null,
  payment_id text,
  preference_id text,
  request_id text,
  provider_status text,
  valor numeric(12,2),
  moeda text,
  processado boolean not null default false,
  erro text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, dedupe_key)
);

create index if not exists pagamento_eventos_pedido_data_idx
  on public.pagamento_eventos(pedido_id, created_at desc);
create index if not exists pagamento_eventos_falhas_idx
  on public.pagamento_eventos(created_at desc)
  where processado = false or erro is not null;

alter table public.pagamento_eventos enable row level security;

drop policy if exists "participantes leem eventos pagamento" on public.pagamento_eventos;
create policy "participantes leem eventos pagamento"
on public.pagamento_eventos for select to authenticated
using (
  exists (
    select 1
    from public.pedidos p
    where p.id = pagamento_eventos.pedido_id
      and (
        p.usuario_id = (select auth.uid())
        or exists (
          select 1 from public.empresas e
          where e.id::text = p.empresa_id and e.usuario_id = (select auth.uid())
        )
        or (select private.is_admin())
      )
  )
);

grant select on public.pagamento_eventos to authenticated;
revoke insert, update, delete on public.pagamento_eventos from anon, authenticated;

-- =========================================================
-- 2) PROTEÇÃO DO PAGAMENTO ONLINE SEM A API DE ROLE DEPRECIADA
-- =========================================================

create or replace function private.proteger_pagamento_online()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.pagamento_modalidade = 'online'
     and new.pagamento_status is distinct from old.pagamento_status
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not private.is_admin() then
    raise exception 'O pagamento online é confirmado exclusivamente pelo provedor.';
  end if;
  return new;
end;
$$;

revoke all on function private.proteger_pagamento_online() from public, anon, authenticated;

-- =========================================================
-- 3) CHECKOUT COM SNAPSHOT ÚNICO DE PREÇOS E ADICIONAIS
-- =========================================================

create or replace function private.criar_pedido_impl(
  p_empresa_id text,
  p_endereco text,
  p_pagamento text,
  p_observacoes text default null,
  p_cupom text default null,
  p_itens jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_empresa record;
  v_item jsonb;
  v_produto record;
  v_grupo record;
  v_quantidade integer;
  v_adicionais jsonb;
  v_adicionais_normalizados jsonb;
  v_adicionais_total numeric(12,2);
  v_solicitados integer;
  v_validos integer;
  v_selecionados integer;
  v_subtotal numeric(12,2) := 0;
  v_taxa numeric(12,2) := 0;
  v_desconto numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_itens_normalizados jsonb := '[]'::jsonb;
  v_pedido public.pedidos%rowtype;
begin
  if v_usuario_id is null then
    raise exception 'Faça login para finalizar o pedido.';
  end if;

  if nullif(trim(p_endereco), '') is null or length(trim(p_endereco)) < 8 then
    raise exception 'Informe um endereço de entrega completo.';
  end if;

  if p_pagamento is null or p_pagamento not in ('PIX', 'Cartão', 'Dinheiro') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido não possui itens.';
  end if;

  select e.id::text as id, e.nome, e.taxa_entrega, e.pedido_minimo
    into v_empresa
  from public.empresas e
  where e.id::text = p_empresa_id and e.status = true
  limit 1;

  if not found then
    raise exception 'O restaurante está fechado ou não foi encontrado.';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    if coalesce(v_item ->> 'quantidade', '') !~ '^[0-9]+$' then
      raise exception 'Quantidade de produto inválida.';
    end if;

    v_quantidade := (v_item ->> 'quantidade')::integer;
    if v_quantidade < 1 or v_quantidade > 99 then
      raise exception 'Quantidade de produto inválida.';
    end if;

    select p.id::text as id,
           p.nome,
           case when coalesce(p.promocao, 0) > 0 then p.promocao else p.preco end as preco
      into v_produto
    from public.produtos p
    where p.id::text = v_item ->> 'produto_id'
      and p.empresa_id::text = p_empresa_id
      and p.disponivel = true
    limit 1
    for share;

    if not found then
      raise exception 'Um produto do carrinho não está mais disponível.';
    end if;

    v_adicionais := coalesce(v_item -> 'adicionais', '[]'::jsonb);
    if jsonb_typeof(v_adicionais) <> 'array' then
      raise exception 'Adicionais inválidos.';
    end if;

    for v_grupo in
      select g.id::text as id,
             g.nome,
             coalesce(g.minimo, 0) as minimo,
             greatest(coalesce(g.maximo, 1), 1) as maximo
      from public.produto_grupos pg
      join public.grupos_adicionais g on g.id::text = pg.grupo_id::text
      where pg.produto_id::text = v_produto.id and g.ativo = true
    loop
      select count(distinct a.id)
        into v_selecionados
      from public.adicionais a
      where a.grupo_id::text = v_grupo.id
        and a.ativo = true
        and a.id::text in (
          select adicional ->> 'id'
          from jsonb_array_elements(v_adicionais) adicional
        );

      if v_selecionados < v_grupo.minimo then
        raise exception 'Selecione pelo menos % opção(ões) em %.', v_grupo.minimo, v_grupo.nome;
      end if;
      if v_selecionados > v_grupo.maximo then
        raise exception 'Selecione no máximo % opção(ões) em %.', v_grupo.maximo, v_grupo.nome;
      end if;
    end loop;

    select count(distinct (adicional ->> 'id'))
      into v_solicitados
    from jsonb_array_elements(v_adicionais) adicional
    where nullif(adicional ->> 'id', '') is not null;

    select count(distinct a.id),
           coalesce(sum(a.preco), 0),
           coalesce(
             jsonb_agg(
               jsonb_build_object('id', a.id::text, 'nome', a.nome, 'preco', a.preco)
               order by a.nome
             ),
             '[]'::jsonb
           )
      into v_validos, v_adicionais_total, v_adicionais_normalizados
    from public.adicionais a
    where a.ativo = true
      and a.id::text in (
        select adicional ->> 'id'
        from jsonb_array_elements(v_adicionais) adicional
      )
      and exists (
        select 1 from public.produto_grupos pg
        where pg.produto_id::text = v_produto.id
          and pg.grupo_id::text = a.grupo_id::text
      );

    if v_solicitados <> v_validos then
      raise exception 'Um adicional selecionado não pertence ao produto.';
    end if;

    v_subtotal := v_subtotal + ((v_produto.preco + v_adicionais_total) * v_quantidade);
    v_itens_normalizados := v_itens_normalizados || jsonb_build_array(
      jsonb_build_object(
        'produto_id', v_produto.id,
        'nome_produto', v_produto.nome,
        'preco_unitario', v_produto.preco,
        'quantidade', v_quantidade,
        'observacao', nullif(left(trim(coalesce(v_item ->> 'observacao', '')), 300), ''),
        'adicionais', v_adicionais_normalizados
      )
    );
  end loop;

  if v_subtotal < coalesce(v_empresa.pedido_minimo, 0) then
    raise exception 'O pedido mínimo deste restaurante é R$ %.',
      to_char(coalesce(v_empresa.pedido_minimo, 0), 'FM999999990D00');
  end if;

  v_taxa := coalesce(v_empresa.taxa_entrega, 0);
  case upper(trim(coalesce(p_cupom, '')))
    when 'BEMVINDO20' then v_desconto := round(v_subtotal * 0.20, 2);
    when 'DELIVERY10' then v_desconto := least(10, v_subtotal);
    when 'FRETEGRATIS' then v_desconto := v_taxa;
    else v_desconto := 0;
  end case;
  v_total := greatest(0, v_subtotal + v_taxa - v_desconto);

  insert into public.pedidos (
    usuario_id, empresa_id, empresa_nome, endereco, pagamento, observacoes,
    subtotal, taxa_entrega, desconto, cupom, total, status
  ) values (
    v_usuario_id, v_empresa.id, coalesce(v_empresa.nome, 'Restaurante'),
    left(trim(p_endereco), 500), p_pagamento,
    nullif(left(trim(coalesce(p_observacoes, '')), 500), ''),
    v_subtotal, v_taxa, v_desconto,
    nullif(upper(trim(coalesce(p_cupom, ''))), ''), v_total, 'recebido'
  ) returning * into v_pedido;

  for v_item in select value from jsonb_array_elements(v_itens_normalizados)
  loop
    insert into public.pedido_itens (
      pedido_id, produto_id, nome_produto, preco_unitario,
      quantidade, observacao, adicionais
    ) values (
      v_pedido.id,
      v_item ->> 'produto_id',
      v_item ->> 'nome_produto',
      (v_item ->> 'preco_unitario')::numeric,
      (v_item ->> 'quantidade')::integer,
      v_item ->> 'observacao',
      coalesce(v_item -> 'adicionais', '[]'::jsonb)
    );
  end loop;

  return jsonb_build_object(
    'id', v_pedido.id,
    'numero', v_pedido.numero,
    'status', v_pedido.status,
    'created_at', v_pedido.created_at,
    'subtotal', v_pedido.subtotal,
    'taxa_entrega', v_pedido.taxa_entrega,
    'desconto', v_pedido.desconto,
    'total', v_pedido.total
  );
end;
$$;

revoke all on function private.criar_pedido_impl(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function private.criar_pedido_impl(text, text, text, text, text, jsonb)
  to authenticated;

-- =========================================================
-- 4) CANCELAMENTO SEM CORRIDA COM PAGAMENTO E DEVOLUÇÃO DE CUPOM
-- =========================================================

create or replace function private.restaurar_estoque_cancelamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_cupom_id uuid;
begin
  if new.status = 'cancelado'
     and old.status <> 'cancelado'
     and not coalesce(old.estoque_devolvido, false) then
    for v_item in
      select produto_id, quantidade
      from public.pedido_itens
      where pedido_id = old.id
    loop
      update public.produtos
      set estoque = estoque + v_item.quantidade,
          disponivel = true,
          updated_at = now()
      where id::text = v_item.produto_id and controle_estoque;
    end loop;

    update public.fidelidade_resgates
    set status = 'disponivel'
    where usuario_id = old.usuario_id
      and empresa_id = old.empresa_id
      and upper(codigo) = upper(coalesce(old.cupom, ''))
      and status = 'usado';

    if nullif(trim(coalesce(old.cupom, '')), '') is not null then
      select c.id into v_cupom_id
      from public.cupons c
      where upper(c.codigo) = upper(old.cupom)
        and (c.empresa_id = old.empresa_id or c.empresa_id is null)
      order by (c.empresa_id = old.empresa_id) desc
      limit 1
      for update;

      if v_cupom_id is not null then
        update public.cupons
        set usos = greatest(usos - 1, 0), updated_at = now()
        where id = v_cupom_id;
      end if;
    end if;

    new.estoque_devolvido := true;
  end if;
  return new;
end;
$$;

revoke all on function private.restaurar_estoque_cancelamento() from public, anon, authenticated;

create or replace function public.empresa_decidir_cancelamento(
  p_pedido_id uuid,
  p_aprovar boolean,
  p_observacao text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_autorizado boolean;
begin
  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then raise exception 'Pedido não encontrado.'; end if;

  select exists(
    select 1 from public.empresas e
    where e.id::text = v_pedido.empresa_id and e.usuario_id = auth.uid()
  ) or private.is_admin()
  into v_autorizado;

  if not v_autorizado then raise exception 'Acesso não autorizado.'; end if;
  if v_pedido.cancelamento_status <> 'solicitado' then
    raise exception 'Não há solicitação pendente.';
  end if;

  if p_aprovar then
    update public.pedidos
    set cancelamento_status = 'aprovado',
        cancelamento_decidido_em = now(),
        cancelamento_observacao = nullif(left(trim(coalesce(p_observacao, '')), 500), ''),
        reembolso_status = case
          when pagamento_modalidade = 'online' and pagamento_status = 'pago' then 'pendente'
          when pagamento_modalidade = 'online' and pagamento_status = 'pendente' then 'aguardando_pagamento'
          when pagamento_modalidade = 'online' and pagamento_status = 'estornado' then 'concluido'
          else 'nao_aplicavel'
        end,
        status = 'cancelado',
        updated_at = now()
    where id = p_pedido_id;
  else
    update public.pedidos
    set cancelamento_status = 'recusado',
        cancelamento_decidido_em = now(),
        cancelamento_observacao = nullif(left(trim(coalesce(p_observacao, '')), 500), ''),
        updated_at = now()
    where id = p_pedido_id;
  end if;

  insert into public.notificacoes(usuario_id, pedido_id, titulo, mensagem, tipo)
  values (
    v_pedido.usuario_id,
    p_pedido_id,
    case when p_aprovar then 'Cancelamento aprovado' else 'Cancelamento recusado' end,
    case when p_aprovar
      then 'Seu pedido foi cancelado. Se o pagamento online for confirmado, o reembolso será aberto automaticamente.'
      else 'O restaurante não aprovou o cancelamento. Consulte o suporte se precisar.'
    end,
    'cancelamento'
  );

  return true;
end;
$$;

revoke all on function public.empresa_decidir_cancelamento(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.empresa_decidir_cancelamento(uuid, boolean, text)
  to authenticated;

-- =========================================================
-- 5) REGISTRO DE PREFERÊNCIA E RECONCILIAÇÃO IDEMPOTENTE
-- =========================================================

create or replace function public.registrar_preferencia_pagamento(
  p_pedido_id uuid,
  p_usuario_id uuid,
  p_preference_id text,
  p_checkout_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Operação restrita ao serviço de pagamento.' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_preference_id, '')), '') is null
     or nullif(trim(coalesce(p_checkout_url, '')), '') is null then
    raise exception 'Preferência de pagamento inválida.';
  end if;

  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id and usuario_id = p_usuario_id
  for update;

  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_pedido.status = 'cancelado' then raise exception 'Pedido cancelado não pode ser pago.'; end if;
  if v_pedido.pagamento_status <> 'pendente' then raise exception 'Pedido não está pendente de pagamento.'; end if;

  if v_pedido.pagamento_preferencia_id is not null
     and v_pedido.pagamento_preferencia_id <> p_preference_id then
    raise exception 'O pedido já possui outra preferência de pagamento.';
  end if;

  update public.pedidos
  set pagamento_modalidade = 'online',
      pagamento_provider = 'mercado_pago',
      pagamento_preferencia_id = p_preference_id,
      pagamento_referencia = p_preference_id,
      pagamento_url = p_checkout_url,
      pagamento_provider_status = 'preference_created',
      pagamento_reconciliacao_status = 'nao_iniciada',
      pagamento_atualizado_em = now(),
      updated_at = now()
  where id = p_pedido_id;

  return jsonb_build_object(
    'pedido_id', p_pedido_id,
    'preference_id', p_preference_id,
    'checkout_url', p_checkout_url
  );
end;
$$;

revoke all on function public.registrar_preferencia_pagamento(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_preferencia_pagamento(uuid, uuid, text, text)
  to service_role;

create or replace function public.reconciliar_pagamento_mercado_pago(
  p_pedido_id uuid,
  p_payment_id text,
  p_provider_status text,
  p_amount numeric,
  p_currency text,
  p_dedupe_key text,
  p_preference_id text default null,
  p_request_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento_id uuid;
  v_pedido public.pedidos%rowtype;
  v_novo_status text;
  v_novo_reembolso text;
  v_erro text;
  v_status_anterior text;
  v_final_sem_cobranca boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Operação restrita ao serviço de pagamento.' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_payment_id, '')), '') is null
     or nullif(trim(coalesce(p_provider_status, '')), '') is null
     or nullif(trim(coalesce(p_dedupe_key, '')), '') is null then
    raise exception 'Evento de pagamento incompleto.';
  end if;

  insert into public.pagamento_eventos(
    provider, dedupe_key, pedido_id, payment_id, preference_id,
    request_id, provider_status, valor, moeda, payload
  ) values (
    'mercado_pago', left(p_dedupe_key, 240), p_pedido_id,
    left(p_payment_id, 160), nullif(left(coalesce(p_preference_id, ''), 160), ''),
    nullif(left(coalesce(p_request_id, ''), 160), ''),
    left(p_provider_status, 80), p_amount,
    upper(left(coalesce(p_currency, ''), 8)), coalesce(p_payload, '{}'::jsonb)
  )
  on conflict(provider, dedupe_key) do nothing
  returning id into v_evento_id;

  if v_evento_id is null then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;

  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    v_erro := 'Pedido não encontrado para a referência externa.';
  elsif exists (
    select 1 from public.pedidos p
    where p.pagamento_provider = 'mercado_pago'
      and p.pagamento_id = p_payment_id
      and p.id <> p_pedido_id
  ) then
    v_erro := 'Identificador de pagamento já associado a outro pedido.';
  elsif v_pedido.pagamento_id is not null
        and v_pedido.pagamento_id <> p_payment_id then
    v_erro := 'Pedido já associado a outro pagamento.';
  elsif lower(p_provider_status) in ('approved','refunded','charged_back')
        and (
          p_amount is null
          or abs(p_amount - v_pedido.total) > 0.01
          or upper(coalesce(p_currency, '')) <> 'BRL'
        ) then
    v_erro := 'Valor ou moeda do pagamento diverge do pedido.';
  end if;

  if v_erro is not null then
    update public.pagamento_eventos
    set erro = v_erro, processed_at = now()
    where id = v_evento_id;

    if found and v_pedido.id is not null then
      update public.pedidos
      set pagamento_reconciliacao_status = 'divergente',
          pagamento_provider_status = left(p_provider_status, 80),
          pagamento_atualizado_em = now(),
          updated_at = now()
      where id = p_pedido_id;
    end if;

    return jsonb_build_object('ok', false, 'erro', v_erro);
  end if;

  v_status_anterior := v_pedido.pagamento_status;
  v_final_sem_cobranca := lower(p_provider_status) in ('rejected','cancelled','canceled','expired');

  if v_pedido.pagamento_status = 'estornado' then
    v_novo_status := 'estornado';
  elsif lower(p_provider_status) in ('refunded','charged_back') then
    v_novo_status := 'estornado';
  elsif v_pedido.pagamento_status = 'pago' then
    v_novo_status := 'pago';
  elsif lower(p_provider_status) = 'approved' then
    v_novo_status := 'pago';
  else
    v_novo_status := 'pendente';
  end if;

  v_novo_reembolso := v_pedido.reembolso_status;
  if v_novo_status = 'estornado' then
    v_novo_reembolso := 'concluido';
  elsif v_novo_status = 'pago' and v_pedido.status = 'cancelado' then
    v_novo_reembolso := 'pendente';
  elsif v_novo_status = 'pendente'
        and v_pedido.status = 'cancelado'
        and v_pedido.reembolso_status = 'aguardando_pagamento'
        and v_final_sem_cobranca then
    v_novo_reembolso := 'nao_aplicavel';
  end if;

  update public.pedidos
  set pagamento_status = v_novo_status,
      pagamento_modalidade = 'online',
      pagamento_provider = 'mercado_pago',
      pagamento_preferencia_id = coalesce(
        nullif(p_preference_id, ''), pagamento_preferencia_id
      ),
      pagamento_id = p_payment_id,
      pagamento_referencia = p_payment_id,
      pagamento_provider_status = left(p_provider_status, 80),
      pagamento_valor_confirmado = p_amount,
      pagamento_moeda = upper(coalesce(p_currency, '')),
      pagamento_reconciliacao_status = 'ok',
      pagamento_reconciliado_em = now(),
      pagamento_atualizado_em = now(),
      reembolso_status = v_novo_reembolso,
      updated_at = now()
  where id = p_pedido_id;

  update public.pagamento_eventos
  set processado = true, processed_at = now()
  where id = v_evento_id;

  if v_status_anterior is distinct from v_novo_status then
    insert into public.notificacoes(usuario_id, pedido_id, titulo, mensagem, tipo)
    values (
      v_pedido.usuario_id,
      p_pedido_id,
      case v_novo_status
        when 'pago' then 'Pagamento confirmado'
        when 'estornado' then 'Pagamento estornado'
        else 'Pagamento atualizado'
      end,
      case
        when v_novo_status = 'pago' and v_pedido.status = 'cancelado'
          then 'O pagamento foi confirmado após o cancelamento e o reembolso foi aberto automaticamente.'
        when v_novo_status = 'pago'
          then 'O pagamento online do seu pedido foi confirmado.'
        when v_novo_status = 'estornado'
          then 'O estorno do pagamento foi confirmado.'
        else 'O status do pagamento foi atualizado.'
      end,
      'pagamento'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicado', false,
    'pagamento_status', v_novo_status,
    'reembolso_status', v_novo_reembolso
  );
end;
$$;

revoke all on function public.reconciliar_pagamento_mercado_pago(
  uuid, text, text, numeric, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.reconciliar_pagamento_mercado_pago(
  uuid, text, text, numeric, text, text, text, text, jsonb
) to service_role;

-- =========================================================
-- 6) REEMBOLSO REAL PELO PAINEL ADMINISTRATIVO
-- =========================================================

create or replace function public.admin_preparar_reembolso(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_pedido.pagamento_modalidade <> 'online'
     or v_pedido.pagamento_status <> 'pago'
     or nullif(v_pedido.pagamento_id, '') is null then
    raise exception 'O pedido não possui pagamento online confirmado para reembolso.';
  end if;
  if v_pedido.reembolso_status not in ('pendente','falhou','processando') then
    raise exception 'O pedido não possui reembolso pendente.';
  end if;

  update public.pedidos
  set reembolso_status = 'processando', updated_at = now()
  where id = p_pedido_id;

  insert into public.admin_auditoria(admin_id, acao, alvo_id, detalhes)
  values (
    auth.uid(), 'iniciar_reembolso', p_pedido_id::text,
    jsonb_build_object('payment_id', v_pedido.pagamento_id, 'valor', v_pedido.total)
  );

  return jsonb_build_object(
    'pedido_id', v_pedido.id,
    'payment_id', v_pedido.pagamento_id,
    'preference_id', v_pedido.pagamento_preferencia_id,
    'valor', v_pedido.total,
    'moeda', coalesce(v_pedido.pagamento_moeda, 'BRL')
  );
end;
$$;

revoke all on function public.admin_preparar_reembolso(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_preparar_reembolso(uuid)
  to authenticated;

create or replace function public.servico_marcar_falha_reembolso(
  p_pedido_id uuid,
  p_erro text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Operação restrita ao serviço de pagamento.' using errcode = '42501';
  end if;

  update public.pedidos
  set reembolso_status = 'falhou',
      pagamento_reconciliacao_status = 'erro',
      updated_at = now()
  where id = p_pedido_id
  returning usuario_id into v_usuario;

  if not found then return false; end if;

  insert into public.notificacoes(usuario_id, pedido_id, titulo, mensagem, tipo)
  values (
    v_usuario, p_pedido_id, 'Reembolso em análise',
    'Não foi possível concluir o reembolso automaticamente. A administração foi avisada.',
    'pagamento'
  );

  insert into public.app_logs(usuario_id, nivel, contexto, mensagem, pagina, detalhes)
  values (
    v_usuario, 'error', 'reembolso_mercado_pago',
    left(coalesce(p_erro, 'Falha no reembolso'), 500),
    'edge-function', jsonb_build_object('pedido_id', p_pedido_id)
  );

  return true;
end;
$$;

revoke all on function public.servico_marcar_falha_reembolso(uuid, text)
  from public, anon, authenticated;
grant execute on function public.servico_marcar_falha_reembolso(uuid, text)
  to service_role;

create or replace function public.admin_conciliacao_pagamentos(p_limite integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'pedidos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at)
      from (
        select p.id, p.numero, p.empresa_nome, p.cliente_nome, p.total,
               p.status, p.pagamento_status, p.pagamento_provider_status,
               p.pagamento_reconciliacao_status, p.reembolso_status,
               p.pagamento_id, p.pagamento_preferencia_id, p.updated_at
        from public.pedidos p
        where p.pagamento_modalidade = 'online'
          and (
            p.pagamento_reconciliacao_status in ('divergente','erro')
            or (p.pagamento_status = 'pendente' and p.created_at < now() - interval '30 minutes')
            or p.reembolso_status in ('aguardando_pagamento','pendente','processando','falhou')
          )
        order by p.updated_at
        limit greatest(1, least(coalesce(p_limite, 100), 500))
      ) x
    ), '[]'::jsonb),
    'eventos_com_erro', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from (
        select id, pedido_id, payment_id, provider_status, erro, created_at
        from public.pagamento_eventos
        where processado = false or erro is not null
        order by created_at desc
        limit 100
      ) e
    ), '[]'::jsonb),
    'gerado_em', now()
  );
end;
$$;

revoke all on function public.admin_conciliacao_pagamentos(integer)
  from public, anon, authenticated;
grant execute on function public.admin_conciliacao_pagamentos(integer)
  to authenticated;

create or replace function public.admin_saude_operacao()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.';
  end if;

  return jsonb_build_object(
    'chamados_abertos', (select count(*) from public.chamados_suporte where status in ('aberto','em_analise')),
    'cancelamentos_pendentes', (select count(*) from public.pedidos where cancelamento_status = 'solicitado'),
    'reembolsos_pendentes', (select count(*) from public.pedidos where reembolso_status in ('aguardando_pagamento','pendente','processando','falhou')),
    'pagamentos_divergentes', (select count(*) from public.pedidos where pagamento_reconciliacao_status in ('divergente','erro')),
    'produtos_estoque_baixo', (select count(*) from public.produtos where controle_estoque and estoque <= estoque_minimo),
    'restaurantes_pausados', (select count(distinct empresa_id) from public.empresa_pausas where now() >= inicio and now() < fim),
    'gerado_em', now()
  );
end;
$$;

revoke all on function public.admin_saude_operacao() from public, anon, authenticated;
grant execute on function public.admin_saude_operacao() to authenticated;

notify pgrst, 'reload schema';
commit;
