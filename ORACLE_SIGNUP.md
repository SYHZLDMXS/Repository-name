# Oracle Cloud 免费账号注册 · 手把手

这份专门讲「怎么把 Oracle 免费账号注册下来」。注册和绑卡必须你本人操作（要你的邮箱、手机号、银行卡），我没法替你点网页，但每一步怎么点、最容易卡在哪，都写清楚了。

> 如果绑卡实在过不去（比如只有纯银联卡），不用硬刚 Oracle——随时可以换 **Railway / Koyeb** 这类免绑信用卡的免费云，注册只要一个邮箱，体验一样。见主指南末尾说明。

---

## 0. 提前准备

- **邮箱**：能收邮件即可（Gmail / Outlook / QQ 邮箱都行）。
- **手机号**：收短信验证码（选 +86 中国）。
- **银行卡**：一张带 **Visa / MasterCard 标识**的信用卡或借记卡。
  - ⚠️ 纯银联单标卡大概率被拒，建议用双标卡或外币卡。
  - Oracle 会做一笔 **$1 预授权**（不是扣款），验证后自动撤销，不花钱。
- **网络**：Oracle 官网在国内偶尔加载慢。若页面转圈卡住，换手机热点或开加速器再试。

---

## 1. 开始注册

1. 打开 https://www.oracle.com/cloud/free/
2. 点页面上的 **Start for free**（开始免费）。
3. 填账号信息：
   - **Email**：你的邮箱
   - **Country / Territory**：选你的国家/地区。若提示该地区不支持免费，改选支持地区（如 *United States* / *Japan* / *Singapore*）
   - **First / Last Name**：姓名拼音
   - **Password**：≥12 位，含大小写字母 + 数字 + 符号
4. 点 **Continue / Next**。

---

## 2. 验证邮箱

- 系统给你的邮箱发验证邮件。
- 去邮箱打开 *Verify your email* 邮件 → 点里面的链接完成验证。
- 没收到？先看垃圾邮件箱；或在页面点 **Resend**（重发）。

---

## 3. 手机验证

- 填手机号（国码选 +86），点发送 → 收短信验证码 → 填入。
- 收不到？等 1~2 分钟；确认号码正确；或切换手机流量再试。

---

## 4. 填写账户详情

- **Account type**：选 **Personal（个人）**。
- **地址**：填真实可对应的地址；城市/省用拼音或英文。
- **账单地址**：要和下一步绑的卡预留地址一致（很多绑卡失败就是这里对不上）。
- 勾选同意服务条款，继续。

---

## 5. 付款方式（绑卡——最关键也最容易卡）

- 填：卡号、有效期、CVV、持卡人姓名（拼音，和卡面一致）、账单地址。
- 点 **Continue / Submit**。
- Oracle 会发一笔 **$1 预授权**验证，成功后自动撤销（不产生费用）。
- ⚠️ **常见绑卡失败原因**：
  | 现象 | 解决 |
  | --- | --- |
  | 提示 card declined / 被拒 | 卡是纯银联 → 换 Visa/MC 双标或外币卡 |
  | 一直处理中 | 卡片未开通境外在线支付 → 去银行 App 开通「境外线上支付」 |
  | 地址校验失败 | 把账单地址改成和银行预留完全一致（包括拼音格式） |
  | 银行发来拦截短信 | 按短信提示放行，或换卡 |
  | 预授权没退回 | 一般 1~7 个工作日自动撤销，不实质扣费 |

---

## 6. 完成注册，进入控制台

- 页面提示 *Your Cloud Account is created*。
- 点 **Sign in to Oracle Cloud Infrastructure (OCI) Console** 登录。
- 用刚才的邮箱 + 密码登录。
- 首次登录可能让你设一个租户名（Tenancy name），随意填（如 `mybot`）。

---

## 7. 创建免费 ARM 实例（接主指南第二步）

登录控制台后，回到主指南 **[CLOUD_DEPLOY.md](CLOUD_DEPLOY.md)** 的「二、登录服务器并装 Docker」之前的部分：

- 左上角 ☰ 菜单 → **Compute** → **Instances** → **Create instance**
- **Image**：Ubuntu 22.04
- **Shape** → Change shape → Specialty and Legacy → **VM.Standard.A1.Flex** → 设 **4 OCPU / 24 GB**（在 Always Free 额度内）
- **Networking**：勾选 *Assign a public IPv4 address*
- **Add SSH keys**：选 *Generate a key pair* 下载私钥（保存好）
- **Security List**：添加 Ingress Rule，放通 `6099`（WebUI）
- 点 **Create**，记下 **Public IP**

---

## 常见卡点速查

| 现象 | 解决 |
| --- | --- |
| 注册页一直转圈 / 加载慢 | 换网络（手机热点）、开加速器、避开晚高峰 |
| 邮箱收不到验证信 | 查垃圾箱；点 Resend；换邮箱 |
| 手机收不到验证码 | 等几分钟；确认 +86；换号 |
| 绑卡被拒 / 失败 | 见第 5 步失败原因清单 |
| 提示「该地区不支持免费」 | 注册 Country 改选支持地区（US / JP / SG 等） |
| 登录后找不到菜单 | 左上角 ☰ → Compute → Instances |

---

注册好、实例也建好之后，把主指南 **CLOUD_DEPLOY.md** 的「二、三、四」走完（装 Docker → 传项目 → `docker compose up -d`），再到浏览器开 `http://<Public IP>:6099/webui` 用 QQ 小号扫码即可。
