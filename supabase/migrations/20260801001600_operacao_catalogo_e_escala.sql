-- Multi Delivery 4.2: variações, cozinha, idempotência do checkout,
-- auditoria de estoque e fundação para múltiplas unidades.

begin;

-- =========================================================
-- 1) MÚLTIPLAS UNIDADES: FUNDAÇÃO COMPATÍVEL COM O MODELO ATUAL
-- =========================================================

create table if not exists public.empresa_unidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  nome text not null default 'Unidade principal',
  slug text,
  endereco text,
  cidade text,
  uf text,
  telefone text,
  ativa boolean not null default true,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists empresa_unidades_slug_idx
  on public.empresa_unidades(empresa_id, lower(slug)) where slug is not null;
create unique index if not exists empresa_unidades_principal_idx
  on public.empresa_unidades(empresa_id) where principal;
create index if not exists empresa_unidades_empresa_idx
  on public.empresa_unidades(empresa_id, ativa, nome);

alter table public.empresa_unidades enable row level security;

drop policy if exists "proprietario le unidades" on public.empresa_unidades;
create policy "proprietario le unidades" on public.empresa_unidades
for select to authenticated
using (exists (
  select 1 from public.empresas e
  where e.id::text = empresa_unidades.empresa_id::text
    and e.usuario_id = (select auth.uid())
));

drop policy if exists "proprietario gerencia unidades" on public.empresa_unidades;
create policy "proprietario gerencia unidades" on public.empresa_unidades
for all to authenticated
using (exists (
  select 1 from public.empresas e
  where e.id::text = empresa_unidades.empresa_id::text
    and e.usuario_id = (select auth.uid())
))
with check (exists (
  select 1 from public.empresas e
  where e.id::text = empresa_unidades.empresa_id::text
    and e.usuario_id = (select auth.uid())
));

grant select, insert, update, delete on public.empresa_unidades to authenticated;

insert into public.empresa_unidades(empresa_id, nome, slug, telefone, principal)
select e.id::text, 'Unidade principal', 'principal', e.telefone, true
from public.empresas e
where not exists (
  select 1 from public.empresa_unidades u where u.empresa_id::text = e.id::text
)
on conflict do nothing;

alter table public.produtos add column if not exists unidade_id uuid references public.empresa_unidades(id) on delete set null;
alter table public.categorias add column if not exists unidade_id uuid references public.empresa_unidades(id) on delete set null;
alter table public.pedidos add column if not exists unidade_id uuid references public.empresa_unidades(id) on delete set null;

create index if not exists produtos_unidade_idx on public.produtos(unidade_id, disponivel);
create index if not exists categorias_unidade_idx on public.categorias(unidade_id, ativo, ordem);
create index if not exists pedidos_unidade_idx on public.pedidos(unidade_id, created_at desc);

update public.produtos p
set unidade_id = u.id
from public.empresa_unidades u
where p.unidade_id is null and u.empresa_id::text = p.empresa_id::text and u.principal;

update public.categorias c
set unidade_id = u.id
from public.empresa_unidades u
where c.unidade_id is null and u.empresa_id::text = c.empresa_id::text and u.principal;

update public.pedidos p
set unidade_id = u.id
from public.empresa_unidades u
where p.unidade_id is null and u.empresa_id::text = p.empresa_id::text and u.principal;

create or replace function private.criar_unidade_principal_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.empresa_unidades(empresa_id, nome, slug, telefone, principal)
  values (new.id::text, 'Unidade principal', 'principal', new.telefone, true)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.criar_unidade_principal_empresa() from public, anon, authenticated;
drop trigger if exists criar_unidade_principal_empresa on public.empresas;
create trigger criar_unidade_principal_empresa
after insert on public.empresas
for each row execute function private.criar_unidade_principal_empresa();

create or replace function private.atribuir_unidade_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unidade_id is null and nullif(new.empresa_id::text, '') is not null then
    select u.id into new.unidade_id
    from public.empresa_unidades u
    where u.empresa_id::text = new.empresa_id::text and u.principal
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function private.atribuir_unidade_principal() from public, anon, authenticated;
drop trigger if exists atribuir_unidade_produto on public.produtos;
create trigger atribuir_unidade_produto before insert on public.produtos
for each row execute function private.atribuir_unidade_principal();
drop trigger if exists atribuir_unidade_categoria on public.categorias;
create trigger atribuir_unidade_categoria before insert on public.categorias
for each row execute function private.atribuir_unidade_principal();
drop trigger if exists atribuir_unidade_pedido on public.pedidos;
create trigger atribuir_unidade_pedido before insert on public.pedidos
for each row execute function private.atribuir_unidade_principal();

