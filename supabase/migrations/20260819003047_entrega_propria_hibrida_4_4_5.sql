-- Multi Delivery 4.4.5: entrega própria, plataforma e modo híbrido por unidade.
-- A distribuição continua fail-closed: somente entregadores aprovados, online,
-- com localização recente e sem outra corrida ativa recebem ou assumem pedidos.

begin;

alter table public.empresa_unidades
  add column if not exists entrega_modalidade text not null default 'plataforma';
alter table public.empresa_unidades
  add column if not exists entrega_hibrida_fallback_minutos smallint not null default 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'empresa_unidades_entrega_modalidade_check'
      and conrelid = 'public.empresa_unidades'::regclass
  ) then
    alter table public.empresa_unidades
      add constraint empresa_unidades_entrega_modalidade_check
      check (entrega_modalidade in ('propria', 'plataforma', 'hibrida'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'empresa_unidades_entrega_fallback_check'
      and conrelid = 'public.empresa_unidades'::regclass
  ) then
    alter table public.empresa_unidades
      add constraint empresa_unidades_entrega_fallback_check
      check (entrega_hibrida_fallback_minutos between 1 and 60);
  end if;
end $$;

create table if not exists public.empresa_entregadores (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  unidade_id uuid not null references public.empresa_unidades(id) on delete cascade,
  entregador_id uuid not null references public.entregadores(id) on delete cascade,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresa_entregadores_unidade_entregador_key unique (unidade_id, entregador_id)
);

create index if not exists empresa_entregadores_empresa_unidade_ativo_idx
  on public.empresa_entregadores(empresa_id, unidade_id, ativo);
create index if not exists empresa_entregadores_entregador_ativo_idx
  on public.empresa_entregadores(entregador_id, ativo, unidade_id);

alter table public.empresa_entregadores enable row level security;

drop policy if exists "entregador le vinculo proprio" on public.empresa_entregadores;
drop policy if exists "proprietario le entregadores da unidade" on public.empresa_entregadores;
drop policy if exists "participantes leem vinculos proprios" on public.empresa_entregadores;
create policy "participantes leem vinculos proprios"
on public.empresa_entregadores
for select to authenticated
using (
  entregador_id = (select auth.uid())
  or exists (
    select 1
    from public.empresas e
    where e.id::text = empresa_entregadores.empresa_id::text
      and e.usuario_id = (select auth.uid())
  )
);

revoke all on table public.empresa_entregadores from public, anon, authenticated, service_role;
grant select on table public.empresa_entregadores to authenticated, service_role;

drop trigger if exists empresa_entregadores_set_updated_at on public.empresa_entregadores;
create trigger empresa_entregadores_set_updated_at
before update on public.empresa_entregadores
for each row execute function public.set_updated_at();

alter table public.entrega_ofertas
  add column if not exists origem text not null default 'plataforma';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'entrega_ofertas_origem_check'
      and conrelid = 'public.entrega_ofertas'::regclass
  ) then
    alter table public.entrega_ofertas
      add constraint entrega_ofertas_origem_check
      check (origem in ('propria', 'plataforma'));
  end if;
end $$;

create index if not exists entrega_ofertas_pedido_status_origem_idx
  on public.entrega_ofertas(pedido_id, status, origem);

-- A trava também cobre duas aceitações simultâneas feitas em abas/dispositivos
-- diferentes. O código ainda valida o estado para devolver uma mensagem clara.
create unique index if not exists pedidos_entregador_corrida_ativa_uniq
  on public.pedidos(entregador_id)
  where entregador_id is not null
    and status in ('preparando', 'saiu_para_entrega');

