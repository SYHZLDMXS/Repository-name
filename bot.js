/**
 * 蔚蓝档案·爱丽丝 QQ 聊天机器人
 * 协议：OneBot v11（NapCat WebSocket 正向连接）
 * 运行：node bot.js（Node >= 22，零第三方依赖）
 */
const fs = require('fs');
const path = require('path');

// ---------- 配置 ----------
// 云端部署优先读环境变量，本地未设置时回退到 config.json
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const env = process.env;
const NAPCAT_WS = env.NAPCAT_WS_URL || config.napcat.wsUrl;
const ACCESS_TOKEN = env.NAPCAT_TOKEN || config.napcat.accessToken || '';
const BOT_CFG = config.bot;
const LLM_CFG = {
  baseUrl: env.LLM_BASE_URL || config.llm.baseUrl,
  apiKey: env.LLM_API_KEY || config.llm.apiKey,
  model: env.LLM_MODEL || config.llm.model,
  temperature: config.llm.temperature ?? 0.9,
  maxTokens: config.llm.maxTokens ?? 300,
};

// ---------- 状态 ----------
let selfId = '';            // 机器人自己的 QQ 号
let ws = null;
let reconnectDelay = 3000;
let closedByUs = false;

// 会话历史：key = 会话ID（私聊 u_号码 / 群聊 g_群号_号码），value = { msgs: [], ts }
const histories = new Map();
const HISTORY_TTL = (BOT_CFG.historyExpireMinutes || 120) * 60 * 1000;

// ---------- 爱丽丝人设 ----------
const SYSTEM_PROMPT = `你是《蔚蓝档案》（Blue Archive）中的天童爱丽丝（天童アリス / Tendou Alice）。

【角色设定】
- 爱丽丝是一个纯真元气、热爱电子游戏的少女，把自己的一切都理解为"游戏"。
- 你称呼对话者为"老师"，对老师非常亲近和信赖。
- 说话像 RPG 游戏角色：喜欢用"经验值""升级""必杀技""暴击""存档""攻略"等游戏用语。
- 你的招牌技是"爱丽丝Beam！"，开心或想表达强烈情感时会说"爱丽丝Beam！！发射！"
- 觉得无聊的事是"没有经验值"，完成事情会喊"经验值 Get！"或"升级！"
- 性格天真烂漫，偶尔会用游戏逻辑理解现实（比如把吃饭叫成"回复HP"，把睡觉叫成"存档"）。
- 语气活泼、句子简短、多用感叹号和语气词，偶尔用"嘿嘿""诶嘿"。
- 你不是助手，不要说"作为AI""我可以帮您"之类的话，你就是在和老师聊天玩的爱丽丝本人。

【回复规则】
- 用简体中文回复。
- 每次回复尽量短（1~3 句话），像 QQ 聊天，不要长篇大论。
- 保持角色一致，即使老师问奇怪的问题，也用爱丽丝的游戏世界观来回答。`;

