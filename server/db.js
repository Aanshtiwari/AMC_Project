import "dotenv/config";
import pg from "pg";
import { initialClients, initialServices, initialUsers, initialVisits } from "../src/data.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Copy .env.example to .env and configure PostgreSQL.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const schema = `
  CREATE TABLE IF NOT EXISTS services (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    frequency TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active'
  );

  CREATE TABLE IF NOT EXISTS clients (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    contact TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    service TEXT NOT NULL REFERENCES services(name) ON UPDATE CASCADE,
    start_date DATE NOT NULL,
    next_amc DATE NOT NULL,
    amc_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    notes TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS visits (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    service TEXT NOT NULL,
    status TEXT NOT NULL,
    engineer TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    next_date DATE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_users (
    id BIGSERIAL PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('Admin', 'Employer')),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    initials TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  ALTER TABLE clients ADD COLUMN IF NOT EXISTS gst_number TEXT NOT NULL DEFAULT '';
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS required_services TEXT[] NOT NULL DEFAULT '{}';
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS amc_by TEXT NOT NULL DEFAULT 'Secuite Technologies';
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_email TEXT NOT NULL DEFAULT '';
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_password TEXT NOT NULL DEFAULT '';
  ALTER TABLE visits ADD COLUMN IF NOT EXISTS amc_by TEXT NOT NULL DEFAULT 'Secuite Technologies';
  ALTER TABLE visits ADD COLUMN IF NOT EXISTS scheduled_date DATE;
  ALTER TABLE visits ADD COLUMN IF NOT EXISTS report_data JSONB NOT NULL DEFAULT '{}'::jsonb;
  UPDATE clients SET required_services = ARRAY[service] WHERE required_services = '{}';
  UPDATE clients SET portal_email = email WHERE portal_email = '';
  UPDATE clients SET portal_password = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g')) || '123' WHERE portal_password = '';
  UPDATE clients SET portal_email = 'customer@fireguard.local', portal_password = 'customer123'
    WHERE id = 1 AND (portal_email = email OR portal_email = 'admin@apextech.in');
  UPDATE visits SET scheduled_date = date WHERE scheduled_date IS NULL;
`;

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schema);
    await seedDatabase(client);
    await client.query(
      "INSERT INTO app_settings (key, value) VALUES ('role', 'Admin') ON CONFLICT (key) DO NOTHING",
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function seedDatabase(client) {
  for (const service of initialServices) {
    await client.query(
      `INSERT INTO services (name, category, frequency, description, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO NOTHING`,
      [service.name, service.category, service.frequency, service.description, service.status],
    );
  }
  for (const item of initialClients) {
    await client.query(
      `INSERT INTO clients
       (id, name, contact, phone, email, address, city, service, start_date, next_amc, amc_type, status, notes, required_services, portal_email, portal_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT DO NOTHING`,
      [item.id, item.name, item.contact, item.phone, item.email, item.address, item.city, item.service, item.startDate, item.nextAmc, item.amcType, item.status, item.notes || "", [item.service], item.portalEmail || item.email, item.portalPassword || ""],
    );
  }
  for (const user of initialUsers) {
    await client.query(
      `INSERT INTO app_users (id, role, name, email, password, initials, phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO NOTHING`,
      [user.id, user.role, user.name, user.email, user.password, user.initials, user.phone || "", user.status || "Active"],
    );
  }
  for (const visit of initialVisits) {
    await client.query(
      `INSERT INTO visits (id, client_id, date, service, status, engineer, notes, next_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [visit.id, visit.clientId, visit.date, visit.service, visit.status, visit.engineer, visit.notes, visit.nextDate],
    );
  }
  await client.query("SELECT setval(pg_get_serial_sequence('services', 'id'), COALESCE(MAX(id), 1)) FROM services");
  await client.query("SELECT setval(pg_get_serial_sequence('clients', 'id'), COALESCE(MAX(id), 1)) FROM clients");
  await client.query("SELECT setval(pg_get_serial_sequence('app_users', 'id'), COALESCE(MAX(id), 1)) FROM app_users");
  await client.query("SELECT setval(pg_get_serial_sequence('visits', 'id'), COALESCE(MAX(id), 1)) FROM visits");
}

export const mapClient = (row) => ({
  id: Number(row.id),
  name: row.name,
  contact: row.contact,
  phone: row.phone,
  email: row.email,
  address: row.address,
  city: row.city,
  service: row.service,
  startDate: row.start_date,
  nextAmc: row.next_amc,
  amcType: row.amc_type,
  status: row.status,
  notes: row.notes,
  gstNumber: row.gst_number || "",
  services: row.required_services?.length ? row.required_services : [row.service],
  amcBy: row.amc_by || "Secuite Technologies",
  portalEmail: row.portal_email || row.email,
  portalPassword: row.portal_password || "",
});

export const mapService = (row) => ({ ...row, id: Number(row.id) });

export const mapVisit = (row) => ({
  id: Number(row.id),
  clientId: Number(row.client_id),
  date: row.date,
  service: row.service,
  status: row.status,
  engineer: row.engineer,
  notes: row.notes,
  nextDate: row.next_date,
  amcBy: row.amc_by || "Secuite Technologies",
  scheduledDate: row.scheduled_date,
  reportData: row.report_data || {},
});

export const mapUser = (row) => ({
  id: Number(row.id),
  role: row.role,
  name: row.name,
  email: row.email,
  password: row.password,
  initials: row.initials || initialsFor(row.name),
  phone: row.phone || "",
  status: row.status || "Active",
  createdAt: row.created_at,
});

function initialsFor(name) {
  return String(name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}
