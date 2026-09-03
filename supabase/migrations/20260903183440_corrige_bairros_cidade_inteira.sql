begin;

-- Cadastros legados usavam textos como "Todos" para representar a cidade
-- inteira. O formato atual usa o array vazio (fallback legado) ou "*" nas
-- regras por unidade. Normalizamos os dados existentes e mantemos a leitura
-- compatível para restaurações e integrações antigas.
update public.empresas e
set bairros_atendidos = '{}'::text[]
where exists (
  select 1
  from unnest(coalesce(e.bairros_atendidos, '{}'::text[])) b
  where lower(trim(b)) in ('*', 'todos', 'todos os bairros', 'todos os bairros da cidade')
);

create or replace function private.calcular_entrega_unidade_impl(
  p_empresa_id text,
  p_unidade_id uuid,
  p_cidade text,
  p_uf text,
  p_bairro text,
  p_quando timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa record;
  v_unidade record;
  v_regiao record;
  v_tem_regioes boolean;
  v_atendido boolean;
  v_aberto boolean;
begin
  select e.taxa_entrega, e.pedido_minimo, e.tempo_estimado_min, e.tempo_estimado_max,
         e.cidade_atendimento, e.uf_atendimento, e.bairros_atendidos, e.status, e.publicado
  into v_empresa from public.empresas e where e.id::text = p_empresa_id limit 1;

  select u.id, u.ativa into v_unidade
  from public.empresa_unidades u
  where u.id = p_unidade_id and u.empresa_id::text = p_empresa_id::text
  limit 1;

  if v_empresa is null or not coalesce(v_empresa.status, false) or not coalesce(v_empresa.publicado, false)
     or v_unidade is null or not coalesce(v_unidade.ativa, false) then
    return jsonb_build_object('atendido',false,'aberto',false,'mensagem','Unidade indisponível.');
  end if;

  v_aberto := private.empresa_aberta_unidade_em(p_empresa_id, p_unidade_id, p_quando);
  select exists(
    select 1 from public.empresa_regioes r
    where r.empresa_id::text = p_empresa_id::text
      and r.unidade_id = p_unidade_id
  ) into v_tem_regioes;

  if v_tem_regioes then
    select r.* into v_regiao
    from public.empresa_regioes r
    where r.empresa_id::text = p_empresa_id::text
      and r.unidade_id = p_unidade_id
      and r.ativo
      and (r.bairro = '*' or lower(trim(r.bairro)) = lower(trim(coalesce(p_bairro,''))))
      and lower(trim(r.cidade)) = lower(trim(coalesce(p_cidade,'')))
      and upper(trim(r.uf)) = upper(trim(coalesce(p_uf,'')))
    order by (r.bairro = '*'), r.id
    limit 1;
    if not found then
      return jsonb_build_object('atendido',false,'aberto',v_aberto,'mensagem','Este bairro ainda não faz parte da área de entrega desta unidade.');
    end if;
    return jsonb_build_object(
      'atendido',true,'aberto',v_aberto,'taxa_entrega',v_regiao.taxa_entrega,
      'pedido_minimo',v_regiao.pedido_minimo,'tempo_min',v_regiao.tempo_min,
      'tempo_max',v_regiao.tempo_max,'regiao_id',v_regiao.id,
      'mensagem',case when v_aberto then 'Entrega disponível.' else 'Unidade fechada neste horário.' end
    );
  end if;

  v_atendido := (nullif(trim(coalesce(v_empresa.cidade_atendimento,'')),'') is null or lower(trim(p_cidade)) = lower(trim(v_empresa.cidade_atendimento)))
    and (nullif(trim(coalesce(v_empresa.uf_atendimento,'')),'') is null or upper(trim(p_uf)) = upper(trim(v_empresa.uf_atendimento)))
    and (
      cardinality(coalesce(v_empresa.bairros_atendidos,'{}'::text[])) = 0
      or exists(
        select 1
        from unnest(v_empresa.bairros_atendidos) b
        where lower(trim(b)) = lower(trim(p_bairro))
           or lower(trim(b)) in ('*', 'todos', 'todos os bairros', 'todos os bairros da cidade')
      )
    );

  return jsonb_build_object(
    'atendido',v_atendido,'aberto',v_aberto,
    'taxa_entrega',v_empresa.taxa_entrega,'pedido_minimo',v_empresa.pedido_minimo,
    'tempo_min',coalesce(v_empresa.tempo_estimado_min,25),'tempo_max',coalesce(v_empresa.tempo_estimado_max,45),
    'mensagem',case when v_atendido then 'Entrega disponível.' else 'Endereço fora da área de entrega.' end
  );
end;
$$;

revoke all on function private.calcular_entrega_unidade_impl(text, uuid, text, text, text, timestamptz)
from public, anon, authenticated, service_role;

commit;
