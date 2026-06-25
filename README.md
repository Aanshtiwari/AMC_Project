# FireGuard AMC Manager

React/Vite frontend with an Express API and PostgreSQL persistence.

## Setup

1. One-time local PostgreSQL setup (no password or sudo required):

   ```bash
   npm run db:setup
   ```

   This creates a project-owned PostgreSQL server on port `5433`, avoiding the
   unknown password on the system PostgreSQL server.

2. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

3. Run both application processes in separate terminals:

   ```bash
   npm run server
   ```

   ```bash
   npm run dev
   ```

The API automatically creates the tables and restores all seven services, three
sample clients, and their visit history. Open `http://localhost:5173`.

On later restarts, run `npm run db:start` before `npm run server`. To stop the
project database, run `npm run db:stop`.

Starting either PostgreSQL or the API more than once is safe; the terminal will
tell you it is already running.

## View the database

To print all services, clients, and table counts in the terminal:

```bash
npm run db:list
```

To open PostgreSQL's interactive database viewer:

```bash
npm run db:view
```

Inside it, use:

```sql
\dt
SELECT * FROM services;
SELECT * FROM clients;
\q
```

## Database check

After starting the API, visit `http://localhost:3001/api/health`. It should return:

```json
{ "status": "ok", "database": "connected" }
```
