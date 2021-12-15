FROM node:12.22.7
WORKDIR /usr/src/app

COPY package* ./
RUN npm ci

COPY config ./config
COPY *config* ./
COPY lib ./lib
COPY bin ./bin
COPY test ./test

RUN npm test && npm run build

COPY entry.sh ./

VOLUME /usr/src/app/workspace
VOLUME /usr/src/app/reports

ENTRYPOINT ["/usr/src/app/entry.sh"]

CMD [ "-c", "/usr/src/app/workspace/config", "-n" ]
