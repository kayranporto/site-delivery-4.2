-- Multi Delivery 4.3: torna explícita a ordem da assinatura e evita OLD em INSERT.

begin;

create or replace function private.validar_limite_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id text;
  v_recurso text;
  v_validar boolean := false;
  v_limite integer;
  v_uso integer;
begin
  v_empresa_id := new.empresa_id::text;

  case tg_table_name
    when 'empresa_unidades' then
      v_recurso := 'unidades';
      if tg_op='INSERT' then
        v_validar := new.ativa=true;
      elsif tg_op='UPDATE' then
        v_validar := new.ativa=true and old.ativa=false;
      end if;
    when 'produtos' then
      v_recurso := 'produtos';
      v_validar := tg_op='INSERT';
    when 'empresa_funcionarios' then
      v_recurso := 'funcionarios';
      if tg_op='INSERT' then
        v_validar := new.ativo=true;
      elsif tg_op='UPDATE' then
        v_validar := new.ativo=true and old.ativo=false;
      end if;
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

revoke all on function private.validar_limite_plano() from public,anon,authenticated,service_role;

drop trigger if exists criar_assinatura_padrao_empresa on public.empresas;
drop trigger if exists aa_criar_assinatura_padrao_empresa on public.empresas;
create trigger aa_criar_assinatura_padrao_empresa
after insert on public.empresas
for each row execute function private.criar_assinatura_padrao_empresa();

commit;
