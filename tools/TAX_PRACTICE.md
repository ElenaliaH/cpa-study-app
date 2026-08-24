# 税法刷题模块维护说明

## 题库来源

题库只允许从本地的“题库来源”目录中指定 Word 文件解析。原始 Word、候选 JSON 和可发布 JSON 均被 Git 忽略，不要提交到公开仓库。

## 生成题库

    powershell -ExecutionPolicy Bypass -File .\tools\parse-tax-bank.ps1

检查以下本地文件：

- work/tax-bank/tax-question-bank.validation.md
- work/tax-bank/tax-question-bank.publishable.json

解析器只把通过结构校验的客观题放入可发布文件。复杂题和异常题继续留在候选文件中人工复核，不允许自动补写答案或解析。

## 数据库迁移

先审阅并执行：

    supabase/migrations/20260824_tax_practice.sql

迁移不会修改或删除 user_app_data，新增表均使用独立 RLS。

## 导入题库

先进行不联网的校验：

    powershell -ExecutionPolicy Bypass -File .\tools\import-tax-bank.ps1

确认迁移已执行后，在当前终端临时设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY，再运行：

    powershell -ExecutionPolicy Bypass -File .\tools\import-tax-bank.ps1 -Apply

导入脚本只执行 upsert，不删除已有题目，也不会打印密钥。service_role 只能用于本地受控导入，严禁写入前端文件。

## Vercel AI 环境变量

- OPENAI_API_KEY：OpenAI API 密钥
- OPENAI_MODEL：默认 gpt-5.4-mini
- SUPABASE_URL：Supabase 项目 URL
- SUPABASE_PUBLISHABLE_KEY：Supabase publishable key
- TAX_AI_DAILY_LIMIT：每用户每日调用上限，默认 20
- TAX_AI_ALLOWED_ORIGIN：正式网站来源，例如 https://cpa-study-app-three.vercel.app

AI Key 只能存放在 Vercel 后台环境变量，不能放入 JavaScript、Git 或 Supabase 数据表。