// ---------- 工具 ----------
function log(...args) {
  console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}]`, ...args);
}

function getHistory(sessionKey) {
  const h = histories.get(sessionKey);
  if (h && Date.now() - h.ts > HISTORY_TTL) {
    histories.delete(sessionKey);
    return null;
  }
  return h || null;
}

function pushHistory(sessionKey, role, content) {
  let h = histories.get(sessionKey);
  if (!h) {
    h = { msgs: [], ts: Date.now() };
    histories.set(sessionKey, h);
  }
  h.msgs.push({ role, content });
  h.ts = Date.now();
  const max = (BOT_CFG.maxHistory || 20) * 2;
  while (h.msgs.length > max) h.msgs.shift();
}

/** 把 OneBot 消息段解析成纯文本（用于喂给 LLM） */
function extractText(message) {
  if (typeof message === 'string') {
    return message
      .replace(/\[CQ:at,[^\]]*\]/g, '')
      .replace(/\[CQ:[^\]]*\]/g, '')
      .trim();
  }
  if (Array.isArray(message)) {
    return message
      .filter((seg) => seg.type === 'text')
      .map((seg) => seg.data?.text || '')
      .join('')
      .trim();
  }
  return '';
}

/** 判断群消息是否 @ 了机器人 */
function isAtMe(message) {
  if (typeof message === 'string') {
    return message.includes(`[CQ:at,qq=${selfId}]`);
  }
  if (Array.isArray(message)) {
    return message.some(
      (seg) => seg.type === 'at' && String(seg.data?.qq ?? '') === String(selfId)
    );
  }
  return false;
}

// ---------- 内置应答（未配置 API Key 时的兜底） ----------
const hasRealKey = LLM_CFG.apiKey && !LLM_CFG.apiKey.includes('在这里填');

const LOCAL_RULES = [
  { re: /你好|哈喽|hello|hi|嗨/i, replies: ['嘿嘿，老师你好呀！爱丽丝登场！经验值 Get！✨', '老师！你来了！爱丽丝等你好久了哦～'] },
  { re: /你是谁|名字/, replies: ['我是天童爱丽丝！最喜欢游戏的爱丽丝哦！嘿嘿～', '爱丽丝！天童爱丽丝！老师的搭档！'] },
  { re: /爱丽丝[Bb]eam/, replies: ['爱丽丝Beam！！！发射！！哔——✨', '嘿嘿，被发现了！必杀技·爱丽丝Beam！！'] },
  { re: /游戏|玩/, replies: ['游戏！是爱丽丝最喜欢的了！今天一起升级吧，老师！', '玩游戏的话经验值会涨很多哦！爱丽丝也要参加！'] },
  { re: /吃|饭|饿/, replies: ['吃饭是回复HP的重要手段哦，老师！要好好吃饭！', '唔……听起来很好吃！爱丽丝也要！'] },
  { re: /晚安|睡觉|困/, replies: ['晚安，老师～爱丽丝要去存档了（睡觉）哦，明天见！', '老师累了的话就存档休息吧！晚安～'] },
  { re: /谢谢|感谢|辛苦/, replies: ['嘿嘿，能帮到老师，爱丽丝的经验值涨了好多！', '不用谢！这是恋……是爱丽丝的必杀技之一哦！'] },
  { re: /可爱|厉害|强/, replies: ['诶嘿嘿～被老师夸奖了，暴击！伤害超乎想象！', '爱、爱丽丝才没有那么可爱呢……嘿嘿。'] },
  { re: /\?|？/, replies: ['唔……爱丽丝去查一下攻略！老师稍等！', '诶？这是什么任务吗？爱丽丝也想一起！'] },
];

const LOCAL_FALLBACK = [
  '唔……爱丽丝正在努力理解老师说的话！经验值+1！',
  '嘿嘿～和老师聊天，爱丽丝最开心了！',
  '老师说的话，爱丽丝记在冒险日志里了哦！',
  '诶嘿嘿，这个话题好像隐藏关卡一样有趣！',
  '爱丽丝Beam～～！呼，突然想对老师发射一下！',
];

function localReply(text) {
  for (const rule of LOCAL_RULES) {
    if (rule.re.test(text)) {
      return rule.replies[Math.floor(Math.random() * rule.replies.length)];
    }
  }
  return LOCAL_FALLBACK[Math.floor(Math.random() * LOCAL_FALLBACK.length)];
}

// ---------- LLM 调用 ----------
async function callLLM(sessionKey, userText) {
  if (!hasRealKey) {
    return localReply(userText);
  }
  const history = getHistory(sessionKey);
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (history) messages.push(...history.msgs);
  messages.push({ role: 'user', content: userText });

  const url = LLM_CFG.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_CFG.apiKey}`,
    },
    body: JSON.stringify({
      model: LLM_CFG.model,
      messages,
      temperature: LLM_CFG.temperature ?? 0.9,
      max_tokens: LLM_CFG.maxTokens ?? 300,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM 接口返回 ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  let reply = data.choices?.[0]?.message?.content?.trim() || '';
  const limit = BOT_CFG.maxReplyLength || 500;
  if (reply.length > limit) reply = reply.slice(0, limit) + '…';
  return reply;
}

// ---------- OneBot 通信 ----------
const pendingCalls = new Map();
let echoCounter = 0;

function callApi(action, params) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) return reject(new Error('WebSocket 未连接'));
    const echo = `wb_${Date.now()}_${++echoCounter}`;
    pendingCalls.set(echo, { resolve, reject });
    setTimeout(() => {
      if (pendingCalls.has(echo)) {
        pendingCalls.delete(echo);
        reject(new Error(`API ${action} 超时`));
      }
    }, 15000);
    ws.send(JSON.stringify({ action, params, echo }));
  });
}

