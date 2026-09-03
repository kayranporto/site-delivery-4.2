begin;

-- As três operações de endereço são transações sob a RLS do próprio cliente.
-- A trava por usuário serializa alterações concorrentes do endereço principal.
create or replace function public.endereco_selecionar(p_endereco_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_usuario uuid := auth.uid();
begin
  if v_usuario is null then raise exception 'Autenticação obrigatória.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  if not exists(select 1 from public.enderecos where id=p_endereco_id and usuario_id=v_usuario) then
    raise exception 'Endereço não encontrado ou acesso negado.';
  end if;
  update public.enderecos set principal=false where usuario_id=v_usuario and principal and id<>p_endereco_id;
  update public.enderecos set principal=true where id=p_endereco_id and usuario_id=v_usuario;
  return p_endereco_id;
end; $$;

create or replace function public.endereco_salvar(p_endereco jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_usuario uuid := auth.uid(); v_id uuid; v_principal boolean;
  v_cep text; v_uf text; v_campo text;
begin
  if v_usuario is null then raise exception 'Autenticação obrigatória.'; end if;
  if p_endereco is null or jsonb_typeof(p_endereco)<>'object' then raise exception 'Endereço inválido.'; end if;
  foreach v_campo in array array['logradouro','numero','bairro','cidade'] loop
    if nullif(trim(p_endereco->>v_campo),'') is null or length(p_endereco->>v_campo)>200 then
      raise exception 'Preencha corretamente o campo %.',v_campo;
    end if;
  end loop;
  foreach v_campo in array array['apelido','complemento','referencia'] loop
    if length(coalesce(p_endereco->>v_campo,''))>200 then raise exception 'O campo % deve ter até 200 caracteres.',v_campo; end if;
  end loop;
  v_cep := regexp_replace(coalesce(p_endereco->>'cep',''),'[[:space:]-]','','g');
  v_uf := upper(trim(coalesce(p_endereco->>'uf','')));
  if v_cep !~ '^[0-9]{8}$' then raise exception 'CEP inválido.'; end if;
  if v_uf !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$' then raise exception 'UF inválida.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  v_principal := coalesce((p_endereco->>'principal')::boolean,false)
    or not exists(select 1 from public.enderecos where usuario_id=v_usuario and principal);
  if v_principal then update public.enderecos set principal=false where usuario_id=v_usuario and principal; end if;
  insert into public.enderecos(usuario_id,apelido,cep,logradouro,numero,complemento,bairro,cidade,uf,referencia,principal)
  values(v_usuario,coalesce(nullif(trim(p_endereco->>'apelido'),''),'Casa'),
    left(v_cep,5)||'-'||right(v_cep,3),trim(p_endereco->>'logradouro'),trim(p_endereco->>'numero'),
    nullif(trim(p_endereco->>'complemento'),''),trim(p_endereco->>'bairro'),trim(p_endereco->>'cidade'),v_uf,
    nullif(trim(p_endereco->>'referencia'),''),v_principal) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.endereco_remover(p_endereco_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_usuario uuid := auth.uid(); v_proximo uuid;
begin
  if v_usuario is null then raise exception 'Autenticação obrigatória.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  delete from public.enderecos where id=p_endereco_id and usuario_id=v_usuario;
  if not found then raise exception 'Endereço não encontrado ou acesso negado.'; end if;
  if not exists(select 1 from public.enderecos where usuario_id=v_usuario and principal) then
    select id into v_proximo from public.enderecos where usuario_id=v_usuario order by created_at desc nulls last,id limit 1;
    update public.enderecos set principal=true where id=v_proximo and usuario_id=v_usuario;
  end if;
  return true;
end; $$;

revoke all on function public.endereco_selecionar(uuid), public.endereco_salvar(jsonb), public.endereco_remover(uuid) from public,anon;
grant execute on function public.endereco_selecionar(uuid), public.endereco_salvar(jsonb), public.endereco_remover(uuid) to authenticated;

-- CNPJ antigo e alfanumérico: 12 posições A-Z/0-9 e dois verificadores numéricos.
-- Fonte: Receita Federal, perguntas e respostas, exemplo 12.ABC.345/01DE-35.
create or replace function private.normalizar_cnpj_empresa()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_base text; v_soma integer; v_resto integer; v_dv integer; i integer; j integer;
begin
  if tg_op='UPDATE' and new.cnpj is not distinct from old.cnpj then return new; end if;
  new.cnpj := nullif(upper(regexp_replace(coalesce(new.cnpj,''),'[./[:space:]-]','','g')),'');
  if new.cnpj is null then return new; end if;
  if new.cnpj !~ '^[A-Z0-9]{12}[0-9]{2}$' or new.cnpj ~ '^([0-9])\1{13}$' then raise exception 'CNPJ inválido.'; end if;
  v_base := left(new.cnpj,12);
  for j in 1..2 loop
    v_soma := 0;
    for i in 1..length(v_base) loop
      v_soma := v_soma + (ascii(substr(v_base,i,1))-48) * (2 + ((length(v_base)-i) % 8));
    end loop;
    v_resto := v_soma % 11;
    v_dv := case when v_resto<2 then 0 else 11-v_resto end;
    v_base := v_base || v_dv::text;
  end loop;
  if new.cnpj<>v_base then raise exception 'CNPJ inválido. Confira os dígitos verificadores.'; end if;
  return new;
end; $$;
revoke all on function private.normalizar_cnpj_empresa() from public,anon,authenticated;
create trigger normalizar_cnpj_empresa before insert or update of cnpj on public.empresas
for each row execute function private.normalizar_cnpj_empresa();
create unique index empresas_cnpj_normalizado_unique
on public.empresas(upper(regexp_replace(cnpj,'[./[:space:]-]','','g')))
where nullif(cnpj,'') is not null;

-- Regiões explícitas podem pertencer a cidades/UFs diferentes da sede.
-- '*' representa todos os bairros da cidade. Regras de bairro têm precedência.
create or replace function private.validar_regiao_empresa()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_minimo numeric;
begin
  select pedido_minimo into v_minimo from public.empresas where id::text=new.empresa_id;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  if new.pedido_minimo<coalesce(v_minimo,0) then raise exception 'O pedido mínimo da região não pode ser menor que o mínimo geral da loja.'; end if;
  new.bairro:=trim(new.bairro); new.cidade:=trim(new.cidade); new.uf:=upper(trim(new.uf));
  if coalesce(new.bairro,'')='' or coalesce(new.cidade,'')='' or length(new.bairro)>100 or length(new.cidade)>100
    or coalesce(new.uf,'') !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$' then
    raise exception 'Informe bairro, cidade e UF válidos.';
  end if;
  -- Não misturar bairros de cidades diferentes no campo legado da sede.
  new.updated_at:=now();
  return new;
end; $$;
revoke all on function private.validar_regiao_empresa() from public,anon,authenticated;
drop index if exists public.empresa_regioes_local_unique_ci;
create unique index empresa_regioes_local_unique_ci
on public.empresa_regioes(empresa_id,unidade_id,lower(trim(bairro)),lower(trim(cidade)),upper(trim(uf)));

-- O importador funciona sob RLS, cria categorias da unidade e falha por inteiro.
create or replace function public.importar_produtos_csv(p_empresa_id text,p_unidade_id uuid,p_produtos jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_item jsonb; v_linha integer:=0; v_nome text; v_categoria text; v_categoria_id text;
  v_preco numeric; v_promocao numeric; v_estoque integer; v_minimo integer;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  if not exists(select 1 from public.empresas where id::text=p_empresa_id and usuario_id=auth.uid())
    or not exists(select 1 from public.empresa_unidades where id=p_unidade_id and empresa_id=p_empresa_id and ativa) then
    raise exception 'Restaurante ou unidade não encontrado ou acesso negado.';
  end if;
  if p_produtos is null or jsonb_typeof(p_produtos)<>'array' then raise exception 'Arquivo de produtos inválido.'; end if;
  if jsonb_array_length(p_produtos) not between 1 and 500 then raise exception 'Importe entre 1 e 500 produtos por arquivo.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('importar-produtos:'||p_empresa_id,0));
  for v_item in select value from jsonb_array_elements(p_produtos) loop
    v_linha:=v_linha+1;
    v_nome:=trim(v_item->>'nome'); v_categoria:=coalesce(trim(v_item->>'categoria'),'');
    if jsonb_typeof(v_item)<>'object' or coalesce(v_nome,'')='' or length(v_nome)>120 or length(v_categoria)>80
      or length(coalesce(v_item->>'descricao',''))>500 then raise exception 'Produto %: nome, categoria ou descrição inválidos.',v_linha; end if;
    if coalesce(jsonb_typeof(v_item->'preco'),'null')<>'number' then raise exception 'Produto %: preço inválido.',v_linha; end if;
    v_preco:=(v_item->>'preco')::numeric;
    v_promocao:=(v_item->>'promocao')::numeric;
    if v_preco not between 0 and 99999999.99 or round(v_preco,2)<>v_preco
      or (v_promocao is not null and (v_promocao<=0 or v_promocao>=v_preco or round(v_promocao,2)<>v_promocao)) then
      raise exception 'Produto %: preço ou promoção inválidos.',v_linha;
    end if;
    if coalesce(v_item->>'estoque','0') !~ '^[0-9]{1,9}$' or coalesce(v_item->>'estoque_minimo','5') !~ '^[0-9]{1,9}$' then
      raise exception 'Produto %: estoque inválido.',v_linha;
    end if;
    v_estoque:=coalesce((v_item->>'estoque')::integer,0); v_minimo:=coalesce((v_item->>'estoque_minimo')::integer,5);
    if coalesce(jsonb_typeof(v_item->'disponivel'),'boolean')<>'boolean' or coalesce(jsonb_typeof(v_item->'controle_estoque'),'boolean')<>'boolean' then
      raise exception 'Produto %: disponibilidade ou controle de estoque inválido.',v_linha;
    end if;
    if nullif(v_item->>'imagem','') is not null and (length(v_item->>'imagem')>2048 or (v_item->>'imagem') !~* '^https?://[^[:space:]]+$') then
      raise exception 'Produto %: informe um link HTTP ou HTTPS para a imagem.',v_linha;
    end if;
    v_categoria_id:=null;
    if v_categoria<>'' then
      select id::text into v_categoria_id from public.categorias
      where empresa_id=p_empresa_id and unidade_id=p_unidade_id and lower(trim(nome))=lower(v_categoria) limit 1;
      if v_categoria_id is null then
        insert into public.categorias(empresa_id,unidade_id,nome,ativo,ordem)
        values(p_empresa_id,p_unidade_id,v_categoria,true,
          (select coalesce(max(ordem),-1)+1 from public.categorias where empresa_id=p_empresa_id and unidade_id=p_unidade_id))
        returning id::text into v_categoria_id;
      end if;
    end if;
    if exists(select 1 from public.produtos where empresa_id=p_empresa_id and unidade_id=p_unidade_id
      and lower(trim(nome))=lower(v_nome) and categoria_id is not distinct from v_categoria_id) then
      raise exception 'Produto %: "%" já existe nesta categoria e unidade.',v_linha,v_nome;
    end if;
    insert into public.produtos(empresa_id,unidade_id,categoria_id,nome,descricao,preco,promocao,disponivel,controle_estoque,estoque,estoque_minimo,imagem)
    values(p_empresa_id,p_unidade_id,v_categoria_id,v_nome,nullif(trim(v_item->>'descricao'),''),v_preco,v_promocao,
      coalesce((v_item->>'disponivel')::boolean,true),coalesce((v_item->>'controle_estoque')::boolean,false),v_estoque,v_minimo,nullif(trim(v_item->>'imagem'),''));
  end loop;
  return v_linha;
end; $$;
revoke all on function public.importar_produtos_csv(text,uuid,jsonb) from public,anon;
grant execute on function public.importar_produtos_csv(text,uuid,jsonb) to authenticated;

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
    and (cardinality(coalesce(v_empresa.bairros_atendidos,'{}'::text[])) = 0 or exists(select 1 from unnest(v_empresa.bairros_atendidos) b where lower(trim(b)) = lower(trim(p_bairro))));

  return jsonb_build_object(
    'atendido',v_atendido,'aberto',v_aberto,
    'taxa_entrega',v_empresa.taxa_entrega,'pedido_minimo',v_empresa.pedido_minimo,
    'tempo_min',coalesce(v_empresa.tempo_estimado_min,25),'tempo_max',coalesce(v_empresa.tempo_estimado_max,45),
    'mensagem',case when v_atendido then 'Entrega disponível.' else 'Endereço fora da área de entrega.' end
  );
end;
$$;


commit;
