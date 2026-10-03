/**
 * 模拟 NapCat 服务器：用于无 QQ 环境下端到端测试 bot.js
 * 监听 ws://127.0.0.1:3001，模拟 OneBot v11 行为：
 * 1. 发送 lifecycle connect 元事件
 * 2. 发送一条私聊消息
 * 3. 发送一条群 @ 消息
 * 4. 接收并打印机器人发出的 send_*_msg API 调用
 */
const http = require('http');

const PORT = 3001;
const FAKE_BOT_QQ = 10000;
const FAKE_USER_QQ = 20001;
const FAKE_GROUP_ID = 123456;

const server = http.createServer((req, res) => res.writeHead(404).end());

// 简易 WebSocket 实现（仅用于测试握手 + 帧）：直接用 Node 自带 WebSocket 的服务端不可用，
// 改用极简实现太复杂 —— 反过来：用 WebSocket 客户端连不上自己，所以这里手写升级。
// 为简单起见，本测试使用原始 WebSocket 协议的最小实现。
server.on('upgrade', (req, socket) => {
  const crypto = require('crypto');
  const key = req.headers['sec-websocket-key'];
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  console.log('[mock] 机器人已连入 WebSocket');

  socket.on('data', (buf) => {
    // 解析 WebSocket 帧（假设未分片、文本帧）
    const payload = decodeFrame(buf);
    if (!payload) return;
    let msg;
    try {
      msg = JSON.parse(payload);
    } catch {
      return;
    }
    if (msg.echo) {
      // API 调用：打印并回执成功
      console.log(`[mock] << API ${msg.action}: ${JSON.stringify(msg.params)}`);
      const result = JSON.stringify({
        status: 'ok',
        retcode: 0,
        data: { message_id: 1 },
        echo: msg.echo,
      });
      socket.write(encodeFrame(result));
    }
  });

  // 发送 lifecycle connect
  setTimeout(() => {
    send(socket, {
      time: Date.now(),
      self_id: FAKE_BOT_QQ,
      post_type: 'meta_event',
      meta_event_type: 'lifecycle',
      sub_type: 'connect',
    });
    // 发送私聊消息
    setTimeout(() => {
      send(socket, {
        time: Date.now(),
        self_id: FAKE_BOT_QQ,
        post_type: 'message',
        message_type: 'private',
        sub_type: 'friend',
        user_id: FAKE_USER_QQ,
        message: [{ type: 'text', data: { text: '你好，你是谁呀？' } }],
        sender: { user_id: FAKE_USER_QQ, nickname: '测试老师' },
      });
    }, 500);
    // 发送群 @ 消息
    setTimeout(() => {
      send(socket, {
        time: Date.now(),
        self_id: FAKE_BOT_QQ,
        post_type: 'message',
        message_type: 'group',
        sub_type: 'normal',
        group_id: FAKE_GROUP_ID,
        user_id: FAKE_USER_QQ,
        message: [
          { type: 'at', data: { qq: String(FAKE_BOT_QQ) } },
          { type: 'text', data: { text: ' 爱丽丝Beam是什么？' } },
        ],
        sender: { user_id: FAKE_USER_QQ, nickname: '测试老师' },
      });
    }, 1500);
    // 发送一条群聊非@消息（应被忽略）
    setTimeout(() => {
      send(socket, {
        time: Date.now(),
        self_id: FAKE_BOT_QQ,
        post_type: 'message',
        message_type: 'group',
        sub_type: 'normal',
        group_id: FAKE_GROUP_ID,
        user_id: FAKE_USER_QQ,
        message: [{ type: 'text', data: { text: '这句话没有@机器人' } }],
        sender: { user_id: FAKE_USER_QQ, nickname: '测试老师' },
      });
      console.log('[mock] 已发送非@群消息（机器人应忽略）');
    }, 2500);
    // 结束
    setTimeout(() => {
      console.log('[mock] 测试完成，退出');
      process.exit(0);
    }, 4000);
  }, 300);
});

function send(socket, obj) {
  console.log(`[mock] >> 事件 ${obj.post_type}/${obj.message_type || obj.meta_event_type}`);
  socket.write(encodeFrame(JSON.stringify(obj)));
}

function encodeFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  if (opcode === 0x8) return null; // close
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  const masked = (buf[1] & 0x80) !== 0;
  let payload;
  if (masked) {
    const mask = buf.slice(offset, offset + 4);
    payload = buf.slice(offset + 4, offset + 4 + len);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  } else {
    payload = buf.slice(offset, offset + len);
  }
  return payload.toString('utf8');
}

server.listen(PORT, () => {
  console.log(`[mock] 模拟 NapCat 监听 ws://127.0.0.1:${PORT}`);
});
