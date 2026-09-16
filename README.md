# Campus Lost-and-Found API

Backend API for a Campus Lost-and-Found service, developed as the semester project retake for **Continuous Integration (S4-CONINT)**.

Lost-and-found items can be read through the public REST API. Creating, updating and deleting items requires a valid API key.

The project contains only the backend API. There is no frontend.

## Technology Stack

- **Backend:** Node.js 22 and Fastify 5
- **Database:** PostgreSQL
- **Production database:** AWS RDS
- **Containerization:** Docker and Docker Compose
- **Reverse proxy:** NGINX
- **CI/CD:** GitHub Actions
- **Container registry:** Docker Hub
- **Testing:** Jest and k6
- **Code quality:** SonarQube, self-hosted on AWS
- **Security scanning:** Snyk
- **Feature toggles:** PostHog
- **Deployment:** AWS EC2 with Blue/Green deployment

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Create the Initial API Key](#create-the-initial-api-key)
  - [Run Locally](#run-locally)
  - [Run with Docker](#run-with-docker)
- [Testing](#testing)
- [Code Quality and Security](#code-quality-and-security)
- [Feature Toggle](#feature-toggle)
- [CI/CD Pipeline](#cicd-pipeline)
- [Docker Hub](#docker-hub)
- [AWS Deployment](#aws-deployment)
- [Blue/Green Deployment](#bluegreen-deployment)
- [Project Structure](#project-structure)

## Architecture

```text
API client
    |
    | HTTP
    v
NGINX on AWS EC2 :80
    |
    | Docker network
    v
Blue / Green Fastify containers :3000
    |
    | TCP 5432
    v
AWS RDS PostgreSQL
```

NGINX is the public entry point for the API.

Two Fastify containers, **Blue** and **Green**, run on the EC2 instance. Only one environment receives production traffic at a time.

The inactive environment can receive a new Docker image and be tested before NGINX switches production traffic to it.

Both environments use the same PostgreSQL database on AWS RDS.

---

## Features

### Feature A — API Key Access

Write operations are protected by an API key.

The active API key is stored as a **SHA-256 hash** in the PostgreSQL `api_keys` table. The plaintext API key is not persisted in the database.

The following routes require a valid `x-api-key` header:

- `POST /items`
- `PUT /items/:id`
- `DELETE /items/:id`
- `POST /api-key/rotate`

The API key can be rotated using:

```text
POST /api-key/rotate
```

A valid current API key must be supplied. When rotation succeeds:

1. A new API key is generated.
2. The new hash replaces the previous hash in the database.
3. The previous API key becomes invalid.
4. The new plaintext API key is returned once in the response.

### Feature B — Public Retrieval of Lost Items

Read operations are public and do not require an API key.

`GET /items` supports:

- pagination with `page` and `limit`
- sorting with `newest` and `oldest`
- full-text search using `search`

Example:

```text
GET /items?page=1&limit=10
```

Sorting:

```text
GET /items?sort=newest
GET /items?sort=oldest
```

Search:

```text
GET /items?search=backpack
```

Full-text search is implemented with PostgreSQL Full Text Search using `to_tsvector`, `plainto_tsquery` and the `@@` operator across the item `name` and `description`.

A single item can be retrieved with:

```text
GET /items/:id
```

A non-existent item returns `404`.

### Feature C — PostHog Feature Toggle

PostHog controls the Boolean feature flag:

```text
is-full-text-search-enabled
```

The flag controls whether full-text search is available.

When the flag is enabled, a request such as:

```text
GET /items?search=backpack
```

performs the PostgreSQL full-text search.

When the flag is disabled, search requests return:

```text
HTTP 503
```

with:

```json
{
  "error": "Full-text search is currently disabled"
}
```

Normal `GET /items` requests without the `search` parameter are not affected.

The feature can therefore be enabled or disabled in PostHog without restarting or redeploying the application.

---

## API Reference

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | API status and health check |
| GET | `/db-test` | Public | Verifies database connectivity |
| GET | `/items` | Public | Returns paginated lost-and-found items |
| GET | `/items/:id` | Public | Returns one item by ID |
| POST | `/items` | API key | Creates a new item |
| PUT | `/items/:id` | API key | Updates an existing item |
| DELETE | `/items/:id` | API key | Deletes an item |
| POST | `/api-key/rotate` | API key | Rotates the active API key |

### Example: Create an Item

Write operations expect the API key in the `x-api-key` header.

```bash
curl -X POST http://localhost:3000/items \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "name": "Black backpack",
    "description": "Found near the library",
    "lost_date": "2026-09-04",
    "metadata": {
      "color": "black"
    }
  }'
```

A request without a valid API key is rejected.

---

## Getting Started

### Prerequisites

For local development:

- Node.js 22
- npm
- PostgreSQL
- Git

Optional tools used by the project:

- Docker
- Docker Compose
- k6
- Snyk
- SonarQube

### Environment Variables

The repository contains:

```text
.env.example
```

Copy it to a local `.env` file:

```bash
cp .env.example .env
```

Then replace the placeholder values with configuration for your environment.

The application uses:

| Variable | Purpose |
| --- | --- |
| `DB_HOST` | PostgreSQL hostname or AWS RDS endpoint |
| `DB_PORT` | PostgreSQL port, normally `5432` |
| `DB_USER` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_NAME` | PostgreSQL database name |
| `POSTHOG_API_KEY` | PostHog project API key |
| `POSTHOG_HOST` | PostHog host |

Example:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-postgres-password
DB_NAME=lostfound

POSTHOG_API_KEY=your-posthog-project-key
POSTHOG_HOST=your-posthog-host
```

Real credentials must never be committed to Git.

`.env` and `.env.*` files are ignored by Git, while `.env.example` is intentionally included as a configuration template.

CI/CD credentials are stored as GitHub Repository Secrets instead of in source files.

Examples include:

- `SNYK_TOKEN`
- `SONAR_HOST_URL`
- `SONAR_TOKEN`
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY_B64`

### Database Setup

The PostgreSQL schema is located in:

```text
database/init.sql
```

The schema creates the tables used by the application, including:

- `items`
- `api_keys`

The `items` table stores lost-and-found data.

The `api_keys` table stores the hash of the active API key.

Apply the schema to a local PostgreSQL database:

```bash
psql -U postgres -d lostfound -f database/init.sql
```

In production, PostgreSQL runs on AWS RDS.

### Create the Initial API Key

After the database schema has been created, generate the first API key with:

```bash
node scripts/createInitialApiKey.js
```

The script generates an API key, stores its hash in PostgreSQL and prints the plaintext key.

Save the plaintext value securely because it is required for write operations.

### Run Locally

Install dependencies:

```bash
npm ci
```

Start the API:

```bash
npm start
```

The server listens on:

```text
http://localhost:3000
```

Test the API:

```bash
curl http://localhost:3000/
```

The response should indicate that the Campus Lost-and-Found API is running.

Database connectivity can be checked with:

```bash
curl http://localhost:3000/db-test
```

### Run with Docker

Build the Docker image:

```bash
docker build -t campus-lost-and-found-api:local .
```

Run the container:

```bash
docker run -d \
  --name lostfound-api \
  -p 3000:3000 \
  --env-file .env \
  -e DB_HOST=host.docker.internal \
  campus-lost-and-found-api:local
```

Test the container:

```bash
curl http://localhost:3000/
```

and:

```bash
curl http://localhost:3000/db-test
```

The PostgreSQL database must be reachable from the container.

---

## Testing

### Jest

Jest is used for automated tests.

Run the test suite:

```bash
npm test
```

Run the tests with coverage:

```bash
npm run test:coverage
```

The project contains **20 Jest tests** covering API-key logic and API behavior.

Coverage reports are generated in:

```text
coverage/
```

SonarQube imports Jest coverage from:

```text
coverage/lcov.info
```

### k6 Performance Testing

The k6 performance test is located in:

```text
tests/performance/items-load.js
```

Run it with:

```bash
npm run test:performance
```

A custom API URL can be supplied through `BASE_URL`.

Example:

```bash
BASE_URL=http://localhost:3000 npm run test:performance
```

In the production CI/CD pipeline, k6 is run against the inactive Blue/Green environment before production traffic is switched.

---

## Code Quality and Security

### SonarQube

SonarQube is used for static code analysis.

Configuration is stored in:

```text
sonar-project.properties
```

Run the scanner with:

```bash
npm run quality:sonar
```

The project uses a self-hosted SonarQube server running on AWS EC2.

SonarQube analyses the source code and imports Jest coverage data.

### Snyk

Snyk is used for dependency and security scanning.

Run:

```bash
npm run security:snyk
```

Snyk is also executed as part of the GitHub Actions **Quality & Security** job.

If the security scan fails, dependent pipeline jobs do not continue.

---

## CI/CD Pipeline

The CI/CD workflow is defined in:

```text
.github/workflows/ci.yml
```

GitHub-hosted Ubuntu runners execute the workflow.

### Main Branch

A push to `main` runs:

1. Quality & Security
2. Test
3. Docker Build

Pull requests targeting `main` run the same quality, test and build stages.

### Production Branch

A push to:

```text
deploy/production
```

runs the complete production pipeline:

1. Quality & Security
2. Test
3. Docker Build
4. Deliver to Docker Hub
5. Deploy to Inactive Environment
6. k6 Performance Test on Staging
7. Blue Green Traffic Switch

Pipeline jobs are connected with `needs`.

A failed required stage prevents downstream stages from executing.

GitHub workflow notifications are used to report pipeline failures.

---

## Docker Hub

Docker Hub is used as the container registry.

Repository:

```text
ismagnus/campus-lost-and-found-api
```

Production images are pushed with two tags:

```text
latest
```

and:

```text
<git-commit-sha>
```

The commit SHA tag makes it possible to associate a deployed Docker image with a specific Git commit.

The deployment pipeline uses the SHA-tagged image for deployment.

---

## AWS Deployment

The production environment runs on Amazon Web Services.

### EC2

The application EC2 instance hosts:

- Blue Fastify container
- Green Fastify container
- NGINX container

Docker Compose manages the containers.

NGINX exposes public HTTP traffic on:

```text
TCP 80
```

The Fastify containers listen internally on:

```text
TCP 3000
```

### RDS

PostgreSQL runs on AWS RDS.

The API connects to the RDS database using:

```text
TCP 5432
```

The RDS security group permits PostgreSQL traffic from the security group associated with the application EC2 instance.

The database is therefore not opened to general public internet traffic for PostgreSQL access.

The `/db-test` route can be used to verify the application-to-database connection.

---

## Blue/Green Deployment

Deployment configuration is stored in:

```text
deploy/
```

Important files are:

```text
deploy/compose.yaml
deploy/nginx.conf
deploy/switch.sh
deploy/.env.example
```

The Docker Compose configuration contains three services:

- `blue`
- `green`
- `nginx`

### Deployment Process

A production deployment follows this process:

1. Determine which environment is currently active.
2. Deploy the new Docker image to the inactive environment.
3. Wait for the inactive container to become healthy.
4. Run performance testing against the inactive environment.
5. Run `switch.sh`.
6. Verify the target API.
7. Verify the target database connection.
8. Update the NGINX `proxy_pass`.
9. Validate the NGINX configuration.
10. Gracefully reload NGINX.
11. Production traffic is now directed to the newly tested environment.

The previously active container remains running as a fallback.

### NGINX Traffic Switching

NGINX acts as a reverse proxy in front of Blue and Green.

The active upstream is configured with a `proxy_pass`, for example:

```nginx
proxy_pass http://blue:3000;
```

or:

```nginx
proxy_pass http://green:3000;
```

`switch.sh` changes the active upstream and uses a graceful NGINX reload.

This allows traffic to be switched between Blue and Green without intentionally stopping the public API.

A continuous-request test was also used to verify the traffic switch, with HTTP requests returning `200` before, during and after the Blue/Green switch.

---

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── database/
│   └── init.sql
│
├── deploy/
│   ├── .env.example
│   ├── compose.yaml
│   ├── nginx.conf
│   └── switch.sh
│
├── scripts/
│   └── createInitialApiKey.js
│
├── src/
│   ├── apiKey.js
│   ├── db.js
│   ├── posthog.js
│   └── server.js
│
├── tests/
│   ├── performance/
│   │   └── items-load.js
│   ├── apiKey.test.js
│   └── server.test.js
│
├── .env.example
├── .gitignore
├── Dockerfile
├── package.json
├── package-lock.json
└── sonar-project.properties
```

---

## Notes

This repository contains the backend implementation for the Continuous Integration semester project retake.

Sensitive credentials, API tokens, database passwords and SSH keys are not stored in the repository.