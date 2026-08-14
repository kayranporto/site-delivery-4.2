-- Multi Delivery: correções operacionais e de privacidade para produção.
-- Execute após 001, 002, 003 e 004.

begin;

-- =========================================================
-- 0) COMPATIBILIDADE COM INSTALAÇÕES LEGADAS
-- =========================================================

-- Algumas instalações antigas usavam titulo/rua/estado. Mantemos essas
-- colunas e acrescentamos os nomes usados pelo frontend atual, preservando
-- todos os endereços já cadastrados.
alter table public.enderecos
  add column if not exists apelido text,
  add column if not exists logradouro text,
  add column if not exists uf text,
  add column if not exists referencia text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'enderecos' and column_name = 'titulo'
  ) then
    execute 'update public.enderecos set apelido = coalesce(apelido, titulo, ''Casa'')';
  else
    update public.enderecos set apelido = coalesce(apelido, 'Casa');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'enderecos' and column_name = 'rua'
  ) then
    execute 'update public.enderecos set logradouro = coalesce(logradouro, rua, '''')';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'enderecos' and column_name = 'estado'
  ) then
    execute 'update public.enderecos set uf = coalesce(uf, estado, '''')';
  end if;
end $$;

alter table public.enderecos enable row level security;
drop policy if exists "usuario gerencia enderecos" on public.enderecos;
create policy "usuario gerencia enderecos"
on public.enderecos for all to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());
grant select, insert, update, delete on public.enderecos to authenticated;

-- Atualiza a tabela antiga de cupons sem apagar as colunas legadas.
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
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cupons' and column_name = 'desconto'
  ) then
    execute 'update public.cupons set valor = coalesce(nullif(valor, 0), desconto, 0)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cupons' and column_name = 'valor_minimo'
  ) then
    execute 'update public.cupons set pedido_minimo = coalesce(nullif(pedido_minimo, 0), valor_minimo, 0)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cupons' and column_name = 'validade'
  ) then
    execute 'update public.cupons set fim = coalesce(fim, validade)';
  end if;
end $$;

alter table public.cupons enable row level security;
drop policy if exists "cupons ativos leitura" on public.cupons;
create policy "cupons ativos leitura"
on public.cupons for select to authenticated using (
  ativo = true
  and inicio <= now()
  and (fim is null or fim >= now())
  and (limite_usos is null or usos < limite_usos)
  or exists (
    select 1 from public.empresas e
    where e.id::text = empresa_id and e.usuario_id = auth.uid()
  )
);
drop policy if exists "restaurante gerencia cupons" on public.cupons;
create policy "restaurante gerencia cupons"
on public.cupons for all to authenticated
using (
  exists (select 1 from public.empresas e where e.id::text = empresa_id and e.usuario_id = auth.uid())
)
with check (
  exists (select 1 from public.empresas e where e.id::text = empresa_id and e.usuario_id = auth.uid())
);
grant select, insert, update, delete on public.cupons to authenticated;

-- Normaliza os nomes usados pelo histórico de status antigo.
alter table public.historico_status_pedido
  add column if not exists alterado_por uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'historico_status_pedido'
      and column_name = 'criado_em'
  ) then
    execute 'update public.historico_status_pedido set created_at = coalesce(criado_em, created_at)';
  end if;
end $$;

alter table public.historico_status_pedido enable row level security;
drop policy if exists "participantes leem historico" on public.historico_status_pedido;
create policy "participantes leem historico"
on public.historico_status_pedido for select to authenticated using (
  exists (
    select 1 from public.pedidos p
    where p.id = pedido_id and (
      p.usuario_id = auth.uid()
      or exists (
        select 1 from public.empresas e
        where e.id::text = p.empresa_id and e.usuario_id = auth.uid()
      )
    )
  )
);
grant select on public.historico_status_pedido to authenticated;

-- =========================================================
-- 1) PUBLICAÇÃO E ÁREA DE ATENDIMENTO DO RESTAURANTE
-- =========================================================

