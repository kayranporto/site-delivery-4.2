# Multi Delivery 4.4.6

O login e o cadastro do cliente abrem a seção de restaurantes. Quando o cliente
veio do checkout, o destino solicitado é preservado e validado como rota interna.

Os endereços são salvos, selecionados e removidos por RPCs transacionais sob RLS.
Uma falha ao gravar não desmarca o endereço anterior. A seleção retorna ao checkout,
campos antigos `rua`/`estado` continuam legíveis e o GPS é associado pelo ID do endereço.

O CNPJ aceita o formato numérico e o alfanumérico, incluindo a recuperação de um
cadastro de restaurante no login. O navegador e o banco validam os verificadores;
o banco normaliza letras e pontuação e impede duplicatas com formatação diferente.
Referência: [Receita Federal — perguntas e respostas, questão 14](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/cnpj/cnpj-alfanumerico.pdf).

Em **Operação → Cidades e regiões de entrega**, a mesma unidade pode cadastrar
várias cidades/UFs. É possível atender um bairro ou todos os bairros de uma cidade.
Uma regra específica de bairro prevalece sobre a regra da cidade. Se todas as
regiões cadastradas estiverem pausadas, o checkout recusa a entrega. Sem regiões
cadastradas, continuam valendo as configurações gerais da loja. O frete por GPS
continua seguindo o raio configurado da unidade.

Em **Cardápio → Importar produtos em lote**, o modelo CSV aceita até 500 produtos
e 1 MB, em UTF-8. Nome e preço são obrigatórios. O importador aceita separadores
vírgula/ponto e vírgula, números como `19,90` ou `19.90` sem milhar, aspas e
descrições multilinha. Mostra erros por linha, impede duplicatas por nome/categoria
na unidade selecionada e cria categorias novas. A importação exige confirmação da
prévia e grava o lote inteiro em uma transação; erros e limites de plano revertem
também as categorias criadas no lote. Produtos existentes não são sobrescritos.

A alternância de tema fica em **Minha conta → Aparência**. Nas demais páginas,
permanece acessível no rodapé, fora das ações fixas de finalizar pedido.
A preferência salva e a preferência inicial do sistema foram preservadas.

## Implantação e verificação

Aplicar `20260903140527_enderecos_cnpj_cidades_importacao.sql` antes do frontend.
Os novos endpoints são restritos a usuários autenticados; o importador exige
propriedade da empresa e uma unidade ativa da mesma empresa.

- `npm run verify`: integridade, testes de unidade e TypeScript.
- `npm run test:e2e`: cenários de desktop/celular com dados simulados, incluindo
  CNPJ, falha de endereço, tema, CSV e cidade inteira.
- `supabase/tests/checkout_cadastro_importacao.sql`: fixtures isoladas em transação
  com rollback, cobrindo gravação atômica, RLS, CNPJ, cidades, frete e lote.

O teste SQL foi executado contra o esquema ativo com a migration dentro da mesma
transação, sem persistir a migration nem as fixtures. A conferência de rollback
confirmou a ausência das funções novas e da empresa de teste após a execução.

Resultado local: `npm run verify` concluído com 193 testes aprovados, integridade
e TypeScript sem erros. Os cenários Playwright foram preparados, mas ainda não
executados: o navegador remoto não acessa o servidor local e o download local do
Chromium não foi concluído. A execução no GitHub aguarda o envio da branch.
Nenhuma alteração desta versão foi publicada no site ou persistida no banco.