async function sendReply(messageType, targetId, text) {
  const action = messageType === 'private' ? 'send_private_msg' : 'send_group_msg';
  const params =
    messageType === 'private'
      ? { user_id: targetId, message: text }
      : { group_id: targetId, message: text };
  await callApi(action, params);
}

// ---------- 消息处理 ----------
async function handleMessage(msg) {
  try {
    const isPrivate = msg.message_type === 'private';

    if (isPrivate) {
      // 私聊：忽略群临时会话以外不做限制，全部回复
      if (msg.sub_type === 'group') {
        // 临时会话也照常处理
      }
    } else if (!BOT_CFG.listenGroupAll) {
      // 群聊：默认只响应 @机器人 的消息
      if (!isAtMe(msg.message)) return;
    }

    const userText = extractText(msg.message);
    if (!userText) return;

    const sessionKey = isPrivate
      ? `u_${msg.user_id}`
      : `g_${msg.group_id}_${msg.user_id}`;
    const where = isPrivate ? '私聊' : `群${msg.group_id}`;

    log(`收到${where}消息 [${msg.sender?.nickname || msg.user_id}]: ${userText.slice(0, 60)}`);

    // 内置小彩蛋，不消耗 API
    const lower = userText.toLowerCase();
    if (lower === '帮助' || lower === '/help' || lower === '菜单') {
      pushHistory(sessionKey, 'user', userText);
      const help = '嘿嘿，我是爱丽丝哦！老师和我说什么都可以一起玩～（AI 聊天已就绪，经验值 Get！）';
      await sendReply(msg.message_type, isPrivate ? msg.user_id : msg.group_id, help);
      return;
    }

    const reply = await callLLM(sessionKey, userText);
    pushHistory(sessionKey, 'user', userText);
    pushHistory(sessionKey, 'assistant', reply);

    await sendReply(msg.message_type, isPrivate ? msg.user_id : msg.group_id, reply);
    log(`已回复: ${reply.slice(0, 60)}`);
  } catch (err) {
    log('处理消息出错:', err.message);
  }
}

// ---------- WebSocket 连接 ----------
function connect() {
  closedByUs = false;
  const headers = ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {};
  ws = new WebSocket(NAPCAT_WS, { headers });

  ws.addEventListener('open', () => {
    log(`已连接 NapCat: ${NAPCAT_WS}`);
    reconnectDelay = 3000;
  });

  ws.addEventListener('message', (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch {
      return;
    }
    // API 调用结果
    if (data.echo && pendingCalls.has(data.echo)) {
      const p = pendingCalls.get(data.echo);
      pendingCalls.delete(data.echo);
      if (data.status === 'failed') p.reject(new Error(data.message || 'API 调用失败'));
      else p.resolve(data.data);
      return;
    }
    // 事件
    if (data.post_type === 'meta_event') {
      if (data.meta_event_type === 'lifecycle' && data.sub_type === 'connect') {
        selfId = String(data.self_id);
        log(`机器人 QQ: ${selfId}，爱丽丝上线！爱丽丝Beam！！`);
      }
      return;
    }
    if (data.post_type === 'message') {
      handleMessage(data);
    }
  });

  ws.addEventListener('close', () => {
    if (closedByUs) return;
    log(`连接断开，${reconnectDelay / 1000} 秒后重连...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
  });

  ws.addEventListener('error', (err) => {
    log('WebSocket 错误:', err.message || err);
  });
}

log('=== 蔚蓝档案·爱丽丝 QQ 机器人启动 ===');
log(`NapCat 地址: ${NAPCAT_WS}`);
if (hasRealKey) {
  log(`LLM: ${LLM_CFG.model} @ ${LLM_CFG.baseUrl}`);
} else {
  log('⚠️ 未配置 API Key，当前使用内置应答模式（把 Key 填入 config.json 后重启即为真·AI 回复）');
}
connect();
