# Privacidade e LGPD — checklist de implementação

Este documento é uma base técnica e operacional, não um parecer jurídico.

## Implementado no projeto

- página pública `privacidade.html`;
- exportação autenticada de dados em `dados.html`;
- solicitação de exclusão por chamado de suporte;
- sanitização básica dos logs do frontend;
- RLS nas tabelas públicas;
- separação entre chaves públicas e segredos de servidor;
- dados completos de cartão fora do frontend e do banco da aplicação;
- geocodificação de endereços via Edge Function autenticada, sem chamada direta do navegador ao provedor;
- atribuição do OpenStreetMap exibida no cadastro de endereços;
- falha da geocodificação não impede salvar o endereço e o GPS continua dependendo de ação explícita do usuário.

## Definições obrigatórias antes do lançamento

A organização responsável deve definir e documentar:

- controlador e canal de contato;
- bases legais por finalidade;
- fornecedores e operadores, incluindo o provedor de geocodificação escolhido para produção;
- prazos de retenção por categoria;
- procedimento de confirmação de identidade;
- critérios de exclusão versus anonimização;
- tratamento de registros fiscais, antifraude e defesa de direitos;
- política para localização de clientes e entregadores;
- processo de resposta a incidentes;
- transferência internacional, quando aplicável.

## Solicitações de titulares

Fluxo recomendado:

1. registrar a solicitação;
2. confirmar identidade sem coletar dados excessivos;
3. classificar exportação, correção, oposição ou exclusão;
4. mapear sistemas e terceiros envolvidos;
5. executar ou justificar retenções;
6. registrar evidência da resposta;
7. notificar fornecedores quando necessário.

A solicitação de exclusão criada pelo site não deve apagar automaticamente pedidos e registros financeiros. A decisão exige aplicação da política de retenção e, quando apropriado, anonimização.

## Localização e geocodificação

Colete localização do entregador apenas durante a operação necessária, com informação clara e controles de acesso. Defina retenção curta e elimine coordenadas que não sejam necessárias para suporte, prevenção a fraude ou defesa de direitos.

No cadastro de endereços, a plataforma pode enviar logradouro, número, bairro, cidade, UF e CEP pelo backend ao provedor de geocodificação para converter o endereço em latitude/longitude. O provedor atual de referência é o Nominatim/OpenStreetMap. Para operação comercial, registre esse fornecedor no inventário de operadores, avalie transferência internacional e mantenha a política pública alinhada ao provedor efetivamente configurado.

Não implemente geocodificação a cada tecla nem envie endereços para logs. O endpoint público do Nominatim deve ser substituído por instância própria ou fornecedor compatível quando o volume deixar de ser uso leve.

## Logs

Não envie para logs:

- senhas;
- tokens de sessão;
- segredos;
- dados completos de cartão;
- documentos ou endereços completos sem necessidade;
- payload integral do provedor quando houver dados excessivos.

Revise periodicamente os campos de `app_logs` e `pagamento_eventos`.
