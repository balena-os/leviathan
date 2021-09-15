# syntax = docker/dockerfile:1

FROM node:12-alpine AS base

WORKDIR /src
COPY package*.json ./
RUN npm ci

COPY .eslintrc.json .prettierrc ./
COPY e2e ./e2e

FROM base AS lint
RUN npm run lint

FROM base AS prettify
RUN --mount=type=bind,src=./e2e,target=./e2e,rw \
    npm run prettify