-- Na primeira execução, preserva no catálogo os restaurantes que já existiam.
-- Novos cadastros recebem publicado = false pelo valor padrão e pelo trigger.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'empresas'
      and column_name = 'publicado'
  ) then
    alter table public.empresas
      add column publicado boolean not null default false;
    update public.empresas set publicado = true;
  end if;
end $$;

alter table public.empresas
  add column if not exists cidade_atendimento text,
  add column if not exists uf_atendimento text,
  add column if not exists bairros_atendidos text[] not null default '{}'::text[],
  add column if not exists tempo_estimado_min integer not null default 25,
  add column if not exists tempo_estimado_max integer not null default 45;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_tempo_estimado_check') then
    alter table public.empresas add constraint empresas_tempo_estimado_check
      check (
        tempo_estimado_min between 5 and 240
        and tempo_estimado_max between tempo_estimado_min and 360
      ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'empresas_uf_atendimento_check') then
    alter table public.empresas add constraint empresas_uf_atendimento_check
      check (uf_atendimento is null or uf_atendimento ~ '^[A-Z]{2}$') not valid;
  end if;
end $$;

create or replace view public.empresas_catalogo
with (security_barrier = true)
as
select
  e.id::text as id,
  e.nome,
  e.descricao,
  e.categoria,
  e.tipo,
  e.logo,
  e.banner,
  e.taxa_entrega,
  e.pedido_minimo,
  e.status,
  e.cidade_atendimento,
  e.uf_atendimento,
  e.bairros_atendidos,
  e.tempo_estimado_min,
  e.tempo_estimado_max
from public.empresas e
where e.publicado = true;

revoke all on public.empresas_catalogo from public, anon, authenticated;
grant select on public.empresas_catalogo to anon, authenticated;

-- O proprietário pode editar dados operacionais, mas não pode se publicar.
revoke insert, update on public.empresas from authenticated;
grant insert (
  usuario_id, nome, email, telefone, cnpj, descricao, categoria, tipo,
  logo, banner, taxa_entrega, pedido_minimo, status,
  cidade_atendimento, uf_atendimento, bairros_atendidos,
  tempo_estimado_min, tempo_estimado_max
) on public.empresas to authenticated;
grant update (
  nome, email, telefone, descricao, categoria, tipo,
  logo, banner, taxa_entrega, pedido_minimo, status,
  cidade_atendimento, uf_atendimento, bairros_atendidos,
  tempo_estimado_min, tempo_estimado_max
) on public.empresas to authenticated;

-- Cadastro automático cria apenas o perfil. O restaurante é criado somente
-- depois que o usuário possui uma sessão válida (e-mail confirmado, quando a
-- confirmação está habilitada), evitando reservar CNPJ com conta não validada.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usuarios (id, nome, sobrenome, telefone, cpf)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    coalesce(new.raw_user_meta_data ->> 'sobrenome', ''),
    coalesce(new.raw_user_meta_data ->> 'telefone', ''),
    nullif(new.raw_user_meta_data ->> 'cpf', '')
  )
  on conflict (id) do update set
    nome = excluded.nome,
    sobrenome = excluded.sobrenome,
    telefone = excluded.telefone,
    cpf = coalesce(excluded.cpf, public.usuarios.cpf);

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_delivery on auth.users;
create trigger on_auth_user_created_delivery
after insert on auth.users
for each row execute function private.handle_new_user();

-- =========================================================
-- 2) DADOS OPERACIONAIS E PAGAMENTO DO PEDIDO
-- =========================================================

alter table public.pedidos
  add column if not exists cliente_nome text,
  add column if not exists cliente_telefone text,
  add column if not exists empresa_telefone text,
  add column if not exists previsao_min integer,
  add column if not exists previsao_max integer,
  add column if not exists pagamento_status text not null default 'pendente';

update public.pedidos p
set cliente_nome = coalesce(p.cliente_nome, nullif(trim(concat_ws(' ', u.nome, u.sobrenome)), '')),
    cliente_telefone = coalesce(p.cliente_telefone, nullif(u.telefone, ''))
from public.usuarios u
where u.id = p.usuario_id
  and (p.cliente_nome is null or p.cliente_telefone is null);

