# Wasl — وصل

### Document an achievement once. Use it everywhere.

Wasl is an AI-powered career development platform that helps users turn verified achievements into professional LinkedIn posts, maintain a Master CV, tailor CVs to job descriptions, and identify skills to develop for their target careers.

Wasl combines AI-powered career tools with evidence verification, user approval workflows, and a Monitoring & Evaluation system designed to make AI outputs more trustworthy and observable.

**Live application:** [https://wasl-ruddy.vercel.app](https://wasl-ruddy.vercel.app)

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Solution](#solution)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Monitoring and Evaluation](#monitoring-and-evaluation)
- [Deployment](#deployment)
- [Local Development](#local-development)
- [Environment Configuration](#environment-configuration)
- [Testing and Quality Assurance](#testing-and-quality-assurance)
- [Project Documentation](#project-documentation)
- [Current Integration Status](#current-integration-status)

## Problem Statement

Professionals often need to describe the same achievements repeatedly across their CVs, LinkedIn profiles, and job applications. Generic AI writing tools can speed up this process, but they may introduce unsupported skills, fabricated metrics, or misleading experience.

Wasl addresses this problem by organizing achievements and career information into a reusable source of truth. AI-generated content is designed to remain grounded in the user's available evidence, with review and approval steps where appropriate.

## Solution

Wasl provides a connected career workflow:

1. Discover and document achievements.
2. Review evidence and confirm relevant information.
3. Generate LinkedIn content from verified achievements.
4. Maintain and update a Master CV through controlled review.
5. Tailor a CV to a target job description.
6. Analyze career skill gaps and identify learning priorities.
7. Monitor application health and evaluate AI task performance.

## Features

### LinkedIn Post Studio

- Generate professional LinkedIn post drafts in supported tones and languages.
- Review and edit generated content before publishing.
- Check claims against available achievement information.
- Support LinkedIn OAuth and publishing when the required application credentials and permissions are configured.
- Require explicit user confirmation before publishing.

### CV Manager

- Upload and parse supported CV documents.
- Review extracted career information.
- Maintain a Master CV and its versions.
- Prepare achievement-based updates for user review.
- Support accepting, editing, or rejecting proposed updates.
- Export CV documents in supported formats, including PDF and DOCX.

### CV Tailoring

- Analyze a target job description.
- Extract job requirements and compare them with available CV evidence.
- Present explainable skill and requirement matches.
- Generate tailored content while aiming to preserve the truth of the original CV.
- Compare original and tailored content for review.

### Career Gap Analyzer

- Compare a target job description with available user skills and achievements.
- Distinguish demonstrated, unverified, and missing skills where supported by the available evidence.
- Recommend prioritized learning actions to help users work toward their career goals.

### Job Matches

- Provide a dedicated workspace for job recommendations.
- Support live job-search integrations when the relevant providers, API keys, and application configuration are available.
- Potential providers include JSearch and SerpApi.

###

### Settings and Integrations

- Manage user profile and AI preferences.
- Support Supabase authentication.
- Provide LinkedIn integration settings when configured.



## Technology Stack

| Component           | Technologies                                    |
| ------------------- | ----------------------------------------------- |
| Frontend            | Next.js 16, React, TypeScript                   |
| Styling and UI      | Tailwind CSS 4, Radix-based UI components       |
| Charts              | Recharts                                        |
| Backend API         | FastAPI, Python, Pydantic                       |
| Database access     | SQLAlchemy 2                                    |
| AI workflows        | LangGraph and provider adapters                 |
| AI providers        | Groq, Google Gemini, OpenRouter                 |
| Authentication      | Supabase Auth                                   |
| Production database | Supabase PostgreSQL                             |
| File storage        | Supabase Storage                                |
| Frontend hosting    | Vercel                                          |
| Backend hosting     | Render                                          |
| Testing             | pytest, Ruff, TypeScript, ESLint, Next.js build |

The exact availability of optional integrations depends on their credentials and environment configuration.

## System Architecture

The application is organized into three main areas:

```text
Wasl/
├── frontend/       # Next.js web application
├── backend/        # FastAPI API and AI workflows
├── supabase/       # Database schema and migrations
└── docs/           # Architecture, setup, monitoring,
                    # evaluation, progress, and pitch documentation
```

### Request Flow

```text
User
 |
 v
Next.js Frontend (Vercel)
 |                  \
 | HTTPS API calls   \ Supabase Auth
 v                     \
FastAPI Backend         Supabase
(Render)                |
 |                       ├── Authentication
 ├── AI workflows        ├── PostgreSQL
 ├── Business logic      └── Storage
 ├── Provider adapters
 └── Monitoring events
          |
          v
Monitoring and Evaluation
```

The frontend communicates with the backend through its configured API URL. Supabase provides the configured authentication, database, and storage services.

The backend handles application logic, AI integrations, and protected operations. Environment variables control production configuration and keep server-side secrets out of frontend code.

### AI Workflows

Wasl's AI architecture includes workflows for content generation, verification, and CV optimization and career analysis.

The provider layer supports configured AI services, with task-specific model selection and operational safeguards such as timeouts, retries, response validation, and fallback behavior where implemented.

AI-generated content should not be treated as automatically verified. User review and evidence checks remain important parts of the workflow.

##

## Deployment

Wasl is deployed using separate frontend and backend services.

| Service                     | Platform         | Configuration                |
| --------------------------- | ---------------- | ---------------------------- |
| Frontend                    | Vercel           | Root directory: `frontend`   |
| Backend API                 | Render           | Root directory: `backend`    |
| Database and authentication | Supabase         | PostgreSQL and Supabase Auth |
| File storage                | Supabase Storage | Configured storage bucket    |

### Production Environment

The frontend requires the correct public backend API URL and Supabase client configuration. The backend requires its database connection, authentication settings, application secrets, and any provider credentials needed for enabled features.

The following settings must use the actual production URLs:

- Frontend API configuration must point to the deployed Render backend.
- Backend `FRONTEND_URL` and `CORS_ORIGINS` must include the deployed frontend origin.
- Backend `BACKEND_URL` must match the public Render service URL.
- Supabase's site URL and allowed redirect URLs must include the production frontend domain.
- OAuth providers must use their registered production callback URLs.

**Production verification is ongoing.** A successful hosting deployment confirms that a service was built and started; it does not by itself prove that authentication, database access, email verification, OAuth, uploads, or every AI feature works end to end.

## Local Development

### Prerequisites

- Python 3.11 or a compatible version supported by the project dependencies.
- Node.js and npm.
- A Supabase project for testing Supabase-backed functionality.
- API credentials for the AI or external integrations you intend to test.

### 1. Clone the Repository

```bash
git clone https://github.com/Nadaalnashwan/wasl.git
cd wasl
```

### 2. Configure the Backend

```bash
cd backend

python -m venv .venv
```

Activate the virtual environment:

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
source .venv/bin/activate
```

Install the dependencies and prepare the environment file:

```bash
pip install -r requirements-dev.txt
```

Copy `.env.example` to `.env` and configure the values required for your local setup. Follow the instructions in `docs/SETUP.md`.

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Configure the Frontend

Open a second terminal:

```bash
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env.local` and fill in the required local values.

Start the development server:

```bash
npm run dev
```

The frontend is normally available at `http://localhost:3000`, and the backend at `http://localhost:8000`.

Keep local environment files private and never commit API keys, service-role keys, or other secrets.

## Environment Configuration

### Backend

The backend `.env.example` documents the supported configuration options. Depending on enabled features, these include:

- Application environment and frontend/backend URLs.
- CORS origins.
- Supabase PostgreSQL connection string.
- Supabase Auth settings and server-side storage credentials.
- JWT and encryption settings.
- AI provider keys and model configuration.
- LinkedIn and GitHub OAuth credentials and callback URLs.
- Optional job-search provider credentials.
- Monitoring thresholds and evaluation settings.

### Frontend

The frontend environment example defines the exact public environment variables required by the Next.js application, including the backend API URL and Supabase client configuration.

Only values intended for browser exposure should use the `NEXT_PUBLIC_` prefix. **Never expose the Supabase service-role key, private AI keys, OAuth client secrets, or encryption keys in frontend variables.**

For production, configure environment variables in the respective Vercel, Render, and Supabase dashboards rather than committing secret values to the repository.

## Testing and Quality Assurance

Run the following checks from the relevant project directories.

### Backend Tests

```bash
cd backend
pytest -q
ruff check app tests
```

### Frontend Checks

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run build
```

### AI Evaluation

```bash
cd backend
python -m app.evaluation
```

AI evaluation may require a configured provider key. Record the actual test results and the provider/model configuration used for each run.

Do not assume that historical test results represent the current production deployment; rerun the checks after relevant code or configuration changes.

## Project Documentation

Additional technical documentation is available in `docs/`:

| Document               | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `docs/ARCHITECTURE.md` | System architecture and development flow        |
| `docs/MONITORING.md`   | Monitoring architecture, metrics, and alerting  |
| `docs/EVALUATION.md`   | AI evaluation methodology and results           |
| `docs/SETUP.md`        | Installation and environment configuration      |
| `docs/PROGRESS.md`     | Implementation progress and acceptance criteria |
|                        |                                                 |
|                        |                                                 |

## Current Integration Status

| Integration                             | Current status                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Frontend deployment                     | Deployed to Vercel                                                           |
| Backend deployment                      | Deployed to Render                                                           |
| Supabase database schema and migrations | Prepared; production connectivity and behavior must be verified              |
| Supabase authentication                 | Configured; end-to-end production verification is ongoing                    |
| Email verification redirects            | Production redirect configuration requires verification                      |
| AI providers                            | Supported by the application; availability depends on configured credentials |
| LinkedIn OAuth and publishing           | Requires valid credentials and registered production callback URL            |
| Job-search APIs                         | Optional; requires provider credentials and runtime verification             |
|                                         |                                                                              |

## Project Context

Built for the Tuwaiq Academy × Meta × Startupbootcamp **AI Product Development and Monitoring** project, October 2026.

Wasl aims to make career development more connected, evidence-based, and transparent by combining practical AI workflows with user control, monitoring, and evaluation.
