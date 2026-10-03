# 云端部署指南（Oracle Cloud 永久免费）

本指南教你把「爱丽丝 QQ 机器人」部署到 **Oracle Cloud 永久免费**的 ARM 实例上，实现 24/7 在线、不占用你自己电脑。

> 为什么选 Oracle？它提供 **ARM 4 核 24GB 内存的实例永久免费**（需绑一张信用卡/借记卡做验证，不扣费），配置充裕，足够 NapCat + 机器人长期运行。

> 关于登录方式：原计划「本地 Windows 先扫码再上传」，但本地那个 Windows 版 NapCat 目前缺 `crypto.dll`/`ssl.dll` 跑不起来。所以这里采用更稳的 **云端 WebUI 远程扫码**——在 Oracle 上用 Linux 版 NapCat 的 Docker 镜像（没有 DLL 问题），开 WebUI 让你本地浏览器扫一次，登录态存在云盘，以后重启都不用再扫。

---

## 一、开通 Oracle Cloud 免费实例

> 📝 注册 / 绑卡每一步的截图级操作和常见卡点排查，见 **[ORACLE_SIGNUP.md](ORACLE_SIGNUP.md)**。

1. 打开 https://www.oracle.com/cloud/free/ ，用邮箱注册 Always Free 账号。
   - 需要手机号验证 + 绑定信用卡/借记卡（仅验证，不扣费）。
2. 进入 **OCI 控制台** → 右上角选区域（建议选离你近且有 ARM 的，如 *Japan East (Tokyo)* / *Seoul* / *Singapore* / *Frankfurt*）。
3. **创建实例**：
   - 菜单 → **Compute** → **Instances** → **Create instance**
   - **Image**：选 `Ubuntu 22.04`（或 Oracle Linux 9）
   - **Shape** → *Change shape* → *Specialty and Legacy* → **VM.Standard.A1.Flex** → 设 **4 OCPU / 24 GB**（在 Always Free 额度内）
   - **Networking**：勾选 *Assign a public IPv4 address*（必须，否则外网进不来）
   - **Add SSH keys**：选 *Generate a key pair* 下载私钥（记住保存路径），或粘贴你已有的公钥
   - 点 **Create**
4. **放通端口**（关键，否则扫码打不开）：
   - 实例详情 → *Virtual cloud network* → *Security List* → **Add Ingress Rule**
   - 添加两条：`Destination port = 6099`（WebUI）、`Destination port = 22`（SSH，默认已有）。3001 不用对外放（bot 在容器网络内访问）。
   - Source CIDR 填 `0.0.0.0/0`（全网），或只填你自己的 IP 更安全。
5. 记下实例的 **Public IP**。

---

## 二、登录服务器并装 Docker

```bash
# 把下载的私钥权限改好（私钥文件在你本机）
chmod 400 ~/Downloads/oci-key.pem

# SSH 登录（Ubuntu 镜像用户名是 ubuntu；Oracle Linux 是 opc）
ssh -i ~/Downloads/oci-key.pem ubuntu@<你的Public IP>
```

登录后，在服务器上执行：

```bash
# 一键安装 Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# 退出重登使 docker 组生效
exit
```

重新 `ssh` 登录后验证：`docker --version` 和 `docker compose version` 都应正常。

---

## 三、上传项目并配置

回到你**本机**（不是服务器），把项目传上去。云端用的是 Docker 版 NapCat，先删掉没用的 Windows 版和工具目录再传：

```bash
# 在本机项目目录执行
cd qq-alice-bot
rm -rf napcat tools            # 云端用 Docker 镜像，不需要 Windows 版
scp -r -o StrictHostKeyChecking=no . ubuntu@<你的Public IP>:~/qq-alice-bot
```

回到服务器：

```bash
ssh -i ~/Downloads/oci-key.pem ubuntu@<你的Public IP>
cd ~/qq-alice-bot

# 配置环境变量（填大模型 API Key）
cp .env.example .env
nano .env          # 把 LLM_API_KEY 改成你的真实 Key，保存退出
```

---

## 四、启动

```bash
cd ~/qq-alice-bot
docker compose up -d
```

拉取镜像（约 1~2 分钟）并启动两个容器：`napcat`（QQ 桥接）和 `alice-bot`（爱丽丝机器人）。

---

## 五、扫码登录 QQ（只需一次）

1. 本地浏览器打开 `http://<你的Public IP>:6099/webui`
2. 登录 Token 默认是 `napcat`（首次可在 `docker logs napcat` 里看到实际 token）
3. 进入后扫码登录 **小号 QQ**（务必用小号，非官方协议有风控风险）
4. 登录成功后，在 WebUI 里确认 **OneBot 11 正向 WebSocket** 已开启：
   - 路径大致是：配置 → OneBot 11 → 添加一个「正向 WebSocket 服务端」
   - 端口填 `3001`，host 填 `0.0.0.0`
   - 保存后 NapCat 会在 `ws://0.0.0.0:3001` 等连接
5. 查看机器人是否上线：

```bash
docker logs -f alice-bot
# 看到「机器人 QQ: xxxxx，爱丽丝上线！爱丽丝Beam！！」即成功
# 看到「收到私聊消息 ... 已回复」说明已经在聊天了
```

给这个 QQ 小号发条私聊消息，或拉进群里 @它，就会收到爱丽丝的回复。

---

## 六、维护

- **重启容器**（更新代码后）：`docker compose up -d --build`
- **看日志**：`docker logs -f alice-bot` / `docker logs -f napcat`
- **停止**：`docker compose down`
- **登录态**：已持久化在 `~/qq-alice-bot/napcat_data/QQ`，容器重启/重建都 **无需重新扫码**。除非你删了这个目录，或 QQ 被挤下线。

---

## 七、安全提醒（重要）

- `6099` 的 WebUI 暴露在公网。登录并配置好后，**建议改掉默认 token** 或在安全列表里把 6099 的 Source 限制成你自己的 IP；不用的话也可以把 `docker-compose.yml` 里 `6099:6099` 那行删掉（但那样以后重登就要临时开放）。
- 务必使用 **小号** QQ，大号有风控/封号风险。
- Oracle 免费实例到期/资源回收：Always Free 的 ARM 实例是长期有效的，不会自动过期；但账号欠费或验证失效可能停用，留意邮件。

---

## 常见问题

**Q：扫码后机器人没上线 / bot 日志一直重连？**
A：确认 NapCat WebUI 里 OneBot 11 正向 WS 端口是 `3001` 且 host `0.0.0.0`；确认 `docker compose.yml` 里 bot 的 `NAPCAT_WS_URL=ws://napcat:3001`（compose 网络内用服务名即可）。`docker logs napcat` 看有没有报错。

**Q：想换大模型（智谱/Kimi/OpenAI）？**
A：编辑 `.env` 里的 `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`，然后 `docker compose up -d --build` 重启 bot 即可。只要是 OpenAI 兼容接口都行。

**Q：以后想本地先登录再传上去行不行？**
A：可以。等你本地 Windows 版 NapCat 修好 DLL 并登录成功后，把本地的 QQ 登录态目录打包，覆盖到服务器 `~/qq-alice-bot/napcat_data/QQ` 即可，效果一样（本质都是持久化这个登录态目录）。本指南主推云端扫码，因为最直接。
