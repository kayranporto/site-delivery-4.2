-- Multi Delivery 4.3: matriz de permissões por papel e painel operacional restrito.
-- Mantém o banco como fonte de autorização; o frontend apenas reflete permissões.

begin;

create or replace function private.papel_empresa_atual(p_empresa_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    when exists (
      select 1
      from public.empresas e
      where e.id::text = p_empresa_id::text
        and e.usuario_id = auth.uid()
    ) then 'proprietario'::text
    else (
      select f.papel::text
      from public.empresa_funcionarios f
      where f.empresa_id::text = p_empresa_id::text
        and f.usuario_id = auth.uid()
        and f.ativo = true
      limit 1
    )
  end;
$$;

create or replace function private.tem_permissao_empresa(
  p_empresa_id text,
  p_permissao text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel text;
begin
  if auth.uid() is null then return false; end if;
  if coalesce(private.is_admin(), false) then return true; end if;

  v_papel := private.papel_empresa_atual(p_empresa_id);
  return case p_permissao
    when 'pedidos_leitura' then v_papel in ('proprietario', 'gerente', 'atendente')
    when 'cozinha_leitura' then v_papel in ('proprietario', 'gerente', 'cozinha')
    when 'cozinha_operar' then v_papel in ('proprietario', 'gerente', 'cozinha')
    when 'atendimento_operar' then v_papel in ('proprietario', 'gerente', 'atendente')
    when 'cancelamento_decidir' then v_papel in ('proprietario', 'gerente')
    when 'financeiro_leitura' then v_papel in ('proprietario', 'financeiro')
    else false
  end;
end;
$$;

revoke all on function private.papel_empresa_atual(text)
  from public, anon, authenticated, service_role;
revoke all on function private.tem_permissao_empresa(text, text)
  from public, anon, authenticated, service_role;

-- Retorna somente os dados de pedido necessários ao papel atual. Cozinha recebe
-- itens e SLA, mas não recebe telefone, endereço, valores ou dados de pagamento.
create or replace function public.empresa_operador_pedidos(
  p_empresa_id text,
  p_limite integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel text;
  v_cozinha boolean;
  v_limite integer := greatest(1, least(coalesce(p_limite, 100), 200));
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  if not (
    private.tem_permissao_empresa(p_empresa_id, 'pedidos_leitura')
    or private.tem_permissao_empresa(p_empresa_id, 'cozinha_leitura')
  ) then
    raise exception 'Acesso não autorizado aos pedidos desta empresa.';
  end if;

  v_papel := private.papel_empresa_atual(p_empresa_id);
  v_cozinha := v_papel = 'cozinha';

  select coalesce(jsonb_agg(q.dados order by q.created_at desc), '[]'::jsonb)
  into v_resultado
  from (
    select p.created_at,
      jsonb_build_object(
        'id', p.id,
        'numero', p.numero,
        'status', p.status,
        'created_at', p.created_at,
        'updated_at', p.updated_at,
        'agendado_para', p.agendado_para,
        'preparo_estimado_minutos', p.preparo_estimado_minutos,
        'preparo_iniciado_em', p.preparo_iniciado_em,
        'pronto_em', p.pronto_em,
        'retirado_em', p.retirado_em,
        'entregue_em', p.entregue_em,
        'prioridade', p.prioridade,
        'cozinha_observacao', p.cozinha_observacao,
        'observacoes', p.observacoes,
        'cancelamento_status', case when v_cozinha then null else p.cancelamento_status end,
        'cancelamento_motivo', case when v_cozinha then null else p.cancelamento_motivo end,
        'pagamento', case when v_cozinha then null else p.pagamento end,
        'pagamento_modalidade', case when v_cozinha then null else p.pagamento_modalidade end,
        'pagamento_status', case when v_cozinha then null else p.pagamento_status end,
        'subtotal', case when v_cozinha then null else p.subtotal end,
        'taxa_entrega', case when v_cozinha then null else p.taxa_entrega end,
        'desconto', case when v_cozinha then null else p.desconto end,
        'total', case when v_cozinha then null else p.total end,
        'cliente_nome', case when v_cozinha then null else p.cliente_nome end,
        'cliente_telefone', case when v_cozinha then null else p.cliente_telefone end,
        'endereco', case when v_cozinha then null else p.endereco end,
        'entregador_atribuido', p.entregador_id is not null,
        'itens', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'nome_produto', i.nome_produto,
              'quantidade', i.quantidade,
              'variante_nome', i.variante_nome,
              'observacao', i.observacao,
              'preco_unitario', case when v_cozinha then null else i.preco_unitario end,
              'adicionais', case when v_cozinha then
                coalesce((
                  select jsonb_agg(jsonb_build_object('nome', extras.item->>'nome'))
                  from jsonb_array_elements(coalesce(i.adicionais, '[]'::jsonb)) as extras(item)
                ), '[]'::jsonb)
                else i.adicionais
              end
            ) order by i.created_at, i.id
          )
          from public.pedido_itens i
          where i.pedido_id = p.id
        ), '[]'::jsonb)
      ) as dados
    from public.pedidos p
    where p.empresa_id::text = p_empresa_id::text
      and (not v_cozinha or p.status in ('recebido', 'preparando'))
    order by p.created_at desc
    limit v_limite
  ) q;

  return v_resultado;
