FROM node:24-alpine

RUN apk add --no-cache git docker-cli docker-cli-compose docker-cli-buildx

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ARG PORT
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD ["npm", "start"]

#postgresql://postgres:postgres@localhost:5432/postgres