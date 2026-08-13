"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = "supabase/migrations/025_funcionarios_rbac_4_3.sql";

test("4.3 cria vínculos de funcionários com papéis explícitos e RLS", () => {
    const sql = read(migration);
    for (const trecho of [
        "create table if not exists public.empresa_funcionarios",
        "'gerente', 'cozinha', 'atendente', 'financeiro'",
        "alter table public.empresa_funcionarios enable row level security",
        "funcionario le proprio vinculo",
        "proprietario le equipe",
        "empresa_funcionarios_empresa_usuario_idx"
    ]) assert.ok(sql.includes(trecho), `RBAC 4.3 sem ${trecho}`);
});

test("gestão da equipe passa apenas por RPCs autenticadas do proprietário", () => {
    const sql = read(migration);
    for (const funcao of [
        "public.empresa_meu_acesso()",
        "public.empresa_listar_funcionarios(text)",
        "public.empresa_salvar_funcionario(text, text, text)",
        "public.empresa_remover_funcionario(text, uuid)"
    ]) {
        assert.ok(sql.includes(`revoke all on function ${funcao}`), `${funcao} sem revoke explícito`);
        assert.ok(sql.includes(`grant execute on function ${funcao} to authenticated`), `${funcao} sem grant autenticado`);
    }
    assert.match(sql, /not private\.eh_proprietario_empresa\(p_empresa_id\)/);
    assert.match(sql, /revoke all on table public\.empresa_funcionarios from anon, authenticated/);
    assert.match(sql, /grant select on table public\.empresa_funcionarios to authenticated/);
});

test("helpers privados permanecem fora da superfície da API", () => {
    const sql = read(migration);
    assert.match(sql, /create or replace function private\.eh_proprietario_empresa/);
    assert.match(sql, /create or replace function private\.tem_vinculo_empresa/);
    assert.match(sql, /revoke all on function private\.eh_proprietario_empresa\(text\)/);
    assert.match(sql, /revoke all on function private\.tem_vinculo_empresa\(text, text\[\]\)/);
});

test("vínculo por e-mail não expõe auth.users diretamente ao frontend", () => {
    const sql = read(migration);
    assert.match(sql, /from auth\.users au/);
    assert.match(sql, /lower\(au\.email\) = lower\(trim\(p_email\)\)/);
    assert.match(sql, /O usuário precisa criar uma conta antes de ser vinculado à equipe/);
    assert.doesNotMatch(sql, /grant\s+select[\s\S]*auth\.users/i);
});

test("primeira etapa de RBAC permanece fail-closed para dados operacionais", () => {
    const sql = read(migration);
    assert.doesNotMatch(sql, /create policy[\s\S]{0,120}on public\.pedidos/i);
    assert.doesNotMatch(sql, /create policy[\s\S]{0,120}on public\.produtos/i);
    assert.doesNotMatch(sql, /create policy[\s\S]{0,120}on public\.cupons/i);
});
