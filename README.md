# BeyondBridge

BeyondBridge 是一個單倉庫專案，核心為 `Node.js + Express` 後端，提供：
- 官方網站 (`/`)
- 教學平台 (`/platform`)
- 管理後台 (`/admin`)
- API (`/api/*`)
- WebSocket 即時功能 (Socket.io)

## 專案結構

```text
backend/                 # 後端服務（唯一可執行服務）
  src/                   # API handlers、middleware、utils、realtime
  public/                # 後端直接服務的前端靜態檔（正式來源）
  scripts/               # DynamoDB 建表、seed、資料維運腳本
platform/                # 前端副本（需由 backend/public/platform 同步）
website/                 # 官網靜態版副本
docs/                    # 架構圖與專案文件
```

## 重要原則

1. 前端「正式來源」是 `backend/public/platform`。  
2. 根目錄 `platform/` 是副本，請用 `backend` 的同步腳本更新：

```bash
cd backend
npm run sync-platform
```

## 快速啟動（本機）

```bash
cd backend
cp .env.example .env
npm install
npm run setup
npm run seed
npm run dev
```

啟動後預設：
- `http://localhost:3000/` 官網
- `http://localhost:3000/platform` 平台
- `http://localhost:3000/admin` 後台
- `http://localhost:3000/health` 健康檢查

## 後端主要腳本

- `npm run dev`: 本機開發
- `npm run start`: 正式啟動
- `npm run setup`: 建立/檢查 DynamoDB 表結構
- `npm run seed`: 建立初始資料
- `npm run sync-platform`: 同步 `backend/public/platform` 到根目錄 `platform/`
- `npm run email:setup-ses-domain -- beyondbridge.com`: 產生 SES 寄件網域驗證需要加入 DNS 的 TXT/CNAME records
- `npm run email:diagnose -- --to someone@example.com`: 檢查 SES identity 狀態並實測寄信

## Email / SES 設定

學生電子郵件驗證與老師邀請信可使用 SMTP/Gmail 或 AWS SES。

目前若先用 Gmail 寄出，Render 建議設定：

```text
STUDENT_EMAIL_VERIFICATION_REQUIRED=false
EMAIL_PROVIDER=smtp
EMAIL_FROM=beyondbridge1020@gmail.com
EMAIL_FROM_NAME=BeyondBridge
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=beyondbridge1020@gmail.com
SMTP_PASS=<Google App Password>
```

`SMTP_PASS` 請使用 Google App Password，不要使用 Gmail 登入密碼。Google App Password 需要該 Google 帳號已啟用 2-Step Verification。

若改用 AWS SES。正式環境需要完成同一個 SES region 的兩件事：

1. 驗證寄件網域或寄件信箱，例如 `beyondbridge.com` 或 `noreply@beyondbridge.com`。
2. 將 SES account 從 sandbox 移到 production access，否則只能寄給已驗證的收件人。

SES Render 建議設定：

```text
EMAIL_PROVIDER=ses
AWS_SES_REGION=ap-southeast-2
EMAIL_FROM=noreply@beyondbridge.com
EMAIL_FROM_NAME=BeyondBridge
```

如果 SES identity 建在其他 region，`AWS_SES_REGION` 必須跟該 identity 的 region 一致。

## Git 工作流建議

1. 從 `main` 拉新分支：`feat/*`、`fix/*`、`chore/*`
2. 小步提交，避免混入 `backend/uploads/` 或本機測試檔
3. 送 PR 前至少做：
   - `node --check`（語法檢查）
   - 核心路徑 smoke test（`/health`, `/api/auth/login`, `/platform`, `/admin`）

## GitHub 設定建議（Repo Settings）

### Branch protection (`main`)
- Require pull request before merging
- Require at least 1 approval
- Require status checks to pass
- Dismiss stale approvals when new commits are pushed
- Restrict who can push to matching branches（可選）

### Secrets / Variables
- 使用 GitHub Secrets 管理正式環境金鑰：
  - `JWT_SECRET`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `GROQ_API_KEY`（可選，用於老師測驗 AI 分析）
  - `GROQ_MODEL`（可選，預設 `llama-3.3-70b-versatile`）
  - 其他部署相關變數

### Actions
- 已提供基本 smoke workflow：`.github/workflows/backend-smoke.yml`
- 建議後續再加整合測試與部署流程（staging/prod 分離）

## 安全注意事項

- 正式環境務必設定：
  - `NODE_ENV=production`
  - `CORS_ORIGINS`
  - 強密碼 `JWT_SECRET`
- 不要提交 `.env`、`backend/uploads/`、本機測試資料。