-- =========================================================
-- 2) VARIAÇÕES DE PRODUTO
-- =========================================================

create table if not exists public.produto_variantes (
  id uuid primary key default gen_random_uuid(),
  produto_id text not null,
  nome text not null,
  preco numeric(12,2) not null default 0 check (preco >= 0),
  promocao numeric(12,2) check (promocao is null or promocao >= 0),
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists produto_variantes_produto_idx
  on public.produto_variantes(produto_id, ativo, ordem, nome);
create unique index if not exists produto_variantes_nome_idx
  on public.produto_variantes(produto_id, lower(nome));

alter table public.produto_variantes enable row level security;

drop policy if exists "catalogo variantes publico" on public.produto_variantes;
create policy "catalogo variantes publico" on public.produto_variantes
for select to anon, authenticated
using (ativo = true and exists (
  select 1 from public.produtos p
  where p.id::text = produto_variantes.produto_id::text and p.disponivel = true
));

drop policy if exists "proprietario le variantes" on public.produto_variantes;
create policy "proprietario le variantes" on public.produto_variantes
for select to authenticated
using (exists (
  select 1
  from public.produtos p
  join public.empresas e on e.id::text = p.empresa_id::text
  where p.id::text = produto_variantes.produto_id::text
    and e.usuario_id = (select auth.uid())
));

drop policy if exists "proprietario gerencia variantes" on public.produto_variantes;
create policy "proprietario gerencia variantes" on public.produto_variantes
for all to authenticated
using (exists (
  select 1
  from public.produtos p
  join public.empresas e on e.id::text = p.empresa_id::text
  where p.id::text = produto_variantes.produto_id::text
    and e.usuario_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.produtos p
  join public.empresas e on e.id::text = p.empresa_id::text
  where p.id::text = produto_variantes.produto_id::text
    and e.usuario_id = (select auth.uid())
));

grant select on public.produto_variantes to anon, authenticated;
grant insert, update, delete on public.produto_variantes to authenticated;

alter table public.pedido_itens
  add column if not exists variante_id text,
  add column if not exists variante_nome text;

-- =========================================================
-- 3) COZINHA, SLA E PROTEÇÃO CONTRA PEDIDO DUPLICADO
-- =========================================================

alter table public.pedidos
  add column if not exists preparo_estimado_minutos integer not null default 30,
  add column if not exists preparo_iniciado_em timestamptz,
  add column if not exists pronto_em timestamptz,
  add column if not exists retirado_em timestamptz,
  add column if not exists entregue_em timestamptz,
  add column if not exists prioridade smallint not null default 0,
  add column if not exists cozinha_observacao text,
  add column if not exists chave_cliente uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_preparo_estimado_check' and conrelid = 'public.pedidos'::regclass) then
    alter table public.pedidos add constraint pedidos_preparo_estimado_check
      check (preparo_estimado_minutos between 5 and 240) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_prioridade_check' and conrelid = 'public.pedidos'::regclass) then
    alter table public.pedidos add constraint pedidos_prioridade_check
      check (prioridade between 0 and 3) not valid;
  end if;
end $$;

create unique index if not exists pedidos_chave_cliente_idx
  on public.pedidos(usuario_id, chave_cliente) where chave_cliente is not null;
create index if not exists pedidos_cozinha_idx
  on public.pedidos(empresa_id, status, pronto_em, prioridade desc, created_at)
  where status in ('recebido', 'preparando');

