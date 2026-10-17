# EIC Department Task Site

Next.js App Router site for department navigation and performance records.

## Local development

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# 填写 .env.local 中的服务端配置后启动
npm.cmd run dev
```

Open `http://localhost:3000`.

如需不连接 CloudBase 进行本地界面测试，可在项目根目录创建空文件
`.local-test-mode`，然后重新启动开发服务器：

```powershell
New-Item .local-test-mode -ItemType File
npm.cmd run dev
```

本地测试数据会写入 `data/local-test/`，该目录已被 Git 忽略，不会上传到 GitHub。

## CloudBase target

The target environment is the CloudBase domestic environment
`hust-eicweb-test-d8en09x415eefb0` in `ap-shanghai`.

The project uses this runtime layout:

- Next.js standalone server for pages and `/api/*` Route Handlers.
- CloudBase PostgreSQL through the official PG REST gateway.
- CloudBase server API key in `CLOUDBASE_APIKEY`, read only by server code.
- CloudBase Run for the deployed Next.js runtime.

Static hosting alone is not sufficient because the project uses server API routes,
HTTP-only minister sessions, and server-side database credentials.

### Test deployment

- CloudRun service: `department-task-site`
- Test URL: <https://department-task-site-321068-12-1497056853.sh.run.tcloudbase.com>
- PostgreSQL migration applied: `20260928132334_performance_schema`
- Verified: public directory reads, minister login, directory create/delete, member and task saves, and cascading cleanup.
- A custom domain has not been bound; this is the CloudBase-provided test URL.

## Environment variables

Copy `.env.example` values into the local or CloudBase runtime configuration.
Never put `CLOUDBASE_APIKEY` in a `NEXT_PUBLIC_*` variable or browser code.

Required variables:

```text
CLOUDBASE_ENV_ID=hust-eicweb-test-d8en09x415eefb0
CLOUDBASE_APIKEY=<server API key issued by CloudBase>
MINISTER_ACCESS_CODES=<comma-separated access codes>
MINISTER_SESSION_SECRET=<random cookie value>
```

## PostgreSQL migration

The schema migrations are stored in `cloudbase/migrations/`:

- `20260928132334_performance_schema.sql` creates the performance tables.
- `20260929140000_performance_tree_nodes.sql` adds recursive directory nodes and
  distinguishes directories from performance pages. Existing sections default
  to `page`, preserving their performance records.
- Later migration files add independent materials, past works, rules, student
  numbers, and department forum tables. Apply them in filename order after
  reviewing the existing CloudBase PG schema.

Before applying it to CloudBase, inspect the existing PG migration history and
the four target tables. If the environment already contains any of these tables,
compare every column before choosing an alter or data-preserving migration.

The old `supabase-performance-content.sql` file is retained only as historical
reference and is not used by the CloudBase runtime.

## Verification

```powershell
npm.cmd run lint
npm.cmd run build
```

After CloudBase resources are configured, verify public performance reads,
minister login, directory create/rename/reorder/delete, member and task saves,
refresh persistence, and mobile layout before binding a custom domain.

## Windows desktop client

The project also includes an Electron desktop client. It hosts the deployed
Next.js application in a Windows EXE; database access remains server-side through
the CloudBase API. See [DESKTOP_APP.md](DESKTOP_APP.md) for local startup and
packaging commands.
