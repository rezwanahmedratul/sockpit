# GitHub Actions CI/CD Pipeline

## Overview

The SockPit agent is written in **Rust** and cross-compiled for all target platforms (Windows, Linux) using **GitHub Actions**. Additionally, the agent is packaged as a **Docker image** and pushed to GitHub Container Registry (ghcr.io). This ensures reproducible builds, automated testing, and hassle-free binary distribution via GitHub Releases.

---

## Workflow File

### File: `.github/workflows/build-agent.yml`

```yaml
name: Build & Release Agent

on:
  push:
    tags:
      - 'v*'          # Trigger on version tags (e.g., v1.0.0, v1.2.3)
  workflow_dispatch:    # Allow manual trigger from GitHub UI

env:
  CARGO_TERM_COLOR: always
  BINARY_NAME: sockpit-agent

jobs:
  # ──────────────────────────────────────────────
  # Job 1: Run tests on all platforms
  # ──────────────────────────────────────────────
  test:
    name: Test (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo registry & build
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            agent/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('agent/Cargo.lock') }}
          restore-keys: |
            ${{ runner.os }}-cargo-

      - name: Run tests
        working-directory: agent
        run: cargo test --release --all-features

      - name: Run clippy (lint)
        working-directory: agent
        run: cargo clippy --release --all-features -- -D warnings

  # ──────────────────────────────────────────────
  # Job 2: Build binaries for all targets
  # ──────────────────────────────────────────────
  build:
    name: Build (${{ matrix.target }})
    needs: test
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          # Windows x86_64
          - target: x86_64-pc-windows-msvc
            os: windows-latest
            binary: sockpit-agent.exe
            artifact_name: sockpit-agent-windows-amd64.exe

          # Linux x86_64
          - target: x86_64-unknown-linux-gnu
            os: ubuntu-latest
            binary: sockpit-agent
            artifact_name: sockpit-agent-linux-amd64

          # Linux ARM64
          - target: aarch64-unknown-linux-gnu
            os: ubuntu-latest
            binary: sockpit-agent
            artifact_name: sockpit-agent-linux-arm64
            use_cross: true

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Install cross (for ARM64)
        if: matrix.use_cross == true
        run: cargo install cross --git https://github.com/cross-rs/cross

      - name: Cache cargo registry & build
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            agent/target
          key: ${{ matrix.target }}-cargo-${{ hashFiles('agent/Cargo.lock') }}
          restore-keys: |
            ${{ matrix.target }}-cargo-

      - name: Build (native)
        if: matrix.use_cross != true
        working-directory: agent
        run: cargo build --release --target ${{ matrix.target }}

      - name: Build (cross)
        if: matrix.use_cross == true
        working-directory: agent
        run: cross build --release --target ${{ matrix.target }}

      - name: Rename binary
        shell: bash
        run: |
          cp agent/target/${{ matrix.target }}/release/${{ matrix.binary }} ${{ matrix.artifact_name }}

      - name: Generate SHA256 checksum
        shell: bash
        run: |
          if [[ "${{ runner.os }}" == "Windows" ]]; then
            certutil -hashfile ${{ matrix.artifact_name }} SHA256 | head -2 | tail -1 > ${{ matrix.artifact_name }}.sha256
          else
            sha256sum ${{ matrix.artifact_name }} > ${{ matrix.artifact_name }}.sha256
          fi

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact_name }}
          path: |
            ${{ matrix.artifact_name }}
            ${{ matrix.artifact_name }}.sha256
          retention-days: 5

  # ──────────────────────────────────────────────
  # Job 3: Create GitHub Release with all binaries
  # ──────────────────────────────────────────────
  release:
    name: Create Release
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      - name: Flatten artifacts
        run: |
          mkdir -p release
          find artifacts -type f -exec cp {} release/ \;
          ls -la release/

      - name: Generate combined checksums
        run: |
          cd release
          sha256sum sockpit-agent-* | grep -v '.sha256' > checksums.txt
          cat checksums.txt

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          draft: false
          prerelease: ${{ contains(github.ref, '-rc') || contains(github.ref, '-beta') }}
          generate_release_notes: true
          files: |
            release/sockpit-agent-windows-amd64.exe
            release/sockpit-agent-linux-amd64
            release/sockpit-agent-linux-arm64
            release/checksums.txt
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # ──────────────────────────────────────────────
  # Job 4: Build & push Docker image
  # ──────────────────────────────────────────────
  docker:
    name: Build Docker Image
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract version from tag
        id: version
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "major_minor=$(echo $VERSION | cut -d. -f1,2)" >> $GITHUB_OUTPUT

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./agent
          file: ./agent/Dockerfile
          platforms: linux/amd64,linux/arm64
          push: ${{ startsWith(github.ref, 'refs/tags/v') }}
          tags: |
            ghcr.io/${{ github.repository_owner }}/sockpit-agent:latest
            ghcr.io/${{ github.repository_owner }}/sockpit-agent:${{ steps.version.outputs.version }}
            ghcr.io/${{ github.repository_owner }}/sockpit-agent:${{ steps.version.outputs.major_minor }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ──────────────────────────────────────────────
  # Job 5: Deploy binaries to SockPit server
  # ──────────────────────────────────────────────
  deploy:
    name: Deploy to Server
    needs: [release, docker]
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v') && !contains(github.ref, '-rc') && !contains(github.ref, '-beta')

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      - name: Flatten artifacts
        run: |
          mkdir -p deploy
          find artifacts -type f -name 'sockpit-agent-*' ! -name '*.sha256' -exec cp {} deploy/ \;

      - name: Deploy to server via SCP
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          source: "deploy/*"
          target: "/var/www/sockpit/downloads/"
          strip_components: 1

      - name: Update version on server
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            chmod 755 /var/www/sockpit/downloads/sockpit-agent-*
            cd /var/www/sockpit/downloads && sha256sum sockpit-agent-* > checksums.txt
            echo "${{ github.ref_name }}" > /var/www/sockpit/downloads/latest-version.txt
            echo "Deployed ${{ github.ref_name }} successfully"
```

