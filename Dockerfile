FROM node:24-alpine

RUN apk add --no-cache git docker-cli docker-cli-compose docker-cli-buildx

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=4000
EXPOSE 4000

CMD ["npm", "start"]

#postgresql://postgres:postgres@localhost:5432/postgres