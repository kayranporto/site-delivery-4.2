-- Multi Delivery 4.4: coordenadas opcionais, distância observável e ranking de coleta.
-- Não altera a tarifa de entrega por km. Preço continua seguindo regiões/configuração existente.

begin;

alter table public.empresa_unidades
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists localizacao_atualizada_em timestamptz;

alter table public.enderecos
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists localizacao_atualizada_em timestamptz;

alter table public.entregadores
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists precisao_metros numeric(10,2),
  add column if not exists localizacao_atualizada_em timestamptz;

alter table public.pedidos
  add column if not exists distancia_km numeric(10,2);

alter table public.empresa_unidades drop constraint if exists empresa_unidades_coordenadas_check;
alter table public.empresa_unidades add constraint empresa_unidades_coordenadas_check check (
  (latitude is null and longitude is null)
  or (latitude between -90 and 90 and longitude between -180 and 180)
);

alter table public.enderecos drop constraint if exists enderecos_coordenadas_check;
alter table public.enderecos add constraint enderecos_coordenadas_check check (
  (latitude is null and longitude is null)
  or (latitude between -90 and 90 and longitude between -180 and 180)
);

alter table public.entregadores drop constraint if exists entregadores_coordenadas_check;
alter table public.entregadores add constraint entregadores_coordenadas_check check (
  (latitude is null and longitude is null)
  or (latitude between -90 and 90 and longitude between -180 and 180)
);

alter table public.entregadores drop constraint if exists entregadores_precisao_check;
alter table public.entregadores add constraint entregadores_precisao_check check (
  precisao_metros is null or precisao_metros between 0 and 10000
);

alter table public.pedidos drop constraint if exists pedidos_distancia_check;
alter table public.pedidos add constraint pedidos_distancia_check check (
  distancia_km is null or distancia_km between 0 and 5000
);

create index if not exists entregadores_online_localizacao_idx
  on public.entregadores(aprovado, online, localizacao_atualizada_em desc)
  where aprovado = true and online = true;

create or replace function private.distancia_km(
  p_lat1 double precision,
  p_lon1 double precision,
  p_lat2 double precision,
  p_lon2 double precision
)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  select round((
    6371.0088 * 2 * asin(
      sqrt(
        power(sin(radians(p_lat2 - p_lat1) / 2), 2)
        + cos(radians(p_lat1)) * cos(radians(p_lat2))
          * power(sin(radians(p_lon2 - p_lon1) / 2), 2)
      )
    )
  )::numeric, 2);
$$;

revoke all on function private.distancia_km(double precision,double precision,double precision,double precision)
  from public, anon, authenticated, service_role;

create or replace function private.preencher_distancia_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unidade record;
  v_endereco record;
begin
  if new.unidade_id is null or new.endereco_id is null then
    new.distancia_km := null;
    return new;
  end if;

  select u.latitude,u.longitude into v_unidade
  from public.empresa_unidades u
  where u.id=new.unidade_id and u.empresa_id::text=new.empresa_id::text
  limit 1;

  select e.latitude,e.longitude into v_endereco
  from public.enderecos e
  where e.id=new.endereco_id and e.usuario_id=new.usuario_id
  limit 1;

  if v_unidade.latitude is null or v_unidade.longitude is null
     or v_endereco.latitude is null or v_endereco.longitude is null then
    new.distancia_km := null;
  else
    new.distancia_km := private.distancia_km(
      v_unidade.latitude,v_unidade.longitude,
      v_endereco.latitude,v_endereco.longitude
    );
  end if;
  return new;
end;
$$;

revoke all on function private.preencher_distancia_pedido()
  from public, anon, authenticated, service_role;

drop trigger if exists preencher_distancia_pedido on public.pedidos;
create trigger preencher_distancia_pedido
before insert or update of unidade_id,endereco_id on public.pedidos
for each row execute function private.preencher_distancia_pedido();

