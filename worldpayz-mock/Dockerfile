FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev --build-from-source

COPY . .

EXPOSE 3102

CMD ["npm", "start"]
