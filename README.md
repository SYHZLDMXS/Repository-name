# 蔚蓝档案·爱丽丝 QQ 聊天机器人 🎮

基于 **NapCat**（OneBot v11 协议）+ 大模型的 QQ 聊天机器人，人设为《蔚蓝档案》的天童爱丽丝。

> 🌐 想让机器人 24/7 跑在云端、不占用自己电脑？
> - 免信用卡：**→ [Koyeb 部署指南](KOYEB_DEPLOY.md)**（免费档有限制，文档已说明）
> - 资源最充裕（4核24G 永久免费，需绑卡）：**[Oracle 部署指南](CLOUD_DEPLOY.md)**

## 架构

```
QQ 服务器 ←→ NapCat（挂你的QQ号） ←→ OneBot v11 WebSocket ←→ bot.js（爱丽丝） ←→ 大模型 API
```

## 搭建步骤

### 第一步：安装 NapCat 并登录 QQ

1. 到 NapCat 发布页下载 Windows 版：<https://napneko.github.io/guide/boot/Shell>
   （或 GitHub Releases：<https://github.com/NapNeko/NapCatQQ/releases>，下载 `NapCat.Shell.Zip`）
2. 解压后运行里面的启动脚本，会弹出 QQ 登录界面，**用你准备给机器人用的 QQ 号扫码登录**。
   - ⚠️ 建议用小号，不要用主号！
3. 登录成功后，打开 NapCat 的 WebUI（一般是 <http://localhost:6099>），进入「网络配置」→「新建」：
   - 类型：**WebSocket 服务器**
   - 端口：**3001**
   - 其他默认，保存启用。

### 第二步：获取大模型 API Key

默认配置使用 DeepSeek（便宜且效果好）：

1. 到 <https://platform.deepseek.com> 注册并充值少量金额（几块钱够用很久）。
2. 创建 API Key（`sk-` 开头）。

也可以换成其他任何 OpenAI 兼容接口，只需改 `config.json` 里的 `llm` 三项。

### 第三步：填配置并启动

1. 编辑本目录下的 `config.json`，把 `apiKey` 换成你的真实 Key。
2. 启动机器人：

```bash
node bot.js
```

看到 `机器人 QQ: xxx，爱丽丝上线！爱丽丝Beam！！` 即成功。

## 使用方式

- **私聊**机器人：直接聊天，爱丽丝都会回复。
- **群聊**：`@机器人 + 内容` 才会回复（把 `config.json` 里 `listenGroupAll` 改为 `true` 可以回复群里所有消息，慎用）。
- 对话记忆：同一私聊/群成员的上下文会保留 2 小时。

## 常见问题

| 问题 | 解决 |
| --- | --- |
| 一直重连失败 | 检查 NapCat WebSocket 服务器是否开启、端口是否为 3001 |
| 报 401 | NapCat 设置了 access token，把它填到 `config.json` 的 `accessToken` |
| LLM 返回 401 | API Key 没填对 |
| LLM 返回 402 | DeepSeek 余额不足 |

---

## 云端部署（Oracle Cloud 永久免费）

不想在自己电脑 24/7 开着？可以用 **Oracle Cloud Always Free** 的 ARM 4 核 24G 实例（永久免费，需绑卡验证不扣费）把整套跑在云端。

方案：用官方 `mlikiowa/napcat-docker` 镜像（Linux 版，无 Windows 的 DLL 问题）做 QQ 桥接，bot 另起一个容器连它，QQ 登录态持久化到云盘，扫码一次后重启免再扫。

配套文件：

- `docker-compose.yml` —— napcat + bot 双服务编排
- `Dockerfile` —— bot 容器（node:22-slim，零依赖）
- `.env.example` —— 环境变量模板（NapCat 地址 / 大模型 Key）
- **`CLOUD_DEPLOY.md`** —— 从开 Oracle 实例到扫码上线的完整图文步骤

只需你自己做的两步：① 注册免费 Oracle 账号并开实例；② 浏览器开 WebUI 扫一次 QQ 码。其余文件我都准备好了。

### Koyeb（免信用卡，但免费档有限制）

不想绑卡？可以用 **Koyeb** 免信用卡部署。注意免费档 **512MB 内存可能 OOM、无持久卷（重启要重扫）、空闲会暂停**，适合试水；要稳需升到付费 Small 实例。

- `Dockerfile.koyeb` —— 单容器合一镜像（NapCat + bot 用 supervisord 同跑）
- `supervisord.conf` / `start_napcat.sh` —— 进程管理
- **`KOYEB_DEPLOY.md`** —— 从注册到扫码上线的完整步骤（含免费档限制说明）
