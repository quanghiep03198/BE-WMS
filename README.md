[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=quanghiep03198_BE-WMS&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=quanghiep03198_BE-WMS)

# Warehouse Management API 

[![SonarCloud](https://sonarcloud.io/images/project_badges/sonarcloud-black.svg)](https://sonarcloud.io/summary/new_code?id=quanghiep03198_BE-WMS)

This is a **RESTful API** for a **Warehouse Management System** built with **NestJS**. The API allows you to manage product inventories, monitor stock levels, and handle various warehouse operations. <br/> The project integrates **SQL Server** as the primary database using **TypeORM** and uses **Redis** for caching and performance optimization.


## Table of Contents

-  [Features](#features)
-  [Tech Stack](#tech-stack)
-  [Getting Started](#getting-started)
-  [Configuration](#configuration)
-  [Running the Application](#running-the-application)
-  [Contributing](#contributing)
-  [License](#license)

## Features

-  **Product Management**: Create, update, delete, and list products.
-  **Inventory Management**: Track stock levels, update quantities, and monitor stock movements.
-  **Order Processing**: Manage incoming and outgoing orders, including validations.
-  **Warehouse Zones**: Manage different storage zones and sections within the warehouse.
-  **Redis Caching**: Improve API performance by caching frequently accessed data.
-  **Database Transactions**: Ensure data integrity using SQL Server and TypeORM.
-  **Authentication and Authorization**: Secure API endpoints using JWT authentication (optional).

## Tech Stack

-  **Languages**: [Typescript](https://www.typescriptlang.org/) / [Node.js](https://nodejs.org/docs/latest/api/)
-  **Framework**: [NestJS](https://nestjs.com/)
-  **Database**: [Microsoft SQL Server](https://www.microsoft.com/en-us/sql-server/sql-server-2022)
-  **Cache**: [Redis](https://redis.io/docs/latest/)
-  **ORM**: [TypeORM](https://typeorm.io/)
-  **Authentication**: [JSON Web Tokens](https://jwt.io/)
-  **Validation**: [Zod](https://zod.dev/)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

-  **Node.js** (v18.x or higher)
-  **SQL Server** (Local or remote instance)
-  **Redis** (Local or remote instance)
-  **NPM** or **Yarn**

### Installation

1. Clone the repository:

```bash
git clone https://github.com/quanghiep03198/BE-WMS.git <dir_name>

cd <dir_name>
```

2. Install the dependencies:

```bash
 npm install
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
npm run migration:run
```

This will create the necessary tables and relationships in SQL Server.

### Running the Application

To start the development server:

```bash
npm run start:dev
```

The API will now be available at http://localhost:3001.

### Running Tests

To run the unit tests:

```bash
npm run test:cov
```

##Contributing
If you'd like to contribute to this project, please follow the contribution guidelines. We welcome all contributions, from minor fixes to new features.

## Branching Strategy

-  **main**: Production-ready code.
-  **develop**: Development branch for the next release.
-  **feat/\***: Developing feature branch
-  **fix/\***: Needed fix branch

Create a feature branch for any new features or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
