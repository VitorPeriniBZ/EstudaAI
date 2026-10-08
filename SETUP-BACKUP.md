# Backup do banco

O workflow `.github/workflows/backup.yml` faz um `pg_dump` do Neon todo domingo às 03h
(horário de Brasília). O dump é criptografado com [age](https://age-encryption.org) e enviado
a um bucket do Cloudflare R2. Também dá para rodar a qualquer momento em
**Actions → Backup do banco → Run workflow**. Rode sempre antes de migrations que apagam ou
movem dados.

O dump contém o material dos alunos e as chaves de API dos provedores de IA, por isso nunca
sai do GitHub sem criptografia. Só quem tem a chave privada do age consegue abrir.

## 1. Bucket no R2

1. Cloudflare → **R2 Object Storage** → **Create bucket** → nome `estudaai-backups`
   (localização automática; não habilite acesso público).
2. No bucket → **Settings → Object lifecycle rules → Add rule**:
   prefixo `postgres/`, ação **Delete objects**, depois de **60 dias**.
   Com um backup por semana, isso mantém cerca de 8 cópias.
3. **R2 → Manage R2 API Tokens → Create API token**: permissão **Object Read & Write**,
   restrita ao bucket `estudaai-backups`. Anote o *Access Key ID*, o *Secret Access Key* e o
   endpoint S3 (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).

## 2. Par de chaves do age

No seu computador (`brew install age`):

```bash
age-keygen -o estudaai-backup.key
```

- A linha `# public key: age1...` é a **chave pública**. Ela vai para o GitHub (segredo `AGE_PUBLIC_KEY`).
- O arquivo `estudaai-backup.key` é a **chave privada**. Guarde **offline**: gerenciador de
  senhas e uma cópia em pendrive. **Nunca** coloque no GitHub, no Render ou no R2. Sem ela,
  os backups não abrem.

## 3. Conexão com o banco

No Neon → **Connect**, desligue **Connection pooling** e copie a URL *direta*, que não tem
`-pooler` no host. O `pg_dump` precisa de uma conexão direta.

Recomendado: um papel só de leitura para o backup. No SQL Editor do Neon:

```sql
create role backup_leitura login password '<senha forte>';
grant pg_read_all_data to backup_leitura;
```

Se o Neon recusar o `grant`, use a URL do usuário normal.

## 4. Segredos no GitHub

Repositório → **Settings → Secrets and variables → Actions → New repository secret**:

| Segredo | Valor |
|---|---|
| `BACKUP_DATABASE_URL` | URL direta do Neon (passo 3), com `?sslmode=require` |
| `R2_ACCESS_KEY_ID` | Access Key ID do token do R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key do token do R2 |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | `estudaai-backups` |
| `AGE_PUBLIC_KEY` | a chave pública `age1...` |

Depois: **Actions → Backup do banco → Run workflow**. O resumo da execução mostra o nome do
arquivo, o tamanho e a versão do PostgreSQL.

## 5. Teste de restauração (uma vez por mês)

Backup que nunca foi restaurado não conta. Use a versão do Postgres mostrada no resumo do
workflow (abaixo, `17`) e o nome do arquivo gerado:

```bash
# baixa e abre o backup (aws cli com as chaves do R2 em AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)
aws s3 cp s3://estudaai-backups/postgres/estudaai-AAAA-MM-DD-HHMM.dump.age . \
  --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com
age --decrypt -i estudaai-backup.key -o estudaai.dump estudaai-AAAA-MM-DD-HHMM.dump.age

# restaura num Postgres descartável
docker run -d --name estudaai-restore -e POSTGRES_PASSWORD=postgres postgres:17
sleep 5
docker cp estudaai.dump estudaai-restore:/tmp/estudaai.dump
docker exec estudaai-restore createdb -U postgres estudaai
docker exec estudaai-restore pg_restore -U postgres -d estudaai --no-owner --no-acl /tmp/estudaai.dump

# confere: as contagens devem bater com o painel admin
docker exec estudaai-restore psql -U postgres -d estudaai -c \
  "select (select count(*) from users) usuarios, (select count(*) from subjects) materias,
          (select count(*) from materials) materiais, (select count(*) from files) arquivos,
          (select count(*) from drizzle.__drizzle_migrations) migrations"

# limpa (o dump aberto tem dados pessoais)
docker rm -f estudaai-restore && rm estudaai.dump
```

## Observações

- Cada backup transfere quase o banco inteiro para fora do Neon, e o plano Free tem 5 GB de
  tráfego por mês. Perto do limite de 0,5 GB, um backup por semana usa ~2 GB/mês.
- Em repositório público, o GitHub desativa workflows agendados depois de 60 dias sem
  commits. Confira a aba Actions de vez em quando.
- Uma conta excluída continua nos backups até a regra de 60 dias apagá-los. A política de
  privacidade precisa dizer isso.
