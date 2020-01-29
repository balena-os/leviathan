FROM node:12
WORKDIR /usr/src/app

COPY package* ./
RUN npm ci

COPY config ./config
COPY lib ./lib
COPY bin ./bin

VOLUME /usr/src/app/workspace

ENTRYPOINT ["node", "bin/multi-client", "-c", "../workspace/config"]
