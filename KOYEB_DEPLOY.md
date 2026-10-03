# 云端部署：Koyeb（免信用卡）

> 目标：把「NapCat（QQ 桥接）+ 爱丽丝 bot」整个跑在 Koyeb 上，你只需最后用手机扫一次 QQ 登录码。
> 配套文件：`Dockerfile.koyeb`（合一镜像）、`supervisord.conf`、`start_napcat.sh`。

---

## 0. ⚠️ 先说清楚：Koyeb 免费档的限制（必读）

Koyeb 免费档**不用绑信用卡**，但这三个限制对「QQ 机器人」这种常驻 + 要存登录态的场景很要命：

| 限制 | 影响 | 应对 |
| --- | --- | --- |
| **512MB RAM / 0.1 vCPU** | NapCat 是 QQNT（Electron 内核），启动约吃 300–500MB，免费档极可能 **OOM 崩溃** | 升到 **Small 实例（≥1GB）** 才稳 |
| **无持久卷**（免费档） | QQ 登录态存容器临时盘，容器一重建/一暂停就丢，**得重新扫码** | 付费档开启持久卷，挂 `/app/.config/QQ` |
| **空闲自动暂停（scale-to-zero）** | 不能真正 24/7 常驻，没人说话一段时间就停 | 付费档关闭该行为 |

**结论**：想"免费 + 长期稳"，Koyeb 免费档不合适；想"先免卡跑起来试水"，可以用免费档，但要做好"偶尔崩/重启要重扫"的心理准备。真要 24/7，**Oracle 永久免费（4核24G + 块存储）** 仍是唯一正解（见 `CLOUD_DEPLOY.md`）。

下面步骤两种档位都适用，付费档只需在「实例类型」和「持久卷」两步多选一下。

---

## 1. 准备代码仓库

Koyeb 推荐从 GitHub 拉代码构建。建议把本目录（`qq-alice-bot/`）单独作为一个 Git 仓库推到 GitHub：

```bash
cd qq-alice-bot
git init
git add .
git commit -m "爱丽丝 QQ 机器人 - Koyeb 部署"
# 在 GitHub 新建一个空仓库，然后：
git remote add origin https://github.com/你的用户名/qq-alice-bot.git
git push -u origin main
```

> 仓库根目录里要有 `Dockerfile.koyeb`、`bot.js`、`package.json`、`supervisord.conf`、`start_napcat.sh`。`.dockerignore` 已排除 `napcat/`（115MB 的 Windows 版）和 `tools/`，构建上下文不会膨胀。

---

## 2. 注册并新建 App

1. 打开 <https://www.koyeb.com> ，用**邮箱**注册（无需信用卡）。
2. 控制台点 **Create App** → **GitHub**（授权并选刚才的仓库）。
3. Builder 选 **Dockerfile**；Dockerfile path 填：
   - 若仓库根就是 `qq-alice-bot`：`Dockerfile.koyeb`
   - 若仓库根包含 `qq-alice-bot/` 子目录：`qq-alice-bot/Dockerfile.koyeb`
4. 实例类型：免费档会自动用 Free；想稳就选 **Small（1GB+）**。

---

## 3. 配置

### 3.1 端口（暴露 WebUI 供你扫码）
Koyeb 的 Web Service 会自动分配一个 `*.koyeb.app` 域名并做 HTTPS 转发。把容器端口设为：
- **6099**（NapCat WebUI，对外公开，你用来扫码）

> 3001（OneBot WS）**不需要对外**，bot 在同一容器内通过 `127.0.0.1:3001` 连接即可。

### 3.2 环境变量（App Settings → Environment variables）
| 变量 | 值 | 说明 |
| --- | --- | --- |
| `NAPCAT_UID` | `0` | NapCat-Docker 要求的权限变量，设 0 即 root 避免权限问题 |
| `NAPCAT_GID` | `0` | 同上 |
| `LLM_API_KEY` | `sk-你的真实Key` | 不填则机器人走内置应答模式（爱丽丝语气固定回复） |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | 可换智谱/OpenAI/Kimi 等任意 OpenAI 兼容地址 |
| `LLM_MODEL` | `deepseek-chat` | 对应模型名 |
| `NAPCAT_TOKEN` | 留空 | 若你在 WebUI 给 OneBot 设了 token，这里填一样的 |
| `NAPCAT_WS_URL` | **不填** | 镜像内默认 `ws://127.0.0.1:3001`，无需改 |

