-- Exclusão administrativa segura de restaurantes.
-- A loja deixa de operar e de conceder acesso, mas pedidos e auditoria
-- permanecem preservados para suporte, conciliação e histórico.

begin;

alter table public.empresas
  add column if not exists excluida_em timestamptz,
  add column if not exists excluida_por uuid,
  add column if not exists proprietario_anterior_id uuid;

comment on column public.empresas.excluida_em is
  'Marca a exclusão administrativa lógica da loja sem remover pedidos e auditoria.';
comment on column public.empresas.excluida_por is
  'Administrador responsável pela exclusão lógica da loja.';
comment on column public.empresas.proprietario_anterior_id is
  'Proprietário no momento da exclusão; impede recadastro automático pela mesma conta.';

create index if not exists empresas_proprietario_excluido_idx
  on public.empresas(proprietario_anterior_id)
  where excluida_em is not null;

create or replace function private.impedir_recadastro_restaurante_excluido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.usuario_id is not null and exists (
    select 1
    from public.empresas e
    where e.proprietario_anterior_id = new.usuario_id
      and e.excluida_em is not null
  ) then
    raise exception 'O restaurante desta conta foi excluído pela administração. Procure o suporte.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.impedir_recadastro_restaurante_excluido()
  from public, anon, authenticated, service_role;

drop trigger if exists a_impedir_recadastro_restaurante_excluido on public.empresas;
create trigger a_impedir_recadastro_restaurante_excluido
before insert on public.empresas
for each row execute function private.impedir_recadastro_restaurante_excluido();

create or replace function private.proteger_restaurante_excluido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.excluida_em is not null and (
    new.excluida_em is distinct from old.excluida_em
    or new.excluida_por is distinct from old.excluida_por
    or new.proprietario_anterior_id is distinct from old.proprietario_anterior_id
    or new.usuario_id is not null
    or new.publicado is true
    or new.status is true
  ) then
    raise exception 'Restaurante excluído não pode ser reativado por esta operação.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.proteger_restaurante_excluido()
  from public, anon, authenticated, service_role;

drop trigger if exists a_proteger_restaurante_excluido on public.empresas;
create trigger a_proteger_restaurante_excluido
before update on public.empresas
for each row execute function private.proteger_restaurante_excluido();

create or replace function public.admin_excluir_restaurante(
  p_empresa_id uuid,
  p_nome_confirmacao text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa public.empresas%rowtype;
  v_pedidos_em_andamento bigint;
  v_total_pedidos bigint;
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  select *
  into v_empresa
  from public.empresas
  where id = p_empresa_id
    and excluida_em is null
  for update;

  if not found then
    return false;
  end if;

  if lower(trim(coalesce(p_nome_confirmacao, ''))) <> lower(trim(v_empresa.nome)) then
    raise exception 'Digite o nome exato do restaurante para confirmar.' using errcode = '22023';
  end if;

  select
    count(*) filter (where p.status not in ('entregue', 'cancelado')),
    count(*)
  into v_pedidos_em_andamento, v_total_pedidos
  from public.pedidos p
  where p.empresa_id::text = p_empresa_id::text;

  if v_pedidos_em_andamento > 0 then
    raise exception 'Finalize ou cancele os pedidos em andamento antes de apagar a loja.'
      using errcode = '55000';
  end if;

  update public.empresa_funcionarios
  set ativo = false, updated_at = now()
  where empresa_id::text = p_empresa_id::text and ativo = true;

  update public.empresa_entregadores
  set ativo = false, updated_at = now()
  where empresa_id::text = p_empresa_id::text and ativo = true;

  update public.empresa_unidades
  set ativa = false, updated_at = now()
  where empresa_id::text = p_empresa_id::text and ativa = true;

  update public.empresa_horarios
  set ativo = false, updated_at = now()
  where empresa_id::text = p_empresa_id::text and ativo = true;

  update public.empresa_regioes
  set ativo = false, updated_at = now()
  where empresa_id::text = p_empresa_id::text and ativo = true;

  update public.categorias
  set ativo = false, updated_at = now()
  where empresa_id::text = p_empresa_id::text and ativo = true;

  update public.produtos
  set disponivel = false, updated_at = now()
  where empresa_id::text = p_empresa_id::text and disponivel = true;

  update public.grupos_adicionais
  set ativo = false, updated_at = now()
  where empresa_id::text = p_empresa_id::text and ativo = true;

  update public.cupons
  set ativo = false, updated_at = now()
  where empresa_id::text = p_empresa_id::text and ativo = true;

  update public.empresa_assinaturas
  set status = 'cancelada', cancelada_em = coalesce(cancelada_em, now()), updated_at = now()
  where empresa_id = p_empresa_id
    and status not in ('cancelada', 'expirada');

  update public.empresas
  set proprietario_anterior_id = coalesce(proprietario_anterior_id, usuario_id),
      usuario_id = null,
      publicado = false,
      status = false,
      excluida_em = now(),
      excluida_por = auth.uid(),
      updated_at = now()
  where id = p_empresa_id;

  insert into public.admin_auditoria(admin_id, acao, alvo_id, detalhes)
  values (
    auth.uid(),
    'restaurante_excluido',
    p_empresa_id::text,
    jsonb_build_object(
      'nome', v_empresa.nome,
      'cnpj', v_empresa.cnpj,
      'proprietario_id', v_empresa.usuario_id,
      'pedidos_preservados', v_total_pedidos,
      'modo', 'exclusao_logica'
    )
  );

  return true;
end;
$$;

revoke all on function public.admin_excluir_restaurante(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_excluir_restaurante(uuid, text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
