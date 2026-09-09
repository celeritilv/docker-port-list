FROM --platform=$BUILDPLATFORM node:24-alpine AS client-builder
WORKDIR /ui
COPY ui/package.json /ui/package.json
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm install
COPY ui /ui
RUN npm run build

FROM scratch
LABEL org.opencontainers.image.title="Port Lister" \
    org.opencontainers.image.description="Lists ports published by containers in your local Docker setup and what is using them." \
    org.opencontainers.image.vendor="SIA Celeriti" \
    com.docker.desktop.extension.api.version=">= 0.3.0" \
    com.docker.extension.screenshots="[{\"alt\":\"Port Lister showing published container ports, filters, and compose project column\",\"url\":\"https://raw.githubusercontent.com/celeritilv/docker-port-list/master/assets/screenshot-1.png\"}]" \
    com.docker.desktop.extension.icon="https://raw.githubusercontent.com/celeritilv/docker-port-list/master/docker.svg" \
    com.docker.extension.detailed-description="Port Lister shows every host port published by containers in Docker Desktop, and which container, image, and compose project owns it. Filter by IPv4/IPv6 binding, search by port/container/project, and keep stopped containers visible so you can spot port conflicts before restarting a project." \
    com.docker.extension.publisher-url="https://celeriti.lv" \
    com.docker.extension.additional-urls="[{\"title\":\"Support\",\"url\":\"mailto:info@celeriti.lv\"}]" \
    com.docker.extension.categories="utility-tools" \
    com.docker.extension.changelog="0.1.0: Initial release - list published container ports, IPv4/IPv6 filter, compose project column, includes stopped containers."

COPY metadata.json .
COPY docker.svg .
COPY --from=client-builder /ui/build ui
