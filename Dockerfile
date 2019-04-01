FROM node:9-stretch AS npm-install

ENV npm_config_unsafe_perm=true

WORKDIR /tmp/node

COPY package.json .

RUN npm install

FROM node:9-stretch

ENV npm_config_unsafe_perm=true

# Avoid using a ssh agent by using GIT_SSH_COMMAND (requires git v2.10+)
RUN apt-get update && \
    apt-get install -y qemu-system-x86 qemu-kvm jq git vim rsync && \
    rm -rf /var/lib/apt/lists/*

RUN git config --global user.email "testbot@resin.io" && \
    git config --global user.name "Test Bot"

RUN npm install -g balena-cli

WORKDIR /usr/app

COPY --from=npm-install /tmp/node ./

COPY contracts contracts
COPY .eslintrc.json ./

COPY lib lib
COPY suites suites
COPY entry.sh ./

CMD [ "./entry.sh" ]
