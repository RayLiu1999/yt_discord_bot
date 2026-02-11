FROM node:22-slim

# 設定時區
ENV TZ=Asia/Taipei
RUN apt-get update && apt-get install -y tzdata && \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone && \
    rm -rf /var/lib/apt/lists/*


# 安裝 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 先複製 package 相關檔案，利用 Docker cache 層
COPY package.json pnpm-lock.yaml ./

# 安裝 production 依賴
RUN pnpm install --frozen-lockfile --prod

# 複製應用程式碼
COPY . .

# 容器入口點（不使用 pm2，由容器編排工具管理重啟）
CMD ["node", "app.mjs"]
