# Builds the Rust API in release mode and runs the compiled binary.
FROM rust:1.83-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release

FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/release/mbam-api /usr/local/bin/mbam-api
COPY migrations ./migrations

EXPOSE 8080

CMD ["mbam-api"]
