begin;

-- Catálogo anônimo: uma entidade só é pública se o restaurante também estiver
-- presente em empresas_catalogo (view que contém apenas empresas publicadas).

drop policy if exists "catalogo_categorias_anon" on public.categorias;
create policy "catalogo_categorias_anon"
on public.categorias for select to anon
using (
  ativo = true
  and exists (
    select 1 from public.empresas_catalogo ec
    where ec.id = categorias.empresa_id
  )
);

drop policy if exists "catalogo_categorias_authenticated" on public.categorias;
create policy "catalogo_categorias_authenticated"
on public.categorias for select to authenticated
using (
  (ativo = true and exists (
    select 1 from public.empresas_catalogo ec
    where ec.id = categorias.empresa_id
  ))
  or exists (
    select 1 from public.empresas e
    where e.id::text = categorias.empresa_id
      and e.usuario_id = (select auth.uid())
  )
);

drop policy if exists "catalogo_produtos_anon" on public.produtos;
create policy "catalogo_produtos_anon"
on public.produtos for select to anon
using (
  disponivel = true
  and exists (
    select 1 from public.empresas_catalogo ec
    where ec.id = produtos.empresa_id
  )
);

drop policy if exists "catalogo_produtos_authenticated" on public.produtos;
create policy "catalogo_produtos_authenticated"
on public.produtos for select to authenticated
using (
  (disponivel = true and exists (
    select 1 from public.empresas_catalogo ec
    where ec.id = produtos.empresa_id
  ))
  or exists (
    select 1 from public.empresas e
    where e.id::text = produtos.empresa_id
      and e.usuario_id = (select auth.uid())
  )
);

drop policy if exists "catalogo_grupos_anon" on public.grupos_adicionais;
create policy "catalogo_grupos_anon"
on public.grupos_adicionais for select to anon
using (
  ativo = true
  and exists (
    select 1 from public.empresas_catalogo ec
    where ec.id = grupos_adicionais.empresa_id
  )
);

drop policy if exists "catalogo_grupos_authenticated" on public.grupos_adicionais;
create policy "catalogo_grupos_authenticated"
on public.grupos_adicionais for select to authenticated
using (
  (ativo = true and exists (
    select 1 from public.empresas_catalogo ec
    where ec.id = grupos_adicionais.empresa_id
  ))
  or exists (
    select 1 from public.empresas e
    where e.id::text = grupos_adicionais.empresa_id
      and e.usuario_id = (select auth.uid())
  )
);

drop policy if exists "catalogo_adicionais_anon" on public.adicionais;
create policy "catalogo_adicionais_anon"
on public.adicionais for select to anon
using (
  ativo = true
  and exists (
    select 1
    from public.grupos_adicionais g
    where g.id::text = adicionais.grupo_id
      and g.ativo = true
  )
);

drop policy if exists "catalogo_adicionais_authenticated" on public.adicionais;
create policy "catalogo_adicionais_authenticated"
on public.adicionais for select to authenticated
using (
  ativo = true
  and exists (
    select 1
    from public.grupos_adicionais g
    where g.id::text = adicionais.grupo_id
  )
);

-- O vínculo produto/grupo e as variantes herdam a visibilidade dos produtos/grupos.
drop policy if exists "catalogo_produto_grupos_anon" on public.produto_grupos;
create policy "catalogo_produto_grupos_anon"
on public.produto_grupos for select to anon
using (
  exists (
    select 1
    from public.produtos p
    join public.grupos_adicionais g on g.id::text = produto_grupos.grupo_id
    where p.id::text = produto_grupos.produto_id
      and p.disponivel = true
      and g.ativo = true
  )
);

drop policy if exists "catalogo_produto_grupos_authenticated" on public.produto_grupos;
create policy "catalogo_produto_grupos_authenticated"
on public.produto_grupos for select to authenticated
using (
  exists (
    select 1
    from public.produtos p
    join public.grupos_adicionais g on g.id::text = produto_grupos.grupo_id
    where p.id::text = produto_grupos.produto_id
      and g.ativo = true
  )
);

drop policy if exists "catalogo variantes publico" on public.produto_variantes;
create policy "catalogo_variantes_anon"
on public.produto_variantes for select to anon
using (
  ativo = true
  and exists (
    select 1 from public.produtos p
    where p.id::text = produto_variantes.produto_id
      and p.disponivel = true
  )
);
create policy "catalogo_variantes_authenticated"
on public.produto_variantes for select to authenticated
using (
  ativo = true
  and exists (
    select 1 from public.produtos p
    where p.id::text = produto_variantes.produto_id
  )
);

-- RPC de reembolso legado: não é mais usado pelo frontend. O fluxo atual passa
-- por admin_preparar_reembolso + Edge Function processar-reembolso.
revoke execute on function public.admin_atualizar_reembolso(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_atualizar_reembolso(uuid,text) to service_role;

-- Anti-abuso do endpoint público de tentativas de login: antes p_sucesso=true
-- permitia inserir eventos ilimitados. Agora qualquer e-mail fica limitado a
-- 30 eventos por hora; chamadas anônimas não podem registrar sucesso.
create or replace function public.registrar_tentativa_login(p_email text, p_sucesso boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := left(lower(trim(coalesce(p_email, ''))), 254);
  v_hash text := md5(v_email);
  v_falhas integer;
  v_eventos integer;
  v_sucesso boolean := coalesce(p_sucesso, false) and auth.uid() is not null;
begin
  if length(v_email) < 5 then
    return jsonb_build_object('bloqueado', false, 'falhas', 0);
  end if;

  select count(*)::integer into v_eventos
  from public.tentativas_login
  where email_hash = v_hash
    and created_at >= now() - interval '1 hour';

  if v_eventos < 30 then
    insert into public.tentativas_login(email_hash, sucesso)
    values (v_hash, v_sucesso);
  end if;

  select count(*)::integer into v_falhas
  from public.tentativas_login
  where email_hash = v_hash
    and sucesso = false
    and created_at >= now() - interval '15 minutes';

  return jsonb_build_object(
    'bloqueado', v_falhas >= 5,
    'falhas', v_falhas,
    'aguarde_segundos', case when v_falhas >= 5 then 60 else 0 end
  );
end;
$function$;
revoke all on function public.registrar_tentativa_login(text,boolean) from public;
grant execute on function public.registrar_tentativa_login(text,boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;