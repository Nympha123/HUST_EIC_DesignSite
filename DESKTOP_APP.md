# Windows EXE 客户端

本项目使用 Electron 将现有 Next.js 网页封装为 Windows 客户端。EXE 不直接连接 PostgreSQL，所有数据仍通过云端 HTTPS API 访问 CloudBase 数据库和云存储。

## 本地运行

先启动网页服务：

```powershell
cd C:\Users\30685\department-task-site
npm.cmd run dev
```

另开一个终端启动桌面窗口：

```powershell
cd C:\Users\30685\department-task-site
npm.cmd run desktop
```

默认加载 `http://localhost:3000`。

## 连接云端网站

PowerShell 中可以指定已部署的网站地址：

```powershell
$env:DESKTOP_APP_URL = "https://你的云端域名"
npm.cmd run desktop
```

正式打包前，应把 `DESKTOP_APP_URL` 配置为实际部署的 HTTPS 地址，并确认云端已经部署当前网页和所有 `/api/*` 接口。

## 生成 EXE 安装包

```powershell
npm.cmd run desktop:pack
```

安装包会生成在 `release` 目录。打包后的客户端仍需要访问云端 API，因此目标电脑需要网络连接。
