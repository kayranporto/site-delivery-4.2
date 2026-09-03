-- Executar após a migration; usa somente fixtures e desfaz tudo no final.
begin;

create temp table qa_contexto (cliente uuid, outro uuid, empresa text, unidade uuid, endereco_outro uuid);
insert into qa_contexto(cliente,outro) values(gen_random_uuid(),gen_random_uuid());
grant select on qa_contexto to authenticated;
insert into auth.users(id,email) select cliente,cliente::text||'@example.invalid' from qa_contexto
union all select outro,outro::text||'@example.invalid' from qa_contexto;
with nova as (
  insert into public.empresas(usuario_id,nome,status,publicado,cidade_atendimento,uf_atendimento,pedido_minimo)
  select cliente,'QA transacional',true,true,'São Paulo','SP',10 from qa_contexto returning id
) update qa_contexto set empresa=(select id::text from nova);
update qa_contexto set unidade=(select id from public.empresa_unidades where empresa_id=qa_contexto.empresa and principal);
with novo as (
  insert into public.enderecos(usuario_id,apelido,logradouro,numero,bairro,cidade,uf,principal)
  select outro,'QA outro','Rua Dois','2','Centro','Recife','PE',true from qa_contexto returning id
) update qa_contexto set endereco_outro=(select id from novo);

-- Exercita exatamente o trigger de CNPJ sem usar inscrições reais de empresas.
create temp table qa_cnpj (cnpj text);
create trigger qa_cnpj before insert or update on qa_cnpj for each row execute function private.normalizar_cnpj_empresa();
do $$ begin
  insert into qa_cnpj values('12.abc.345/01de-35'),('11.222.333/0001-81');
  assert (select count(*)=2 from qa_cnpj where cnpj in ('12ABC34501DE35','11222333000181')), 'Normalização CNPJ';
  begin
    insert into qa_cnpj values('12ABC34501DE34');
    raise exception using errcode='ZX001',message='Aceitou DV incorreto';
  exception when raise_exception then null; end;
  begin
    insert into qa_cnpj values('11222333000181!');
    raise exception using errcode='ZX001',message='Aceitou caracteres inválidos';
  exception when raise_exception then null; end;
end; $$;

create function pg_temp.qa_falhar_endereco() returns trigger language plpgsql as $$
begin if new.logradouro='Falha deliberada QA' then raise exception 'Falha de gravação simulada'; end if; return new; end; $$;
create trigger qa_falhar_endereco before insert on public.enderecos for each row execute function pg_temp.qa_falhar_endereco();

