-- Multi Delivery 3.2: gestão administrativa avançada.
-- Execute depois de 009_hotfix_painel_admin.sql.

begin;

-- Garante compatibilidade com instalações antigas antes de criar as funções.
alter table public.cupons
  add column if not exists empresa_id text,
  add column if not exists tipo text not null default 'fixo',
  add column if not exists valor numeric(12,2) not null default 0,
  add column if not exists pedido_minimo numeric(12,2) not null default 0,
  add column if not exists limite_usos integer,
  add column if not exists usos integer not null default 0,
  add column if not exists primeiro_pedido boolean not null default false,
  add column if not exists inicio timestamptz not null default now(),
  add column if not exists fim timestamptz,
  add column if not exists max_desconto numeric(12,2),
  add column if not exists limite_por_usuario integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists cupons_admin_listagem_idx
  on public.cupons(ativo, created_at desc);

create or replace function public.admin_salvar_cupom(
  p_codigo text,
  p_tipo text,
  p_valor numeric,
  p_empresa_id text default null,
  p_pedido_minimo numeric default 0,
  p_limite_usos integer default null,
  p_primeiro_pedido boolean default false,
  p_inicio timestamptz default now(),
  p_fim timestamptz default null,
  p_max_desconto numeric default null,
  p_limite_por_usuario integer default 1,
  p_cupom_id uuid default null,
  p_ativo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_tipo text := lower(trim(coalesce(p_tipo, '')));
  v_valor numeric := coalesce(p_valor, 0);
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;
  if v_codigo !~ '^[A-Z0-9_-]{3,30}$' then
    raise exception 'Use de 3 a 30 letras, números, hífen ou sublinhado no código.' using errcode = '22023';
  end if;
  if v_tipo not in ('fixo', 'percentual', 'frete') then
    raise exception 'Tipo de cupom inválido.' using errcode = '22023';
  end if;
  if v_valor < 0 or (v_tipo = 'percentual' and (v_valor <= 0 or v_valor > 100))
     or (v_tipo = 'fixo' and v_valor <= 0) then
    raise exception 'Valor do benefício inválido.' using errcode = '22023';
  end if;
  if coalesce(p_pedido_minimo, 0) < 0 or (p_max_desconto is not null and p_max_desconto < 0) then
    raise exception 'Os valores mínimos não podem ser negativos.' using errcode = '22023';
  end if;
  if p_limite_usos is not null and p_limite_usos < 1 then
    raise exception 'O limite de usos deve ser maior que zero.' using errcode = '22023';
  end if;
  if coalesce(p_limite_por_usuario, 1) < 1 then
    raise exception 'O limite por usuário deve ser maior que zero.' using errcode = '22023';
  end if;
  if p_fim is not null and p_fim <= coalesce(p_inicio, now()) then
    raise exception 'A validade final deve ser posterior ao início.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.cupons c
    where upper(c.codigo) = v_codigo
      and coalesce(c.empresa_id, '*') = coalesce(nullif(p_empresa_id, ''), '*')
      and (p_cupom_id is null or c.id <> p_cupom_id)
  ) then
    raise exception 'Já existe um cupom com este código no mesmo escopo.' using errcode = '23505';
  end if;

  if p_cupom_id is null then
    insert into public.cupons (
      empresa_id, codigo, tipo, valor, pedido_minimo, limite_usos, usos,
      primeiro_pedido, inicio, fim, max_desconto, limite_por_usuario, ativo
    ) values (
      nullif(p_empresa_id, ''), v_codigo, v_tipo,
      case when v_tipo = 'frete' then 0 else v_valor end,
      coalesce(p_pedido_minimo, 0), p_limite_usos, 0,
      coalesce(p_primeiro_pedido, false), coalesce(p_inicio, now()), p_fim,
      p_max_desconto, coalesce(p_limite_por_usuario, 1), coalesce(p_ativo, true)
    ) returning id into v_id;
  else
    update public.cupons
    set empresa_id = nullif(p_empresa_id, ''),
        codigo = v_codigo,
        tipo = v_tipo,
        valor = case when v_tipo = 'frete' then 0 else v_valor end,
        pedido_minimo = coalesce(p_pedido_minimo, 0),
        limite_usos = p_limite_usos,
        primeiro_pedido = coalesce(p_primeiro_pedido, false),
        inicio = coalesce(p_inicio, inicio),
        fim = p_fim,
        max_desconto = p_max_desconto,
        limite_por_usuario = coalesce(p_limite_por_usuario, 1),
        ativo = coalesce(p_ativo, ativo),
        updated_at = now()
    where id = p_cupom_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Cupom não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.admin_auditoria(admin_id, acao, alvo_id, detalhes)
  values (
    auth.uid(),
    case when p_cupom_id is null then 'cupom_criado' else 'cupom_editado' end,
    v_id::text,
    jsonb_build_object('codigo', v_codigo, 'tipo', v_tipo, 'empresa_id', nullif(p_empresa_id, ''))
  );
  return v_id;
