import "dotenv/config";
import express from "express";
import cors from "cors";
import { initializeDatabase, mapClient, mapService, mapUser, mapVisit, pool, seedDatabase } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json({ limit: "5mb" }));
app.use(cors());

const clientFields = (item) => [
  item.name, item.contact, item.phone, item.email, item.address, item.city || "",
  item.services?.[0] || item.service, item.startDate, item.nextAmc, item.amcType,
  item.status || "Active", item.notes || "", item.gstNumber || "",
  item.services?.length ? item.services : [item.service].filter(Boolean),
  item.amcBy || "Secuite Technologies",
  item.portalEmail || item.email,
  item.portalPassword || "",
];
const serviceFields = (item) => [
  item.name, item.category, item.frequency, item.description || "", item.status || "Active",
];
const visitFields = (item) => [
  item.clientId, item.date, item.service, item.status, item.engineer, item.notes || "",
  item.nextDate, item.amcBy || "Secuite Technologies", item.scheduledDate || null,
  item.reportData || {},
];
const userFields = (item) => [
  item.role || "Employer",
  item.name,
  item.email,
  item.password,
  item.initials || initialsFor(item.name),
  item.phone || "",
  item.address || "",
  item.fatherName || "",
  item.motherName || "",
  item.marriageStatus || "Single",
  item.generalInformation || "",
  item.status || "Active",
];

async function getSnapshot(db = pool) {
  const [clients, services, visits, users, role] = await Promise.all([
    db.query("SELECT *, start_date::text AS start_date, next_amc::text AS next_amc FROM clients ORDER BY id"),
    db.query("SELECT * FROM services ORDER BY id"),
    db.query("SELECT *, date::text AS date, next_date::text AS next_date, scheduled_date::text AS scheduled_date FROM visits ORDER BY visits.date DESC, visits.id DESC"),
    db.query("SELECT * FROM app_users ORDER BY role, id"),
    db.query("SELECT value FROM app_settings WHERE key = 'role'"),
  ]);
  return {
    clients: clients.rows.map(mapClient),
    services: services.rows.map(mapService),
    visits: visits.rows.map(mapVisit),
    users: users.rows.map(mapUser),
    role: role.rows[0]?.value || "Admin",
  };
}

app.get("/api/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) { next(error); }
});

app.get("/api/bootstrap", async (_req, res, next) => {
  try { res.json(await getSnapshot()); } catch (error) { next(error); }
});

app.post("/api/clients", async (req, res, next) => {
  try {
    const result = await pool.query(
      `INSERT INTO clients
       (name, contact, phone, email, address, city, service, start_date, next_amc, amc_type, status, notes, gst_number, required_services, amc_by, portal_email, portal_password)
       VALUES (${Array.from({ length: 17 }, (_, i) => `$${i + 1}`).join(", ")})
       RETURNING *, start_date::text AS start_date, next_amc::text AS next_amc`,
      clientFields(req.body),
    );
    res.status(201).json(mapClient(result.rows[0]));
  } catch (error) { next(error); }
});

app.put("/api/clients/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE clients SET
       name=$1, contact=$2, phone=$3, email=$4, address=$5, city=$6, service=$7,
       start_date=$8, next_amc=$9, amc_type=$10, status=$11, notes=$12,
       gst_number=$13, required_services=$14, amc_by=$15, portal_email=$16, portal_password=$17
       WHERE id=$18 RETURNING *, start_date::text AS start_date, next_amc::text AS next_amc`,
      [...clientFields(req.body), req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Client not found." });
    res.json(mapClient(result.rows[0]));
  } catch (error) { next(error); }
});

app.post("/api/users", async (req, res, next) => {
  try {
    if (!["Admin", "Employer"].includes(req.body.role || "Employer")) {
      return res.status(400).json({ error: "Only Admin and Employer users can be created here." });
    }
    if (!req.body.name || !req.body.email || !req.body.password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    const result = await pool.query(
      `INSERT INTO app_users (role, name, email, password, initials, phone, address, father_name, mother_name, marriage_status, general_information, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      userFields(req.body),
    );
    res.status(201).json(mapUser(result.rows[0]));
  } catch (error) { next(error); }
});

app.put("/api/users/:id", async (req, res, next) => {
  try {
    if (req.body.role && req.body.role !== "Employer") {
      return res.status(400).json({ error: "Only Employer users can be updated here." });
    }
    if (!req.body.name || !req.body.email || !req.body.password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    const result = await pool.query(
      `UPDATE app_users SET name=$1, email=$2, password=$3, initials=$4, phone=$5, address=$6, father_name=$7, mother_name=$8, marriage_status=$9, general_information=$10, status=$11
       WHERE id=$12 AND role='Employer' RETURNING *`,
      [req.body.name, req.body.email, req.body.password, req.body.initials || initialsFor(req.body.name), req.body.phone || "", req.body.address || "", req.body.fatherName || "", req.body.motherName || "", req.body.marriageStatus || "Single", req.body.generalInformation || "", req.body.status || "Active", req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Employer not found or cannot be updated." });
    res.json(mapUser(result.rows[0]));
  } catch (error) { next(error); }
});

app.delete("/api/users/:id", async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM app_users WHERE id=$1 AND role='Employer'", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Employer not found or cannot be deleted." });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.delete("/api/clients/:id", async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM clients WHERE id=$1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Client not found." });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post("/api/services", async (req, res, next) => {
  try {
    const result = await pool.query(
      `INSERT INTO services (name, category, frequency, description, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      serviceFields(req.body),
    );
    res.status(201).json(mapService(result.rows[0]));
  } catch (error) { next(error); }
});

app.put("/api/services/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE services SET name=$1, category=$2, frequency=$3, description=$4, status=$5
       WHERE id=$6 RETURNING *`,
      [...serviceFields(req.body), req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Service not found." });
    res.json(mapService(result.rows[0]));
  } catch (error) { next(error); }
});

app.delete("/api/services/:id", async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM services WHERE id=$1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Service not found." });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post("/api/visits", async (req, res, next) => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await db.query(
      `INSERT INTO visits (client_id, date, service, status, engineer, notes, next_date, amc_by, scheduled_date, report_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *, date::text AS date, next_date::text AS next_date, scheduled_date::text AS scheduled_date`,
      visitFields(req.body),
    );
    await db.query("UPDATE clients SET next_amc=$1 WHERE id=$2", [req.body.nextDate, req.body.clientId]);
    await db.query("COMMIT");
    res.status(201).json(mapVisit(result.rows[0]));
  } catch (error) {
    await db.query("ROLLBACK");
    next(error);
  } finally { db.release(); }
});

