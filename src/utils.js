export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function prettyDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysUntil(value) {
  const todayDate = new Date(today());
  const dueDate = new Date(value);
  return Math.ceil((dueDate - todayDate) / 86400000);
}

export function getAmcStatus(value) {
  const days = daysUntil(value);
  if (days < 0) return { label: "Overdue", level: "overdue" };
  if (days === 0) return { label: "Due Today", level: "today" };
  if (days <= 7) return { label: "Due This Week", level: "week" };
  if (days <= 30) return { label: "Next 30 Days", level: "soon" };
  return { label: "Upcoming", level: "upcoming" };
}

export function calculateNextAMC(startDate, amcType) {
  if (!startDate) return "";
  const monthsByType = { Monthly: 1, Quarterly: 3, "Half-yearly": 6, Annual: 12 };
  const [year, month, day] = startDate.split("-").map(Number);
  const targetMonth = month - 1 + (monthsByType[amcType] ?? 0);
  const lastDay = new Date(year, targetMonth + 1, 0).getDate();
  const date = new Date(year, targetMonth, Math.min(day, lastDay));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function serviceUsage(clients, serviceName) {
  return clients.filter((client) => (client.services?.length ? client.services : [client.service]).includes(serviceName)).length;
}

export function validateClient(form, clients, currentId) {
  const errors = [];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneDigits = form.phone.replace(/\D/g, "");
  const duplicate = clients.some((client) => client.id !== currentId && client.name.trim().toLowerCase() === form.name.trim().toLowerCase());
  if (duplicate) errors.push("A client with this name already exists.");
  if (!(form.services?.length || form.service)) errors.push("Select at least one required service.");
  if (!emailPattern.test(form.email)) errors.push("Enter a valid email address.");
  if (phoneDigits.length < 10) errors.push("Enter a valid phone number.");
  if (form.startDate && form.nextAmc && form.nextAmc < form.startDate) errors.push("Next AMC date cannot be before start date.");
  return errors;
}

export function downloadBlob(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportBackup(payload) {
  downloadBlob(JSON.stringify(payload, null, 2), "application/json", `fireguard-backup-${today()}.json`);
}

export function exportAMCList(clients, format) {
  const headings = ["Client", "Contact", "Phone", "Email", "GST", "Service", "AMC type", "AMC By", "Start", "Next AMC", "Status", "Address"];
  const rows = clients.map((client) => [
    client.name,
    client.contact,
    client.phone,
    client.email,
    client.gstNumber || "",
    (client.services?.length ? client.services : [client.service]).join(", "),
    client.amcType,
    client.amcBy || "",
    prettyDate(client.startDate),
    prettyDate(client.nextAmc),
    getAmcStatus(client.nextAmc).label,
    client.address,
  ]);
  const table = `<table><thead><tr>${headings.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  if (format === "pdf") {
    const report = window.open("", "_blank");
    if (!report) return;
    report.document.write(`<!doctype html><html><head><title>AMC Report</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#17231d}h1{font-size:20px;margin:0 0 4px}p{font-size:11px;color:#66756c}table{border-collapse:collapse;width:100%;font-size:9px}th{background:#215b42;color:#fff}th,td{border:1px solid #dce3de;padding:6px;text-align:left}</style></head><body><h1>Annual Maintenance Contracts</h1><p>${rows.length} records exported on ${escapeHtml(new Date().toLocaleString("en-IN"))}</p>${table}<script>window.onload=()=>window.print()</script></body></html>`);
    report.document.close();
    return;
  }
  downloadBlob(`<!doctype html><html><body>${table}</body></html>`, "application/vnd.ms-excel", `amc-contracts-${today()}.xls`);
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
