begin;

-- 4.2.8: reconcilia no repositório o estado final das migrations live de catálogo
-- aplicadas em 2026-08-07 e adiciona least privilege para o papel anon.

create or replace view public.empresas_catalogo
with (security_invoker = true, security_barrier = true)
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

revoke all on public.empresas_catalogo from anon, authenticated;
grant select on public.empresas_catalogo to anon, authenticated;

-- O catálogo anônimo nunca precisa escrever diretamente nessas tabelas.
revoke all on public.empresas from anon;
grant select (
  id, nome, descricao, categoria, tipo, logo, banner,
  taxa_entrega, pedido_minimo, status, publicado,
  cidade_atendimento, uf_atendimento, bairros_atendidos,
  tempo_estimado_min, tempo_estimado_max
) on public.empresas to anon;

revoke all on public.produtos from anon;
revoke all on public.produto_variantes from anon;
revoke all on public.grupos_adicionais from anon;
revoke all on public.adicionais from anon;
revoke all on public.produto_grupos from anon;
revoke all on public.avaliacoes from anon;
grant select on public.produtos, public.produto_variantes, public.grupos_adicionais,
  public.adicionais, public.produto_grupos, public.avaliacoes to anon;

drop policy if exists catalogo_empresas_publicas on public.empresas;
create policy catalogo_empresas_publicas
on public.empresas for select to anon
using (publicado = true and status = true);

drop policy if exists catalogo_produtos_anon on public.produtos;
create policy catalogo_produtos_anon
on public.produtos for select to anon
using (
  disponivel = true
  and exists (
    select 1 from public.empresas_catalogo ec
    where ec.id = produtos.empresa_id
  )
);

drop policy if exists catalogo_produtos_authenticated on public.produtos;
create policy catalogo_produtos_authenticated
on public.produtos for select to authenticated
using (
  (
    disponivel = true
    and exists (
      select 1 from public.empresas_catalogo ec
      where ec.id = produtos.empresa_id
    )
  )
  or exists (
    select 1 from public.empresas e
    where e.id::text = produtos.empresa_id
      and e.usuario_id = (select auth.uid())
  )
);

drop policy if exists catalogo_grupos_anon on public.grupos_adicionais;
create policy catalogo_grupos_anon
on public.grupos_adicionais for select to anon
using (
  ativo = true
  and exists (
    select 1 from public.empresas_catalogo ec
    where ec.id = grupos_adicionais.empresa_id
  )
);

drop policy if exists catalogo_grupos_authenticated on public.grupos_adicionais;
create policy catalogo_grupos_authenticated
on public.grupos_adicionais for select to authenticated
using (
  (
    ativo = true
    and exists (
      select 1 from public.empresas_catalogo ec
      where ec.id = grupos_adicionais.empresa_id
    )
  )
  or exists (
    select 1 from public.empresas e
    where e.id::text = grupos_adicionais.empresa_id
      and e.usuario_id = (select auth.uid())
  )
);

drop policy if exists catalogo_variantes_anon on public.produto_variantes;
create policy catalogo_variantes_anon
on public.produto_variantes for select to anon
using (
  ativo = true
  and exists (
    select 1 from public.produtos p
    where p.id::text = produto_variantes.produto_id
      and p.disponivel = true
  )
);

drop policy if exists catalogo_variantes_authenticated on public.produto_variantes;
create policy catalogo_variantes_authenticated
on public.produto_variantes for select to authenticated
using (
  ativo = true
  and exists (
    select 1 from public.produtos p
    where p.id::text = produto_variantes.produto_id
  )
);

drop policy if exists catalogo_produto_grupos_anon on public.produto_grupos;
create policy catalogo_produto_grupos_anon
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

drop policy if exists catalogo_produto_grupos_authenticated on public.produto_grupos;
create policy catalogo_produto_grupos_authenticated
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

drop policy if exists catalogo_adicionais_anon on public.adicionais;
create policy catalogo_adicionais_anon
on public.adicionais for select to anon
using (
  ativo = true
  and exists (
    select 1 from public.grupos_adicionais g
    where g.id::text = adicionais.grupo_id
      and g.ativo = true
  )
);

drop policy if exists catalogo_adicionais_authenticated on public.adicionais;
create policy catalogo_adicionais_authenticated
on public.adicionais for select to authenticated
using (
  ativo = true
  and exists (
    select 1 from public.grupos_adicionais g
    where g.id::text = adicionais.grupo_id
  )
);

-- Remove uma policy pública duplicada; "avaliacoes leitura publica" permanece.
drop policy if exists avaliacoes_public on public.avaliacoes;

create or replace function public.registrar_tentativa_login(
  p_email text,
  p_sucesso boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.registrar_tentativa_login(text, boolean) from public;
grant execute on function public.registrar_tentativa_login(text, boolean) to anon, authenticated, service_role;

-- Reembolso administrativo manual não deve ser invocável pelo navegador.
revoke execute on function public.admin_atualizar_reembolso(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_atualizar_reembolso(uuid, text) to service_role;

commit;
