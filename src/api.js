const apiBase = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
  } catch {
    throw new Error("PostgreSQL API is offline. Start it with: npm run server");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The database request failed.");
  return data;
}

export const api = {
  bootstrap: () => request("/bootstrap"),
  createClient: (client) => request("/clients", { method: "POST", body: JSON.stringify(client) }),
  updateClient: (client) => request(`/clients/${client.id}`, { method: "PUT", body: JSON.stringify(client) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: "DELETE" }),
  createService: (service) => request("/services", { method: "POST", body: JSON.stringify(service) }),
  updateService: (service) => request(`/services/${service.id}`, { method: "PUT", body: JSON.stringify(service) }),
  deleteService: (id) => request(`/services/${id}`, { method: "DELETE" }),
  createVisit: (visit) => request("/visits", { method: "POST", body: JSON.stringify(visit) }),
  updateVisit: (visit) => request(`/visits/${visit.id}`, { method: "PUT", body: JSON.stringify(visit) }),
  createUser: (user) => request("/users", { method: "POST", body: JSON.stringify(user) }),
  updateUser: (user) => request(`/users/${user.id}`, { method: "PUT", body: JSON.stringify(user) }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),
  setRole: (role) => request("/settings/role", { method: "PUT", body: JSON.stringify({ role }) }),
  restore: (backup) => request("/restore", { method: "POST", body: JSON.stringify(backup) }),
  reset: () => request("/reset", { method: "POST" }),
};
