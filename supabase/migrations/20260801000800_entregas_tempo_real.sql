-- Multi Delivery 3.1: entregas, chat, agendamento, promoções, notificações e observabilidade.
-- Execute depois de 007_painel_admin.sql.

begin;

-- =========================================================
-- 1) PEDIDOS, PAGAMENTO E PROMOÇÕES
-- =========================================================

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
  if not exists (select 1 from pg_constraint where conname = 'pedidos_pagamento_modalidade_check') then
    alter table public.pedidos add constraint pedidos_pagamento_modalidade_check
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

create or replace function public.pedido_definir_pagamento_online(p_pedido_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pedidos
  set pagamento_modalidade = 'online', pagamento_provider = 'mercado_pago', updated_at = now()
  where id = p_pedido_id and usuario_id = auth.uid()
    and status <> 'cancelado' and pagamento_status = 'pendente';
  return found;
end;
$$;

revoke all on function public.pedido_definir_pagamento_online(uuid) from public, anon, authenticated;
grant execute on function public.pedido_definir_pagamento_online(uuid) to authenticated;

alter table public.cupons
  add column if not exists max_desconto numeric(12,2),
  add column if not exists limite_por_usuario integer not null default 1,
  add column if not exists dias_semana smallint[],
  add column if not exists horario_inicio time,
  add column if not exists horario_fim time;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cupons_max_desconto_check') then
    alter table public.cupons add constraint cupons_max_desconto_check
      check (max_desconto is null or max_desconto >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cupons_limite_usuario_check') then
    alter table public.cupons add constraint cupons_limite_usuario_check
      check (limite_por_usuario > 0 and limite_por_usuario <= 100) not valid;
  end if;
end $$;

create or replace function private.validar_promocao_avancada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cupom public.cupons%rowtype;
  v_usos integer;
  v_dia smallint := extract(dow from now())::smallint;
  v_hora time := localtime;
begin
  if new.cupom is null then return new; end if;

  select c.* into v_cupom
  from public.cupons c
  where upper(c.codigo) = upper(new.cupom)
    and (c.empresa_id is null or c.empresa_id = new.empresa_id)
  order by (c.empresa_id is not null) desc
  limit 1;

  if not found then return new; end if;

  if cardinality(coalesce(v_cupom.dias_semana, '{}'::smallint[])) > 0
     and not (v_dia = any(v_cupom.dias_semana)) then
    raise exception 'Este cupom não é válido hoje.';
  end if;

  if v_cupom.horario_inicio is not null and v_cupom.horario_fim is not null then
    if v_cupom.horario_inicio <= v_cupom.horario_fim then
      if v_hora < v_cupom.horario_inicio or v_hora > v_cupom.horario_fim then
        raise exception 'Este cupom não é válido neste horário.';
      end if;
    elsif v_hora < v_cupom.horario_inicio and v_hora > v_cupom.horario_fim then
      raise exception 'Este cupom não é válido neste horário.';
    end if;
  end if;

  select count(*) into v_usos
  from public.pedidos p
  where p.usuario_id = new.usuario_id
    and upper(coalesce(p.cupom, '')) = upper(v_cupom.codigo)
    and (v_cupom.empresa_id is null or p.empresa_id = v_cupom.empresa_id)
    and p.status <> 'cancelado';

  if v_usos >= v_cupom.limite_por_usuario then
    raise exception 'Você já atingiu o limite de uso deste cupom.';
  end if;

  if v_cupom.max_desconto is not null then
    new.desconto := least(new.desconto, v_cupom.max_desconto);
    new.total := greatest(0, new.subtotal + new.taxa_entrega - new.desconto);
  end if;
  return new;
end;
$$;

revoke all on function private.validar_promocao_avancada() from public, anon, authenticated;
drop trigger if exists zz_validar_promocao_avancada on public.pedidos;
create trigger zz_validar_promocao_avancada
before insert on public.pedidos
for each row execute function private.validar_promocao_avancada();

-- Sobrecarga compatível: o fluxo antigo de seis parâmetros continua válido.
create or replace function public.criar_pedido(
  p_empresa_id text,
  p_endereco text,
  p_pagamento text,
  p_observacoes text,
  p_cupom text,
  p_itens jsonb,
  p_agendado_para timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_id uuid;
begin
  if p_agendado_para is not null and (
    p_agendado_para < now() + interval '30 minutes'
    or p_agendado_para > now() + interval '7 days'
  ) then
    raise exception 'O agendamento deve ficar entre 30 minutos e 7 dias.';
  end if;

  v_resultado := private.criar_pedido_impl(
    p_empresa_id, p_endereco, p_pagamento, p_observacoes, p_cupom, p_itens
  );
  v_id := (v_resultado ->> 'id')::uuid;

  update public.pedidos
  set agendado_para = p_agendado_para
  where id = v_id and usuario_id = auth.uid();

  return v_resultado || jsonb_build_object('agendado_para', p_agendado_para);
end;
$$;

revoke all on function public.criar_pedido(text, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.criar_pedido(text, text, text, text, text, jsonb, timestamptz)
  to authenticated;

create or replace function private.validar_inicio_agendado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'recebido' and new.status = 'preparando'
     and old.agendado_para is not null
     and old.agendado_para > now() + interval '30 minutes' then
    raise exception 'Este pedido ainda está fora da janela de preparo.';
  end if;
  return new;
end;
$$;

revoke all on function private.validar_inicio_agendado() from public, anon, authenticated;
drop trigger if exists a_validar_inicio_agendado on public.pedidos;
create trigger a_validar_inicio_agendado
before update of status on public.pedidos
for each row execute function private.validar_inicio_agendado();

create or replace function private.proteger_pagamento_online()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.pagamento_modalidade = 'online'
     and new.pagamento_status is distinct from old.pagamento_status
     and coalesce(auth.role(), '') <> 'service_role'
     and not private.is_admin() then
    raise exception 'O pagamento online é confirmado exclusivamente pelo provedor.';
  end if;
  return new;
end;
$$;

drop trigger if exists b_proteger_pagamento_online on public.pedidos;
create trigger b_proteger_pagamento_online
before update of pagamento_status on public.pedidos
for each row execute function private.proteger_pagamento_online();

-- =========================================================
-- 2) ENTREGADORES E LOCALIZAÇÃO
-- =========================================================

create table if not exists public.entregadores (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  telefone text not null,
  documento text,
  veiculo text not null default 'Moto',
  placa text,
  aprovado boolean not null default false,
  online boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entrega_localizacoes (
  pedido_id uuid primary key references public.pedidos(id) on delete cascade,
  entregador_id uuid not null references public.entregadores(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  precisao_metros numeric(10,2),
  updated_at timestamptz not null default now()
);

create index if not exists entregadores_disponiveis_idx
  on public.entregadores(aprovado, online) where aprovado = true;

alter table public.entregadores enable row level security;
alter table public.entrega_localizacoes enable row level security;

drop policy if exists "entregador le cadastro" on public.entregadores;
create policy "entregador le cadastro" on public.entregadores
for select to authenticated using (id = auth.uid() or (select private.is_admin()));

drop policy if exists "admin le entregadores" on public.entregadores;
create policy "admin le entregadores" on public.entregadores
for select to authenticated using ((select private.is_admin()));

grant select on public.entregadores to authenticated;
grant select on public.entrega_localizacoes to authenticated;

create or replace function private.participa_pedido(p_pedido_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pedidos p
    where p.id = p_pedido_id and (
      p.usuario_id = auth.uid()
      or p.entregador_id = auth.uid()
      or exists (
        select 1 from public.empresas e
        where e.id::text = p.empresa_id and e.usuario_id = auth.uid()
      )
      or private.is_admin()
    )
  );
$$;

revoke all on function private.participa_pedido(uuid) from public, anon, authenticated;
grant execute on function private.participa_pedido(uuid) to authenticated;

drop policy if exists "participantes leem localizacao" on public.entrega_localizacoes;
create policy "participantes leem localizacao" on public.entrega_localizacoes
for select to authenticated using ((select private.participa_pedido(pedido_id)));

drop policy if exists "entregador le pedidos atribuidos" on public.pedidos;
create policy "entregador le pedidos atribuidos" on public.pedidos
for select to authenticated using (entregador_id = auth.uid());

drop policy if exists "entregador le itens atribuidos" on public.pedido_itens;
create policy "entregador le itens atribuidos" on public.pedido_itens
for select to authenticated using (
  exists (select 1 from public.pedidos p where p.id = pedido_id and p.entregador_id = auth.uid())
);

drop policy if exists "participantes leem historico" on public.historico_status_pedido;
create policy "participantes leem historico" on public.historico_status_pedido
for select to authenticated using ((select private.participa_pedido(pedido_id)));

create or replace function public.cadastrar_entregador(
  p_nome text,
  p_telefone text,
  p_veiculo text default 'Moto',
  p_documento text default null,
  p_placa text default null
)
returns public.entregadores
language plpgsql
security definer
set search_path = ''
as $$
declare v_entregador public.entregadores%rowtype;
begin
  if auth.uid() is null then raise exception 'Faça login para continuar.'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Informe seu nome.'; end if;
  if length(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g')) < 10 then raise exception 'Informe um telefone válido.'; end if;

  insert into public.entregadores(id, nome, telefone, veiculo, documento, placa)
  values (
    auth.uid(), left(trim(p_nome), 120), left(trim(p_telefone), 30),
    left(trim(coalesce(p_veiculo, 'Moto')), 40), nullif(left(trim(coalesce(p_documento, '')), 40), ''),
    nullif(upper(left(trim(coalesce(p_placa, '')), 10)), '')
  )
  on conflict (id) do update set
    nome = excluded.nome,
    telefone = excluded.telefone,
    veiculo = excluded.veiculo,
    documento = excluded.documento,
    placa = excluded.placa,
    updated_at = now()
  returning * into v_entregador;
  return v_entregador;
end;
$$;

create or replace function public.entregador_definir_online(p_online boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.entregadores
  set online = p_online, updated_at = now()
  where id = auth.uid() and aprovado = true;
  return found;
end;
$$;

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
    and p.entregador_id is null
    and (p.agendado_para is null or p.agendado_para <= now() + interval '45 minutes')
    and exists (
      select 1 from public.entregadores d
      where d.id = auth.uid() and d.aprovado = true and d.online = true
    )
  order by coalesce(p.agendado_para, p.created_at), p.created_at
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
  where id = p_pedido_id and status = 'preparando' and entregador_id is null;
  return found;
end;
$$;

create or replace function public.entregador_atualizar_localizacao(
  p_pedido_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_precisao_metros numeric default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pedidos p
    where p.id = p_pedido_id and p.entregador_id = auth.uid()
      and p.status in ('preparando', 'saiu_para_entrega')
  ) then raise exception 'Entrega não atribuída a esta conta.'; end if;

  insert into public.entrega_localizacoes(pedido_id, entregador_id, latitude, longitude, precisao_metros)
  values (p_pedido_id, auth.uid(), p_latitude, p_longitude, p_precisao_metros)
  on conflict (pedido_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    precisao_metros = excluded.precisao_metros,
    updated_at = now();
  return true;
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
      pagamento_status = case
        when p_pagamento_recebido and pagamento_modalidade = 'na_entrega' then 'pago'
        else pagamento_status
      end,
      updated_at = now()
  where id = p_pedido_id and entregador_id = auth.uid()
    and ((status = 'preparando' and p_status = 'saiu_para_entrega')
      or (status = 'saiu_para_entrega' and p_status = 'entregue'));
  return found;
end;
$$;

create or replace function public.admin_definir_entregador(p_entregador_id uuid, p_aprovado boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  update public.entregadores
  set aprovado = p_aprovado, online = case when p_aprovado then online else false end, updated_at = now()
  where id = p_entregador_id;
  if found then
    insert into public.admin_auditoria(admin_id, acao, alvo_id, detalhes)
    values (auth.uid(), 'entregador_aprovacao', p_entregador_id::text, jsonb_build_object('aprovado', p_aprovado));
  end if;
  return found;
end;
$$;

revoke all on function public.cadastrar_entregador(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.entregador_definir_online(boolean) from public, anon, authenticated;
revoke all on function public.listar_entregas_disponiveis() from public, anon, authenticated;
revoke all on function public.entregador_aceitar_pedido(uuid) from public, anon, authenticated;
revoke all on function public.entregador_atualizar_localizacao(uuid,double precision,double precision,numeric) from public, anon, authenticated;
revoke all on function public.entregador_atualizar_status(uuid,text,boolean) from public, anon, authenticated;
revoke all on function public.admin_definir_entregador(uuid,boolean) from public, anon, authenticated;
grant execute on function public.cadastrar_entregador(text,text,text,text,text) to authenticated;
grant execute on function public.entregador_definir_online(boolean) to authenticated;
grant execute on function public.listar_entregas_disponiveis() to authenticated;
grant execute on function public.entregador_aceitar_pedido(uuid) to authenticated;
grant execute on function public.entregador_atualizar_localizacao(uuid,double precision,double precision,numeric) to authenticated;
grant execute on function public.entregador_atualizar_status(uuid,text,boolean) to authenticated;
grant execute on function public.admin_definir_entregador(uuid,boolean) to authenticated;

-- =========================================================
-- 3) CHAT, NOTIFICAÇÕES E RESPOSTAS ÀS AVALIAÇÕES
-- =========================================================

create table if not exists public.pedido_mensagens (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  autor_id uuid not null references auth.users(id) on delete cascade,
  autor_tipo text not null check (autor_tipo in ('cliente','restaurante','entregador','admin')),
  mensagem text not null check (char_length(mensagem) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.notificacoes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  pedido_id uuid references public.pedidos(id) on delete cascade,
  titulo text not null,
  mensagem text not null,
  tipo text not null default 'info',
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(usuario_id, endpoint)
);

create index if not exists pedido_mensagens_pedido_idx on public.pedido_mensagens(pedido_id, created_at);
create index if not exists notificacoes_usuario_idx on public.notificacoes(usuario_id, lida, created_at desc);

alter table public.pedido_mensagens enable row level security;
alter table public.notificacoes enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "participantes leem mensagens" on public.pedido_mensagens;
create policy "participantes leem mensagens" on public.pedido_mensagens
for select to authenticated using ((select private.participa_pedido(pedido_id)));
drop policy if exists "participantes enviam mensagens" on public.pedido_mensagens;
create policy "participantes enviam mensagens" on public.pedido_mensagens
for insert to authenticated with check (autor_id = auth.uid() and (select private.participa_pedido(pedido_id)));

drop policy if exists "usuario le notificacoes" on public.notificacoes;
create policy "usuario le notificacoes" on public.notificacoes
for select to authenticated using (usuario_id = auth.uid());
drop policy if exists "usuario atualiza notificacoes" on public.notificacoes;
create policy "usuario atualiza notificacoes" on public.notificacoes
for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "usuario gerencia push" on public.push_subscriptions;
create policy "usuario gerencia push" on public.push_subscriptions
for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

grant select, insert on public.pedido_mensagens to authenticated;
grant select on public.notificacoes to authenticated;
grant update(lida) on public.notificacoes to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create or replace function private.normalizar_autor_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_pedido public.pedidos%rowtype;
begin
  new.autor_id := auth.uid();
  new.mensagem := left(trim(new.mensagem), 1000);
  select * into v_pedido from public.pedidos where id = new.pedido_id;
  if v_pedido.usuario_id = auth.uid() then new.autor_tipo := 'cliente';
  elsif v_pedido.entregador_id = auth.uid() then new.autor_tipo := 'entregador';
  elsif exists (select 1 from public.empresas e where e.id::text = v_pedido.empresa_id and e.usuario_id = auth.uid()) then new.autor_tipo := 'restaurante';
  elsif private.is_admin() then new.autor_tipo := 'admin';
  else raise exception 'Você não participa deste pedido.';
  end if;
  return new;
end;
$$;

drop trigger if exists normalizar_autor_mensagem on public.pedido_mensagens;
create trigger normalizar_autor_mensagem
before insert on public.pedido_mensagens
for each row execute function private.normalizar_autor_mensagem();

create or replace function private.notificar_mensagem_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_pedido public.pedidos%rowtype; v_restaurante_id uuid;
begin
  select * into v_pedido from public.pedidos where id = new.pedido_id;
  select e.usuario_id into v_restaurante_id from public.empresas e where e.id::text = v_pedido.empresa_id;

  insert into public.notificacoes(usuario_id, pedido_id, titulo, mensagem, tipo)
  select destino, new.pedido_id, 'Nova mensagem no pedido', left(new.mensagem, 180), 'chat'
  from unnest(array[v_pedido.usuario_id, v_restaurante_id, v_pedido.entregador_id]) destino
  where destino is not null and destino <> new.autor_id;
  return new;
end;
$$;

drop trigger if exists notificar_mensagem_pedido on public.pedido_mensagens;
create trigger notificar_mensagem_pedido
after insert on public.pedido_mensagens
for each row execute function private.notificar_mensagem_pedido();

create or replace function private.notificar_evento_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_titulo text; v_mensagem text; v_restaurante_id uuid;
begin
  if tg_op = 'INSERT' then
    v_titulo := 'Pedido recebido';
    v_mensagem := 'Seu pedido #' || coalesce(new.numero::text, '') || ' foi enviado ao restaurante.';
    select e.usuario_id into v_restaurante_id from public.empresas e where e.id::text = new.empresa_id;
    if v_restaurante_id is not null then
      insert into public.notificacoes(usuario_id, pedido_id, titulo, mensagem, tipo)
      values (v_restaurante_id, new.id, 'Novo pedido recebido', 'O pedido #' || new.numero || ' precisa de atenção.', 'pedido');
    end if;
  elsif new.status is distinct from old.status then
    v_titulo := 'Pedido atualizado';
    v_mensagem := case new.status
      when 'preparando' then 'O restaurante iniciou o preparo do seu pedido.'
      when 'saiu_para_entrega' then 'Seu pedido saiu para entrega.'
      when 'entregue' then 'Pedido entregue. Bom apetite!'
      when 'cancelado' then 'Seu pedido foi cancelado.'
      else 'O andamento do pedido foi atualizado.' end;
  elsif new.entregador_id is distinct from old.entregador_id and new.entregador_id is not null then
    insert into public.notificacoes(usuario_id, pedido_id, titulo, mensagem, tipo)
    values (new.entregador_id, new.id, 'Nova entrega', 'A entrega do pedido #' || new.numero || ' foi atribuída a você.', 'entrega');
    return new;
  else return new;
  end if;

  insert into public.notificacoes(usuario_id, pedido_id, titulo, mensagem, tipo)
  values (new.usuario_id, new.id, v_titulo, v_mensagem, 'pedido');
  return new;
end;
$$;

drop trigger if exists notificar_evento_pedido on public.pedidos;
create trigger notificar_evento_pedido
after insert or update of status, entregador_id on public.pedidos
for each row execute function private.notificar_evento_pedido();

create or replace function public.empresa_responder_avaliacao(p_avaliacao_id uuid, p_resposta text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_usuario uuid; v_pedido uuid;
begin
  update public.avaliacoes a
  set resposta = nullif(left(trim(coalesce(p_resposta, '')), 1000), ''), updated_at = now()
  where a.id = p_avaliacao_id and exists (
    select 1 from public.empresas e
    where e.id::text = a.empresa_id and e.usuario_id = auth.uid()
  )
  returning usuario_id, pedido_id into v_usuario, v_pedido;

  if found then
    insert into public.notificacoes(usuario_id, pedido_id, titulo, mensagem, tipo)
    values (v_usuario, v_pedido, 'Resposta do restaurante', 'O restaurante respondeu à sua avaliação.', 'avaliacao');
  end if;
  return found;
end;
$$;

revoke all on function public.empresa_responder_avaliacao(uuid,text) from public, anon, authenticated;
grant execute on function public.empresa_responder_avaliacao(uuid,text) to authenticated;

-- =========================================================
-- 4) LOGS E RELATÓRIOS ADMINISTRATIVOS
-- =========================================================

create table if not exists public.app_logs (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users(id) on delete set null,
  nivel text not null check (nivel in ('info','warning','error')),
  contexto text not null,
  mensagem text not null,
  pagina text,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_logs_created_idx on public.app_logs(created_at desc);
alter table public.app_logs enable row level security;
drop policy if exists "usuario registra log" on public.app_logs;
create policy "usuario registra log" on public.app_logs
for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists "admin le logs" on public.app_logs;
create policy "admin le logs" on public.app_logs
for select to authenticated using ((select private.is_admin()));
grant insert, select on public.app_logs to authenticated;

create or replace function public.admin_relatorio_operacional(p_dias integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_admin() then jsonb_build_object(
    'periodo_dias', least(greatest(p_dias, 1), 365),
    'pedidos', count(*),
    'entregues', count(*) filter (where p.status = 'entregue'),
    'cancelados', count(*) filter (where p.status = 'cancelado'),
    'faturamento', coalesce(sum(p.total) filter (where p.status = 'entregue' and p.pagamento_status = 'pago'), 0),
    'ticket_medio', coalesce(avg(p.total) filter (where p.status = 'entregue'), 0),
    'tempo_medio_minutos', coalesce(avg(extract(epoch from (p.updated_at - p.created_at)) / 60) filter (where p.status = 'entregue'), 0),
    'online', count(*) filter (where p.pagamento_modalidade = 'online')
  ) else null end
  from public.pedidos p
  where p.created_at >= now() - make_interval(days => least(greatest(p_dias, 1), 365));
$$;

revoke all on function public.admin_relatorio_operacional(integer) from public, anon, authenticated;
grant execute on function public.admin_relatorio_operacional(integer) to authenticated;

-- Realtime com RLS: clientes recebem somente linhas que já podem consultar.
do $$
declare v_tabela text;
begin
  foreach v_tabela in array array['pedido_mensagens','notificacoes','entrega_localizacoes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabela);
    end if;
  end loop;
end $$;

commit;