select set_config('request.jwt.claims',jsonb_build_object('sub',cliente,'role','authenticated')::text,true) from qa_contexto;
set local role authenticated;
do $$
declare v_ctx record; v_primeiro uuid; v_segundo uuid; v_id uuid; v_resultado jsonb; v_importados integer;
begin
  select * into v_ctx from qa_contexto;
  v_primeiro:=public.endereco_salvar('{"logradouro":"Rua Um","numero":"1","bairro":"Centro","cidade":"São Paulo","uf":"SP","cep":"01001000","principal":true}');
  begin
    perform public.endereco_salvar('{"logradouro":"Falha deliberada QA","numero":"2","bairro":"Centro","cidade":"São Paulo","uf":"SP","cep":"01001000","principal":true}');
    raise exception using errcode='ZX001',message='Falha de insert não propagada';
  exception when raise_exception then null; end;
  assert (select principal from public.enderecos where id=v_primeiro), 'Perdeu principal após falha no cadastro';
  begin
    perform public.endereco_selecionar(v_ctx.endereco_outro);
    raise exception using errcode='ZX001',message='Selecionou endereço alheio';
  exception when raise_exception then null; end;
  assert (select principal from public.enderecos where id=v_primeiro), 'Perdeu principal após seleção negada';
  v_segundo:=public.endereco_salvar('{"logradouro":"Rua Três","numero":"3","bairro":"Centro","cidade":"São Paulo","uf":"SP","cep":"01001-000","principal":true}');
  assert (select not principal from public.enderecos where id=v_primeiro), 'Principal anterior mantido';
  assert (select principal from public.enderecos where id=v_segundo), 'Novo principal não selecionado';
  perform public.endereco_selecionar(v_primeiro);
  perform public.endereco_remover(v_primeiro);
  assert (select principal from public.enderecos where id=v_segundo), 'Remoção não elegeu o próximo endereço';
  assert not exists(select 1 from public.enderecos where id=v_ctx.endereco_outro), 'RLS expôs endereço de outra conta';
  begin
    perform public.endereco_remover(v_ctx.endereco_outro);
    raise exception using errcode='ZX001',message='Removeu endereço alheio';
  exception when raise_exception then null; end;

  insert into public.empresa_regioes(empresa_id,unidade_id,bairro,cidade,uf,taxa_entrega,pedido_minimo)
  values(v_ctx.empresa,v_ctx.unidade,'Centro','São Paulo','SP',5,10),
    (v_ctx.empresa,v_ctx.unidade,'*','Rio de Janeiro','RJ',7,10),
    (v_ctx.empresa,v_ctx.unidade,'Copacabana','Rio de Janeiro','RJ',4,10);
  v_resultado:=public.calcular_entrega_empresa(v_ctx.empresa,'São Paulo','SP','Centro');
  assert (v_resultado->>'atendido')::boolean and (v_resultado->>'taxa_entrega')::numeric=5, 'Primeira cidade';
  v_resultado:=public.calcular_entrega_empresa(v_ctx.empresa,'Rio de Janeiro','RJ','Tijuca');
  assert (v_resultado->>'atendido')::boolean and (v_resultado->>'taxa_entrega')::numeric=7, 'Segunda cidade/todos os bairros';
  v_resultado:=public.calcular_entrega_empresa(v_ctx.empresa,'Rio de Janeiro','RJ','Copacabana');
  assert (v_resultado->>'taxa_entrega')::numeric=4, 'Prioridade da regra por bairro';
  v_resultado:=public.calcular_entrega_empresa(v_ctx.empresa,'Recife','PE','Centro');
  assert not (v_resultado->>'atendido')::boolean, 'Liberou cidade não cadastrada';
  update public.empresa_regioes set ativo=false where empresa_id=v_ctx.empresa;
  v_resultado:=public.calcular_entrega_empresa(v_ctx.empresa,'São Paulo','SP','Centro');
  assert not (v_resultado->>'atendido')::boolean, 'Regiões pausadas liberaram entrega pelo fallback';

  v_importados:=public.importar_produtos_csv(v_ctx.empresa,v_ctx.unidade,'[{"nome":"Pizza QA","categoria":"Pizzas QA","preco":39.9},{"nome":"Suco QA","categoria":"Bebidas QA","preco":9.9,"controle_estoque":true,"estoque":5}]');
  assert v_importados=2, 'Quantidade importada';
  assert (select count(*)=2 from public.produtos where empresa_id=v_ctx.empresa), 'Produtos não gravados';
  assert (select count(*)=2 from public.categorias where empresa_id=v_ctx.empresa), 'Categorias não criadas';
  begin
    perform public.importar_produtos_csv(v_ctx.empresa,v_ctx.unidade,'[{"nome":"Primeiro QA","categoria":"Nova QA","preco":10},{"nome":"Inválido QA","preco":-1}]');
    raise exception using errcode='ZX001',message='Importou lote inválido';
  exception when raise_exception then null; end;
  assert not exists(select 1 from public.produtos where empresa_id=v_ctx.empresa and nome='Primeiro QA'), 'Importação parcial';
  assert not exists(select 1 from public.categorias where empresa_id=v_ctx.empresa and nome='Nova QA'), 'Categoria órfã após erro';
  begin
    perform public.importar_produtos_csv(v_ctx.empresa,v_ctx.unidade,'[{"nome":"Pizza QA","categoria":"Pizzas QA","preco":39.9}]');
    raise exception using errcode='ZX001',message='Aceitou duplicado';
  exception when raise_exception then null; end;
  assert (select count(*)=2 from public.produtos where empresa_id=v_ctx.empresa), 'Duplicação de catálogo';
end; $$;

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',outro,'role','authenticated')::text,true) from qa_contexto;
set local role authenticated;
do $$ declare c record; begin
  select * into c from qa_contexto;
  begin
    perform public.importar_produtos_csv(c.empresa,c.unidade,'[{"nome":"Invasão QA","preco":1}]');
    raise exception using errcode='ZX001',message='Importou em empresa alheia';
  exception when raise_exception then null; end;
end; $$;
reset role;
select 'OK: endereços atômicos, isolamento, CNPJ, cidades, importação e rollback' as resultado;
rollback;