end;
$$;

create or replace function public.empresa_relatorio_financeiro_acesso(
  p_empresa_id text,
  p_dias integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa public.empresas%rowtype;
  v_resultado jsonb;
  v_dias integer := greatest(1, least(coalesce(p_dias, 30), 365));
begin
  if auth.uid() is null
     or not private.tem_permissao_empresa(p_empresa_id, 'financeiro_leitura') then
    raise exception 'Acesso financeiro não autorizado.';
  end if;

  select * into v_empresa
  from public.empresas e
  where e.id::text = p_empresa_id::text
  limit 1;
  if not found then raise exception 'Restaurante não encontrado.'; end if;

  select jsonb_build_object(
    'bruto', coalesce(sum(total) filter(where status='entregue'), 0),
    'pedidos_entregues', count(*) filter(where status='entregue'),
    'taxa_plataforma', round(coalesce(sum(total) filter(where status='entregue'), 0) * v_empresa.taxa_plataforma_percentual / 100, 2),
    'liquido', round(coalesce(sum(total) filter(where status='entregue'), 0) * (100 - v_empresa.taxa_plataforma_percentual) / 100, 2),
    'online_pendente', coalesce(sum(total) filter(where pagamento_modalidade='online' and pagamento_status='pendente' and status<>'cancelado'), 0),
    'reembolsos_pendentes', count(*) filter(where reembolso_status in ('pendente','processando')),
    'cancelamentos_pendentes', count(*) filter(where cancelamento_status='solicitado')
  ) into v_resultado
  from public.pedidos
  where empresa_id::text = p_empresa_id::text
    and created_at >= now() - make_interval(days => v_dias);

  return v_resultado || jsonb_build_object(
    'taxa_percentual', v_empresa.taxa_plataforma_percentual,
    'periodo_dias', v_dias
  );
end;
$$;

-- Preserva integralmente as regras de estado e pagamento da 4.2.8; muda apenas
-- a decisão sobre qual papel pode chamar cada ação.
create or replace function public.empresa_atualizar_operacao_pedido(
  p_pedido_id uuid,
  p_acao text,
  p_preparo_estimado integer default null,
  p_observacao text default null
)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_status_anterior text;
  v_permissao text;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;

  select p.* into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
  for update;

  if not found then raise exception 'Pedido não encontrado.'; end if;

  v_permissao := case
    when p_acao in ('iniciar_preparo', 'marcar_pronto', 'reabrir_preparo') then 'cozinha_operar'
    when p_acao in ('recusar_pedido', 'enviar_entrega', 'confirmar_entrega', 'definir_prioridade') then 'atendimento_operar'
    else null
  end;

  if v_permissao is null
     or not private.tem_permissao_empresa(v_pedido.empresa_id::text, v_permissao) then
    raise exception 'Acesso não autorizado para esta ação.';
  end if;

  v_status_anterior := v_pedido.status;

  if p_acao in ('iniciar_preparo', 'marcar_pronto', 'reabrir_preparo', 'enviar_entrega', 'confirmar_entrega')
     and v_pedido.pagamento_modalidade = 'online'
     and v_pedido.pagamento_status is distinct from 'pago' then
    raise exception 'Aguarde a confirmação do pagamento online antes de avançar o pedido.';
  end if;

  if p_preparo_estimado is not null
     and (p_preparo_estimado < 5 or p_preparo_estimado > 240) then
    raise exception 'O tempo de preparo deve ficar entre 5 e 240 minutos.';
  end if;

  case p_acao
    when 'iniciar_preparo' then
      if v_pedido.status <> 'recebido' then raise exception 'O pedido não pode iniciar preparo neste estado.'; end if;
      update public.pedidos
      set status = 'preparando',
          preparo_iniciado_em = coalesce(preparo_iniciado_em, now()),
          preparo_estimado_minutos = coalesce(p_preparo_estimado, preparo_estimado_minutos, 30),
          cozinha_observacao = coalesce(nullif(left(trim(coalesce(p_observacao, '')), 500), ''), cozinha_observacao),
          pronto_em = null,
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'recusar_pedido' then
      if v_pedido.status <> 'recebido' then raise exception 'Somente pedidos ainda não aceitos podem ser recusados.'; end if;
      if v_pedido.pagamento_status = 'pago' then raise exception 'Pedido pago deve seguir o fluxo de cancelamento e reembolso.'; end if;
      update public.pedidos
      set status = 'cancelado',
          cozinha_observacao = coalesce(nullif(left(trim(coalesce(p_observacao, '')), 500), ''), 'Recusado pelo restaurante'),
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'marcar_pronto' then
      if v_pedido.status <> 'preparando' then raise exception 'Somente pedidos em preparo podem ser marcados como prontos.'; end if;
      update public.pedidos
      set pronto_em = coalesce(pronto_em, now()),
          preparo_iniciado_em = coalesce(preparo_iniciado_em, created_at),
          cozinha_observacao = coalesce(nullif(left(trim(coalesce(p_observacao, '')), 500), ''), cozinha_observacao),
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'reabrir_preparo' then
      if v_pedido.status <> 'preparando' or v_pedido.pronto_em is null then raise exception 'Este pedido não está marcado como pronto.'; end if;
      update public.pedidos set pronto_em = null, updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'enviar_entrega' then
      if v_pedido.status <> 'preparando' or v_pedido.pronto_em is null then raise exception 'Marque o pedido como pronto antes de enviar para entrega.'; end if;
      if v_pedido.entregador_id is not null then raise exception 'O entregador atribuído deve confirmar a retirada pelo aplicativo.'; end if;
      update public.pedidos
      set status = 'saiu_para_entrega', retirado_em = coalesce(retirado_em, now()), updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'confirmar_entrega' then
      if v_pedido.status <> 'saiu_para_entrega' then raise exception 'Somente pedidos em entrega podem ser concluídos.'; end if;
      if v_pedido.entregador_id is not null then raise exception 'O entregador atribuído deve confirmar a entrega pelo aplicativo.'; end if;
      update public.pedidos
      set status = 'entregue', entregue_em = coalesce(entregue_em, now()), updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'definir_prioridade' then
      update public.pedidos
      set prioridade = greatest(0, least(3, coalesce(p_preparo_estimado, 0)))::smallint,
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    else raise exception 'Ação operacional inválida.';
  end case;

  insert into public.pedido_operacao_eventos(
    pedido_id, empresa_id, acao, status_anterior, status_novo,
    preparo_estimado_minutos, observacao, usuario_id
  ) values (
    v_pedido.id, v_pedido.empresa_id::text, p_acao, v_status_anterior, v_pedido.status,
    p_preparo_estimado, nullif(left(trim(coalesce(p_observacao, '')), 500), ''), auth.uid()
  );

  return v_pedido;
end;
$$;

create or replace function public.empresa_marcar_pagamento_offline(p_pedido_id uuid)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;

  select p.* into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
  for update;

  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not private.tem_permissao_empresa(v_pedido.empresa_id::text, 'atendimento_operar') then
    raise exception 'Acesso não autorizado para confirmar pagamento.';
  end if;
  if v_pedido.pagamento_modalidade = 'online' then
    raise exception 'O pagamento online é confirmado exclusivamente pelo provedor.';
  end if;
  if v_pedido.status = 'cancelado' then
    raise exception 'Pedido cancelado não pode receber confirmação de pagamento.';
  end if;
  if v_pedido.pagamento_status = 'pago' then return v_pedido; end if;

  update public.pedidos
  set pagamento_status = 'pago', pagamento_atualizado_em = now(), updated_at = now()
  where id = p_pedido_id
  returning * into v_pedido;

  insert into public.pedido_operacao_eventos(
    pedido_id, empresa_id, acao, status_anterior, status_novo, observacao, usuario_id
  ) values (
    v_pedido.id, v_pedido.empresa_id::text, 'marcar_pagamento_offline',
    v_pedido.status, v_pedido.status, 'Pagamento presencial confirmado', auth.uid()
  );

  return v_pedido;
end;
$$;

create or replace function public.empresa_cancelar_pedido_nao_pago(
  p_pedido_id uuid,
  p_motivo text
)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 500), '');
  v_status_anterior text;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  if v_motivo is null then raise exception 'Informe o motivo do cancelamento.'; end if;

  select p.* into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
  for update;

  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not private.tem_permissao_empresa(v_pedido.empresa_id::text, 'atendimento_operar') then
    raise exception 'Acesso não autorizado para cancelar pedidos.';
  end if;
  if v_pedido.pagamento_status = 'pago' then
    raise exception 'Pedido pago deve seguir o fluxo de cancelamento e reembolso.';
  end if;
  if v_pedido.status not in ('recebido', 'preparando') then
    raise exception 'O pedido não pode ser cancelado neste estado.';
  end if;

  v_status_anterior := v_pedido.status;

  update public.pedidos
  set status = 'cancelado',
      cozinha_observacao = v_motivo,
      cancelamento_observacao = v_motivo,
      cancelamento_status = case when cancelamento_status = 'solicitado' then 'aprovado' else cancelamento_status end,
      cancelamento_decidido_em = case when cancelamento_status = 'solicitado' then now() else cancelamento_decidido_em end,
      updated_at = now()
  where id = p_pedido_id
  returning * into v_pedido;

  insert into public.pedido_operacao_eventos(
    pedido_id, empresa_id, acao, status_anterior, status_novo, observacao, usuario_id
  ) values (
    v_pedido.id, v_pedido.empresa_id::text, 'cancelar_pedido_nao_pago',
    v_status_anterior, v_pedido.status, v_motivo, auth.uid()
  );

  return v_pedido;
