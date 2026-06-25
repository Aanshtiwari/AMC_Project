export const serviceOptions = [
  "Fire Alarm System",
  "Fire Extinguisher",
  "CCTV System",
  "Access Control",
  "Sprinkler System",
  "Public Announcement System",
  "FM 200 System",
  "Vesda",
  "Rodent Repellent System",
  "Water Leak System",
];

export const initialClients = [
  { id: 1, name: "Apex Tech Park", contact: "Rohan Mehta", phone: "+91 98765 43210", email: "admin@apextech.in", portalEmail: "customer@fireguard.local", portalPassword: "customer123", address: "Sector 62, Noida, Uttar Pradesh", service: "Fire Alarm System", startDate: "2026-01-12", nextAmc: "2026-06-18", amcType: "Quarterly", status: "Active", city: "Noida" },
  { id: 2, name: "Greenview Hospital", contact: "Dr. Kavita Shah", phone: "+91 98112 33445", email: "facility@greenview.in", portalEmail: "greenview@fireguard.local", portalPassword: "greenview123", address: "Gomti Nagar, Lucknow, Uttar Pradesh", service: "Sprinkler System", startDate: "2025-11-05", nextAmc: "2026-06-22", amcType: "Monthly", status: "Active", city: "Lucknow" },
  { id: 3, name: "Orchid Residency", contact: "Amit Suri", phone: "+91 99002 11887", email: "office@orchidresidency.in", portalEmail: "orchid@fireguard.local", portalPassword: "orchid123", address: "Whitefield, Bengaluru, Karnataka", service: "CCTV System", startDate: "2026-02-20", nextAmc: "2026-07-02", amcType: "Quarterly", status: "Active", city: "Bengaluru" },
];

export const initialUsers = [
  { id: 1, role: "Admin", name: "Admin User", email: "admin@fireguard.local", password: "admin123", initials: "AD" },
  { id: 2, role: "Employer", name: "Employer User", email: "employer@fireguard.local", password: "employer123", initials: "EM" },
];

export const initialServices = serviceOptions.map((name, index) => ({
  id: index + 1,
  name,
  category: name.includes("CCTV") || name.includes("Access") || name.includes("Announcement") || name.includes("Rodent") || name.includes("Water Leak") ? "Security & Communication" : "Fire Safety",
  frequency: ["Monthly", "Quarterly", "Half-yearly"][index % 3],
  description: `${name} inspection, testing, maintenance, and compliance reporting.`,
  status: "Active",
}));

export const initialVisits = [
  { id: 101, clientId: 1, date: "2026-03-18", service: "Fire Alarm System", status: "Completed", engineer: "Vikram Singh", notes: "Panel tested, backup battery replaced.", nextDate: "2026-06-18" },
  { id: 102, clientId: 2, date: "2026-05-22", service: "Fire Hydrant", status: "Completed", engineer: "Sahil Khan", notes: "Pump pressure verified and hose reel inspected.", nextDate: "2026-06-22" },
  { id: 103, clientId: 3, date: "2026-04-02", service: "CCTV System", status: "Completed", engineer: "Priya Nair", notes: "Camera alignment corrected in basement area.", nextDate: "2026-07-02" },
];

export const pageMeta = {
  dashboard: ["Dashboard", "Operations overview and alerts"],
  clients: ["Clients", "Manage client details and contracts"],
  services: ["Services", "Manage service catalogue"],
  amc: ["AMC Workflow", "Track schedules, completion, and follow-ups"],
  calendar: ["AMC Calendar", "Plan upcoming maintenance visits"],
  employers: ["Employers", "Manage employer logins and completed AMC work"],
  settings: ["Backup & Access", "Export, import, reset, and role tools"],
  customerDashboard: ["Customer Dashboard", "Review your services, AMC reports, and upcoming visits"],
};
