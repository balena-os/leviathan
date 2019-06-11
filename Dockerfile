FROM node:9-stretch AS npm-install

ENV npm_config_unsafe_perm=true

WORKDIR /tmp/node

COPY package.json .

RUN npm install

FROM node:9-stretch

ENV npm_config_unsafe_perm=true

RUN apt-get update && \
    apt-get install -y jq git vim rsync && \
    curl -sSL https://get.docker.com/ | sh && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/app

COPY --from=npm-install /tmp/node ./

COPY contracts contracts
COPY .eslintrc.json ./
COPY .prettierrc ./

COPY lib lib
COPY suites suites
COPY entry.sh ./

CMD [ "./entry.sh" ]
