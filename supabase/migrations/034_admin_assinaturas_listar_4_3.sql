-- Multi Delivery 4.3: visão administrativa das assinaturas sem expor a tabela diretamente.

begin;

create or replace function public.admin_assinaturas_listar()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null or not coalesce(private.is_admin(),false) then
    raise exception 'Acesso administrativo obrigatório.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'empresa_id',e.id,
      'empresa_nome',e.nome,
      'plano_id',p.id,
      'plano_nome',p.nome,
      'plano_slug',p.slug,
      'status',case when a.status='trial' and a.trial_fim_em<=now() then 'expirada' else a.status end,
      'inicio_em',a.inicio_em,
      'trial_fim_em',a.trial_fim_em,
      'periodo_inicio',a.periodo_inicio,
      'periodo_fim',a.periodo_fim,
      'updated_at',a.updated_at
    ) order by e.nome
  ),'[]'::jsonb)
  into v_resultado
  from public.empresa_assinaturas a
  join public.empresas e on e.id=a.empresa_id
  join public.planos_plataforma p on p.id=a.plano_id;

  return v_resultado;
end;
$$;

revoke all on function public.admin_assinaturas_listar()
  from public,anon,authenticated,service_role;
grant execute on function public.admin_assinaturas_listar()
  to authenticated;

commit;