create or replace function public.empresa_unidade_atualizar_localizacao(
  p_unidade_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_empresa_id text;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Coordenadas inválidas.';
  end if;

  select u.empresa_id::text into v_empresa_id
  from public.empresa_unidades u
  join public.empresas e on e.id::text=u.empresa_id::text
  where u.id=p_unidade_id and e.usuario_id=auth.uid()
  limit 1;
  if v_empresa_id is null then raise exception 'Unidade não encontrada ou acesso negado.'; end if;

  update public.empresa_unidades
  set latitude=p_latitude,longitude=p_longitude,localizacao_atualizada_em=now(),updated_at=now()
  where id=p_unidade_id and empresa_id::text=v_empresa_id;
  return true;
end;
$$;

create or replace function public.endereco_atualizar_localizacao(
  p_endereco_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Coordenadas inválidas.';
  end if;

  update public.enderecos
  set latitude=p_latitude,longitude=p_longitude,localizacao_atualizada_em=now(),updated_at=now()
  where id=p_endereco_id and usuario_id=auth.uid();
  if not found then raise exception 'Endereço não encontrado ou acesso negado.'; end if;
  return true;
end;
$$;

create or replace function public.entregador_atualizar_posicao(
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
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Coordenadas inválidas.';
  end if;
  if p_precisao_metros is not null and (p_precisao_metros < 0 or p_precisao_metros > 10000) then
    raise exception 'Precisão inválida.';
  end if;

  update public.entregadores
  set latitude=p_latitude,longitude=p_longitude,precisao_metros=p_precisao_metros,
      localizacao_atualizada_em=now(),updated_at=now()
  where id=auth.uid() and aprovado=true and online=true;
  if not found then raise exception 'Entregador aprovado e online obrigatório.'; end if;
  return true;
end;
$$;

create or replace function public.listar_entregas_disponiveis_proximidade()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entregador public.entregadores%rowtype;
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  select d.* into v_entregador
  from public.entregadores d
  where d.id=auth.uid() and d.aprovado=true and d.online=true
  limit 1;
  if not found then raise exception 'Entregador aprovado e online obrigatório.'; end if;

  select coalesce(jsonb_agg(q.dados order by
    q.sem_distancia,
    q.distancia_coleta_km nulls last,
    q.prioridade desc,
    q.ordenacao_tempo,
    q.created_at
  ),'[]'::jsonb)
  into v_resultado
  from (
    select
      p.prioridade,
      coalesce(p.agendado_para,p.created_at) as ordenacao_tempo,
      p.created_at,
      case when v_entregador.latitude is null or v_entregador.longitude is null
             or u.latitude is null or u.longitude is null then 1 else 0 end as sem_distancia,
      case when v_entregador.latitude is null or v_entregador.longitude is null
             or u.latitude is null or u.longitude is null then null
           else private.distancia_km(v_entregador.latitude,v_entregador.longitude,u.latitude,u.longitude)
      end as distancia_coleta_km,
      jsonb_build_object(
        'pedido_id',p.id,
        'numero',p.numero,
        'restaurante',p.empresa_nome,
        'unidade_id',u.id,
        'unidade_nome',coalesce(u.nome,'Unidade principal'),
        'bairro',coalesce((regexp_match(p.endereco,'— ([^—]+) —'))[1],'Região protegida'),
        'total',p.total,
        'pagamento',p.pagamento,
        'agendado_para',p.agendado_para,
        'created_at',p.created_at,
        'distancia_coleta_km',case when v_entregador.latitude is null or v_entregador.longitude is null
             or u.latitude is null or u.longitude is null then null
           else private.distancia_km(v_entregador.latitude,v_entregador.longitude,u.latitude,u.longitude) end,
        'distancia_entrega_km',p.distancia_km
      ) as dados
    from public.pedidos p
    left join lateral (
      select ux.*
      from public.empresa_unidades ux
      where ux.empresa_id::text=p.empresa_id::text
        and (ux.id=p.unidade_id or (p.unidade_id is null and ux.principal=true))
      order by (ux.id=p.unidade_id) desc,ux.principal desc
      limit 1
    ) u on true
    where p.status='preparando'
      and p.pronto_em is not null
      and p.entregador_id is null
      and (p.pagamento_modalidade is distinct from 'online' or p.pagamento_status='pago')
      and (p.agendado_para is null or p.agendado_para<=now()+interval '45 minutes')
    limit 50
  ) q;

  return v_resultado;
end;
$$;

revoke all on function public.empresa_unidade_atualizar_localizacao(uuid,double precision,double precision)
  from public,anon,authenticated,service_role;
revoke all on function public.endereco_atualizar_localizacao(uuid,double precision,double precision)
  from public,anon,authenticated,service_role;
revoke all on function public.entregador_atualizar_posicao(double precision,double precision,numeric)
  from public,anon,authenticated,service_role;
revoke all on function public.listar_entregas_disponiveis_proximidade()
  from public,anon,authenticated,service_role;

grant execute on function public.empresa_unidade_atualizar_localizacao(uuid,double precision,double precision) to authenticated;
grant execute on function public.endereco_atualizar_localizacao(uuid,double precision,double precision) to authenticated;
grant execute on function public.entregador_atualizar_posicao(double precision,double precision,numeric) to authenticated;
grant execute on function public.listar_entregas_disponiveis_proximidade() to authenticated;

commit;
