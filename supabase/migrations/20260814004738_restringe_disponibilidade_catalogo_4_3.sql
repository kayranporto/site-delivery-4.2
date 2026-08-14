create or replace function public.empresa_disponibilidade(
  p_empresa_id text,
  p_quando timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1
      from public.empresas e
      where e.id::text = p_empresa_id::text
        and e.publicado = true
        and e.status = true
    ) then jsonb_build_object(
      'aberto', false,
      'momento', p_quando,
      'mensagem', 'Restaurante indisponível.'
    )
    else jsonb_build_object(
      'aberto', private.empresa_aberta_em(p_empresa_id, p_quando),
      'momento', p_quando,
      'mensagem', case
        when private.empresa_aberta_em(p_empresa_id, p_quando)
          then 'Aberto para pedidos.'
        else 'Fechado neste horário.'
      end
    )
  end;
$$;

revoke all on function public.empresa_disponibilidade(text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.empresa_disponibilidade(text, timestamptz)
  to anon, authenticated, service_role;