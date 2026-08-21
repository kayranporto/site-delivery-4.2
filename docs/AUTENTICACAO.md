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

1. ajuste os rate limits de cadastro, recuperação e demais endpoints de autenticação;
2. quando disponível no plano, mantenha a proteção contra senhas vazadas ativa;
3. mantenha a política local de senha com pelo menos 8 caracteres, letra e número;
4. monitore cadastros, tentativas e abuso por IP no provedor de borda.

O e-mail continua necessário para recuperação de senha e comunicações operacionais. Alterar o e-mail da conta continua sendo uma operação confirmada.

## Configuração dos rate limits

O CAPTCHA permanecerá desativado por decisão de produto. O suporte opcional existente no frontend não exige remoção e não envia token enquanto `turnstileSiteKey` estiver vazio.

As URLs e os limites recomendados estão versionados em `supabase/config.toml`:

- URL principal: `https://site-delivery-42.vercel.app`;
- redirect exato de recuperação: `https://site-delivery-42.vercel.app/html/nova-senha.html`;
- login/cadastro: 30 requisições por 5 minutos por IP;
- renovação de token: 150 requisições por 5 minutos por IP;
- verificação de token/OTP: 30 requisições por 5 minutos por IP;
- e-mail do provedor embutido: 2 mensagens por hora.

Depois de revisar o diff, aplique a configuração declarativa autenticada pelo CLI:

```powershell
npx --yes supabase@2.115.0 config push --project-ref wzxsjxdbxonrmlmzufpv
```

Como alternativa para auditoria pela Management API, obtenha um token pessoal em `https://supabase.com/dashboard/account/tokens` e consulte os limites atuais sem alterá-los:

```powershell
$env:SUPABASE_ACCESS_TOKEN="seu-token-pessoal"
npm run configure:auth:rate-limits -- --check
```

O Supabase já aplica limites padrão aos endpoints de Auth. No provedor SMTP embutido, cadastro e recuperação compartilham o limite de 2 e-mails por hora e esse valor somente pode ser personalizado depois da configuração de SMTP próprio. Outros limites suportados pela Management API podem ser enviados explicitamente:

```powershell
$env:AUTH_RATE_LIMIT_OTP="30"
$env:AUTH_RATE_LIMIT_VERIFY="30"
$env:AUTH_RATE_LIMIT_TOKEN_REFRESH="150"
npm run configure:auth:rate-limits -- --apply
```

O modo padrão é somente consulta; `--apply` exige pelo menos uma variável `AUTH_RATE_LIMIT_*`. O token pessoal nunca é escrito no repositório nem exibido na saída.

Não reduza ou aumente limites sem observar tráfego real e respostas HTTP 429. O login por senha não possui um ajuste isolado documentado; mantenha também monitoramento por IP e a política forte de senha.
