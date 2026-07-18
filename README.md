# SockPit — SOCKS5 Proxy Server Management Platform

> A multi-tenant SaaS platform for deploying, managing, and monitoring SOCKS5 proxy servers across Windows and Linux machines.

---

## Overview

SockPit allows administrators and users to deploy SOCKS5 proxy servers on remote machines via unique installation scripts. Each user gets their own dashboard showing only the servers they've deployed, while the global admin has visibility and control over everything.

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                     SockPit Dashboard                       │
│               (Next.js Frontend + REST API)                 │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  Admin Panel  │  │  User Panel  │  │  API Gateway      │ │
│  │  (Full CRUD)  │  │  (Scoped)    │  │  (Auth + Routes)  │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │ REST API / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend API Server                      │
│                  (Node.js + Express/Fastify)                │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐ │
│  │   Auth   │ │  Server  │ │  Proxy   │ │  Installer    │ │
│  │  Module  │ │  Manager │ │  Users   │ │  Generator    │ │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌──────────────┐ ┌──────────┐ ┌──────────────┐
     │  PostgreSQL   │ │  Redis   │ │  WebSocket   │
     │  Database     │ │  Cache   │ │  Server      │
     └──────────────┘ └──────────┘ └──────────────┘
                                          │
                    ┌─────────────────────┤
                    ▼                     ▼
          ┌──────────────┐      ┌──────────────┐
          │  Windows PC  │      │  Linux Server │
          │  (Agent +    │      │  (Agent +     │
          │   SOCKS5)    │      │   SOCKS5)     │
          └──────────────┘      └──────────────┘
```

## Core Components

| Component | Description | Docs |
|-----------|-------------|------|
| Dashboard Frontend | Next.js web UI for admin and users | [docs/frontend.md](docs/frontend.md) |
| Backend API | Node.js REST API server | [docs/backend-api.md](docs/backend-api.md) |
| Agent (Windows) | Windows service that runs SOCKS5 and connects to dashboard | [docs/agent-windows.md](docs/agent-windows.md) |
| Agent (Linux) | Linux daemon that runs SOCKS5 and connects to dashboard | [docs/agent-linux.md](docs/agent-linux.md) |
| Agent (Docker) | Containerized agent for any platform with Docker | [docs/agent-docker.md](docs/agent-docker.md) |
| Installer Generator | Creates user-specific install scripts | [docs/installer-generator.md](docs/installer-generator.md) |
| Database Schema | PostgreSQL schema and migrations | [docs/database-schema.md](docs/database-schema.md) |
| Authentication | JWT-based auth with role system | [docs/authentication.md](docs/authentication.md) |
| WebSocket Protocol | Real-time comms between agent and server | [docs/websocket-protocol.md](docs/websocket-protocol.md) |
| SOCKS5 Engine | The SOCKS5 proxy implementation | [docs/socks5-engine.md](docs/socks5-engine.md) |
| CI/CD Pipeline | GitHub Actions for building agent binaries | [docs/github-actions.md](docs/github-actions.md) |
| Deployment | Docker Compose setup for self-hosting | [docs/deployment.md](docs/deployment.md) |
| API Reference | Full REST API specification | [docs/api-reference.md](docs/api-reference.md) |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14+, React, CSS Modules |
| Backend API | Node.js, Express.js |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis |
| Real-time | WebSocket (ws library) |
| Agent (Windows) | Rust (compiled to .exe via GitHub Actions) |
| Agent (Linux) | Rust (compiled binary via GitHub Actions) + bash installer |
| Agent (Docker) | Docker image (ghcr.io) built via GitHub Actions |
| SOCKS5 Server | Rust (fast-socks5 / custom implementation) |
| Auth | JWT + bcrypt |
| CI/CD | GitHub Actions (agent cross-compilation & release) |
| Containerization | Docker + Docker Compose |

## Project Structure

```
sockpit/
├── README.md                        # This file
├── docs/                            # All planning & design documentation
│   ├── architecture.md              # System architecture deep-dive
│   ├── frontend.md                  # Frontend design & components
│   ├── backend-api.md               # Backend API design
│   ├── database-schema.md           # PostgreSQL schema
│   ├── authentication.md            # Auth system design
│   ├── websocket-protocol.md        # WebSocket protocol spec
│   ├── socks5-engine.md             # SOCKS5 server implementation
│   ├── agent-windows.md             # Windows agent design
│   ├── agent-linux.md               # Linux agent design
│   ├── agent-docker.md              # Docker agent design
│   ├── installer-generator.md       # Installer script generation
│   ├── api-reference.md             # REST API reference
│   ├── deployment.md                # Deployment & infrastructure
│   ├── github-actions.md            # CI/CD pipeline for agent builds
│   ├── security.md                  # Security considerations
│   └── user-flows.md                # User journey & workflows
├── dashboard/                       # Next.js frontend app
│   ├── src/
│   │   ├── app/                     # Next.js app router pages
│   │   ├── components/              # React components
│   │   ├── lib/                     # Utility functions
│   │   ├── hooks/                   # Custom React hooks
│   │   └── styles/                  # CSS modules
│   └── package.json
├── server/                          # Backend API server
│   ├── src/
│   │   ├── routes/                  # API route handlers
│   │   ├── middleware/              # Express middleware
│   │   ├── services/                # Business logic
│   │   ├── models/                  # Database models
│   │   ├── websocket/               # WebSocket handlers
│   │   └── utils/                   # Helper functions
│   ├── migrations/                  # PostgreSQL migrations
│   └── package.json
├── agent/                           # Rust agent + SOCKS5 server
│   ├── src/
│   │   ├── main.rs                  # Entry point
│   │   ├── socks5/                  # SOCKS5 server implementation
│   │   ├── ws/                      # WebSocket client
│   │   ├── config/                  # Agent configuration
│   │   └── service/                 # Windows service / Linux daemon
│   ├── Cargo.toml                   # Rust package manifest
│   └── Cargo.lock
├── .github/
│   └── workflows/
│       └── build-agent.yml          # GitHub Actions: build & release agent binaries
├── installers/                      # Installer templates
│   ├── templates/
│   │   ├── windows-install.ps1.tpl  # PowerShell installer template
│   │   ├── linux-install.sh.tpl     # Bash installer template
│   │   └── docker-install.sh.tpl    # Docker installer template
│   └── README.md
└── docker-compose.yml               # Development environment
```

## Quick Links

- [Architecture Deep-Dive](docs/architecture.md)
- [Database Schema](docs/database-schema.md)
- [API Reference](docs/api-reference.md)
- [GitHub Actions CI/CD](docs/github-actions.md)
- [Security Model](docs/security.md)
- [User Flows](docs/user-flows.md)
- [Deployment Guide](docs/deployment.md)
