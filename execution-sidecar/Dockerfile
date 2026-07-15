FROM node:24-alpine
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --omit=dev
COPY src ./src
USER node
CMD ["npm", "start"]
