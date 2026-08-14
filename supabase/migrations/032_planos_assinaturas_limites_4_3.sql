-- Multi Delivery 4.3: planos, trial, assinaturas e limites configuráveis.
-- Não define preços comerciais. Empresas existentes permanecem no plano técnico Legado.

begin;

create table if not exists public.planos_plataforma (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  interno boolean not null default false,
  padrao_novos boolean not null default false,
  preco_mensal numeric(12,2),
  moeda text not null default 'BRL',
  trial_dias integer not null default 0,
  limite_unidades integer,
  limite_produtos integer,
  limite_funcionarios integer,
  limite_pedidos_mes integer,
  recursos jsonb not null default '{}'::jsonb,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planos_slug_check check (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  constraint planos_preco_check check (preco_mensal is null or preco_mensal >= 0),
  constraint planos_moeda_check check (moeda ~ '^[A-Z]{3}$'),
  constraint planos_trial_check check (trial_dias between 0 and 365),
  constraint planos_limite_unidades_check check (limite_unidades is null or limite_unidades > 0),
  constraint planos_limite_produtos_check check (limite_produtos is null or limite_produtos > 0),
  constraint planos_limite_funcionarios_check check (limite_funcionarios is null or limite_funcionarios > 0),
  constraint planos_limite_pedidos_check check (limite_pedidos_mes is null or limite_pedidos_mes > 0),
  constraint planos_recursos_objeto_check check (jsonb_typeof(recursos) = 'object')
);

create unique index if not exists planos_plataforma_um_padrao_idx
  on public.planos_plataforma((padrao_novos))
  where padrao_novos = true;

create table if not exists public.empresa_assinaturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete cascade,
  plano_id uuid not null references public.planos_plataforma(id) on delete restrict,
  status text not null default 'ativa',
  inicio_em timestamptz not null default now(),
  trial_fim_em timestamptz,
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  cancelada_em timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresa_assinaturas_status_check check (status in ('trial','ativa','inadimplente','cancelada','expirada')),
  constraint empresa_assinaturas_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint empresa_assinaturas_trial_check check (status <> 'trial' or trial_fim_em is not null)
);

create index if not exists empresa_assinaturas_plano_status_idx
  on public.empresa_assinaturas(plano_id, status);

alter table public.planos_plataforma enable row level security;
alter table public.empresa_assinaturas enable row level security;

revoke all on table public.planos_plataforma from public, anon, authenticated;
revoke all on table public.empresa_assinaturas from public, anon, authenticated;
grant all on table public.planos_plataforma to service_role;
grant all on table public.empresa_assinaturas to service_role;

insert into public.planos_plataforma(
  slug,nome,descricao,ativo,interno,padrao_novos,preco_mensal,trial_dias,
  limite_unidades,limite_produtos,limite_funcionarios,limite_pedidos_mes,recursos,ordem
) values (
  'legado','Legado','Plano técnico de compatibilidade para empresas existentes enquanto os planos comerciais são configurados.',
  true,true,true,null,0,null,null,null,null,
  '{"multiunidade":true,"equipe":true,"operacao":true,"financeiro":true}'::jsonb,-100
)
on conflict (slug) do nothing;

insert into public.empresa_assinaturas(empresa_id,plano_id,status,inicio_em)
select e.id,p.id,'ativa',e.created_at
from public.empresas e
cross join public.planos_plataforma p
where p.slug='legado'
on conflict (empresa_id) do nothing;

create or replace function private.assinatura_empresa_valida(p_empresa_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_assinaturas a
    join public.planos_plataforma p on p.id=a.plano_id
    where a.empresa_id::text=p_empresa_id::text
      and p.ativo=true
      and (
        a.status='ativa'
        or (a.status='trial' and a.trial_fim_em > now())
      )
  );
$$;

