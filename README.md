# Language Learning App

Full-stack TypeScript app for vocabulary study: AI-generated lists and quizzes, SM-2 spaced repetition, and progress analytics.

**Live:** [languagelearningapp-z0ca.onrender.com](https://languagelearningapp-z0ca.onrender.com/login)

## Demo

![Quiz and vocabulary UI](https://github.com/user-attachments/assets/8bed62e6-23a9-42ea-86bf-b7406bce4ded)
![Progress and list UI](https://github.com/user-attachments/assets/62968178-677e-4b69-8b3d-0c9130c53e52)

## What this demonstrates

Built as a production-shaped product, not a thin OpenAI wrapper.

| Area | Implementation |
| --- | --- |
| **API** | Express + Zod validation, JWT auth, CSRF (Redis-backed), Helmet, rate limits, mongo-sanitize |
| **Data** | MongoDB driver (aggregations, batched reads, indexes on connect), in-memory list cache with invalidation |
| **AI** | OpenAI with Zod-parsed output, content moderation, retries, circuit breaker, and a concurrency/rate-limited request queue |
| **Learning** | SuperMemo-2 scheduling; quiz reviews vs manual status updates use different SM-2 entry points |
| **Reliability** | Idempotent quiz generation, connection pooling, `/api/health` (Mongo + Redis) |
| **Frontend** | React + TypeScript, Zustand, shared types with the server, Cypress e2e |

## Architecture

```
client (React / CRA)  →  Express API  →  MongoDB
                         ├─ Redis (CSRF store, optional shared rate-limit counters)
                         └─ OpenAI (queued + circuit-broken)
```

Client and server share `shared/types` (symlinked at build time).

## Tests

- **Server:** Jest + ts-jest — services, routes (Supertest), middleware, SM-2, AI helpers, circuit breaker, request queue
- **Client:** Cypress e2e (auth, vocabulary, quiz, user journey)

```bash
cd server && npm test
cd client && npm run test:e2e:headless   # needs API + app running
```

## Stack

- **Client:** React 18, TypeScript, Tailwind, Zustand, React Router, Cypress
- **Server:** Node, Express, TypeScript, Zod, Winston, Jest
- **Data / infra:** MongoDB, Redis, Render

## Local setup

**Needs:** Node 18+, MongoDB, OpenAI API key. Redis is optional (CSRF/rate-limit degrade without it).

```bash
git clone <repository-url>
cd LanguageLearningApp
npm run install-all
```

**Server** (`server/.env` from `server/.env.example`):

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/language-learning
JWT_SECRET=change-me
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
FRONTEND_URL=http://localhost:3000
REDIS_URL=                    # optional
```

**Client** (`client/.env` from `client/.env.example`):

```
REACT_APP_API_URL=http://localhost:5000/api
```

```bash
cd server && npm run dev      # http://localhost:5000
cd client && npm start        # http://localhost:3000
```

Production build: `npm run build` then `npm start` from the repo root (serves `server/dist`).
