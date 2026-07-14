# syntax = docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

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