end;
$$;

create or replace function public.admin_excluir_cupom(p_cupom_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cupom public.cupons%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;
  select * into v_cupom from public.cupons where id = p_cupom_id;
  if not found then return false; end if;
  insert into public.admin_auditoria(admin_id, acao, alvo_id, detalhes)
  values (auth.uid(), 'cupom_excluido', p_cupom_id::text,
    jsonb_build_object('codigo', v_cupom.codigo, 'empresa_id', v_cupom.empresa_id));
  delete from public.cupons where id = p_cupom_id;
  return found;
end;
$$;

create or replace function public.admin_atualizar_restaurante(
  p_empresa_id uuid,
  p_nome text default null,
  p_email text default null,
  p_telefone text default null,
  p_categoria text default null,
  p_descricao text default null,
  p_taxa_entrega numeric default null,
  p_pedido_minimo numeric default null,
  p_tempo_min integer default null,
  p_tempo_max integer default null,
  p_publicado boolean default null,
  p_status boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;
  if p_nome is not null and length(trim(p_nome)) < 2 then
    raise exception 'Informe um nome válido para o restaurante.' using errcode = '22023';
  end if;
  if coalesce(p_taxa_entrega, 0) < 0 or coalesce(p_pedido_minimo, 0) < 0 then
    raise exception 'Taxa e pedido mínimo não podem ser negativos.' using errcode = '22023';
  end if;
  if p_tempo_min is not null and (p_tempo_min < 5 or p_tempo_min > 240) then
    raise exception 'O tempo mínimo deve ficar entre 5 e 240 minutos.' using errcode = '22023';
  end if;
  if p_tempo_max is not null and (p_tempo_max < coalesce(p_tempo_min, 5) or p_tempo_max > 360) then
    raise exception 'O tempo máximo informado é inválido.' using errcode = '22023';
  end if;

  update public.empresas
  set nome = coalesce(nullif(trim(p_nome), ''), nome),
      email = coalesce(nullif(trim(p_email), ''), email),
      telefone = coalesce(nullif(trim(p_telefone), ''), telefone),
      categoria = coalesce(nullif(trim(p_categoria), ''), categoria),
      descricao = coalesce(p_descricao, descricao),
      taxa_entrega = coalesce(p_taxa_entrega, taxa_entrega),
      pedido_minimo = coalesce(p_pedido_minimo, pedido_minimo),
      tempo_estimado_min = coalesce(p_tempo_min, tempo_estimado_min),
      tempo_estimado_max = coalesce(p_tempo_max, tempo_estimado_max),
      publicado = coalesce(p_publicado, publicado),
      status = coalesce(p_status, status),
      updated_at = now()
  where id = p_empresa_id;

  if found then
    insert into public.admin_auditoria(admin_id, acao, alvo_id, detalhes)
    values (auth.uid(), 'restaurante_editado', p_empresa_id::text,
      jsonb_build_object('nome', p_nome, 'publicado', p_publicado, 'status', p_status));
  end if;
  return found;
end;
$$;

create or replace function public.admin_obter_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;
  select to_jsonb(p) || jsonb_build_object(
    'itens', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at)
      from public.pedido_itens i where i.pedido_id = p.id
    ), '[]'::jsonb),
    'historico', coalesce((
      select jsonb_agg(to_jsonb(h) order by coalesce(h.criado_em, h.created_at))
      from public.historico_status_pedido h where h.pedido_id = p.id
    ), '[]'::jsonb)
  ) into v_resultado
  from public.pedidos p
  where p.id = p_pedido_id;
  return v_resultado;
end;
$$;

revoke all on function public.admin_salvar_cupom(text,text,numeric,text,numeric,integer,boolean,timestamptz,timestamptz,numeric,integer,uuid,boolean) from public, anon, authenticated;
revoke all on function public.admin_excluir_cupom(uuid) from public, anon, authenticated;
revoke all on function public.admin_atualizar_restaurante(uuid,text,text,text,text,text,numeric,numeric,integer,integer,boolean,boolean) from public, anon, authenticated;
revoke all on function public.admin_obter_pedido(uuid) from public, anon, authenticated;
grant execute on function public.admin_salvar_cupom(text,text,numeric,text,numeric,integer,boolean,timestamptz,timestamptz,numeric,integer,uuid,boolean) to authenticated;
grant execute on function public.admin_excluir_cupom(uuid) to authenticated;
grant execute on function public.admin_atualizar_restaurante(uuid,text,text,text,text,text,numeric,numeric,integer,integer,boolean,boolean) to authenticated;
grant execute on function public.admin_obter_pedido(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