---

## Workflow Pipeline Diagram

```
git tag v1.0.0 → git push --tags
         │
         ▼
┌─────────────────────────────────────────────────┐
│              GitHub Actions Triggered            │
└─────────────────────┬───────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
   ┌────────────┐ ┌────────────┐
   │  Test       │ │  Test       │
   │  (Ubuntu)   │ │  (Windows)  │
   └─────┬──────┘ └─────┬──────┘
         └───────┬───────┘
                 │
    ┌────────────┼────────────┬────────────────┐
    ▼            ▼            ▼                ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ Build    │ │ Build    │ │ Build    │ │ Build Docker │
│ Win x64  │ │ Linux x64│ │ Linux    │ │ Image        │
│ (.exe)   │ │          │ │ ARM64    │ │ (multi-arch) │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘
     └────────────┼────────────┘               │
                  ▼                            │
         ┌────────────────┐                    │
         │ Create GitHub  │                    │
         │ Release        │                    │
         │ + checksums    │                    │
         └───────┬────────┘                    │
                 │    ┌────────────────────────┘
                 ▼    ▼
         ┌────────────────┐    ┌──────────────────┐
         │ Deploy to      │    │ Push to ghcr.io  │
         │ SockPit Server │    │ (Docker Registry)│
         │ via SCP        │    └──────────────────┘
         └────────────────┘
```

---

## How to Release a New Version

```bash
# 1. Make sure all changes are committed
git add .
git commit -m "feat: add new feature"

# 2. Tag the release
git tag v1.0.0

# 3. Push tag to trigger the build
git push origin v1.0.0

# 4. GitHub Actions will automatically:
#    - Run tests on Windows + Linux
#    - Build binaries for all 3 targets
#    - Build & push Docker image (multi-arch: amd64 + arm64)
#    - Create a GitHub Release with binaries + checksums
#    - Deploy binaries to the SockPit server
```

### Pre-release Versions

```bash
# Beta releases (won't auto-deploy to production)
git tag v1.1.0-beta.1
git push origin v1.1.0-beta.1

# Release candidates
git tag v1.1.0-rc.1
git push origin v1.1.0-rc.1
```

---

## Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `DEPLOY_HOST` | IP or hostname of the SockPit production server |
| `DEPLOY_USER` | SSH username for deployment |
| `DEPLOY_SSH_KEY` | SSH private key for deployment |

> `GITHUB_TOKEN` is automatically provided by GitHub Actions.

---

## Build Targets

| Target Triple | Platform | Architecture | Output |
|--------------|----------|-------------|--------|
| `x86_64-pc-windows-msvc` | Windows 10/11 | AMD64 | `sockpit-agent-windows-amd64.exe` |
| `x86_64-unknown-linux-gnu` | Linux (glibc) | AMD64 | `sockpit-agent-linux-amd64` |
| `aarch64-unknown-linux-gnu` | Linux (glibc) | ARM64 | `sockpit-agent-linux-arm64` |
| Docker (multi-arch) | Any OS with Docker | AMD64 + ARM64 | `ghcr.io/.../sockpit-agent:latest` |

---

## Release Artifacts

Each GitHub Release includes:

```
sockpit-agent-windows-amd64.exe    # Windows binary
sockpit-agent-linux-amd64          # Linux x86_64 binary
sockpit-agent-linux-arm64          # Linux ARM64 binary
checksums.txt                      # SHA256 checksums for all binaries
```

Docker images are published separately to `ghcr.io`:

```
ghcr.io/your-org/sockpit-agent:latest     # Latest stable
ghcr.io/your-org/sockpit-agent:1.0.0      # Specific version
ghcr.io/your-org/sockpit-agent:1.0        # Latest patch in 1.0.x
```

The dashboard's installer generator reads the latest version from the server and embeds the correct download URL, checksum, or Docker image tag into generated install scripts.
