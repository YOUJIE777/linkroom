# Linkroom 验证协作台

轻量网页原型：批次管理、状态下拉、微信聊天文本链接提取、重复链接提示、CSV 导入导出、按记录关联附件入口。

## 本地预览

直接打开 `index.html`。当前演示模式把记录和批次保存在浏览器 `localStorage`，只对当前浏览器可见；不会跨设备或与另一位成员同步。

## 云端多人协作接入底座

`supabase-schema.sql` 定义了工作区、成员角色、批次、记录、记录附件元数据及活动记录，包含基于成员关系的 RLS 策略和 Realtime publication。

接入准备步骤：

1. 创建 Supabase 项目，在 SQL Editor 执行 `supabase-schema.sql`。
2. 在 Authentication 配置邮箱登录与邀请；创建工作区时由可信后端同时写入第一位 admin 成员，禁止浏览器自行授予角色。
3. 创建名为 `record-attachments` 的 private Storage bucket；上传对象使用 `<workspace UUID>/<record UUID>/<random filename>` 路径。授权下载需生成短期 signed URL。
4. 在 `config.js` 写入项目 URL 和 anon/publishable key（此 key 可公开；绝不可放 service_role key）。
5. 页面已有 Supabase 邮箱魔法链接登录、按当前用户成员关系读取工作区、共享批次/记录读取、记录状态更新、批次和记录创建、文本/CSV 批量导入及 Realtime 监听。
6. 建立第一工作区和首个管理员成员需要可信后台操作（SQL editor 手动初始化，或部署受保护的 server/edge function）；不要开放浏览器端自助提权。邀请成员同样应由 admin-only 后端函数完成。
7. 部署到 HTTPS 静态托管。不要直接用 `file://` 访问云端功能，因为邮件回跳与浏览器身份验证需要稳定的 HTTPS 来源。

SQL 文件是安全接入底座。只有完成 Supabase 配置、执行 SQL、初始化工作区并通过 HTTPS 部署后，云端多人功能才可使用。云端附件使用私有存储桶和按工作区限制的权限策略；演示模式不保存附件文件。

## 当前云端升级

已部署的项目还需执行 `supabase-workspace-features.sql`，增加批次日期、管理员专属操作动态和成员显示名称。网页在云端模式下可上传图片及 PDF 到私有 `record-attachments` 存储桶，附件信息保存在 `attachments` 表。本机演示模式不保存附件文件。