app.put("/api/visits/:id", async (req, res, next) => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await db.query(
      `UPDATE visits SET client_id=$1, date=$2, service=$3, status=$4, engineer=$5,
       notes=$6, next_date=$7, amc_by=$8, scheduled_date=$9, report_data=$10
       WHERE id=$11 RETURNING *, date::text AS date, next_date::text AS next_date,
       scheduled_date::text AS scheduled_date`,
      [...visitFields(req.body), req.params.id],
    );
    if (!result.rowCount) {
      await db.query("ROLLBACK");
      return res.status(404).json({ error: "AMC report not found." });
    }
    await db.query("UPDATE clients SET next_amc=$1 WHERE id=$2", [req.body.nextDate, req.body.clientId]);
    await db.query("COMMIT");
    res.json(mapVisit(result.rows[0]));
  } catch (error) {
    await db.query("ROLLBACK");
    next(error);
  } finally { db.release(); }
});

app.put("/api/settings/role", async (req, res, next) => {
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('role', $1)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [req.body.role],
    );
    res.json({ role: req.body.role });
  } catch (error) { next(error); }
});

app.post("/api/restore", async (req, res, next) => {
  const db = await pool.connect();
  try {
    const { clients = [], services = [], visits = [], users = [], role = "Admin" } = req.body;
    await db.query("BEGIN");
    await db.query("TRUNCATE visits, clients, services, app_users RESTART IDENTITY CASCADE");
    for (const service of services) {
      await db.query(
        `INSERT INTO services (id, name, category, frequency, description, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [service.id, ...serviceFields(service)],
      );
    }
    for (const item of clients) {
      await db.query(
        `INSERT INTO clients
         (id, name, contact, phone, email, address, city, service, start_date, next_amc, amc_type, status, notes, gst_number, required_services, amc_by, portal_email, portal_password)
         VALUES ($1, ${Array.from({ length: 17 }, (_, i) => `$${i + 2}`).join(", ")})`,
        [item.id, ...clientFields(item)],
      );
    }
    for (const user of users) {
      await db.query(
        `INSERT INTO app_users (id, role, name, email, password, initials, phone, address, father_name, mother_name, marriage_status, general_information, status)
         VALUES ($1, ${Array.from({ length: 12 }, (_, i) => `$${i + 2}`).join(", ")})`,
        [user.id, ...userFields(user)],
      );
    }
    for (const visit of visits) {
      await db.query(
        `INSERT INTO visits (id, client_id, date, service, status, engineer, notes, next_date, amc_by, scheduled_date, report_data)
         VALUES ($1, ${Array.from({ length: 10 }, (_, i) => `$${i + 2}`).join(", ")})`,
        [visit.id, ...visitFields(visit)],
      );
    }
    await db.query("INSERT INTO app_settings (key, value) VALUES ('role', $1) ON CONFLICT (key) DO UPDATE SET value=$1", [role]);
    await db.query("SELECT setval(pg_get_serial_sequence('services', 'id'), COALESCE(MAX(id), 1)) FROM services");
    await db.query("SELECT setval(pg_get_serial_sequence('clients', 'id'), COALESCE(MAX(id), 1)) FROM clients");
    await db.query("SELECT setval(pg_get_serial_sequence('app_users', 'id'), COALESCE(MAX(id), 1)) FROM app_users");
    await db.query("SELECT setval(pg_get_serial_sequence('visits', 'id'), COALESCE(MAX(id), 1)) FROM visits");
    await db.query("COMMIT");
    res.json(await getSnapshot());
  } catch (error) {
    await db.query("ROLLBACK");
    next(error);
  } finally { db.release(); }
});

app.post("/api/reset", async (_req, res, next) => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("TRUNCATE visits, clients, services RESTART IDENTITY CASCADE");
    await seedDatabase(db);
    await db.query("COMMIT");
    res.json(await getSnapshot());
  } catch (error) {
    await db.query("ROLLBACK");
    next(error);
  } finally { db.release(); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === "23505") return res.status(409).json({ error: "A record with that name already exists." });
  if (error.code === "23503") return res.status(409).json({ error: "This record is still being used and cannot be deleted." });
  res.status(500).json({ error: error.message || "Database operation failed." });
});

function initialsFor(name) {
  return String(name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

initializeDatabase()
  .then(() => {
    const server = app.listen(port, () => console.log(`FireGuard API running at http://localhost:${port}`));
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.log(`FireGuard API is already running on port ${port}. You do not need to start it again.`);
        process.exit(0);
      }
      throw error;
    });
  })
  .catch((error) => {
    console.error("Could not initialize PostgreSQL:", error.message);
    process.exit(1);
  });