create or replace function private.empresa_limite_valor(p_empresa_id text,p_recurso text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_recurso
    when 'unidades' then p.limite_unidades
    when 'produtos' then p.limite_produtos
    when 'funcionarios' then p.limite_funcionarios
    when 'pedidos_mes' then p.limite_pedidos_mes
    else 0
  end
  from public.empresa_assinaturas a
  join public.planos_plataforma p on p.id=a.plano_id
  where a.empresa_id::text=p_empresa_id::text
    and p.ativo=true
    and (a.status='ativa' or (a.status='trial' and a.trial_fim_em > now()))
  limit 1;
$$;

create or replace function private.empresa_uso_recurso(p_empresa_id text,p_recurso text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_total integer;
begin
  case p_recurso
    when 'unidades' then
      select count(*)::integer into v_total from public.empresa_unidades u where u.empresa_id::text=p_empresa_id::text and u.ativa=true;
    when 'produtos' then
      select count(*)::integer into v_total from public.produtos p where p.empresa_id::text=p_empresa_id::text;
    when 'funcionarios' then
      select count(*)::integer into v_total from public.empresa_funcionarios f where f.empresa_id::text=p_empresa_id::text and f.ativo=true;
    when 'pedidos_mes' then
      select count(*)::integer into v_total from public.pedidos p
      where p.empresa_id::text=p_empresa_id::text
        and p.created_at >= date_trunc('month',now())
        and p.created_at < date_trunc('month',now()) + interval '1 month';
    else
      return 0;
  end case;
  return coalesce(v_total,0);
end;
$$;

create or replace function private.empresa_pode_consumir_recurso(p_empresa_id text,p_recurso text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_uso integer;
begin
  if not private.assinatura_empresa_valida(p_empresa_id) then return false; end if;
  v_limite := private.empresa_limite_valor(p_empresa_id,p_recurso);
  if v_limite is null then return true; end if;
  v_uso := private.empresa_uso_recurso(p_empresa_id,p_recurso);
  return v_uso < v_limite;
end;
$$;

create or replace function private.validar_limite_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id text;
  v_recurso text;
  v_validar boolean := true;
  v_limite integer;
  v_uso integer;
begin
  v_empresa_id := new.empresa_id::text;

  case tg_table_name
    when 'empresa_unidades' then
      v_recurso := 'unidades';
      v_validar := new.ativa=true and (tg_op='INSERT' or old.ativa=false);
    when 'produtos' then
      v_recurso := 'produtos';
      v_validar := tg_op='INSERT';
    when 'empresa_funcionarios' then
      v_recurso := 'funcionarios';
      v_validar := new.ativo=true and (tg_op='INSERT' or old.ativo=false);
    when 'pedidos' then
      v_recurso := 'pedidos_mes';
      v_validar := tg_op='INSERT';
    else
      return new;
  end case;

  if not v_validar then return new; end if;
  if private.empresa_pode_consumir_recurso(v_empresa_id,v_recurso) then return new; end if;

  v_limite := private.empresa_limite_valor(v_empresa_id,v_recurso);
  v_uso := private.empresa_uso_recurso(v_empresa_id,v_recurso);
  if not private.assinatura_empresa_valida(v_empresa_id) then
    raise exception 'A assinatura da empresa não está ativa. Regularize o plano para continuar.';
  end if;
  raise exception 'Limite do plano atingido para %. Uso atual: %, limite: %.',v_recurso,v_uso,v_limite;
end;
$$;

revoke all on function private.assinatura_empresa_valida(text) from public,anon,authenticated,service_role;
revoke all on function private.empresa_limite_valor(text,text) from public,anon,authenticated,service_role;
revoke all on function private.empresa_uso_recurso(text,text) from public,anon,authenticated,service_role;
revoke all on function private.empresa_pode_consumir_recurso(text,text) from public,anon,authenticated,service_role;
revoke all on function private.validar_limite_plano() from public,anon,authenticated,service_role;

drop trigger if exists validar_plano_unidades on public.empresa_unidades;
create trigger validar_plano_unidades
before insert or update of ativa on public.empresa_unidades
for each row execute function private.validar_limite_plano();

drop trigger if exists validar_plano_produtos on public.produtos;
create trigger validar_plano_produtos
before insert on public.produtos
for each row execute function private.validar_limite_plano();

drop trigger if exists validar_plano_funcionarios on public.empresa_funcionarios;
create trigger validar_plano_funcionarios
before insert or update of ativo on public.empresa_funcionarios
for each row execute function private.validar_limite_plano();

drop trigger if exists validar_plano_pedidos on public.pedidos;
create trigger validar_plano_pedidos
before insert on public.pedidos
for each row execute function private.validar_limite_plano();

create or replace function private.criar_assinatura_padrao_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_plano public.planos_plataforma%rowtype;
begin
  select p.* into v_plano
  from public.planos_plataforma p
  where p.ativo=true and p.padrao_novos=true
  limit 1;
  if not found then
    select p.* into v_plano from public.planos_plataforma p where p.slug='legado' and p.ativo=true limit 1;
  end if;
  if not found then return new; end if;

  insert into public.empresa_assinaturas(empresa_id,plano_id,status,inicio_em,trial_fim_em)
  values(
    new.id,v_plano.id,
    case when v_plano.trial_dias>0 then 'trial' else 'ativa' end,
    now(),
    case when v_plano.trial_dias>0 then now()+make_interval(days=>v_plano.trial_dias) else null end
  )
  on conflict (empresa_id) do nothing;
  return new;
end;
$$;

revoke all on function private.criar_assinatura_padrao_empresa() from public,anon,authenticated,service_role;
drop trigger if exists criar_assinatura_padrao_empresa on public.empresas;
create trigger criar_assinatura_padrao_empresa
after insert on public.empresas
for each row execute function private.criar_assinatura_padrao_empresa();

create or replace function public.empresa_meu_plano()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa public.empresas%rowtype;
  v_assinatura public.empresa_assinaturas%rowtype;
  v_plano public.planos_plataforma%rowtype;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  select e.* into v_empresa from public.empresas e where e.usuario_id=auth.uid() limit 1;
  if not found then raise exception 'Empresa não encontrada para esta conta.'; end if;

  select a.* into v_assinatura from public.empresa_assinaturas a where a.empresa_id=v_empresa.id limit 1;
  if not found then raise exception 'Assinatura não configurada.'; end if;
  select p.* into v_plano from public.planos_plataforma p where p.id=v_assinatura.plano_id limit 1;

  v_status := case
    when v_assinatura.status='trial' and v_assinatura.trial_fim_em<=now() then 'expirada'
    else v_assinatura.status
  end;

  return jsonb_build_object(
    'empresa_id',v_empresa.id,
    'plano',jsonb_build_object(
      'id',v_plano.id,'slug',v_plano.slug,'nome',v_plano.nome,'descricao',v_plano.descricao,
      'preco_mensal',v_plano.preco_mensal,'moeda',v_plano.moeda,'interno',v_plano.interno,'recursos',v_plano.recursos
    ),
    'assinatura',jsonb_build_object(
      'status',v_status,'inicio_em',v_assinatura.inicio_em,'trial_fim_em',v_assinatura.trial_fim_em,
      'periodo_inicio',v_assinatura.periodo_inicio,'periodo_fim',v_assinatura.periodo_fim
    ),
    'limites',jsonb_build_object(
      'unidades',v_plano.limite_unidades,'produtos',v_plano.limite_produtos,
      'funcionarios',v_plano.limite_funcionarios,'pedidos_mes',v_plano.limite_pedidos_mes
    ),
    'uso',jsonb_build_object(
      'unidades',private.empresa_uso_recurso(v_empresa.id::text,'unidades'),
      'produtos',private.empresa_uso_recurso(v_empresa.id::text,'produtos'),
      'funcionarios',private.empresa_uso_recurso(v_empresa.id::text,'funcionarios'),
      'pedidos_mes',private.empresa_uso_recurso(v_empresa.id::text,'pedidos_mes')
    )
  );
end;
$$;

create or replace function public.admin_planos_listar()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null or not coalesce(private.is_admin(),false) then raise exception 'Acesso administrativo obrigatório.'; end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.ordem,p.nome),'[]'::jsonb) into v_resultado
  from public.planos_plataforma p;
  return v_resultado;
end;
$$;

create or replace function public.admin_plano_salvar(p_plano jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_plano->>'id','')::uuid;
  v_slug text := lower(trim(coalesce(p_plano->>'slug','')));
  v_nome text := trim(coalesce(p_plano->>'nome',''));
  v_padrao boolean := coalesce((p_plano->>'padrao_novos')::boolean,false);
  v_resultado public.planos_plataforma%rowtype;
begin
  if auth.uid() is null or not coalesce(private.is_admin(),false) then raise exception 'Acesso administrativo obrigatório.'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,59}$' or length(v_nome)<2 then raise exception 'Slug ou nome do plano inválido.'; end if;
  if v_padrao then update public.planos_plataforma set padrao_novos=false,updated_at=now() where padrao_novos=true and (v_id is null or id<>v_id); end if;

  if v_id is null then
    insert into public.planos_plataforma(
      slug,nome,descricao,ativo,interno,padrao_novos,preco_mensal,moeda,trial_dias,
      limite_unidades,limite_produtos,limite_funcionarios,limite_pedidos_mes,recursos,ordem
    ) values (
      v_slug,v_nome,nullif(trim(p_plano->>'descricao'),''),coalesce((p_plano->>'ativo')::boolean,true),
      coalesce((p_plano->>'interno')::boolean,false),v_padrao,nullif(p_plano->>'preco_mensal','')::numeric,
      upper(coalesce(nullif(p_plano->>'moeda',''),'BRL')),coalesce(nullif(p_plano->>'trial_dias','')::integer,0),
      nullif(p_plano->>'limite_unidades','')::integer,nullif(p_plano->>'limite_produtos','')::integer,
      nullif(p_plano->>'limite_funcionarios','')::integer,nullif(p_plano->>'limite_pedidos_mes','')::integer,
      coalesce(p_plano->'recursos','{}'::jsonb),coalesce(nullif(p_plano->>'ordem','')::integer,0)
    ) returning * into v_resultado;
  else
    update public.planos_plataforma set
      slug=v_slug,nome=v_nome,descricao=nullif(trim(p_plano->>'descricao'),''),
      ativo=coalesce((p_plano->>'ativo')::boolean,ativo),interno=coalesce((p_plano->>'interno')::boolean,interno),
      padrao_novos=v_padrao,preco_mensal=case when p_plano ? 'preco_mensal' then nullif(p_plano->>'preco_mensal','')::numeric else preco_mensal end,
      moeda=upper(coalesce(nullif(p_plano->>'moeda',''),moeda)),
      trial_dias=coalesce(nullif(p_plano->>'trial_dias','')::integer,trial_dias),
      limite_unidades=case when p_plano ? 'limite_unidades' then nullif(p_plano->>'limite_unidades','')::integer else limite_unidades end,
      limite_produtos=case when p_plano ? 'limite_produtos' then nullif(p_plano->>'limite_produtos','')::integer else limite_produtos end,
      limite_funcionarios=case when p_plano ? 'limite_funcionarios' then nullif(p_plano->>'limite_funcionarios','')::integer else limite_funcionarios end,
      limite_pedidos_mes=case when p_plano ? 'limite_pedidos_mes' then nullif(p_plano->>'limite_pedidos_mes','')::integer else limite_pedidos_mes end,
      recursos=case when p_plano ? 'recursos' then coalesce(p_plano->'recursos','{}'::jsonb) else recursos end,
      ordem=coalesce(nullif(p_plano->>'ordem','')::integer,ordem),updated_at=now()
    where id=v_id returning * into v_resultado;
    if not found then raise exception 'Plano não encontrado.'; end if;
  end if;
  return to_jsonb(v_resultado);
