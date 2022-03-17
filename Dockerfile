FROM node:14

ARG DEFAULT_HOMESERVER

RUN git clone -b oidc --single-branch https://github.com/vector-im/files-sdk-demo

WORKDIR /files-sdk-demo
RUN yarn install --frozen-lockfile

ENV DEFAULT_HOMESERVER ${DEFAULT_HOMESERVER}
RUN yarn build

EXPOSE 5001

ENTRYPOINT ["npx", "http-server", "-p5001", "dist"]