create or replace function public.empresa_unidade_configurar_entrega(
  p_unidade_id uuid,
  p_modalidade text,
  p_fallback_minutos integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unidade record;
  v_total_ativos integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;
  if p_modalidade is null or p_modalidade not in ('propria', 'plataforma', 'hibrida') then
    raise exception 'Modalidade de entrega inválida.';
  end if;
  if coalesce(p_fallback_minutos, 5) < 1
     or coalesce(p_fallback_minutos, 5) > 60 then
    raise exception 'O fallback híbrido deve ficar entre 1 e 60 minutos.';
  end if;

  select u.id,u.empresa_id,u.nome
  into v_unidade
  from public.empresa_unidades u
  join public.empresas e on e.id::text = u.empresa_id::text
  where u.id = p_unidade_id
    and e.usuario_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Unidade não encontrada ou acesso negado.';
  end if;

  update public.empresa_unidades
  set entrega_modalidade = p_modalidade,
      entrega_hibrida_fallback_minutos = coalesce(p_fallback_minutos, 5),
      updated_at = now()
  where id = p_unidade_id;

  -- A troca de modalidade invalida ofertas abertas pela regra anterior.
  -- A redistribuição abaixo recria apenas as ofertas agora elegíveis.
  update public.entrega_ofertas o
  set status = 'encerrada',updated_at = now()
  from public.pedidos p
  where p.id = o.pedido_id
    and p.unidade_id = p_unidade_id
    and p.status = 'preparando'
    and p.pronto_em is not null
    and p.entregador_id is null
    and o.status = 'disponivel';

  select count(*)::integer into v_total_ativos
  from public.empresa_entregadores v
  join public.entregadores d on d.id = v.entregador_id
  where v.unidade_id = p_unidade_id
    and v.empresa_id::text = v_unidade.empresa_id::text
    and v.ativo = true
    and d.aprovado = true;

  perform private.redistribuir_entregas_pendentes(100);

  return jsonb_build_object(
    'unidade_id', p_unidade_id,
    'unidade_nome', v_unidade.nome,
    'modalidade', p_modalidade,
    'fallback_minutos', coalesce(p_fallback_minutos, 5),
    'entregadores_ativos', v_total_ativos
  );
end;
$$;

create or replace function public.empresa_listar_entregadores_proprios(p_unidade_id uuid)
returns table (
  entregador_id uuid,
  nome text,
  email text,
  telefone text,
  veiculo text,
  placa text,
  aprovado boolean,
  online boolean,
  localizacao_atualizada_em timestamptz,
  ativo boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa_id text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select u.empresa_id::text into v_empresa_id
  from public.empresa_unidades u
  where u.id = p_unidade_id
  limit 1;

  if v_empresa_id is null
     or not private.tem_permissao_empresa(v_empresa_id, 'atendimento_operar') then
    raise exception 'Acesso não autorizado para consultar a equipe de entrega.';
  end if;

  return query
  select
    d.id,
    d.nome::text,
    au.email::text,
    d.telefone::text,
    d.veiculo::text,
    d.placa::text,
    d.aprovado,
    d.online,
    d.localizacao_atualizada_em,
    v.ativo,
    v.created_at
  from public.empresa_entregadores v
  join public.entregadores d on d.id = v.entregador_id
  join auth.users au on au.id = d.id
  where v.unidade_id = p_unidade_id
    and v.empresa_id::text = v_empresa_id
  order by v.ativo desc,d.nome,au.email;
end;
$$;

create or replace function public.empresa_salvar_entregador_proprio(
  p_unidade_id uuid,
  p_email text
)
returns public.empresa_entregadores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id text;
  v_entregador_id uuid;
  v_vinculo public.empresa_entregadores%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'Informe o e-mail do entregador.';
  end if;

  select u.empresa_id::text into v_empresa_id
  from public.empresa_unidades u
  join public.empresas e on e.id::text = u.empresa_id::text
  where u.id = p_unidade_id
    and e.usuario_id = auth.uid()
  limit 1;

  if v_empresa_id is null then
    raise exception 'Unidade não encontrada ou acesso negado.';
  end if;

  select d.id into v_entregador_id
  from auth.users au
  join public.entregadores d on d.id = au.id
  where lower(au.email) = lower(trim(p_email))
  limit 1;

  if v_entregador_id is null then
    raise exception 'O usuário precisa criar o cadastro de entregador antes de ser vinculado.';
  end if;

  insert into public.empresa_entregadores(
    empresa_id,unidade_id,entregador_id,ativo,criado_por,updated_at
  ) values (
    v_empresa_id,p_unidade_id,v_entregador_id,true,auth.uid(),now()
  )
  on conflict (unidade_id,entregador_id) do update
  set empresa_id = excluded.empresa_id,
      ativo = true,
      criado_por = auth.uid(),
      updated_at = now()
  returning * into v_vinculo;

  perform private.redistribuir_entregas_pendentes(100);
  return v_vinculo;
end;
$$;

create or replace function public.empresa_remover_entregador_proprio(
  p_unidade_id uuid,
  p_entregador_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id text;
begin
  select u.empresa_id::text into v_empresa_id
  from public.empresa_unidades u
  join public.empresas e on e.id::text = u.empresa_id::text
  where u.id = p_unidade_id
    and e.usuario_id = auth.uid()
  limit 1;

  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Apenas o proprietário pode gerenciar a equipe de entrega.';
  end if;

  update public.empresa_entregadores
  set ativo = false,updated_at = now()
  where unidade_id = p_unidade_id
    and empresa_id::text = v_empresa_id
    and entregador_id = p_entregador_id
    and ativo = true;

  if not found then
    return false;
  end if;

  update public.entrega_ofertas o
  set status = 'encerrada',updated_at = now()
  from public.pedidos p
  where p.id = o.pedido_id
    and p.unidade_id = p_unidade_id
    and o.entregador_id = p_entregador_id
    and o.origem = 'propria'
    and o.status = 'disponivel';

  update public.notificacoes n
  set lida = true
  from public.pedidos p
  where p.id = n.pedido_id
    and p.unidade_id = p_unidade_id
    and n.usuario_id = p_entregador_id
    and n.tipo = 'entrega_disponivel'
    and n.lida = false;

  perform private.redistribuir_entregas_pendentes(100);
  return true;
end;
$$;

create or replace function public.empresa_atribuir_entregador_proprio(
  p_pedido_id uuid,
  p_entregador_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id text;
  v_unidade_id uuid;
  v_valor numeric(10,2);
  v_pedido record;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select p.empresa_id::text,p.unidade_id
  into v_empresa_id,v_unidade_id
  from public.pedidos p
  where p.id = p_pedido_id
  limit 1;

  if v_empresa_id is null
     or not private.tem_permissao_empresa(v_empresa_id, 'atendimento_operar') then
    raise exception 'Acesso não autorizado para atribuir esta entrega.';
  end if;
  if v_unidade_id is null then
    raise exception 'O pedido não possui uma unidade válida.';
  end if;

  select d.valor_por_entrega::numeric(10,2) into v_valor
  from public.entregadores d
  where d.id = p_entregador_id
    and d.aprovado = true
    and d.online = true
    and d.latitude is not null
    and d.longitude is not null
    and d.localizacao_atualizada_em >= now() - interval '30 minutes'
    and exists (
      select 1
      from public.empresa_entregadores v
      where v.empresa_id::text = v_empresa_id
        and v.unidade_id = v_unidade_id
        and v.entregador_id = d.id
        and v.ativo = true
    )
  for update;

  if not found then
    raise exception 'O entregador próprio precisa estar aprovado, online e com localização recente.';
  end if;

  if exists (
    select 1 from public.pedidos px
    where px.entregador_id = p_entregador_id
      and px.status in ('preparando', 'saiu_para_entrega')
  ) then
    raise exception 'Este entregador já possui uma corrida ativa.';
  end if;

  select p.* into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
  for update;

  if v_pedido.empresa_id::text <> v_empresa_id
     or v_pedido.unidade_id is distinct from v_unidade_id
     or v_pedido.status <> 'preparando'
     or v_pedido.pronto_em is null
     or v_pedido.entregador_id is not null
     or (v_pedido.pagamento_modalidade = 'online' and v_pedido.pagamento_status <> 'pago') then
    raise exception 'O pedido não está disponível para atribuição.';
  end if;

  update public.pedidos
  set entregador_id = p_entregador_id,
      entregador_valor = coalesce(v_valor, 0),
      updated_at = now()
  where id = p_pedido_id
    and entregador_id is null;

  if not found then
    return false;
  end if;

  insert into public.notificacoes(
    usuario_id,pedido_id,titulo,mensagem,tipo,lida,destino
  ) values (
    p_entregador_id,
    p_pedido_id,
    'Entrega atribuída pela sua equipe',
    'O pedido #' || coalesce(v_pedido.numero::text, left(p_pedido_id::text, 8)) || ' foi atribuído diretamente a você.',
    'entrega_atribuida',
    false,
    'entregador.html'
  );

  return true;
exception when unique_violation then
  raise exception 'Este entregador já possui uma corrida ativa.';
end;
$$;

create or replace function private.distribuir_oferta_pedido(p_pedido_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido record;
  v_unidade record;
  v_modalidade text;
  v_fallback_minutos integer;
  v_liberar_plataforma boolean;
  v_etapa smallint;
  v_raio numeric(10,2);
  v_limite integer;
  v_idade interval;
  v_candidato record;
  v_criadas integer := 0;
  v_distancia_txt text;
  v_ganho_txt text;
begin
  select
    p.id,p.numero,p.empresa_id,p.empresa_nome,p.unidade_id,p.pronto_em,
    p.agendado_para,p.pagamento_modalidade,p.pagamento_status,p.entregador_id
  into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
    and p.status = 'preparando'
    and p.pronto_em is not null
    and p.entregador_id is null
    and (p.pagamento_modalidade is distinct from 'online' or p.pagamento_status = 'pago')
    and (p.agendado_para is null or p.agendado_para <= now() + interval '45 minutes')
  limit 1;

  if not found then
    return 0;
  end if;

  select
    u.id,u.nome,u.latitude,u.longitude,
    u.entrega_modalidade,u.entrega_hibrida_fallback_minutos
  into v_unidade
  from public.empresa_unidades u
  where u.empresa_id::text = v_pedido.empresa_id::text
    and (u.id = v_pedido.unidade_id or (v_pedido.unidade_id is null and u.principal = true))
    and u.ativa = true
  order by (u.id = v_pedido.unidade_id) desc,u.principal desc
  limit 1;

  if not found then
    return 0;
  end if;

  v_modalidade := coalesce(v_unidade.entrega_modalidade, 'plataforma');
  v_fallback_minutos := greatest(1, least(coalesce(v_unidade.entrega_hibrida_fallback_minutos, 5), 60));
  v_idade := greatest(interval '0 seconds', now() - v_pedido.pronto_em);
  v_liberar_plataforma := v_modalidade = 'plataforma'
    or (v_modalidade = 'hibrida' and v_idade >= make_interval(mins => v_fallback_minutos));

  if v_idade < interval '1 minute' then
    v_etapa := 1;
    v_raio := 4;
    v_limite := 5;
  elsif v_idade < interval '3 minutes' then
    v_etapa := 2;
    v_raio := 8;
    v_limite := 10;
  else
    v_etapa := 3;
    v_raio := 15;
    v_limite := 20;
  end if;

  for v_candidato in
    with candidatos as (
      select
        d.id,
        coalesce(d.valor_por_entrega, 0)::numeric(10,2) as valor_oferta,
        d.localizacao_atualizada_em,
        case
          when v_unidade.latitude is null or v_unidade.longitude is null then null
          else private.distancia_km(d.latitude,d.longitude,v_unidade.latitude,v_unidade.longitude)
        end as distancia_coleta_km,
        (
          v_modalidade in ('propria', 'hibrida')
          and exists (
            select 1
            from public.empresa_entregadores ve
            where ve.empresa_id::text = v_pedido.empresa_id::text
              and ve.unidade_id = v_unidade.id
              and ve.entregador_id = d.id
              and ve.ativo = true
          )
        ) as proprio
      from public.entregadores d
      where d.aprovado = true
        and d.online = true
        and d.latitude is not null
        and d.longitude is not null
        and d.localizacao_atualizada_em >= now() - interval '30 minutes'
        and not exists (
          select 1
          from public.pedidos px
          where px.entregador_id = d.id
            and px.status in ('preparando', 'saiu_para_entrega')
        )
    ), ranqueados as (
      select
        c.*,
        row_number() over (
          partition by c.proprio
          order by c.distancia_coleta_km nulls last,c.localizacao_atualizada_em desc,c.id
        ) as posicao
      from candidatos c
      where c.proprio
        or (
          v_liberar_plataforma
          and (
            v_unidade.latitude is null
            or v_unidade.longitude is null
            or c.distancia_coleta_km <= v_raio
          )
        )
    )
    select
      r.id,r.valor_oferta,r.distancia_coleta_km,r.proprio,
      case when r.proprio then 'propria'::text else 'plataforma'::text end as origem,
      case when r.proprio then 1::smallint else v_etapa end as etapa,
      case
        when r.proprio or v_unidade.latitude is null or v_unidade.longitude is null then null
        else v_raio
      end as raio_km
    from ranqueados r
    where (r.proprio and r.posicao <= 50)
       or (not r.proprio and v_liberar_plataforma and r.posicao <= v_limite)
    order by r.proprio desc,r.distancia_coleta_km nulls last,r.localizacao_atualizada_em desc,r.id
  loop
    insert into public.entrega_ofertas(
      pedido_id,entregador_id,distancia_coleta_km,valor_oferta,raio_km,etapa,status,origem
    ) values (
      v_pedido.id,v_candidato.id,v_candidato.distancia_coleta_km,
      v_candidato.valor_oferta,v_candidato.raio_km,v_candidato.etapa,'disponivel',v_candidato.origem
    )
    on conflict (pedido_id,entregador_id) do update
    set distancia_coleta_km = excluded.distancia_coleta_km,
        valor_oferta = excluded.valor_oferta,
        raio_km = excluded.raio_km,
        etapa = excluded.etapa,
        status = 'disponivel',
        origem = excluded.origem,
        updated_at = now()
    where entrega_ofertas.status = 'encerrada';

    if found then
      v_distancia_txt := case
        when v_candidato.distancia_coleta_km is null then 'distância da coleta indisponível'
        else replace(to_char(v_candidato.distancia_coleta_km,'FM999990D00'),'.',',') || ' km até a coleta'
      end;
      v_ganho_txt := case
        when v_candidato.valor_oferta > 0 then
          'ganho R$ ' || replace(to_char(v_candidato.valor_oferta,'FM999999990D00'),'.',',')
        else 'tarifa ainda não configurada'
      end;

      insert into public.notificacoes(
        usuario_id,pedido_id,titulo,mensagem,tipo,lida,destino
      ) values (
        v_candidato.id,
        v_pedido.id,
        case when v_candidato.origem = 'propria' then 'Entrega da sua equipe' else 'Nova entrega disponível' end,
        coalesce(v_pedido.empresa_nome,'Restaurante') || ' • ' || v_distancia_txt || ' • ' || v_ganho_txt,
        'entrega_disponivel',
        false,
        'entregador.html?oferta=' || v_pedido.id::text
      );

      v_criadas := v_criadas + 1;
    end if;
  end loop;

  return v_criadas;
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
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  if not exists (
    select 1 from public.entregadores d
    where d.id = auth.uid()
      and d.aprovado = true
      and d.online = true
      and d.latitude is not null
      and d.longitude is not null
      and d.localizacao_atualizada_em >= now() - interval '30 minutes'
  ) then
    raise exception 'Entregador aprovado, online e com localização recente obrigatório.';
  end if;

  select coalesce(jsonb_agg(q.dados order by
    q.origem_ordem,q.distancia_coleta_km nulls last,q.prioridade desc,q.ordenacao_tempo,q.created_at
  ), '[]'::jsonb)
  into v_resultado
  from (
    select
      p.prioridade,
      coalesce(p.agendado_para,p.created_at) as ordenacao_tempo,
      p.created_at,
      o.distancia_coleta_km,
      case when o.origem = 'propria' then 0 else 1 end as origem_ordem,
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
        'distancia_coleta_km',o.distancia_coleta_km,
        'distancia_entrega_km',p.distancia_km,
        'ganho_entregador',o.valor_oferta,
        'oferta_etapa',o.etapa,
        'oferta_raio_km',o.raio_km,
        'oferta_origem',o.origem
      ) as dados
    from public.entrega_ofertas o
    join public.pedidos p on p.id = o.pedido_id
    left join lateral (
      select ux.*
      from public.empresa_unidades ux
      where ux.empresa_id::text = p.empresa_id::text
        and (ux.id = p.unidade_id or (p.unidade_id is null and ux.principal = true))
      order by (ux.id = p.unidade_id) desc,ux.principal desc
      limit 1
    ) u on true
    where o.entregador_id = auth.uid()
      and o.status = 'disponivel'
      and p.status = 'preparando'
      and p.pronto_em is not null
      and p.entregador_id is null
      and (p.pagamento_modalidade is distinct from 'online' or p.pagamento_status = 'pago')
      and (p.agendado_para is null or p.agendado_para <= now() + interval '45 minutes')
    limit 50
  ) q;

  return v_resultado;
end;
$$;

create or replace function public.entregador_aceitar_pedido(p_pedido_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oferta public.entrega_ofertas%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  perform 1
  from public.entregadores d
  where d.id = auth.uid()
    and d.aprovado = true
    and d.online = true
    and d.latitude is not null
    and d.longitude is not null
    and d.localizacao_atualizada_em >= now() - interval '30 minutes'
  for update;

  if not found then
    raise exception 'Entregador aprovado, online e com localização recente obrigatório.';
  end if;

  if exists (
    select 1
    from public.pedidos p
    where p.entregador_id = auth.uid()
      and p.status in ('preparando', 'saiu_para_entrega')
  ) then
    raise exception 'Conclua sua entrega atual antes de aceitar outra.';
  end if;

  select o.* into v_oferta
  from public.entrega_ofertas o
  where o.pedido_id = p_pedido_id
    and o.entregador_id = auth.uid()
    and o.status = 'disponivel'
  for update;

  if not found then
    raise exception 'Esta oferta não está mais disponível para você.';
  end if;

  update public.pedidos
  set entregador_id = auth.uid(),
      entregador_valor = v_oferta.valor_oferta,
      updated_at = now()
  where id = p_pedido_id
    and status = 'preparando'
    and pronto_em is not null
    and entregador_id is null
    and (pagamento_modalidade is distinct from 'online' or pagamento_status = 'pago');

  if not found then
    update public.entrega_ofertas
    set status = 'encerrada',updated_at = now()
    where id = v_oferta.id;
    return false;
  end if;

  update public.entrega_ofertas
  set status = case when entregador_id = auth.uid() then 'aceita' else 'encerrada' end,
      updated_at = now()
  where pedido_id = p_pedido_id;

  update public.notificacoes
  set lida = true
  where pedido_id = p_pedido_id
    and tipo = 'entrega_disponivel'
    and lida = false;

  return true;
exception when unique_violation then
  raise exception 'Conclua sua entrega atual antes de aceitar outra.';
end;
$$;

revoke all on function public.empresa_unidade_configurar_entrega(uuid,text,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.empresa_listar_entregadores_proprios(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.empresa_salvar_entregador_proprio(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.empresa_remover_entregador_proprio(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.empresa_atribuir_entregador_proprio(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.listar_entregas_disponiveis_proximidade()
  from public,anon,authenticated,service_role;
revoke all on function public.entregador_aceitar_pedido(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.distribuir_oferta_pedido(uuid)
  from public,anon,authenticated,service_role;

grant execute on function public.empresa_unidade_configurar_entrega(uuid,text,integer) to authenticated;
grant execute on function public.empresa_listar_entregadores_proprios(uuid) to authenticated;
grant execute on function public.empresa_salvar_entregador_proprio(uuid,text) to authenticated;
grant execute on function public.empresa_remover_entregador_proprio(uuid,uuid) to authenticated;
grant execute on function public.empresa_atribuir_entregador_proprio(uuid,uuid) to authenticated;
grant execute on function public.listar_entregas_disponiveis_proximidade() to authenticated;
grant execute on function public.entregador_aceitar_pedido(uuid) to authenticated;

select private.redistribuir_entregas_pendentes(100);

commit;
