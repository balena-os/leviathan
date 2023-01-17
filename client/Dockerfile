FROM node:12.22.12-alpine3.14
WORKDIR /usr/src/app

# hadolint ignore=DL3018
RUN apk add --no-cache bash git

COPY package* ./
RUN npm ci

COPY config.js ./
COPY *config* ./
COPY lib ./lib
COPY bin ./bin
COPY test ./test

RUN npm test && npm run build

COPY entry.sh ./

VOLUME /usr/src/app/workspace
VOLUME /usr/src/app/reports

ENTRYPOINT ["/usr/src/app/entry.sh"]

CMD [ "-c", "/usr/src/app/workspace/config" ]