create or replace function public.empresa_atualizar_operacao_pedido(
  p_pedido_id uuid,
  p_acao text,
  p_preparo_estimado integer default null,
  p_observacao text default null
)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  select p.* into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
    and exists (
      select 1 from public.empresas e
      where e.id::text = p.empresa_id::text and e.usuario_id = auth.uid()
    )
  for update;

  if not found then raise exception 'Pedido não encontrado para este restaurante.'; end if;

  if p_preparo_estimado is not null and (p_preparo_estimado < 5 or p_preparo_estimado > 240) then
    raise exception 'O tempo de preparo deve ficar entre 5 e 240 minutos.';
  end if;

  case p_acao
    when 'iniciar_preparo' then
      if v_pedido.status <> 'recebido' then raise exception 'O pedido não pode iniciar preparo neste estado.'; end if;
      update public.pedidos
      set status = 'preparando',
          preparo_iniciado_em = coalesce(preparo_iniciado_em, now()),
          preparo_estimado_minutos = coalesce(p_preparo_estimado, preparo_estimado_minutos, 30),
          cozinha_observacao = coalesce(nullif(left(trim(coalesce(p_observacao, '')), 500), ''), cozinha_observacao),
          pronto_em = null,
          updated_at = now()
      where id = p_pedido_id
      returning * into v_pedido;

    when 'marcar_pronto' then
      if v_pedido.status <> 'preparando' then raise exception 'Somente pedidos em preparo podem ser marcados como prontos.'; end if;
      update public.pedidos
      set pronto_em = coalesce(pronto_em, now()),
          preparo_iniciado_em = coalesce(preparo_iniciado_em, created_at),
          cozinha_observacao = coalesce(nullif(left(trim(coalesce(p_observacao, '')), 500), ''), cozinha_observacao),
          updated_at = now()
      where id = p_pedido_id
      returning * into v_pedido;

    when 'reabrir_preparo' then
      if v_pedido.status <> 'preparando' or v_pedido.pronto_em is null then
        raise exception 'Este pedido não está marcado como pronto.';
      end if;
      update public.pedidos set pronto_em = null, updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'enviar_entrega' then
      if v_pedido.status <> 'preparando' or v_pedido.pronto_em is null then
        raise exception 'Marque o pedido como pronto antes de enviar para entrega.';
      end if;
      if v_pedido.entregador_id is not null then
        raise exception 'O entregador atribuído deve confirmar a retirada pelo aplicativo.';
      end if;
      update public.pedidos
      set status = 'saiu_para_entrega', retirado_em = coalesce(retirado_em, now()), updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'confirmar_entrega' then
      if v_pedido.status <> 'saiu_para_entrega' then
        raise exception 'Somente pedidos em entrega podem ser concluídos.';
      end if;
      if v_pedido.entregador_id is not null then
        raise exception 'O entregador atribuído deve confirmar a entrega pelo aplicativo.';
      end if;
      update public.pedidos
      set status = 'entregue', entregue_em = coalesce(entregue_em, now()), updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'definir_prioridade' then
      update public.pedidos
      set prioridade = greatest(0, least(3, coalesce(p_preparo_estimado, 0)))::smallint,
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    else raise exception 'Ação operacional inválida.';
  end case;

  return v_pedido;
end;
$$;

revoke all on function public.empresa_atualizar_operacao_pedido(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.empresa_atualizar_operacao_pedido(uuid, text, integer, text)
  to authenticated;

-- =========================================================
-- 4) AUDITORIA DE ESTOQUE
-- =========================================================

create table if not exists public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  produto_id text not null,
  quantidade_anterior integer not null,
  quantidade_nova integer not null,
  delta integer not null,
  tipo text not null check (tipo in ('entrada','saida','ajuste')),
  motivo text not null default 'alteracao_de_estoque',
  usuario_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists estoque_movimentos_empresa_idx
  on public.estoque_movimentos(empresa_id, created_at desc);
create index if not exists estoque_movimentos_produto_idx
  on public.estoque_movimentos(produto_id, created_at desc);

alter table public.estoque_movimentos enable row level security;

drop policy if exists "proprietario le movimentos estoque" on public.estoque_movimentos;
create policy "proprietario le movimentos estoque" on public.estoque_movimentos
for select to authenticated
using (exists (
  select 1 from public.empresas e
  where e.id::text = estoque_movimentos.empresa_id::text
    and e.usuario_id = (select auth.uid())
));

grant select on public.estoque_movimentos to authenticated;

create or replace function private.registrar_movimento_estoque()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior integer := case when tg_op = 'INSERT' then 0 else coalesce(old.estoque, 0) end;
  v_novo integer := coalesce(new.estoque, 0);
  v_delta integer;
begin
  if not coalesce(new.controle_estoque, false) then return new; end if;
  if tg_op = 'UPDATE' and v_anterior = v_novo then return new; end if;
  if tg_op = 'INSERT' and v_novo = 0 then return new; end if;

  v_delta := v_novo - v_anterior;
  insert into public.estoque_movimentos(
    empresa_id, produto_id, quantidade_anterior, quantidade_nova,
    delta, tipo, motivo, usuario_id
  ) values (
    new.empresa_id::text, new.id::text, v_anterior, v_novo,
    v_delta,
    case when v_delta > 0 then 'entrada' when v_delta < 0 then 'saida' else 'ajuste' end,
    case when tg_op = 'INSERT' then 'estoque_inicial' else 'alteracao_de_estoque' end,
    auth.uid()
  );
  return new;
