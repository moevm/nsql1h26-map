FROM node:23
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 5678
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5678"]