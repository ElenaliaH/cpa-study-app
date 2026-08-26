# 税法刷题模块维护说明

## 题库来源

题库只允许从本地的“题库来源”目录中指定 Word 文件解析。原始 Word、候选 JSON 和可发布 JSON 均被 Git 忽略，不要提交到公开仓库。

## 生成题库

    powershell -ExecutionPolicy Bypass -File .\tools\parse-tax-bank.ps1

检查以下本地文件：

- work/tax-bank/tax-question-bank.validation.md
- work/tax-bank/tax-question-bank.publishable.json

解析器只把通过结构校验的客观题放入可发布文件。复杂题和异常题继续留在候选文件中人工复核，不允许自动补写答案或解析。

主观题使用独立解析器：

    pwsh -File .\tools\parse-tax-subjective-bank.ps1

检查以下 Git ignored 文件：

- work/tax-bank/tax-subjective-bank.validation.md
- work/tax-bank/tax-subjective-bank.publishable.json

主观题解析器只发布题干、答案边界明确的题块；可读取的 Word 表格会转换为文本表格，纯图片或无法读取的内容继续隔离。被隔离题必须逐题对照原 Word，不允许让 AI 补写原题内容。

## 数据库迁移

先审阅并执行：

    supabase/migrations/20260824_tax_practice.sql
    supabase/migrations/20260826_tax_batch_subjective.sql
    supabase/migrations/20260826_tax_subjective_grading.sql
    supabase/migrations/20260826_tax_subjective_rpc_hardening.sql
    supabase/migrations/20260826_tax_existing_rpc_hardening.sql

迁移不会修改或删除 user_app_data，新增表均使用独立 RLS。最后一项迁移增加客观题/主观题独立进度、主观题作答记录和 AI 辅助批改结果。

## 导入题库

先进行不联网的校验：

    powershell -ExecutionPolicy Bypass -File .\tools\import-tax-bank.ps1

确认迁移已执行后，在当前终端临时设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY，再运行：

    powershell -ExecutionPolicy Bypass -File .\tools\import-tax-bank.ps1 -Apply

导入脚本只执行 upsert，不删除已有题目，也不会打印密钥。service_role 只能用于本地受控导入，严禁写入前端文件。

主观题默认只导入为未发布暂存数据：

    pwsh -File .\tools\import-tax-subjective-bank.ps1

只有在包含主观题前端的版本已经进入正式站点后，才允许显式发布：

    pwsh -File .\tools\import-tax-subjective-bank.ps1 -Publish

发布脚本不会删除历史题目，只会 upsert 主观题并重新统计相关章节的已发布题数。

## 练习进度

- 每道客观题单独提交并立即判题，答题卡显示整个专题的正确、错误和未作答状态。
- 点击章节后先选择客观题或主观题，两类题使用独立 session 保存进度。
- 主观题可以保存用户答案并请求 GPT 辅助批改；批改结果与用户答案分开保存，不覆盖原书答案和解析。
- 主观题完成辅助批改或直接查看原书答案后记录为“已查看”，不纳入客观题正确率。
- 已提交答案和主观题进度保存在 Supabase，刷新或再次进入专题时会恢复。
- “重新刷题”只重置所选题型并创建新 session，不删除另一题型的进度，也不删除历史答题、错题、收藏、笔记或 AI 对话。

## 主观题辅助批改

- 批改请求必须携带当前 Supabase 登录令牌，由 Vercel API 再次核验用户、专题 session 和题目归属。
- 用户答案保存在 `tax_subjective_attempts`；AI 评分、反馈、模型名和批改时间与答案一同保留。
- GPT 输出仅作为辅助解释，页面始终单独展示原书答案和解析。
- 辅助批改与题目 AI 问答共用每日限额和冷却时间，不允许前端绕过。
- 原始题库和原书解析禁止发送到公开仓库，只有通过结构校验的题目可以发布到 Supabase。

## Vercel AI 环境变量

- OPENAI_API_KEY：OpenAI API 密钥
- OPENAI_MODEL：默认 gpt-5.4-mini
- SUPABASE_URL：Supabase 项目 URL
- SUPABASE_PUBLISHABLE_KEY：Supabase publishable key
- TAX_AI_DAILY_LIMIT：每用户每日调用上限，默认 20
- TAX_AI_ALLOWED_ORIGIN：正式网站来源，例如 https://cpa-study-app-three.vercel.app

AI Key 只能存放在 Vercel 后台环境变量，不能放入 JavaScript、Git 或 Supabase 数据表。