end;
$$;

create or replace function public.admin_assinatura_definir(
  p_empresa_id text,
  p_plano_id uuid,
  p_status text default 'ativa',
  p_trial_dias integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_plano public.planos_plataforma%rowtype;
  v_assinatura public.empresa_assinaturas%rowtype;
  v_trial integer;
begin
  if auth.uid() is null or not coalesce(private.is_admin(),false) then raise exception 'Acesso administrativo obrigatório.'; end if;
  if p_status not in ('trial','ativa','inadimplente','cancelada','expirada') then raise exception 'Status de assinatura inválido.'; end if;
  select e.id into v_empresa from public.empresas e where e.id::text=p_empresa_id::text limit 1;
  if v_empresa is null then raise exception 'Empresa não encontrada.'; end if;
  select p.* into v_plano from public.planos_plataforma p where p.id=p_plano_id and p.ativo=true limit 1;
  if not found then raise exception 'Plano ativo não encontrado.'; end if;
  v_trial := greatest(0,least(365,coalesce(p_trial_dias,v_plano.trial_dias)));
  if p_status='trial' and v_trial=0 then raise exception 'Informe uma duração de trial maior que zero.'; end if;

  insert into public.empresa_assinaturas(empresa_id,plano_id,status,inicio_em,trial_fim_em,cancelada_em,updated_at)
  values(v_empresa,p_plano_id,p_status,now(),case when p_status='trial' then now()+make_interval(days=>v_trial) else null end,case when p_status='cancelada' then now() else null end,now())
  on conflict (empresa_id) do update set
    plano_id=excluded.plano_id,status=excluded.status,
    trial_fim_em=excluded.trial_fim_em,cancelada_em=excluded.cancelada_em,updated_at=now()
  returning * into v_assinatura;
  return to_jsonb(v_assinatura);
end;
$$;

revoke all on function public.empresa_meu_plano() from public,anon,authenticated,service_role;
revoke all on function public.admin_planos_listar() from public,anon,authenticated,service_role;
revoke all on function public.admin_plano_salvar(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.admin_assinatura_definir(text,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.empresa_meu_plano() to authenticated;
grant execute on function public.admin_planos_listar() to authenticated;
grant execute on function public.admin_plano_salvar(jsonb) to authenticated;
grant execute on function public.admin_assinatura_definir(text,uuid,text,integer) to authenticated;

commit;