update public.pedidos p
set empresa_telefone = coalesce(p.empresa_telefone, nullif(e.telefone, '')),
    previsao_min = coalesce(p.previsao_min, e.tempo_estimado_min, 25),
    previsao_max = coalesce(p.previsao_max, e.tempo_estimado_max, 45)
from public.empresas e
where e.id::text = p.empresa_id
  and (p.empresa_telefone is null or p.previsao_min is null or p.previsao_max is null);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_pagamento_status_check') then
    alter table public.pedidos add constraint pedidos_pagamento_status_check
      check (pagamento_status in ('pendente', 'pago', 'estornado')) not valid;
  end if;
end $$;

-- O restaurante altera somente o andamento e a confirmação de pagamento.
revoke update on public.pedidos from authenticated;
grant update (status, pagamento_status) on public.pedidos to authenticated;

-- =========================================================
-- 3) CUPONS TRANSACIONAIS
-- =========================================================

-- Remove duplicidades históricas antes de criar a unicidade case-insensitive.
delete from public.cupons a
using public.cupons b
where a.id::text > b.id::text
  and coalesce(a.empresa_id, '*') = coalesce(b.empresa_id, '*')
  and upper(a.codigo) = upper(b.codigo);

create unique index if not exists cupons_empresa_codigo_unique_ci
  on public.cupons (coalesce(empresa_id, '*'), upper(codigo));

insert into public.cupons (
  empresa_id, codigo, tipo, valor, pedido_minimo,
  limite_usos, primeiro_pedido, ativo
)
select null, 'BEMVINDO20', 'percentual', 20, 0, null, true, true
where not exists (
  select 1 from public.cupons
  where empresa_id is null and upper(codigo) = 'BEMVINDO20'
);

insert into public.cupons (
  empresa_id, codigo, tipo, valor, pedido_minimo,
  limite_usos, primeiro_pedido, ativo
)
select null, 'DELIVERY10', 'fixo', 10, 0, null, false, true
where not exists (
  select 1 from public.cupons
  where empresa_id is null and upper(codigo) = 'DELIVERY10'
);

insert into public.cupons (
  empresa_id, codigo, tipo, valor, pedido_minimo,
  limite_usos, primeiro_pedido, ativo
)
select null, 'FRETEGRATIS', 'frete', 0, 0, null, false, true
where not exists (
  select 1 from public.cupons
  where empresa_id is null and upper(codigo) = 'FRETEGRATIS'
);

-- Enriquecimento, validação da área e aplicação autoritativa do cupom.
-- Como o trigger roda na mesma transação da função criar_pedido, qualquer falha
-- posterior desfaz também a reserva de uso do cupom.
create or replace function private.preparar_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa record;
  v_usuario record;
  v_cupom public.cupons%rowtype;
  v_codigo text;
  v_endereco_normalizado text;