end;
$$;

create or replace function public.empresa_decidir_cancelamento(
  p_pedido_id uuid,
  p_aprovar boolean,
  p_observacao text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;

  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not private.tem_permissao_empresa(v_pedido.empresa_id::text, 'cancelamento_decidir') then
    raise exception 'Acesso não autorizado.';
  end if;
  if v_pedido.cancelamento_status <> 'solicitado' then
    raise exception 'Não há solicitação pendente.';
  end if;

  if p_aprovar then
    update public.pedidos
    set cancelamento_status = 'aprovado',
        cancelamento_decidido_em = now(),
        cancelamento_observacao = nullif(left(trim(coalesce(p_observacao, '')), 500), ''),
        reembolso_status = case when pagamento_modalidade='online' and pagamento_status='pago' then 'pendente' else 'nao_aplicavel' end,
        status = 'cancelado',
        updated_at = now()
    where id = p_pedido_id;
  else
    update public.pedidos
    set cancelamento_status = 'recusado',
        cancelamento_decidido_em = now(),
        cancelamento_observacao = nullif(left(trim(coalesce(p_observacao, '')), 500), ''),
        updated_at = now()
    where id = p_pedido_id;
  end if;

  insert into public.notificacoes(usuario_id, pedido_id, titulo, mensagem, tipo)
  values(
    v_pedido.usuario_id,
    p_pedido_id,
    case when p_aprovar then 'Cancelamento aprovado' else 'Cancelamento recusado' end,
    case when p_aprovar
      then 'Seu pedido foi cancelado. Se houver pagamento online, o reembolso seguirá para processamento.'
      else 'O restaurante não aprovou o cancelamento. Consulte o suporte se precisar.'
    end,
    'cancelamento'
  );

  return true;
end;
$$;

revoke all on function public.empresa_operador_pedidos(text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.empresa_relatorio_financeiro_acesso(text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.empresa_atualizar_operacao_pedido(uuid, text, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.empresa_marcar_pagamento_offline(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.empresa_cancelar_pedido_nao_pago(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.empresa_decidir_cancelamento(uuid, boolean, text)
  from public, anon, authenticated, service_role;

grant execute on function public.empresa_operador_pedidos(text, integer) to authenticated;
grant execute on function public.empresa_relatorio_financeiro_acesso(text, integer) to authenticated;
grant execute on function public.empresa_atualizar_operacao_pedido(uuid, text, integer, text) to authenticated;
grant execute on function public.empresa_marcar_pagamento_offline(uuid) to authenticated, service_role;
grant execute on function public.empresa_cancelar_pedido_nao_pago(uuid, text) to authenticated, service_role;
grant execute on function public.empresa_decidir_cancelamento(uuid, boolean, text) to authenticated;

commit;