end;
$$;

revoke all on function private.registrar_movimento_estoque() from public, anon, authenticated;
drop trigger if exists registrar_movimento_estoque on public.produtos;
create trigger registrar_movimento_estoque
after insert or update of estoque on public.produtos
for each row execute function private.registrar_movimento_estoque();

-- =========================================================
-- 5) CRIAÇÃO DE PEDIDO COM VARIAÇÃO E SNAPSHOT ÚNICO
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
  v_variante_id text;
  v_variante_nome text;
  v_grupo record;
  v_quantidade integer;
  v_adicionais jsonb;
  v_adicionais_normalizados jsonb;
  v_adicionais_total numeric(12,2);
  v_solicitados integer;
  v_validos integer;
  v_selecionados integer;
  v_preco_unitario numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_taxa numeric(12,2) := 0;
  v_desconto numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_itens_normalizados jsonb := '[]'::jsonb;
  v_pedido public.pedidos%rowtype;
begin
  if v_usuario_id is null then raise exception 'Faça login para finalizar o pedido.'; end if;
  if nullif(trim(p_endereco), '') is null or length(trim(p_endereco)) < 8 then
    raise exception 'Informe um endereço de entrega completo.';
  end if;
  if p_pagamento is null or p_pagamento not in ('PIX', 'Cartão', 'Dinheiro') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido não possui itens.';
  end if;

  select e.id::text as id, e.nome, e.taxa_entrega, e.pedido_minimo,
         (select u.id from public.empresa_unidades u
          where u.empresa_id::text = e.id::text and u.principal limit 1) as unidade_id
    into v_empresa
  from public.empresas e
  where e.id::text = p_empresa_id and e.status = true
  limit 1;
  if not found then raise exception 'O restaurante está fechado ou não foi encontrado.'; end if;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    if coalesce(v_item ->> 'quantidade', '') !~ '^[0-9]+$' then raise exception 'Quantidade de produto inválida.'; end if;
    v_quantidade := (v_item ->> 'quantidade')::integer;
    if v_quantidade < 1 or v_quantidade > 99 then raise exception 'Quantidade de produto inválida.'; end if;

    select p.id::text as id, p.nome,
           case when coalesce(p.promocao, 0) > 0 then p.promocao else p.preco end as preco
      into v_produto
    from public.produtos p
    where p.id::text = v_item ->> 'produto_id'
      and p.empresa_id::text = p_empresa_id
      and p.disponivel = true
    limit 1
    for share;
    if not found then raise exception 'Um produto do carrinho não está mais disponível.'; end if;

    v_variante_id := nullif(v_item ->> 'variante_id', '');
    if exists (
      select 1 from public.produto_variantes pv
      where pv.produto_id::text = v_produto.id and pv.ativo
    ) then
      if v_variante_id is null then raise exception 'Escolha uma variação para %.', v_produto.nome; end if;
      select pv.id::text, pv.nome,
             case when coalesce(pv.promocao, 0) > 0 then pv.promocao else pv.preco end
        into v_variante_id, v_variante_nome, v_preco_unitario
      from public.produto_variantes pv
      where pv.id::text = v_variante_id
        and pv.produto_id::text = v_produto.id
        and pv.ativo
      limit 1
      for share;
      if not found then raise exception 'A variação selecionada não está mais disponível.'; end if;
    else
      if v_variante_id is not null then raise exception 'A variação selecionada não pertence ao produto.'; end if;
      v_variante_id := null;
      v_variante_nome := null;
      v_preco_unitario := v_produto.preco;
    end if;

    v_adicionais := coalesce(v_item -> 'adicionais', '[]'::jsonb);
    if jsonb_typeof(v_adicionais) <> 'array' then raise exception 'Adicionais inválidos.'; end if;

    for v_grupo in
      select g.id::text as id, g.nome, coalesce(g.minimo, 0) as minimo,
             greatest(coalesce(g.maximo, 1), 1) as maximo
      from public.produto_grupos pg
      join public.grupos_adicionais g on g.id::text = pg.grupo_id::text
      where pg.produto_id::text = v_produto.id and g.ativo = true
    loop
      select count(distinct a.id) into v_selecionados
      from public.adicionais a
      where a.grupo_id::text = v_grupo.id and a.ativo = true
        and a.id::text in (
          select adicional ->> 'id' from jsonb_array_elements(v_adicionais) adicional
        );
      if v_selecionados < v_grupo.minimo then
        raise exception 'Selecione pelo menos % opção(ões) em %.', v_grupo.minimo, v_grupo.nome;
      end if;
      if v_selecionados > v_grupo.maximo then
        raise exception 'Selecione no máximo % opção(ões) em %.', v_grupo.maximo, v_grupo.nome;
      end if;
    end loop;

    select count(distinct (adicional ->> 'id')) into v_solicitados
    from jsonb_array_elements(v_adicionais) adicional
    where nullif(adicional ->> 'id', '') is not null;

    select count(distinct a.id), coalesce(sum(a.preco), 0),
           coalesce(jsonb_agg(
             jsonb_build_object('id', a.id::text, 'nome', a.nome, 'preco', a.preco)
             order by a.nome
           ), '[]'::jsonb)
      into v_validos, v_adicionais_total, v_adicionais_normalizados
    from public.adicionais a
    where a.ativo = true
      and a.id::text in (
        select adicional ->> 'id' from jsonb_array_elements(v_adicionais) adicional
      )
      and exists (
        select 1 from public.produto_grupos pg
        where pg.produto_id::text = v_produto.id and pg.grupo_id::text = a.grupo_id::text
      );
    if v_solicitados <> v_validos then raise exception 'Um adicional selecionado não pertence ao produto.'; end if;

    v_subtotal := v_subtotal + ((v_preco_unitario + v_adicionais_total) * v_quantidade);
    v_itens_normalizados := v_itens_normalizados || jsonb_build_array(jsonb_build_object(
      'produto_id', v_produto.id,
      'nome_produto', v_produto.nome,
      'variante_id', v_variante_id,
      'variante_nome', v_variante_nome,
      'preco_unitario', v_preco_unitario,
      'quantidade', v_quantidade,
      'observacao', nullif(left(trim(coalesce(v_item ->> 'observacao', '')), 300), ''),
      'adicionais', v_adicionais_normalizados
    ));
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

  insert into public.pedidos(
    usuario_id, empresa_id, unidade_id, empresa_nome, endereco, pagamento, observacoes,
    subtotal, taxa_entrega, desconto, cupom, total, status
  ) values (
    v_usuario_id, v_empresa.id, v_empresa.unidade_id, coalesce(v_empresa.nome, 'Restaurante'),
    left(trim(p_endereco), 500), p_pagamento,
    nullif(left(trim(coalesce(p_observacoes, '')), 500), ''),
    v_subtotal, v_taxa, v_desconto,
    nullif(upper(trim(coalesce(p_cupom, ''))), ''), v_total, 'recebido'
  ) returning * into v_pedido;

  for v_item in select value from jsonb_array_elements(v_itens_normalizados)
  loop
    insert into public.pedido_itens(
      pedido_id, produto_id, nome_produto, variante_id, variante_nome,
      preco_unitario, quantidade, observacao, adicionais
    ) values (
      v_pedido.id, v_item ->> 'produto_id', v_item ->> 'nome_produto',
      v_item ->> 'variante_id', v_item ->> 'variante_nome',
      (v_item ->> 'preco_unitario')::numeric,
      (v_item ->> 'quantidade')::integer,
      v_item ->> 'observacao', coalesce(v_item -> 'adicionais', '[]'::jsonb)
    );
  end loop;

  return jsonb_build_object(
    'id', v_pedido.id, 'numero', v_pedido.numero, 'status', v_pedido.status,
    'created_at', v_pedido.created_at, 'subtotal', v_pedido.subtotal,
    'taxa_entrega', v_pedido.taxa_entrega, 'desconto', v_pedido.desconto,
    'total', v_pedido.total
  );
