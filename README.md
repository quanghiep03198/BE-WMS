[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=quanghiep03198_BE-WMS&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=quanghiep03198_BE-WMS)

# Warehouse Management API

[![SonarCloud](https://sonarcloud.io/images/project_badges/sonarcloud-black.svg)](https://sonarcloud.io/summary/new_code?id=quanghiep03198_BE-WMS)

This is a **RESTful API** for a **Warehouse Management System** built with **NestJS**. The API allows you to manage product inventories, monitor stock levels, and handle various warehouse operations. <br/> The project integrates **SQL Server** as the primary database using **TypeORM** and uses **Redis** for caching and performance optimization.

## Table of Contents

- [Features](#features)
- [Technologies Stack](#technologies-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Contributing](#contributing)
- [License](#license)

## Features

- Product catalog and inventory tracking\*\*
- Inbound and outbound stock management
- Warehouse transfer operations
- RFID-based item tracking
- User and role management
- Audit logs for warehouse activities
- Multi-language support for warehouse operations
- Reporting and analytics for inventory and warehouse performance
- Notification system for critical warehouse events
- Support for multiple warehouses and locations
- Stocktaking and inventory adjustment workflows
- Supplier and customer management
- Order processing and fulfillment
- Barcode and QR code integration for inventory handling
- Customizable business rules for warehouse processes

## Technologies Stack

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![NestJS](https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white)
![Fastify](https://img.shields.io/badge/fastify-%23000000.svg?style=for-the-badge&logo=fastify&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens)
![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)
![Zod](https://img.shields.io/badge/zod-%233068b7.svg?style=for-the-badge&logo=zod&logoColor=white)
![TypeORM](https://img.shields.io/badge/TypeORM-FE0803.svg?style=for-the-badge&logo=typeorm&logoColor=white)
![MicrosoftSQLServer](https://img.shields.io/badge/Microsoft%20SQL%20Server-CC2927?style=for-the-badge&logo=microsoft%20sql%20server&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)
![BullMQ](https://img.shields.io/badge/bullmq-%230f172a.svg?style=for-the-badge)
![Jest](https://img.shields.io/badge/-jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white)
![Sentry](https://img.shields.io/badge/sentry-%23362D59.svg?style=for-the-badge&logo=sentry&logoColor=white)
![SonarQube](https://img.shields.io/badge/SonarQube-black?style=for-the-badge&logo=sonarqube&logoColor=4E9BCD)
![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?style=for-the-badge&logo=Prometheus&logoColor=white)
![Grafana](https://img.shields.io/badge/grafana-%23F46800.svg?style=for-the-badge&logo=grafana&logoColor=white)
![PM2](https://img.shields.io/badge/pm2-%2340029c?style=for-the-badge&logo=pm2&logoColor=%23fafafa)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.x or higher)
- **SQL Server** (Local or remote instance)
- **MongoDB Replication set** (Local or remote instance)
- **Redis 7.x or higher** (Local or remote instance)
- **NPM** or **PNPM**

If you are confusing about NestJS (A progressive NodeJS Framework), we already wrote a [documentation](./docs/@framework/nestjs.md) about **NestJS** for **absolute beginner** to provide you crucial knowledgement about this framework, you might need to checkout [Official NestJS Documentation](https://nestjs.com/) as well.

### Folder Structure

```
├── .github/
│   └── workflows
│       └── cicd.yml
├── .husky/
├── .vscode/
├── docs/
├── logs/
├── node_modules/
├── infrastructure/
├── src/
│   ├── common/
│   │   ├── constants/
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── helper/
│   │   ├── interceptors/
│   │   ├── pipes/
│   │   ├── types/
│   │   ├── interceptors/
│   │   └── utils/
│   ├── configs/
│   │   ├── app.config.ts
│   │   └── app.config.validator.ts
│   ├── databases/
│   │   ├── constants/
│   │   ├── migrations/
│   │   ├── seeds/
│   │   ├── transformers/
│   │   ├── data-source.ts
│   │   ├── database.module.ts
│   │   └── seed.ts
│   ├── events/
│   │   └── event.gateway.ts
│   ├── generated/
│   │   └── i18n.generated.ts
│   ├── i18n/
│   │   ├── cn/
│   │   ├── en/
│   │   └── vi/
│   ├── jobs/
│   │   └── rotate-log.job.ts
│   ├── redis/
│   │   ├── constants/
│   │   ├── redis.module.ts
│   │   └── redis.service.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── rfid/
│   │   └── ...
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── main.ts
│   └── ...
├── test/
├── .env.example
├── commitlint.config.js
├── docker-compose.yaml
├── Dockerfile
├── ecosystem.config.js
├── nest-cli.json
├── package.json
├── pnpm-lock.yaml
├── sonar-project.properties
├── tsconfig.build.json
├── tsconfig.json
└── ...
```

### Installation

1. Clone the repository:

```bash
git clone https://github.com/quanghiep03198/BE-WMS.git <dir_name>

cd <dir_name>
```

2. Install the dependencies:

```bash
 pnpm install
```

3. Set up your SQL Server and Redis instances.

### Configuration

The application uses environment variables for configuration. Create a .env file in the root of the project and add the following environment variables from _env.example_:

```bash
cp .env.example .env
```

### Database Migration

To initialize the database schema using TypeORM, run:

```bash
pnpm migration:run
```

This will create the necessary tables and relationships in SQL Server.

### Running the Application

To start the development server:

```bash
pnpm start:dev
```

The API will now be available at http://localhost:3001.

### Running Tests

To run the unit tests:

```bash
pnpm test:cov
```

## Contributing

If you'd like to contribute to this project, please follow the contribution guidelines. We welcome all contributions, from minor fixes to new features.

## Branching Strategy

- **main**: Production-ready code.
- **develop**: Development branch for the next release.
- **feat/\***: Developing feature branch
- **fix/\***: Needed fix branch

Create a feature branch for any new features or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
