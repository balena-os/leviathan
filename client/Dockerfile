FROM node:22.14.0-alpine
WORKDIR /usr/src/app

# hadolint ignore=DL3018
RUN apk update && apk upgrade && apk add --no-cache bash git

COPY package* ./
RUN npm ci

COPY config.js ./
COPY lib ./lib
COPY bin ./bin
COPY entry.sh ./

VOLUME /usr/src/app/workspace
VOLUME /usr/src/app/reports

ENTRYPOINT ["/usr/src/app/entry.sh"]

CMD [ "-c", "/usr/src/app/workspace/config" ]
