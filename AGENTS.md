# AGENTS.md

## 一、项目概况

- 项目名称：CPA Study
- 正式网址：https://cpa-study-app-three.vercel.app/
- 技术栈：纯 HTML / CSS / JavaScript
- 本项目不是 React，不是 Vite，不是 Next.js
- 前端部署平台：Vercel
- 数据库：Supabase
- 云同步方式：Supabase Auth + `user_app_data.data` jsonb 整包同步

## 二、重要文件说明

- `index.html`：页面结构和脚本入口
- `css/`：样式
- `js/app.js`：应用初始化
- `js/store.js`：本地数据和业务数据管理
- `js/supabaseClient.js`：Supabase 前端客户端配置，只能使用 anon / publishable key
- `js/supabaseStorage.js`：Supabase 登录、读取、保存和同步逻辑
- `supabase/schema.sql`：Supabase 表结构和 RLS 策略
- `sw.js`：Service Worker / PWA 缓存
- `worker/`：Cloudflare Worker 测试目录，暂时不接入正式网站
- `vercel.json`：Vercel 部署配置
- `package.json`：依赖和脚本

## 三、当前架构

- 前端：Vercel
- 登录：Supabase Auth
- 数据库：Supabase
- 主表：`user_app_data`
- 主字段：`data` jsonb
- `data` 中包含 `examDate`、`subjects`、`manualTasks`、`mistakes`、`schemaVersion` 等
- 手机和电脑通过同一个 Supabase 账号登录，实现云同步

## 四、已废弃或暂存方案

- 腾讯云 CloudBase 已弃用并清理，不要恢复
- GitHub Token 同步方案已弃用，不要恢复
- Cloudflare Worker / 自定义域名方案只是测试过，暂时不接入正式网站
- 当前正式网站仍然是 Vercel + Supabase 直连

## 五、严禁事项

1. 不要恢复 CloudBase；
2. 不要使用 GitHub Token 同步数据；
3. 不要把 Supabase service_role key 写进前端；
4. 不要删除 Supabase 项目；
5. 不要删除 `user_app_data` 数据；
6. 不要修改 Supabase 表结构，除非用户明确要求；
7. 不要把任何 API Key、Token、密钥写进项目文件；
8. 不要读取或打印 `C:\Users\99388\.claude\settings.json`；
9. 不要部署到腾讯云；
10. 不要修改正式部署平台，除非用户确认；
11. 不要直接 git push，除非用户明确确认；
12. 不要清理 `.claude`、`.codex`、`AppData/Roaming/npm` 等工具配置目录；
13. 不要把 Cloudflare Worker 接入正式网站，除非用户明确要求。

## 六、以后修改流程

1. 先扫描相关文件；
2. 先输出修改计划；
3. 等用户确认；
4. 再修改代码；
5. 本地 `http://localhost:3000` 测试；
6. 确认 Supabase 云同步不受影响；
7. 执行 `git status`；
8. 用户确认后再 commit；
9. 用户确认后再 push；
10. Vercel 自动部署正式网站。

## 七、测试要求

每次改功能后至少检查：

1. 页面能否打开；
2. Supabase 登录是否正常；
3. 电脑和手机是否还能同步；
4. 浏览器 Console 是否有红色报错；
5. `git status` 是否符合预期；
6. 修改是否只影响本次任务相关文件。
