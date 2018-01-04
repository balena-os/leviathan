FROM node:6 as npm-install

WORKDIR /tmp/node

COPY package.json .

RUN npm install

FROM node:6

RUN echo 'deb http://ftp.debian.org/debian jessie-backports main' >> /etc/apt/sources.list


# Avoid using a ssh agent by using GIT_SSH_COMMAND (requires git v2.10+)
RUN apt-get update && \
    apt-get install -y qemu-system-x86 qemu-kvm && \
    apt-get install -y -t jessie-backports git && \
    rm -rf /var/lib/apt/lists/*

ENV INITSYSTEM on

WORKDIR /usr/app

COPY --from=npm-install /tmp/node ./

ADD tslint.json tsconfig.json ./
ADD lib lib

CMD ["npm","start"]
