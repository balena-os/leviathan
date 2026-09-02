FROM node:22.23.2-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
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
