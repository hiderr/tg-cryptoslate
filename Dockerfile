FROM --platform=$BUILDPLATFORM node:18-slim

WORKDIR /app

# Копируем сначала package.json и package-lock.json
COPY package*.json ./
RUN npm install

# Копируем tsconfig.json
COPY tsconfig.json ./

# Создаем папку src и копируем в нее исходники
COPY src ./src

# Компилируем TypeScript в JavaScript
RUN npm run build

CMD ["node", "dist/index.js"] 