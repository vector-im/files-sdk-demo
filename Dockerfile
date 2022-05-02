FROM node:14-alpine as builder

ARG DEFAULT_HOMESERVER

WORKDIR /files-sdk-demo

COPY .npmrc yarn.lock package.json ./
RUN yarn install --frozen-lockfile

COPY src ./src
COPY public ./public
COPY tsconfig.json webpack.config.js webpack.parts.js ./
ENV DEFAULT_HOMESERVER ${DEFAULT_HOMESERVER}
RUN yarn build

FROM nginxinc/nginx-unprivileged:1.21-alpine

COPY --from=builder /files-sdk-demo/dist /usr/share/nginx/html
