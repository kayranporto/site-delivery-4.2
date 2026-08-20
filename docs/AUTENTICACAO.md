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

## Ativação segura do Turnstile e rate limits

O frontend já envia `captchaToken` no login, cadastro e recuperação de senha. A ativação deve respeitar esta ordem para não bloquear a autenticação:

1. crie um widget Turnstile para `kayranporto.github.io` no Cloudflare;
2. grave apenas a **Site Key pública** em `turnstileSiteKey`, no arquivo `js/core/config.js`;
3. publique o frontend e confirme que o widget aparece nas cinco telas de autenticação;
4. obtenha um token pessoal em `https://supabase.com/dashboard/account/tokens`;
5. execute a automação abaixo com a **Secret Key somente no ambiente local**.

```bash
export SUPABASE_ACCESS_TOKEN="seu-token-pessoal"
export TURNSTILE_SITE_KEY="sua-site-key-publica"
export TURNSTILE_SECRET_KEY="sua-secret-key"
npm run configure:auth:protection
```

O script consulta o `config.js` publicado antes de habilitar o CAPTCHA no Supabase. A Secret Key e o token pessoal nunca são escritos no repositório nem exibidos na saída.

Para consultar o estado atual sem alterá-lo:

```bash
export SUPABASE_ACCESS_TOKEN="seu-token-pessoal"
npm run configure:auth:protection -- --check
```

O Supabase já aplica limites padrão aos endpoints de Auth. No provedor SMTP embutido, cadastro e recuperação compartilham o limite de 2 e-mails por hora e esse valor somente pode ser personalizado depois da configuração de SMTP próprio. Outros limites suportados pela Management API podem ser enviados explicitamente, por exemplo:

```bash
export AUTH_RATE_LIMIT_OTP=30
export AUTH_RATE_LIMIT_VERIFY=360
export AUTH_RATE_LIMIT_TOKEN_REFRESH=1800
npm run configure:auth:protection
```

Não reduza ou aumente limites sem observar tráfego real e respostas HTTP 429. O login por senha não possui um ajuste isolado documentado; sua proteção principal neste projeto é o Turnstile, somado aos limites nativos por IP do Supabase.
