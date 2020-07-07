FROM node:12
WORKDIR /usr/src/app

COPY package* ./
RUN npm ci

COPY config ./config
COPY lib ./lib
COPY bin ./bin
COPY entry.sh ./

VOLUME /usr/src/app/workspace
VOLUME /usr/src/app/reports

ENTRYPOINT ["/usr/src/app/entry.sh"]
