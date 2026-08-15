# syntax = docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32

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
