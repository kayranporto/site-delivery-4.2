# Privacidade e LGPD — checklist de implementação

Este documento é uma base técnica e operacional, não um parecer jurídico.

## Implementado no projeto

- página pública `privacidade.html`;
- exportação autenticada de dados em `dados.html`;
- solicitação de exclusão por chamado de suporte;
- sanitização básica dos logs do frontend;
- RLS nas tabelas públicas;
- separação entre chaves públicas e segredos de servidor;
- dados completos de cartão fora do frontend e do banco da aplicação.

## Definições obrigatórias antes do lançamento

A organização responsável deve definir e documentar:

- controlador e canal de contato;
- bases legais por finalidade;
- fornecedores e operadores;
- prazos de retenção por categoria;
- procedimento de confirmação de identidade;
- critérios de exclusão versus anonimização;
- tratamento de registros fiscais, antifraude e defesa de direitos;
- política para localização de entregadores;
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

## Localização

Colete localização do entregador apenas durante a operação necessária, com informação clara e controles de acesso. Defina retenção curta e elimine coordenadas que não sejam necessárias para suporte, prevenção a fraude ou defesa de direitos.

## Logs

Não envie para logs:

- senhas;
- tokens de sessão;
- segredos;
- dados completos de cartão;
- documentos ou endereços completos sem necessidade;
- payload integral do provedor quando houver dados excessivos.

Revise periodicamente os campos de `app_logs` e `pagamento_eventos`.
