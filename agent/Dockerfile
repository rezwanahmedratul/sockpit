# ---- Stage 1: Build ----
FROM rust:latest AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock* ./
COPY src/ ./src/

# Install build dependencies (needed for native-tls / pkg-config if any, but since we compile with rustls, we don't strictly need them)
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Build release binary using exact locked dependencies
RUN cargo build --release --locked

# ---- Stage 2: Runtime ----
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --system --no-create-home --shell /usr/sbin/nologin sockpit

# Copy binary
COPY --from=builder /build/target/release/sockpit-agent /usr/local/bin/sockpit-agent

# Create config directory
RUN mkdir -p /etc/sockpit && chown sockpit:sockpit /etc/sockpit

USER sockpit

ENTRYPOINT ["sockpit-agent"]
CMD ["--config-path", "/etc/sockpit/config.json"]
