FROM node:9 AS npm-install

ENV npm_config_unsafe_perm=true

WORKDIR /tmp/node

COPY package.json .

RUN npm install

FROM node:9

ENV npm_config_unsafe_perm=true

RUN echo 'deb http://ftp.debian.org/debian jessie-backports main' >> /etc/apt/sources.list

# Avoid using a ssh agent by using GIT_SSH_COMMAND (requires git v2.10+)
RUN apt-get update && \
    apt-get install -y qemu-system-x86 qemu-kvm && \
    apt-get install -y -t jessie-backports jq git vim rsync && \
    rm -rf /var/lib/apt/lists/*

RUN git config --global user.email "testbot@resin.io" && \
    git config --global user.name "Test Bot"

RUN npm install -g resin-cli

ENV INITSYSTEM on

WORKDIR /usr/app

COPY --from=npm-install /tmp/node ./

ADD contracts contracts
ADD scripts scripts
ADD .eslintrc.yml entry.sh ./

RUN chmod a+x entry.sh

ADD lib lib

RUN apt-get update && apt-get install -y unzip
RUN wget https://github.com/nadoo/glider/releases/download/v0.5.1/glider-v0.5.1-linux-amd64.zip -P glider && \
    cd glider && \
    unzip glider-v0.5.1-linux-amd64.zip && \
    chmod +x glider && \
    ln -s /usr/app/glider/glider /usr/local/bin/

CMD ./entry.sh
