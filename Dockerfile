FROM node:boron

ENV INITSYSTEM on

RUN apt-get update && apt-get install -y --no-install-recommends \
        bc \
        vim \
    && rm -rf /var/lib/apt/lists/*

COPY package.json /tmp/package.json
RUN cd /tmp && npm install
RUN mkdir -p /usr/app && cp -a /tmp/node_modules /usr/app/

WORKDIR /usr/app

COPY . /usr/app
