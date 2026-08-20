# Autenticação — Multi Delivery 4.2.8

## Cadastro sem confirmação de e-mail

O fluxo de cliente e restaurante exige que o Supabase devolva uma sessão no próprio `signUp`. A aplicação não mostra mais a etapa “confirme seu e-mail”.

### Projeto hospedado

No Supabase Dashboard, abra **Authentication → Providers → Email** e desative **Confirm email**.

Alternativamente, execute com um token pessoal que tenha permissão de configuração do projeto:

```bash
export SUPABASE_ACCESS_TOKEN="seu-token-pessoal"
npm run configure:auth:no-confirm
```

O script não armazena o token. No modo padrão ele configura cadastro sem confirmação, senha mínima de 8 caracteres e confirmação segura para troca de e-mail.

A proteção contra senhas vazadas (HIBP) é recurso de plano Pro ou superior no Supabase hospedado. Para ativá-la quando o projeto estiver em um plano compatível:

```bash
export ENABLE_HIBP=true
npm run configure:auth:no-confirm
```

O HIBP é aplicado em uma requisição separada para que a configuração básica continue funcionando no plano Free.

## Controles compensatórios obrigatórios

Desativar confirmação de e-mail aumenta a facilidade de criar contas com endereços inexistentes ou pertencentes a terceiros. Antes da produção:

1. configure Cloudflare Turnstile ou hCaptcha no Supabase Auth;
2. preencha `turnstileSiteKey` em `js/core/config.js`;
3. ajuste rate limits de cadastro, login e recuperação;
4. quando disponível no plano, mantenha a proteção contra senhas vazadas ativa;
5. mantenha a política local de senha com pelo menos 8 caracteres, letra e número;
6. monitore cadastros, tentativas e abuso por IP no provedor de borda.

O e-mail continua necessário para recuperação de senha e comunicações operacionais. Alterar o e-mail da conta continua sendo uma operação confirmada.
