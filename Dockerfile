# 爱丽丝机器人 bot 容器（零第三方依赖，Node 22 自带 fetch / WebSocket）
FROM node:22-slim
WORKDIR /app

# 仅拷贝运行时需要的文件（napcat/ tools/ 已被 .dockerignore 排除）
COPY package.json ./
COPY . .

# Node 22 的全局 WebSocket 仍需此实验 flag；若该版本已默认开启则自动忽略
CMD ["node", "--experimental-websocket", "bot.js"]
