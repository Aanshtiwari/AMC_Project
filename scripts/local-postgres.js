import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const dataDir = resolve(".postgres-data");
const binDir = "/usr/lib/postgresql/16/bin";
const port = "5433";
const user = "fireguard_app";
const database = "fireguard_amc";

function run(command, args, allowFailure = false) {
  const result = spawnSync(`${binDir}/${command}`, args, { stdio: "inherit" });
  if (result.status !== 0 && !allowFailure) process.exit(result.status || 1);
  return result.status === 0;
}

function isRunning() {
  return spawnSync(`${binDir}/pg_ctl`, ["-D", dataDir, "status"], {
    stdio: "ignore",
  }).status === 0;
}

function start() {
  if (!existsSync(`${dataDir}/PG_VERSION`)) {
    console.error("Local database is not initialized. Run: npm run db:setup");
    process.exit(1);
  }
  if (isRunning()) {
    console.log(`Local PostgreSQL is already running on port ${port}.`);
    return;
  }
  run("pg_ctl", ["-D", dataDir, "-l", `${dataDir}/server.log`, "-o", `-p ${port} -k ${dataDir}`, "start"]);
}

function setup() {
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(`${dataDir}/PG_VERSION`)) {
    run("initdb", ["-D", dataDir, "--username", user, "--auth", "trust", "--encoding", "UTF8"]);
  }
  start();
  const exists = spawnSync(
    `${binDir}/psql`,
    ["-h", "localhost", "-p", port, "-U", user, "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${database}'`],
    { encoding: "utf8" },
  );
  if (!exists.stdout?.trim()) run("createdb", ["-h", "localhost", "-p", port, "-U", user, database]);
  console.log(`Local PostgreSQL is ready on port ${port}.`);
}

function stop() {
  if (!existsSync(`${dataDir}/PG_VERSION`) || !isRunning()) {
    console.log("Local PostgreSQL is already stopped.");
    return;
  }
  run("pg_ctl", ["-D", dataDir, "stop"]);
}

function list() {
  run("psql", [
    "-h", "localhost", "-p", port, "-U", user, "-d", database,
    "-c", "SELECT 'services' AS table_name, COUNT(*) FROM services UNION ALL SELECT 'clients', COUNT(*) FROM clients UNION ALL SELECT 'visits', COUNT(*) FROM visits;",
    "-c", "SELECT id, name, category, frequency, status FROM services ORDER BY id;",
    "-c", "SELECT id, name, city, service, next_amc FROM clients ORDER BY id;",
  ]);
}

function view() {
  run("psql", ["-h", "localhost", "-p", port, "-U", user, "-d", database]);
}

const action = process.argv[2];
if (action === "setup") setup();
else if (action === "start") start();
else if (action === "stop") stop();
else if (action === "list") list();
else if (action === "view") view();
else {
  console.error("Use setup, start, stop, list, or view.");
  process.exit(1);
}