end;
$$;

revoke all on function private.criar_pedido_impl(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
-- Função interna: somente wrappers SECURITY DEFINER podem chamá-la.

create or replace function public.criar_pedido(
  p_empresa_id text,
  p_endereco text,
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
  v_id uuid;
  v_existente public.pedidos%rowtype;
begin
  if auth.uid() is null then raise exception 'Faça login para finalizar o pedido.'; end if;
  if p_chave_cliente is null then raise exception 'Identificador do checkout ausente.'; end if;
  if p_agendado_para is not null and (
    p_agendado_para < now() + interval '30 minutes'
    or p_agendado_para > now() + interval '7 days'
  ) then raise exception 'O agendamento deve ficar entre 30 minutos e 7 dias.'; end if;

  select p.* into v_existente from public.pedidos p
  where p.usuario_id = auth.uid() and p.chave_cliente = p_chave_cliente
  limit 1;
  if found then
    return jsonb_build_object(
      'id', v_existente.id, 'numero', v_existente.numero, 'status', v_existente.status,
      'created_at', v_existente.created_at, 'subtotal', v_existente.subtotal,
      'taxa_entrega', v_existente.taxa_entrega, 'desconto', v_existente.desconto,
      'total', v_existente.total, 'agendado_para', v_existente.agendado_para,
      'reutilizado', true
    );
  end if;

  v_resultado := private.criar_pedido_impl(
    p_empresa_id, p_endereco, p_pagamento, p_observacoes, p_cupom, p_itens
  );
  v_id := (v_resultado ->> 'id')::uuid;

  update public.pedidos
  set agendado_para = p_agendado_para, chave_cliente = p_chave_cliente
  where id = v_id and usuario_id = auth.uid()
  returning * into v_existente;

  return v_resultado || jsonb_build_object(
    'agendado_para', p_agendado_para, 'reutilizado', false
  );
exception when unique_violation then
  select p.* into v_existente from public.pedidos p
  where p.usuario_id = auth.uid() and p.chave_cliente = p_chave_cliente
  limit 1;
  if found then
    return jsonb_build_object(
      'id', v_existente.id, 'numero', v_existente.numero, 'status', v_existente.status,
      'created_at', v_existente.created_at, 'subtotal', v_existente.subtotal,
      'taxa_entrega', v_existente.taxa_entrega, 'desconto', v_existente.desconto,
      'total', v_existente.total, 'agendado_para', v_existente.agendado_para,
      'reutilizado', true
    );
  end if;
  raise;
end;
$$;

revoke all on function public.criar_pedido(text, text, text, text, text, jsonb, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.criar_pedido(text, text, text, text, text, jsonb, timestamptz, uuid)
  to authenticated;

-- Checkout operacional com endereço validado e chave idempotente.
create or replace function public.criar_pedido_operacional(
  p_empresa_id text,
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
  v_endereco record;
  v_texto text;
  v_entrega jsonb;
  v_resultado jsonb;
  v_id uuid;
  v_pedido public.pedidos%rowtype;
  v_existente public.pedidos%rowtype;
  v_cupom public.cupons%rowtype;
  v_taxa numeric;
  v_minimo numeric;
  v_desconto numeric := 0;
  v_quando timestamptz := coalesce(p_agendado_para, now());
begin
  if auth.uid() is null then raise exception 'Faça login para finalizar o pedido.'; end if;
  if p_chave_cliente is null then raise exception 'Identificador do checkout ausente.'; end if;
  if p_agendado_para is not null and (
    p_agendado_para < now() + interval '30 minutes'
    or p_agendado_para > now() + interval '7 days'
  ) then raise exception 'O agendamento deve ficar entre 30 minutos e 7 dias.'; end if;

  select p.* into v_existente
  from public.pedidos p
  where p.usuario_id = auth.uid() and p.chave_cliente = p_chave_cliente
  limit 1;
  if found then
    return jsonb_build_object(
      'id', v_existente.id, 'numero', v_existente.numero, 'status', v_existente.status,
      'created_at', v_existente.created_at, 'subtotal', v_existente.subtotal,
      'taxa_entrega', v_existente.taxa_entrega, 'desconto', v_existente.desconto,
      'total', v_existente.total, 'agendado_para', v_existente.agendado_para,
      'reutilizado', true
    );
  end if;

  select * into v_endereco from public.enderecos
  where id = p_endereco_id and usuario_id = auth.uid();
  if not found then raise exception 'Selecione um endereço válido da sua conta.'; end if;

  v_entrega := private.calcular_entrega_impl(p_empresa_id, v_endereco.cidade, v_endereco.uf, v_endereco.bairro);
  if not coalesce((v_entrega ->> 'atendido')::boolean, false) then
    raise exception '%', coalesce(v_entrega ->> 'mensagem', 'Endereço fora da área de entrega.');
  end if;
  if not private.empresa_aberta_em(p_empresa_id, v_quando) then
    raise exception 'O restaurante não atende no horário escolhido.';
  end if;

  v_texto := concat_ws(', ',
    nullif(trim(v_endereco.logradouro), ''), nullif(trim(v_endereco.numero), ''),
    nullif(trim(v_endereco.complemento), ''), nullif(trim(v_endereco.bairro), ''),
    nullif(trim(v_endereco.cidade), ''), nullif(trim(v_endereco.uf), ''),
    nullif(trim(v_endereco.cep), '')
  );

  v_resultado := private.criar_pedido_impl(
    p_empresa_id, v_texto, p_pagamento, p_observacoes, p_cupom, p_itens
  );
  v_id := (v_resultado ->> 'id')::uuid;
  select * into v_pedido from public.pedidos where id = v_id for update;

  v_taxa := coalesce((v_entrega ->> 'taxa_entrega')::numeric, 0);
  v_minimo := coalesce((v_entrega ->> 'pedido_minimo')::numeric, 0);
  if v_pedido.subtotal < v_minimo then
    raise exception 'O pedido mínimo para esta região é R$ %.', to_char(v_minimo, 'FM999999990D00');
  end if;

  if v_pedido.cupom is not null then
    select * into v_cupom from public.cupons c
    where upper(c.codigo) = upper(v_pedido.cupom)
      and (c.empresa_id is null or c.empresa_id = p_empresa_id)
    order by (c.empresa_id is not null) desc limit 1;
    if found then
      v_desconto := case v_cupom.tipo
        when 'percentual' then round(v_pedido.subtotal * least(v_cupom.valor, 100) / 100, 2)
        when 'fixo' then least(v_cupom.valor, v_pedido.subtotal)
        when 'frete' then v_taxa else 0 end;
      if v_cupom.max_desconto is not null then
        v_desconto := least(v_desconto, v_cupom.max_desconto);
      end if;
    end if;
  end if;

  update public.pedidos
  set endereco_id = p_endereco_id,
      endereco = v_texto,
      taxa_entrega = v_taxa,
      desconto = v_desconto,
      total = greatest(0, subtotal + v_taxa - v_desconto),
      previsao_min = coalesce((v_entrega ->> 'tempo_min')::integer, 25),
      previsao_max = coalesce((v_entrega ->> 'tempo_max')::integer, 45),
      preparo_estimado_minutos = greatest(5, least(240, coalesce((v_entrega ->> 'tempo_min')::integer, 30))),
      agendado_para = p_agendado_para,
      chave_cliente = p_chave_cliente,
      updated_at = now()
  where id = v_id
  returning * into v_pedido;

  return v_resultado || jsonb_build_object(
    'taxa_entrega', v_pedido.taxa_entrega,
    'desconto', v_pedido.desconto,
    'total', v_pedido.total,
    'agendado_para', v_pedido.agendado_para,
    'reutilizado', false
  );
exception when unique_violation then
  select p.* into v_existente
  from public.pedidos p
  where p.usuario_id = auth.uid() and p.chave_cliente = p_chave_cliente
  limit 1;
  if found then
    return jsonb_build_object(
      'id', v_existente.id, 'numero', v_existente.numero, 'status', v_existente.status,
      'created_at', v_existente.created_at, 'subtotal', v_existente.subtotal,
      'taxa_entrega', v_existente.taxa_entrega, 'desconto', v_existente.desconto,
      'total', v_existente.total, 'agendado_para', v_existente.agendado_para,
      'reutilizado', true
    );
  end if;
  raise;
end;
$$;

revoke all on function public.criar_pedido_operacional(text, uuid, text, text, text, jsonb, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.criar_pedido_operacional(text, uuid, text, text, text, jsonb, timestamptz, uuid)
  to authenticated;

-- Impede clientes antigos de contornarem a chave idempotente obrigatória.
revoke all on function public.criar_pedido(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.criar_pedido(text, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.criar_pedido_operacional(text, uuid, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;

-- =========================================================
-- 6) ENTREGA SOMENTE APÓS O PEDIDO ESTAR PRONTO
-- =========================================================

create or replace function public.listar_entregas_disponiveis()
returns table (
  pedido_id uuid,
  numero bigint,
  restaurante text,
  bairro text,
  total numeric,
  pagamento text,
  agendado_para timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.numero, p.empresa_nome,
    coalesce((regexp_match(p.endereco, '— ([^—]+) —'))[1], 'Endereço após aceitar'),
    p.total, p.pagamento, p.agendado_para, p.created_at
  from public.pedidos p
  where p.status = 'preparando'
    and p.pronto_em is not null
    and p.entregador_id is null
    and (p.agendado_para is null or p.agendado_para <= now() + interval '45 minutes')
    and exists (
      select 1 from public.entregadores d
      where d.id = auth.uid() and d.aprovado = true and d.online = true
    )
  order by p.prioridade desc, coalesce(p.agendado_para, p.created_at), p.created_at
  limit 50;
$$;

create or replace function public.entregador_aceitar_pedido(p_pedido_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.entregadores d
    where d.id = auth.uid() and d.aprovado = true and d.online = true
  ) then raise exception 'Entregador indisponível ou ainda não aprovado.'; end if;

  update public.pedidos
  set entregador_id = auth.uid(), updated_at = now()
  where id = p_pedido_id and status = 'preparando'
    and pronto_em is not null and entregador_id is null;
  return found;
end;
$$;

create or replace function public.entregador_atualizar_status(
  p_pedido_id uuid,
  p_status text,
  p_pagamento_recebido boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('saiu_para_entrega', 'entregue') then
    raise exception 'Status de entrega inválido.';
  end if;

  update public.pedidos
  set status = p_status,
      retirado_em = case when p_status = 'saiu_para_entrega' then coalesce(retirado_em, now()) else retirado_em end,
      entregue_em = case when p_status = 'entregue' then coalesce(entregue_em, now()) else entregue_em end,
      pagamento_status = case
        when p_pagamento_recebido and pagamento_modalidade = 'na_entrega' then 'pago'
        else pagamento_status
      end,
      updated_at = now()
  where id = p_pedido_id and entregador_id = auth.uid()
    and ((status = 'preparando' and pronto_em is not null and p_status = 'saiu_para_entrega')
      or (status = 'saiu_para_entrega' and p_status = 'entregue'));
  return found;
end;
$$;

revoke all on function public.listar_entregas_disponiveis() from public, anon, authenticated;
revoke all on function public.entregador_aceitar_pedido(uuid) from public, anon, authenticated;
revoke all on function public.entregador_atualizar_status(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.listar_entregas_disponiveis() to authenticated;
grant execute on function public.entregador_aceitar_pedido(uuid) to authenticated;
grant execute on function public.entregador_atualizar_status(uuid, text, boolean) to authenticated;

-- =========================================================
-- 7) RELATÓRIO OPERACIONAL DO RESTAURANTE
-- =========================================================

create or replace function public.empresa_relatorio_operacional(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa_id text;
  v_inicio timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)));
begin
  select e.id::text into v_empresa_id from public.empresas e
  where e.usuario_id = auth.uid() limit 1;
  if v_empresa_id is null then raise exception 'Restaurante não encontrado.'; end if;

  return jsonb_build_object(
    'pedidos', (select count(*) from public.pedidos p where p.empresa_id::text = v_empresa_id and p.created_at >= v_inicio),
    'entregues', (select count(*) from public.pedidos p where p.empresa_id::text = v_empresa_id and p.status = 'entregue' and p.created_at >= v_inicio),
    'cancelados', (select count(*) from public.pedidos p where p.empresa_id::text = v_empresa_id and p.status = 'cancelado' and p.created_at >= v_inicio),
    'faturamento', coalesce((select sum(p.total) from public.pedidos p where p.empresa_id::text = v_empresa_id and p.status = 'entregue' and p.pagamento_status = 'pago' and p.created_at >= v_inicio), 0),
    'tempo_preparo_medio_minutos', coalesce((select round(avg(extract(epoch from (p.pronto_em - p.preparo_iniciado_em)) / 60)::numeric, 1) from public.pedidos p where p.empresa_id::text = v_empresa_id and p.pronto_em is not null and p.preparo_iniciado_em is not null and p.created_at >= v_inicio), 0),
    'em_preparo', (select count(*) from public.pedidos p where p.empresa_id::text = v_empresa_id and p.status = 'preparando' and p.pronto_em is null),
    'prontos', (select count(*) from public.pedidos p where p.empresa_id::text = v_empresa_id and p.status = 'preparando' and p.pronto_em is not null),
    'atrasados', (select count(*) from public.pedidos p where p.empresa_id::text = v_empresa_id and p.status = 'preparando' and p.pronto_em is null and coalesce(p.preparo_iniciado_em, p.created_at) + make_interval(mins => p.preparo_estimado_minutos) < now()),
    'estoque_baixo', (select count(*) from public.produtos p where p.empresa_id::text = v_empresa_id and p.controle_estoque and p.estoque <= p.estoque_minimo),
    'gerado_em', now()
  );
end;
$$;

revoke all on function public.empresa_relatorio_operacional(integer) from public, anon, authenticated;
grant execute on function public.empresa_relatorio_operacional(integer) to authenticated;

-- Updated-at nas tabelas novas.
drop trigger if exists empresa_unidades_set_updated_at on public.empresa_unidades;
create trigger empresa_unidades_set_updated_at before update on public.empresa_unidades
for each row execute function public.set_updated_at();
drop trigger if exists produto_variantes_set_updated_at on public.produto_variantes;
create trigger produto_variantes_set_updated_at before update on public.produto_variantes
for each row execute function public.set_updated_at();

commit;