### 3.3 持久卷（仅付费档，强烈建议）
在 Volumes 里挂两块（避免重启重扫）：
- 容器路径 `/app/.config/QQ` ← QQ 登录态
- 容器路径 `/app/napcat/config` ← NapCat 配置（含 OneBot 设置）

---

## 4. 部署并查看日志

点 **Deploy**。等构建完成（首次约 1–3 分钟，要下载 Node 22 和装 NapCat 依赖）。

在 **Runtime logs** 里应看到：
- NapCat 启动日志，含一行 `WebUi User Panel Url: http://...:6099/webui?token=xxxx`
- bot 日志 `=== 蔚蓝档案·爱丽丝 QQ 机器人启动 ===`

---

## 5. 扫码登录 QQ

1. 浏览器打开 `https://<你的子域名>.koyeb.app/webui?token=napcat`
   - 默认 token 是 `napcat`；若日志里给出别的 `?token=xxxx`，用那个。
2. 进入 **QQ 登录** → 选 **扫码登录**，用你给机器人用的 **QQ 小号** 扫码。
   - ⚠️ 务必用小号，个人号有风控风险。
3. 登录成功后提示修改默认密码，建议改掉。

---

## 6. 配置 OneBot 正向 WebSocket

NapCat 登录后默认还没开 OneBot 接口，需要手动建一个：

1. WebUI 里进入 **网络配置（Network）** → **新建**。
2. 类型：**WebSocket 服务端（正向 WS）**
3. 端口：**3001**
4. 监听地址：`0.0.0.0`
5. access_token：不设（或设一个，并同步填到环境变量 `NAPCAT_TOKEN`）
6. 保存并启用。

bot 会自动连上，日志出现 `机器人 QQ: xxxx，爱丽丝上线！爱丽丝Beam！！` 即成功。

---

## 7. 验证

- 私聊机器人小号：发"你好"，应收到爱丽丝语气回复。
- 把小号拉进一个群，在群里 `@小号 你好`，应被回复。

---

## 8. 排错

| 现象 | 原因 / 解决 |
| --- | --- |
| 容器反复重启、日志报 OOM / killed | 内存不够。**升实例到 ≥1GB** |
| NapCat 没起来（无 WebUI 日志） | 看 `napcat.out.log`/`napcat.err.log`；若报找不到启动入口，进容器 `ls /usr/local/bin /app` 找实际路径，改 `start_napcat.sh` 后重推 |
| 访问 `*.koyeb.app` 打不开 WebUI | 确认端口填的是 **6099** 且服务是 Web Service 类型 |
| bot 一直"连接断开/重连" | OneBot 正向 WS 没建或端口不对；回第 6 步确认 3001 已启用 |
| 报 401 | NapCat 设了 access_token，把同一 token 填进 `NAPCAT_TOKEN` 环境变量 |
| 重启后又要重新扫码 | 免费档无持久卷；升级付费档并挂第 3.3 节的卷 |
| NapCat 日志报 Chromium / sandbox 错误 | 以 root（UID=0）跑 QQNT 触发沙箱限制。把 `NAPCAT_UID`/`NAPCAT_GID` 改为 `1000`；若镜像无该用户仍报错，需为容器加 `--no-sandbox` 等效参数（详见 NapCat 文档） |

---

## 9. 升级到付费档（推荐用于稳定 24/7）

在 Koyeb 把实例类型改成 **Small（1GB 内存起）**，开启两块持久卷（第 3.3 节），并在实例设置里关闭 **scale-to-zero / 自动暂停**。这样机器人可稳定 24/7，且登录态持久化、重启免再扫。
