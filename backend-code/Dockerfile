FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production --legacy-peer-deps \
    && npm cache clean --force

COPY . .

ENV NODE_ENV=production
ENV PORT=80

RUN mkdir -p logs exports
RUN mkdir -p exports/avatars

EXPOSE 80

CMD ["npm", "start"]

