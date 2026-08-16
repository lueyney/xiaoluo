FROM node:18-alpine

WORKDIR /app

# 先仅复制依赖清单，利用 Docker 缓存
COPY backend-code/package*.json ./backend-code/
COPY backmager/package*.json ./backmager/
RUN cd /app/backend-code && npm install --production --legacy-peer-deps && npm cache clean --force
RUN cd /app/backmager && npm install --production --legacy-peer-deps && npm cache clean --force

# 复制后端、管理后台与前端代码
COPY backend-code ./backend-code
COPY backmager ./backmager
COPY web-frontend ./web-frontend

WORKDIR /app/backend-code

ENV NODE_ENV=production
ENV PORT=80

RUN mkdir -p logs exports exports/avatars

EXPOSE 80

CMD ["npm", "start"]
