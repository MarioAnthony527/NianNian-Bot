# 念念 MVP

把抖音分享链接发给飞书机器人，念念会把视频重构成一个可执行承诺，并在飞书里推送提醒卡片。

## 1. 初始化 Supabase

1. 新建 Supabase 项目。
2. 打开 SQL Editor。
3. 执行 `supabase.schema.sql`。
4. 在 Project Settings 里复制 `Project URL` 和 `service_role` key。

## 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，填入：

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_VERIFICATION_TOKEN`
- `LLM_API_BASE`
- `LLM_API_KEY`
- `LLM_MODEL_ANALYZE`
- `LLM_MODEL_COPY`
- `NEXT_PUBLIC_APP_URL`

## 3. 飞书开放平台

企业自建应用需要启用机器人能力，并配置：

- 事件订阅地址：`https://your-domain/api/feishu/webhook`
- 卡片回调地址：`https://your-domain/api/feishu/card-action`
- 权限建议：`im:message`、`im:message.group_at_msg`、`contact:user.id:readonly`

## 4. 本地开发

```bash
npm install
npm run dev
```

本地没有公网 HTTPS 时，飞书不能直接回调本机。现场体验建议部署到 Vercel，并把部署域名写入 `NEXT_PUBLIC_APP_URL`。

## 5. 演示闭环

1. 评委向飞书机器人发送抖音公开分享链接。
2. 机器人回复处理中卡片。
3. 机器人发送承诺确认卡片。
4. 打开控制台查看状态。
5. 在 `/demo` 点击“立刻推送”，输入 `DEMO_SECRET`，评委收到提醒卡片。
6. 评委点击“做了 / 晚点 / 算了”，状态同步到看板。

## 6. 抖音解析说明

当前默认策略会跟随短链重定向并抓取公开页面 meta 信息。如果页面读不到标题和描述，会提示用户换一条公开分享链接，不会伪造内容。

如果团队有真实抖音解析服务，设置 `DOUYIN_PARSER_BASE_URL`。系统会尝试调用常见的 `?url=` 形式接口，并使用返回的 title、description、author、cover、tags、subtitle。
