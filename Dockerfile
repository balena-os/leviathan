FROM node:6 as npm-install

WORKDIR /tmp/node

COPY package.json .

RUN npm install

FROM node:6

RUN apt-get update && apt-get install -y qemu-system-x86 qemu-kvm && \
    rm -rf /var/lib/apt/lists/*

ENV INITSYSTEM on

WORKDIR /usr/app

COPY --from=npm-install /tmp/node ./

ADD tslint.json tsconfig.json ./
ADD lib lib

CMD ["npm","start"]