begin
  select
    e.telefone,
    e.cidade_atendimento,
    e.uf_atendimento,
    e.bairros_atendidos,
    e.tempo_estimado_min,
    e.tempo_estimado_max
  into v_empresa
  from public.empresas e
  where e.id::text = new.empresa_id
    and e.publicado = true
    and e.status = true
  limit 1;

  if not found then
    raise exception 'O restaurante não está publicado ou não está recebendo pedidos.';
  end if;

  select trim(concat_ws(' ', u.nome, u.sobrenome)) as nome, u.telefone
  into v_usuario
  from public.usuarios u
  where u.id = new.usuario_id;

  new.cliente_nome := nullif(v_usuario.nome, '');
  new.cliente_telefone := nullif(v_usuario.telefone, '');
  new.empresa_telefone := nullif(v_empresa.telefone, '');
  new.previsao_min := coalesce(v_empresa.tempo_estimado_min, 25);
  new.previsao_max := coalesce(v_empresa.tempo_estimado_max, 45);
  new.pagamento_status := 'pendente';

  v_endereco_normalizado := lower(coalesce(new.endereco, ''));

  if nullif(trim(v_empresa.cidade_atendimento), '') is not null
     and position(
       lower(trim(v_empresa.cidade_atendimento))
       in v_endereco_normalizado
     ) = 0 then
    raise exception 'O endereço informado está fora da cidade atendida pelo restaurante.';
  end if;

  if nullif(trim(v_empresa.uf_atendimento), '') is not null
     and position(lower(trim(v_empresa.uf_atendimento)) in v_endereco_normalizado) = 0 then
    raise exception 'O endereço informado está fora do estado atendido pelo restaurante.';
  end if;

  if cardinality(coalesce(v_empresa.bairros_atendidos, '{}'::text[])) > 0
     and not exists (
       select 1
       from unnest(v_empresa.bairros_atendidos) bairro
       where nullif(trim(bairro), '') is not null
         and position(lower(trim(bairro)) in v_endereco_normalizado) > 0
     ) then
    raise exception 'O bairro informado não está na área de entrega do restaurante.';
  end if;

  v_codigo := nullif(upper(trim(coalesce(new.cupom, ''))), '');
  if v_codigo is null then
    new.cupom := null;
    new.desconto := 0;
    new.total := greatest(0, new.subtotal + new.taxa_entrega);
    return new;
  end if;

  -- Serializa pedidos simultâneos do mesmo cliente para proteger primeiro pedido.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.usuario_id::text));

  select c.*
  into v_cupom
  from public.cupons c
  where upper(c.codigo) = v_codigo
    and (c.empresa_id is null or c.empresa_id = new.empresa_id)
    and c.ativo = true
    and c.inicio <= now()
    and (c.fim is null or c.fim >= now())
    and (c.limite_usos is null or c.usos < c.limite_usos)
  order by (c.empresa_id is not null) desc
  limit 1
  for update;

  if not found then
    raise exception 'Cupom inválido, expirado ou esgotado.';
  end if;

  if new.subtotal < v_cupom.pedido_minimo then
    raise exception 'Este cupom exige pedido mínimo de R$ %.',
      to_char(v_cupom.pedido_minimo, 'FM999999990D00');
  end if;

  if v_cupom.primeiro_pedido and exists (
    select 1
    from public.pedidos p
    where p.usuario_id = new.usuario_id
      and p.status <> 'cancelado'
  ) then
    raise exception 'Este cupom é válido somente no primeiro pedido.';
  end if;

  case v_cupom.tipo
    when 'percentual' then
      new.desconto := round(new.subtotal * least(v_cupom.valor, 100) / 100, 2);
    when 'fixo' then
      new.desconto := least(v_cupom.valor, new.subtotal);
    when 'frete' then
      new.desconto := new.taxa_entrega;
    else
      raise exception 'Tipo de cupom inválido.';
  end case;

  new.cupom := v_codigo;
  new.total := greatest(0, new.subtotal + new.taxa_entrega - new.desconto);

  update public.cupons
  set usos = usos + 1, updated_at = now()
  where id = v_cupom.id;

  return new;
end;
$$;

revoke all on function private.preparar_pedido() from public, anon, authenticated;
drop trigger if exists preparar_pedido_delivery on public.pedidos;
create trigger preparar_pedido_delivery
before insert on public.pedidos
for each row execute function private.preparar_pedido();

create or replace function private.validar_transicao_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'recebido' and new.status in ('preparando', 'cancelado'))
      or (old.status = 'preparando' and new.status in ('saiu_para_entrega', 'cancelado'))
      or (old.status = 'saiu_para_entrega' and new.status = 'entregue')
    ) then
      raise exception 'Transição de status inválida: % → %.', old.status, new.status;
    end if;
  end if;

  if new.pagamento_status = 'pago' and new.status = 'cancelado' then
    raise exception 'Pedido cancelado não pode ser marcado como pago.';
  end if;

  return new;
end;
$$;

revoke all on function private.validar_transicao_pedido() from public, anon, authenticated;
drop trigger if exists validar_transicao_pedido_delivery on public.pedidos;
create trigger validar_transicao_pedido_delivery
before update of status, pagamento_status on public.pedidos
for each row execute function private.validar_transicao_pedido();

comment on column public.empresas.publicado is
  'Controlado administrativamente. Proprietários não podem publicar a própria loja.';
comment on column public.pedidos.pagamento_status is
  'Confirmação manual enquanto o pagamento ocorre na entrega.';

commit;
