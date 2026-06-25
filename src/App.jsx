import { useEffect, useMemo, useState } from "react";
import {
  Bell, CalendarDays, CheckCircle2, ClipboardCheck, Download, Edit3, FileJson,
  Gauge, LayoutDashboard, LogIn, LogOut, Menu, Plus, Search, Settings,
  ShieldCheck, Trash2, Upload, UserRound, Users, Wrench, X
} from "lucide-react";
import { pageMeta } from "./data";
import { api } from "./api";
import { calculateNextAMC, exportAMCList, exportBackup, getAmcStatus, prettyDate, serviceUsage, today, validateClient } from "./utils";
import { getReportTemplate, reportStyles } from "./reportFormats";

const navItems = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["clients", "Clients", Users],
  ["services", "Services", Wrench],
  ["amc", "AMC", ClipboardCheck],
  ["calendar", "Calendar", CalendarDays],
  ["employers", "Employers", UserRound],
  ["settings", "Backup", Settings],
];
const amcByOptions = ["Secuite Technologies", "Securite Infra Projects"];
const roleAccess = {
  Admin: {
    label: "Admin",
    description: "Full system access including clients, services, AMC reports, calendar, and backup.",
    nav: ["dashboard", "clients", "services", "amc", "calendar", "employers", "settings"],
    canEdit: true,
    canBackup: true,
    clientScope: "all",
  },
  Employer: {
    label: "Employer",
    description: "Can view AMC reports, client list, service catalogue, and schedules. Backup is hidden.",
    nav: ["dashboard", "clients", "services", "amc", "calendar"],
    canEdit: false,
    canBackup: false,
    clientScope: "all",
  },
  Customer: {
    label: "Customer",
    description: "Can view only their dashboard, services, and completed AMC reports.",
    nav: ["customerDashboard"],
    canEdit: false,
    canBackup: false,
    clientScope: "own",
  },
};
const demoUsers = [
  { role: "Admin", name: "Admin User", email: "admin@fireguard.local", password: "admin123", initials: "AD" },
  { role: "Employer", name: "Employer User", email: "employer@fireguard.local", password: "employer123", initials: "EM" },
  { role: "Customer", name: "Apex Customer", email: "customer@fireguard.local", password: "customer123", initials: "AC", clientId: 1 },
];

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fireguard-user")) || null; }
    catch { return null; }
  });
  const [page, setPage] = useState(currentUser?.role === "Customer" ? "customerDashboard" : "dashboard");
  const [subPage, setSubPage] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [visits, setVisits] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const role = currentUser?.role || "";
  const access = roleAccess[role] || roleAccess.Customer;
  const defaultPageFor = (user) => user?.role === "Customer" ? "customerDashboard" : "dashboard";
  const allowedNavFor = (user) => roleAccess[user?.role]?.nav || [];

  const applySnapshot = (data) => {
    setClients(data.clients);
    setServices(data.services);
    setVisits(data.visits);
    setUsers(data.users || []);
  };

  useEffect(() => {
    api.bootstrap()
      .then(applySnapshot)
      .catch((error) => setDatabaseError(error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (!allowedNavFor(currentUser).includes(page)) {
      setPage(defaultPageFor(currentUser));
      closeSub();
    }
  }, [currentUser, page]);

  const runDatabaseAction = async (action) => {
    try {
      setDatabaseError("");
      return await action();
    } catch (error) {
      setDatabaseError(error.message);
      window.alert(error.message);
      return null;
    }
  };

  const login = ({ email, password, role: selectedRole }) => {
    const cleanEmail = email.trim().toLowerCase();
    const authUsers = users.length ? users : demoUsers.filter((item) => item.role !== "Customer");
    const user = selectedRole === "Customer"
      ? clients.map((client) => ({
        role: "Customer",
        name: client.name,
        email: client.portalEmail || client.email,
        password: client.portalPassword,
        initials: client.name.slice(0, 2).toUpperCase(),
        clientId: client.id,
      })).find((item) => item.email.toLowerCase() === cleanEmail && item.password === password)
      : authUsers.find((item) => item.email.toLowerCase() === cleanEmail && item.password === password && item.role === selectedRole && item.status !== "Paused");
    if (!user) return "Email, password, or login type is incorrect.";
    const sessionUser = { ...user };
    delete sessionUser.password;
    setCurrentUser(sessionUser);
    localStorage.setItem("fireguard-user", JSON.stringify(sessionUser));
    navigate(defaultPageFor(sessionUser), sessionUser);
    return "";
  };

  const logout = () => {
    localStorage.removeItem("fireguard-user");
    setCurrentUser(null);
    setPage("dashboard");
    closeSub();
  };

  const canEdit = access.canEdit;
  const openSub = (next, item = null) => { setSubPage(next); setSelected(item); };
  const closeSub = () => { setSubPage(null); setSelected(null); };
  const navigate = (next, user = currentUser) => {
    const allowedNav = allowedNavFor(user);
    const fallback = defaultPageFor(user);
    setPage(allowedNav.includes(next) ? next : fallback);
    closeSub();
    setQuery("");
    setSidebarOpen(false);
  };

  const saveClient = async (client) => {
    if (!canEdit) return;
    const saved = await runDatabaseAction(() => client.id ? api.updateClient(client) : api.createClient(client));
    if (!saved) return;
    if (client.id) setClients((current) => current.map((item) => item.id === saved.id ? saved : item));
    else setClients((current) => [...current, saved]);
    closeSub();
  };

  const deleteClient = async (client) => {
    if (!canEdit || !window.confirm(`Delete ${client.name}?`)) return;
    const deleted = await runDatabaseAction(() => api.deleteClient(client.id));
    if (!deleted) return;
    setClients((current) => current.filter((item) => item.id !== client.id));
    setVisits((current) => current.filter((visit) => visit.clientId !== client.id));
  };

  const saveService = async (service) => {
    if (!canEdit) return;
    const saved = await runDatabaseAction(() => service.id ? api.updateService(service) : api.createService(service));
    if (!saved) return;
    if (service.id) {
      const oldName = services.find((item) => item.id === service.id)?.name;
      setServices((current) => current.map((item) => item.id === saved.id ? saved : item));
      if (oldName && oldName !== saved.name) setClients((current) => current.map((client) => {
        const servicesList = client.services?.length ? client.services : [client.service];
        if (!servicesList.includes(oldName)) return client;
        const nextServices = servicesList.map((name) => name === oldName ? saved.name : name);
        return { ...client, service: client.service === oldName ? saved.name : client.service, services: nextServices };
      }));
    } else setServices((current) => [...current, saved]);
    closeSub();
  };

  const saveEmployer = async (employer) => {
    if (role !== "Admin") return;
    const saved = await runDatabaseAction(() => api.createUser({ ...employer, role: "Employer" }));
    if (!saved) return;
    setUsers((current) => [...current, saved]);
    closeSub();
  };

  const deleteEmployer = async (employer) => {
    if (role !== "Admin" || !window.confirm(`Delete employer login for ${employer.name}?`)) return;
    const deleted = await runDatabaseAction(() => api.deleteUser(employer.id));
    if (!deleted) return;
    setUsers((current) => current.filter((item) => item.id !== employer.id));
  };

  const deleteService = async (service) => {
    if (!canEdit) return;
    if (clients.some((client) => (client.services?.length ? client.services : [client.service]).includes(service.name))) return window.alert("This service is assigned to clients.");
    if (window.confirm(`Delete ${service.name}?`)) {
      const deleted = await runDatabaseAction(() => api.deleteService(service.id));
      if (!deleted) return;
      setServices((current) => current.filter((item) => item.id !== service.id));
    }
  };

  const completeVisit = async (client, form, report = null) => {
    if (!canEdit) return;
    const nextDate = form.nextDate || calculateNextAMC(client.nextAmc, client.amcType);
    const payload = {
      clientId: client.id,
      date: form.date,
      service: form.service || client.service,
      status: form.status,
      engineer: form.engineer,
      notes: form.notes,
      nextDate,
      amcBy: form.amcBy || client.amcBy || amcByOptions[0],
      scheduledDate: form.scheduledDate || report?.scheduledDate || client.nextAmc,
      reportData: form.reportData || {},
    };
    const saved = await runDatabaseAction(() => report?.id ? api.updateVisit({ ...payload, id: report.id }) : api.createVisit(payload));
    if (!saved) return;
    setVisits((current) => report?.id ? current.map((visit) => visit.id === saved.id ? saved : visit) : [saved, ...current]);
    setClients((current) => current.map((item) => item.id === client.id ? { ...item, nextAmc: nextDate } : item));
    setSelected((current) => current?.client?.id === client.id ? { ...current, client: { ...current.client, nextAmc: nextDate }, visit: saved } : current);
    return saved;
  };

  const restoreBackup = async (data) => {
    const snapshot = await runDatabaseAction(() => api.restore(data));
    if (!snapshot) return false;
    applySnapshot(snapshot);
    return true;
  };

  const visibleClients = access.clientScope === "own"
    ? clients.filter((client) => client.id === currentUser?.clientId)
    : clients;
  const visibleClientIds = new Set(visibleClients.map((client) => client.id));
  const visibleVisits = visits.filter((visit) => visibleClientIds.has(visit.clientId));
  const visibleServices = access.clientScope === "own"
    ? services.filter((service) => visibleClients.some((client) => (client.services?.length ? client.services : [client.service]).includes(service.name)))
    : services;

  if (!currentUser) return <LoginPage loading={loading} databaseError={databaseError} onLogin={login} />;

  const title = subPage ? subTitles[subPage] : pageMeta[page]?.[0] || pageMeta[defaultPageFor(currentUser)][0];
  const subtitle = subPage ? "Review report, save engineer notes, and download PDF" : pageMeta[page]?.[1] || pageMeta[defaultPageFor(currentUser)][1];

  return <div className="app-shell">
    <Sidebar page={page} role={role} user={currentUser} navigate={navigate} open={sidebarOpen} />
    {sidebarOpen && <button className="sidebar-shade" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
    <main className="main">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? <X /> : <Menu />}</button>
        <div className="title-block"><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="top-actions">
          {role !== "Customer" && <label className="global-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search records" /></label>}
          <span className="role-pill"><ShieldCheck size={15} /> {role}</span>
          <button className="icon-button" title="Alerts"><Bell /></button>
          <button className="icon-button" title="Logout" onClick={logout}><LogOut /></button>
          <div className="avatar">{currentUser.initials}</div>
        </div>
      </header>
      <div className="content">
        {loading && <div className="notice"><Gauge size={17} /> Connecting to PostgreSQL...</div>}
        {databaseError && <div className="notice database-error"><Bell size={17} /> Database: {databaseError}</div>}
        {!canEdit && role !== "Customer" && <div className="notice"><ShieldCheck size={17} /> Employer login is read-only. Admin login is required to add, edit, delete, or restore records.</div>}
        {subPage === "addClient" && <ClientForm clients={clients} services={services} onCancel={closeSub} onSave={saveClient} />}
        {subPage === "editClient" && <ClientForm client={selected} clients={clients} services={services} onCancel={closeSub} onSave={saveClient} />}
        {subPage === "clientProfile" && <ClientProfile client={selected} visits={visits} onBack={closeSub} onEdit={(item) => openSub("editClient", item)} onReview={(item, visit = null) => openSub("amcReview", { client: item, visit })} canEdit={canEdit} />}
        {subPage === "addService" && <ServiceForm services={services} onCancel={closeSub} onSave={saveService} />}
        {subPage === "editService" && <ServiceForm service={selected} services={services} onCancel={closeSub} onSave={saveService} />}
        {subPage === "addEmployer" && <EmployerForm users={users} onCancel={closeSub} onSave={saveEmployer} />}
        {subPage === "amcReview" && <AMCReview client={selected?.client || selected} report={selected?.visit || null} visits={visits} canEdit={canEdit} onBack={closeSub} onSave={completeVisit} />}
        {!subPage && page === "dashboard" && <Dashboard clients={visibleClients} services={visibleServices} visits={visibleVisits} navigate={navigate} openReview={(item) => openSub("amcReview", { client: item, visit: null })} role={role} user={currentUser} />}
        {!subPage && page === "customerDashboard" && <CustomerDashboard client={visibleClients[0]} services={visibleServices} visits={visibleVisits} onReport={(client, visit) => openSub("amcReview", { client, visit })} />}
        {!subPage && page === "clients" && <ClientsPage clients={visibleClients} visits={visibleVisits} query={query} canEdit={canEdit} onAdd={() => openSub("addClient")} onView={(item) => openSub("clientProfile", item)} onEdit={(item) => openSub("editClient", item)} onDelete={deleteClient} />}
        {!subPage && page === "services" && <ServicesPage services={visibleServices} clients={visibleClients} query={query} canEdit={canEdit} onAdd={() => openSub("addService")} onEdit={(item) => openSub("editService", item)} onDelete={deleteService} />}
        {!subPage && page === "amc" && <AMCPage clients={visibleClients} query={query} services={visibleServices} onReview={(item) => openSub("amcReview", { client: item, visit: null })} />}
        {!subPage && page === "calendar" && <CalendarPage clients={visibleClients} visits={visibleVisits} query={query} services={visibleServices} setQuery={setQuery} onReview={(item, visit = null) => openSub("amcReview", { client: item, visit })} />}
        {!subPage && page === "employers" && role === "Admin" && <EmployersPage users={users} visits={visits} onAdd={() => openSub("addEmployer")} onDelete={deleteEmployer} />}
        {!subPage && page === "settings" && access.canBackup && <SettingsPage clients={clients} services={services} visits={visits} users={users} role={role} onRestore={restoreBackup} />}
      </div>
    </main>
  </div>;
}

const subTitles = {
  addClient: "Add Client", editClient: "Edit Client", clientProfile: "Client Profile",
  addService: "Add Service", editService: "Edit Service", addEmployer: "Add Employer", amcReview: "AMC Service Review",
};

function LoginPage({ loading, databaseError, onLogin }) {
  const [form, setForm] = useState({ role: "Admin", email: "admin@fireguard.local", password: "admin123" });
  const [error, setError] = useState("");
  const chooseRole = (role) => {
    const user = demoUsers.find((item) => item.role === role);
    setForm({ role, email: user.email, password: user.password });
    setError("");
  };
  const submit = (event) => {
    event.preventDefault();
    setError(onLogin(form));
  };
  return <main className="login-page">
    <section className="login-brand">
      <div className="brand-mark">F</div>
      <span className="eyebrow">FireGuard AMC Manager</span>
      <h1>Sign in to your maintenance workspace</h1>
      <p>Choose the login type for Admin, Employer, or Customer access. Each role opens a different dashboard and permission set.</p>
      <div className="login-access-list">{Object.entries(roleAccess).map(([key, item]) =>
        <button type="button" key={key} className={form.role === key ? "active" : ""} onClick={() => chooseRole(key)}>
          <ShieldCheck size={17} />
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
        </button>
      )}</div>
    </section>
    <form className="login-card" onSubmit={submit}>
      <div className="login-icon"><LogIn /></div>
      <h2>{form.role} Login</h2>
      <p>Demo credentials are filled automatically when you choose a login type.</p>
      {loading && <div className="notice"><Gauge size={17} /> Connecting to PostgreSQL...</div>}
      {databaseError && <div className="notice database-error"><Bell size={17} /> Database: {databaseError}</div>}
      {error && <div className="form-alert"><span>{error}</span></div>}
      <label><span>Login type</span><select value={form.role} onChange={(event) => chooseRole(event.target.value)}><option>Admin</option><option>Employer</option><option>Customer</option></select></label>
      <label><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label><span>Password</span><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
      <button className="primary" type="submit"><LogIn size={16} /> Sign In</button>
    </form>
  </main>;
}

function Sidebar({ page, role, user, navigate, open }) {
  const links = navItems.filter(([key]) => roleAccess[role]?.nav.includes(key));
  if (role === "Customer") links.unshift(["customerDashboard", "My Dashboard", UserRound]);
  return <aside className={`sidebar ${open ? "open" : ""}`}>
    <div className="brand"><div className="brand-mark">F</div><div><strong>FireGuard</strong><span>AMC Manager</span></div></div>
    <nav>{links.map(([key, label, Icon]) => <button key={key} className={page === key ? "active" : ""} onClick={() => navigate(key)}><Icon size={18} /><span>{label}</span></button>)}</nav>
    <div className="sidebar-foot"><div className="avatar small">{user.initials}</div><div><strong>{user.name}</strong><span>{role}</span></div></div>
  </aside>;
}

function Dashboard({ clients, services, visits, navigate, openReview, role, user }) {
  const upcoming = [...clients].sort((a, b) => a.nextAmc.localeCompare(b.nextAmc)).slice(0, 5);
  const overdue = clients.filter((c) => getAmcStatus(c.nextAmc).level === "overdue").length;
  const dueWeek = clients.filter((c) => ["today", "week"].includes(getAmcStatus(c.nextAmc).level)).length;
  const completedMonth = visits.filter((v) => v.status === "Completed" && v.date.slice(0, 7) === today().slice(0, 7)).length;
  const myCompleted = visits.filter((visit) => role === "Employer" && visit.status === "Completed" && visit.engineer.trim().toLowerCase() === user.name.trim().toLowerCase());
  return <>
    <section className="welcome"><div><span className="eyebrow">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</span><h2>{role === "Employer" ? "Employer operations view" : "FireGuard operations cockpit"}</h2><p>{role === "Employer" ? "View AMC reports, clients, services, and schedules without backup access." : "Track contracts, service history, overdue work, and backups from one place."}</p></div><button className="primary" onClick={() => navigate("amc")}><ClipboardCheck size={17} /> Open AMC Workflow</button></section>
    <section className="stats">
      <Stat label="Total Clients" value={clients.length} note="Active contracts" icon={Users} />
      <Stat label="Overdue" value={overdue} note="Needs follow-up" icon={Bell} warning={overdue > 0} />
      <Stat label="Due This Week" value={dueWeek} note="Schedule engineers" icon={CalendarDays} warning={dueWeek > 0} />
      <Stat label="Completed This Month" value={completedMonth} note={`${visits.length} history records`} icon={CheckCircle2} />
    </section>
    {role === "Employer" && <section className="panel employer-work-panel"><div className="panel-head"><h3>My Completed AMC</h3><Badge muted>{myCompleted.length} reports</Badge></div>{myCompleted.length ? myCompleted.slice(0, 6).map((visit) => {
      const client = clients.find((item) => item.id === visit.clientId);
      return <div className="history-row" key={visit.id}><div><strong>{client?.name || "Client"} - {visit.service}</strong><span>{prettyDate(visit.date)} completed by {visit.engineer}</span><p>{visit.notes}</p></div><Badge>{prettyDate(visit.nextDate)}</Badge></div>;
    }) : <div className="empty">No completed AMC reports are assigned to your engineer name yet.</div>}</section>}
    <section className="dashboard-grid">
      <Panel title="Upcoming AMC Visits" action="View calendar" onClick={() => navigate("calendar")}>
        {upcoming.map((c) => <VisitRow key={c.id} client={c} onReview={() => openReview(c)} />)}
      </Panel>
      <Panel title="Service Analytics" action="Manage" onClick={() => navigate("services")}>
        <div className="service-bars">{services.slice(0, 7).map((s) => {
          const count = serviceUsage(clients, s.name);
          return <div key={s.id}><div className="bar-label"><span>{s.name}</span><strong>{count}</strong></div><div className="bar"><i style={{ width: `${Math.min(count * 14, 100)}%` }} /></div></div>;
        })}</div>
      </Panel>
    </section>
  </>;
}

function CustomerDashboard({ client, services, visits, onReport }) {
  if (!client) return <div className="panel empty-customer"><UserRound /><h2>No customer record linked</h2><p>This customer login is not connected with an active client record yet.</p></div>;
  const serviceList = client.services?.length ? client.services : [client.service];
  const history = visits.filter((visit) => visit.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date));
  return <>
    <section className="welcome customer-welcome"><div><span className="eyebrow">Customer dashboard</span><h2>{client.name}</h2><p>{client.address}</p></div><div className="customer-next"><span>Next AMC</span><strong>{prettyDate(client.nextAmc)}</strong><AmcBadge date={client.nextAmc} /></div></section>
    <section className="stats customer-stats">
      <Stat label="Active Services" value={serviceList.length} note="Covered under AMC" icon={Wrench} />
      <Stat label="AMC Reports" value={history.length} note="Completed service visits" icon={ClipboardCheck} />
      <Stat label="AMC Type" value={client.amcType} note="Current contract" icon={CalendarDays} />
      <Stat label="Contact" value={client.contact} note={client.phone} icon={UserRound} />
    </section>
    <section className="dashboard-grid">
      <Panel title="My Services" action="AMC status" onClick={() => {}}>
        <div className="customer-service-list">{services.map((service) =>
          <div key={service.id} className="customer-service"><Wrench size={17} /><div><strong>{service.name}</strong><span>{service.description}</span></div><Badge muted>{service.frequency}</Badge></div>
        )}</div>
      </Panel>
      <Panel title="My AMC Reports" action={`${history.length} reports`} onClick={() => {}}>
        {history.length ? history.map((visit) =>
          <div className="history-row customer-report" key={visit.id}><div><strong>{prettyDate(visit.date)} - {visit.service}</strong><span>{visit.status} by {visit.engineer}</span><p>{visit.notes}</p></div><button className="outline small-btn" onClick={() => onReport(client, visit)}>View Report</button></div>
        ) : <div className="empty">No completed AMC reports yet.</div>}
      </Panel>
    </section>
  </>;
}

function ClientsPage({ clients, visits, query, canEdit, onAdd, onView, onEdit, onDelete }) {
  const filtered = clients.filter((c) => `${c.name} ${(c.services || [c.service]).join(" ")} ${c.city} ${c.gstNumber || ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="panel table-panel"><div className="list-head"><div><h2>Client Directory</h2><p>{filtered.length} clients with service history</p></div>{canEdit && <button className="primary" onClick={onAdd}><Plus size={16} /> Add Client</button>}</div><DataTable heads={["Client", "City", "Service", "Last visit", "Next AMC", "Status", "Actions"]}>{filtered.map((c) => {
    const last = visits.filter((v) => v.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    return <tr key={c.id}><td><NameCell item={c} /></td><td>{c.city || cityFromAddress(c.address)}</td><td>{(c.services?.length ? c.services : [c.service]).join(", ")}</td><td>{last ? prettyDate(last.date) : "-"}</td><td>{prettyDate(c.nextAmc)}</td><td><AmcBadge date={c.nextAmc} /></td><td><div className="row-actions"><button className="outline small-btn" onClick={() => onView(c)}>View</button>{canEdit && <><button className="icon-button mini" onClick={() => onEdit(c)}><Edit3 size={14} /></button><button className="icon-button mini danger-action" onClick={() => onDelete(c)}><Trash2 size={14} /></button></>}</div></td></tr>;
  })}</DataTable></div>;
}

function ServicesPage({ services, clients, query, canEdit, onAdd, onEdit, onDelete }) {
  const filtered = services.filter((s) => `${s.name} ${s.category}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="panel table-panel"><div className="list-head"><div><h2>Service Catalogue</h2><p>{filtered.length} services available</p></div>{canEdit && <button className="primary" onClick={onAdd}><Plus size={16} /> Add Service</button>}</div><DataTable heads={["Service", "Category", "Default AMC", "Clients", "Status", "Actions"]}>{filtered.map((s) => <tr key={s.id}><td><strong>{s.name}</strong><span className="muted-line">{s.description}</span></td><td>{s.category}</td><td>{s.frequency}</td><td>{serviceUsage(clients, s.name)}</td><td><Badge>{s.status}</Badge></td><td>{canEdit && <div className="row-actions"><button className="icon-button mini" onClick={() => onEdit(s)}><Edit3 size={14} /></button><button className="icon-button mini danger-action" onClick={() => onDelete(s)}><Trash2 size={14} /></button></div>}</td></tr>)}</DataTable></div>;
}

function AMCPage({ clients, query, services, onReview }) {
  const [status, setStatus] = useState("all");
  const [service, setService] = useState("all");
  const [format, setFormat] = useState("excel");
  const filtered = clients.filter((c) => {
    const amc = getAmcStatus(c.nextAmc).level;
    const serviceList = c.services?.length ? c.services : [c.service];
    return `${c.name} ${serviceList.join(" ")} ${c.amcType} ${c.city}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || amc === status) && (service === "all" || serviceList.includes(service));
  }).sort((a, b) => a.nextAmc.localeCompare(b.nextAmc));
  return <div className="panel table-panel"><div className="list-head stackable"><div><h2>Annual Maintenance Workflow</h2><p>Filter due work, review reports, and export lists</p></div><div className="filters"><SelectBare value={status} onChange={setStatus} options={["all", "overdue", "today", "week", "soon", "upcoming"]} /><select value={service} onChange={(e) => setService(e.target.value)}><option value="all">All services</option>{services.map((s) => <option key={s.id}>{s.name}</option>)}</select><select value={format} onChange={(e) => setFormat(e.target.value)}><option value="excel">Excel</option><option value="pdf">PDF</option></select><button className="outline" onClick={() => exportAMCList(filtered, format)}><Download size={16} /> Export</button></div></div><DataTable heads={["Client", "Service", "AMC type", "AMC By", "Next AMC", "Status", "Report"]}>{filtered.map((c) => <tr key={c.id}><td><NameCell item={c} /></td><td>{(c.services?.length ? c.services : [c.service]).join(", ")}</td><td><Badge muted>{c.amcType}</Badge></td><td>{c.amcBy || amcByOptions[0]}</td><td><strong>{prettyDate(c.nextAmc)}</strong></td><td><AmcBadge date={c.nextAmc} /></td><td><button className="outline small-btn" onClick={() => onReview(c)}>Review</button></td></tr>)}</DataTable></div>;
}

function CalendarPage({ clients, visits, query, services, setQuery, onReview }) {
  const [month, setMonth] = useState("all");
  const [service, setService] = useState("all");
  const [classification, setClassification] = useState("all");
  const [reportServiceByClient, setReportServiceByClient] = useState({});
  const [reportIdByClient, setReportIdByClient] = useState({});
  const completedReportsForClient = (clientId) => visits.filter((visit) => visit.clientId === clientId && visit.status === "Completed").sort((a, b) => b.date.localeCompare(a.date));
  const latestCompletedByClient = (clientId) => completedReportsForClient(clientId)[0];
  const months = [...new Set([
    ...clients.map((c) => c.nextAmc.slice(0, 7)),
    ...visits.filter((visit) => visit.status === "Completed").map((visit) => visit.date.slice(0, 7)),
  ])].sort();
  const filtered = clients.map((client) => ({ client, completedVisit: latestCompletedByClient(client.id) })).filter(({ client: c, completedVisit }) => {
    const serviceList = c.services?.length ? c.services : [c.service];
    const completedReports = completedReportsForClient(c.id);
    const displayDate = classification === "completed" && completedVisit ? completedVisit.date : c.nextAmc;
    return `${c.name} ${serviceList.join(" ")} ${displayDate}`.toLowerCase().includes(query.toLowerCase())
      && (month === "all" || displayDate.slice(0, 7) === month)
      && (service === "all" || serviceList.includes(service) || completedReports.some((report) => report.service === service))
      && (classification === "all" || (classification === "completed" ? Boolean(completedVisit) : !completedVisit));
  }).sort((a, b) => {
    const aDate = classification === "completed" && a.completedVisit ? a.completedVisit.date : a.client.nextAmc;
    const bDate = classification === "completed" && b.completedVisit ? b.completedVisit.date : b.client.nextAmc;
    return aDate.localeCompare(bDate);
  });
  return <><div className="calendar-tools panel"><div><h2>Upcoming AMC Schedule</h2><p>Filter by completion, month, service, or client</p></div><div className="filters"><select value={classification} onChange={(e) => setClassification(e.target.value)}><option value="all">All AMC</option><option value="completed">Completed AMC</option><option value="pending">Not completed AMC</option></select><label className="input-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client or date" /></label><select value={month} onChange={(e) => setMonth(e.target.value)}><option value="all">All months</option>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select><select value={service} onChange={(e) => setService(e.target.value)}><option value="all">All services</option>{services.map((s) => <option key={s.id}>{s.name}</option>)}</select></div></div><div className="calendar-list">{filtered.map(({ client: c, completedVisit }) => {
    const completedReports = completedReportsForClient(c.id);
    const selectedService = reportServiceByClient[c.id] || "all";
    const serviceReports = selectedService === "all" ? completedReports : completedReports.filter((report) => report.service === selectedService);
    const selectedReport = serviceReports.find((report) => String(report.id) === String(reportIdByClient[c.id])) || serviceReports[0] || completedVisit;
    const isCompletedView = classification === "completed" && selectedReport;
    const displayDate = isCompletedView ? selectedReport.date : c.nextAmc;
    const reportServices = [...new Set(completedReports.map((report) => report.service))];
    return <article className="schedule-card" key={c.id}><DateTile date={displayDate} /><div className="schedule-info">{isCompletedView ? <Badge>Completed AMC</Badge> : <AmcBadge date={c.nextAmc} />}<h3>{c.name}</h3><p>{isCompletedView ? `${selectedReport.service} completed by ${selectedReport.engineer}` : `${(c.services?.length ? c.services : [c.service]).join(", ")} - ${c.amcType} maintenance`}</p>{completedReports.length > 0 && <div className="calendar-report-picker"><select value={selectedService} onChange={(e) => { setReportServiceByClient((current) => ({ ...current, [c.id]: e.target.value })); setReportIdByClient((current) => ({ ...current, [c.id]: "" })); }}><option value="all">All completed services</option>{reportServices.map((name) => <option key={name} value={name}>{name}</option>)}</select><select value={selectedReport?.id || ""} onChange={(e) => setReportIdByClient((current) => ({ ...current, [c.id]: e.target.value }))}>{serviceReports.map((report) => <option key={report.id} value={report.id}>{prettyDate(report.date)} - {report.service}</option>)}</select></div>}</div><div className="schedule-meta"><span>{isCompletedView ? "Completed on" : "Contact"}</span><strong>{isCompletedView ? prettyDate(selectedReport.date) : c.contact}</strong></div><button className="outline" onClick={() => onReview(c, selectedReport || null)}>{selectedReport ? "View Report" : "Review"}</button></article>;
  })}</div></>;
}

function EmployersPage({ users, visits, onAdd, onDelete }) {
  const employers = users.filter((user) => user.role === "Employer");
  const completedFor = (name) => visits.filter((visit) => visit.status === "Completed" && visit.engineer.trim().toLowerCase() === name.trim().toLowerCase());
  return <div className="panel table-panel">
    <div className="list-head"><div><h2>Employer Logins</h2><p>{employers.length} employer accounts can sign in to read AMC work</p></div><button className="primary" onClick={onAdd}><Plus size={16} /> Add Employer</button></div>
    <DataTable heads={["Employer", "Phone", "Login Email", "Completed AMC", "Status", "Actions"]}>{employers.map((employer) => {
      const completed = completedFor(employer.name);
      return <tr key={employer.id}><td><NameCell item={employer} /></td><td>{employer.phone || "-"}</td><td>{employer.email}</td><td><strong>{completed.length}</strong><span className="muted-line">{completed[0] ? `Latest: ${prettyDate(completed[0].date)}` : "No matching reports yet"}</span></td><td><Badge muted>{employer.status || "Active"}</Badge></td><td><button className="icon-button mini danger-action" onClick={() => onDelete(employer)}><Trash2 size={14} /></button></td></tr>;
    })}</DataTable>
  </div>;
}

function EmployerForm({ users, onCancel, onSave }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", initials: "", status: "Active" });
  const [errors, setErrors] = useState([]);
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = (event) => {
    event.preventDefault();
    const nextErrors = [];
    const duplicate = users.some((user) => user.email.trim().toLowerCase() === form.email.trim().toLowerCase());
    if (duplicate) nextErrors.push("A login with this email already exists.");
    if (form.password.trim().length < 6) nextErrors.push("Password must be at least 6 characters.");
    setErrors(nextErrors);
    if (!nextErrors.length) onSave({ ...form, initials: form.initials || initialsFor(form.name) });
  };
  return <FormShell narrow onSubmit={submit} errors={errors} onCancel={onCancel} label="Add Employer">
    <section className="panel form-card"><SectionTitle number="01" title="Employer login" text="Create a read-only employer account" /><div className="form-grid"><Field label="Employer name" name="name" value={form.name} onChange={change} required /><Field label="Phone number" name="phone" value={form.phone} onChange={change} /><Field label="Login email" type="email" name="email" value={form.email} onChange={change} required /><Field label="Password" name="password" value={form.password} onChange={change} required /><Field label="Initials" name="initials" value={form.initials} onChange={change} /><Select label="Status" name="status" value={form.status} onChange={change} options={["Active", "Paused"]} /></div></section>
  </FormShell>;
}

function SettingsPage({ clients, services, visits, users, role, onRestore }) {
  const importBackup = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.clients && data.services && data.visits) {
          if (await onRestore(data)) window.alert("Backup imported successfully.");
        }
      } catch { window.alert("Invalid backup file."); }
    };
    reader.readAsText(file);
  };
  return <div className="settings-grid">
    <section className="panel settings-card"><FileJson /><h2>Backup Data</h2><p>Download a complete JSON backup of clients, services, visits, users, and role.</p><button className="primary" onClick={() => exportBackup({ clients, services, visits, users, role, exportedAt: new Date().toISOString() })}><Download size={16} /> Export Backup</button></section>
    <section className="panel settings-card"><Upload /><h2>Import Backup</h2><p>Restore data from a previous FireGuard JSON export.</p><label className="outline file-control"><Upload size={16} /> Choose File<input type="file" accept="application/json" onChange={importBackup} /></label></section>
    <section className="panel settings-card"><ShieldCheck /><h2>Current Role</h2><p>Signed in as <strong>{role}</strong>. To switch login permissions, sign out and sign in again as Admin, Employer, or Customer.</p></section>
  </div>;
}

function ClientForm({ client, clients, services, onCancel, onSave }) {
  const defaultService = services[0]?.name ?? "";
  const [form, setForm] = useState(client ? { ...client, portalEmail: client.portalEmail || client.email, portalPassword: client.portalPassword || "", services: client.services?.length ? client.services : [client.service] } : { name: "", contact: "", phone: "", email: "", portalEmail: "", portalPassword: "", gstNumber: "", address: "", city: "", service: defaultService, services: defaultService ? [defaultService] : [], amcType: "Quarterly", amcBy: amcByOptions[0], startDate: today(), nextAmc: calculateNextAMC(today(), "Quarterly"), notes: "" });
  const [errors, setErrors] = useState([]);
  const change = (e) => setForm((current) => {
    const next = { ...current, [e.target.name]: e.target.value };
    if (e.target.name === "startDate" || e.target.name === "amcType") next.nextAmc = calculateNextAMC(next.startDate, next.amcType);
    return next;
  });
  const toggleService = (serviceName) => setForm((current) => {
    const currentServices = current.services?.length ? current.services : [current.service].filter(Boolean);
    const nextServices = currentServices.includes(serviceName) ? currentServices.filter((item) => item !== serviceName) : [...currentServices, serviceName];
    return { ...current, services: nextServices, service: nextServices[0] || "" };
  });
  const submit = (event) => {
    event.preventDefault();
    const normalized = { ...form, service: form.services?.[0] || form.service, services: form.services?.length ? form.services : [form.service].filter(Boolean) };
    const nextErrors = validateClient(normalized, clients, client?.id);
    const duplicatePortal = clients.some((item) => item.id !== client?.id && (item.portalEmail || item.email).trim().toLowerCase() === normalized.portalEmail.trim().toLowerCase());
    if (duplicatePortal) nextErrors.push("A customer login with this email already exists.");
    if (!normalized.portalEmail) nextErrors.push("Customer login email is required.");
    if ((normalized.portalPassword || "").trim().length < 6) nextErrors.push("Customer password must be at least 6 characters.");
    setErrors(nextErrors);
    if (!nextErrors.length) onSave({ ...normalized, city: normalized.city || cityFromAddress(normalized.address) });
  };
  return <FormShell onSubmit={submit} errors={errors} onCancel={onCancel} label={client ? "Save Changes" : "Add Client"}>
    <section className="panel form-card"><SectionTitle number="01" title="Client information" text="Business and contact details" /><div className="form-grid"><Field label="Client / company name" name="name" value={form.name} onChange={change} required /><Field label="GST number" name="gstNumber" value={form.gstNumber || ""} onChange={change} /><Field label="Contact person" name="contact" value={form.contact} onChange={change} required /><Field label="Phone number" name="phone" value={form.phone} onChange={change} required /><Field label="Email address" type="email" name="email" value={form.email} onChange={change} required /><Field label="City" name="city" value={form.city || ""} onChange={change} /><Field wide label="Site address" name="address" value={form.address} onChange={change} required /></div></section>
    <section className="panel form-card"><SectionTitle number="02" title="Service and AMC" text="Contract scope and schedule" /><div className="form-grid"><MultiServiceSelect services={services} selected={form.services || []} onToggle={toggleService} /><Select label="AMC By" name="amcBy" value={form.amcBy || amcByOptions[0]} onChange={change} options={amcByOptions} disabled={Boolean(client)} /><Select label="AMC type" name="amcType" value={form.amcType} onChange={change} options={["Monthly", "Quarterly", "Half-yearly", "Annual"]} /><Field label="AMC start date" type="date" name="startDate" value={form.startDate} onChange={change} /><Field label="Next AMC date" type="date" name="nextAmc" value={form.nextAmc} onChange={change} /><Field wide textarea label="Work scope / notes" name="notes" value={form.notes || ""} onChange={change} /></div></section>
    <section className="panel form-card"><SectionTitle number="03" title="Customer portal login" text="Give these credentials to the customer for their dashboard" /><div className="form-grid"><Field label="Customer login email" type="email" name="portalEmail" value={form.portalEmail || ""} onChange={change} required /><Field label="Customer password" name="portalPassword" value={form.portalPassword || ""} onChange={change} required /></div></section>
  </FormShell>;
}

function ServiceForm({ service, services, onCancel, onSave }) {
  const [form, setForm] = useState(service ?? { name: "", category: "Fire Safety", frequency: "Quarterly", description: "", status: "Active" });
  const [errors, setErrors] = useState([]);
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = (event) => {
    event.preventDefault();
    const duplicate = services.some((item) => item.id !== service?.id && item.name.trim().toLowerCase() === form.name.trim().toLowerCase());
    setErrors(duplicate ? ["A service with this name already exists."] : []);
    if (!duplicate) onSave(form);
  };
  return <FormShell narrow onSubmit={submit} errors={errors} onCancel={onCancel} label={service ? "Save Changes" : "Add Service"}><section className="panel form-card"><SectionTitle number="01" title="Service details" text="Catalogue and frequency" /><div className="form-grid"><Field label="Service name" name="name" value={form.name} onChange={change} required /><Select label="Category" name="category" value={form.category} onChange={change} options={["Fire Safety", "Security & Communication", "Other"]} /><Select label="Default AMC frequency" name="frequency" value={form.frequency} onChange={change} options={["Monthly", "Quarterly", "Half-yearly", "Annual"]} /><Select label="Status" name="status" value={form.status} onChange={change} options={["Active", "Paused"]} /><Field wide textarea label="Service description" name="description" value={form.description} onChange={change} /></div></section></FormShell>;
}

function AMCReview({ client, report, visits, canEdit, onBack, onSave }) {
  const latest = visits.filter((visit) => visit.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  const activeReport = report || null;
  const [editingReport, setEditingReport] = useState(!activeReport);
  const [showSignature, setShowSignature] = useState(true);
  const [form, setForm] = useState({
    status: activeReport?.status || "Completed",
    date: activeReport?.date || today(),
    service: activeReport?.service || client.service,
    engineer: activeReport?.engineer || latest?.engineer || "Assigned Engineer",
    notes: activeReport?.notes || latest?.notes || "",
    nextDate: activeReport?.nextDate || calculateNextAMC(client.nextAmc, client.amcType),
    amcBy: activeReport?.amcBy || client.amcBy || amcByOptions[0],
    scheduledDate: activeReport?.scheduledDate || client.nextAmc,
    reportData: activeReport?.reportData || {},
  });
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const save = async (event) => {
    event.preventDefault();
    if (!canEdit) return;
    const saved = await onSave(client, form, activeReport);
    if (saved) {
      setEditingReport(false);
      window.alert("AMC report saved. You can download/print the report now.");
    }
  };
  return <div>
    <div className="review-actions no-print"><button type="button" className="back-button" onClick={onBack}>Back</button><div>{activeReport && !editingReport && canEdit && <button className="outline" onClick={() => setEditingReport(true)}><Edit3 size={16} /> Edit Report</button>}<label className="signature-toggle"><input type="checkbox" checked={showSignature} onChange={(e) => setShowSignature(e.target.checked)} /> Add signature while printing</label><button className="outline" onClick={() => window.print()}><Download size={16} /> Download PDF</button></div></div>
    {activeReport && !editingReport && <div className="notice no-print"><ClipboardCheck size={17} /> Viewing completed AMC report from {prettyDate(activeReport.date)}. Use Edit Report only if you need to correct saved details.</div>}
    {editingReport && <form className="form-layout review-form no-print" onSubmit={save}>
      <section className="panel form-card"><SectionTitle number="01" title={activeReport ? "Edit saved AMC report" : "Save engineer report data"} text={`${form.service} scheduled on ${prettyDate(form.scheduledDate)}`} /><div className="form-grid"><Select label="Required service" name="service" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value, reportData: {} })} options={(client.services?.length ? client.services : [client.service])} /><Select label="Workflow status" name="status" value={form.status} onChange={change} options={["Completed", "In Progress", "Rescheduled", "Missed"]} /><Select label="AMC By" name="amcBy" value={form.amcBy} onChange={change} options={amcByOptions} /><Field label="Visit date" type="date" name="date" value={form.date} onChange={change} /><Field label="Engineer name" name="engineer" value={form.engineer} onChange={change} /><Field label="Scheduled AMC date" type="date" name="scheduledDate" value={form.scheduledDate} onChange={change} /><Field label="Next AMC date" type="date" name="nextDate" value={form.nextDate} onChange={change} /><Field wide textarea label="Engineer notes / checklist result" name="notes" value={form.notes} onChange={change} required /></div></section>
      <ReportContentEditor client={client} report={form} onChange={(ref, value) => setForm((current) => ({ ...current, reportData: { ...current.reportData, [ref]: value } }))} />
      <div className="form-actions">{canEdit ? <button className="primary"><CheckCircle2 size={16} /> {activeReport ? "Update Report" : "Save Report Data"}</button> : <Badge muted>Read only</Badge>}</div>
    </form>}
    <ExcelReport client={client} report={form} showSignature={showSignature} />
  </div>;
}

function ExcelReport({ client, report, showSignature }) {
  const template = getReportTemplate(report.service);
  const ownerIsInfra = report.amcBy === "Securite Infra Projects";
  const totalHeight = template.rows.reduce((sum, row) => sum + row.height, 0);
  const reportScale = Math.min(1, 760 / totalHeight);
  const totalWidth = template.columns.reduce((sum, column) => sum + column.width, 0);
  return <article className="review-sheet excel-report" data-report={template.sheet}>
    <table className="excel-table">
      <colgroup>{template.columns.map((column, index) =>
        <col key={index} style={{ width: `${(column.width / totalWidth) * 100}%` }} />
      )}</colgroup>
      <tbody>{template.rows.map((row) =>
        <tr key={`${template.sheet}-${row.number}`} style={{ height: `${row.height * reportScale}pt` }}>
          {row.cells.map((cell) => {
            const isTitle = cell.value.includes("Preventive Maintenance Report");
            const isSignatureLabel = cell.value.includes("Serina Biswas");
            const centerTitleVertically = isTitle && ["Fire Extinguisher", "Fire Sprinkler", "Vesda"].includes(template.sheet);
            const hasLogo = cell.images?.includes("logo");
            const hasStamp = cell.images?.includes("stamp");
            return <td
              key={cell.ref}
              rowSpan={cell.rowspan}
              colSpan={cell.colspan}
              className={`${isTitle ? "workbook-title-cell" : ""} ${centerTitleVertically ? "workbook-title-center-cell" : ""} ${hasLogo ? "workbook-logo-cell" : ""} ${hasStamp ? "workbook-signature-cell" : ""} ${isSignatureLabel ? "workbook-signature-label-cell" : ""}`}
              style={workbookCellStyle(cell, reportScale)}
            >
              <span className="workbook-cell-text">{fillWorkbookCell(cell, row, client, report)}</span>
              {hasLogo && <OwnerLogo infra={ownerIsInfra} />}
              {hasStamp && showSignature && <img className="signature-stamp" src="/report-assets/image2.png" alt="Authorized signature" />}
            </td>;
          })}
        </tr>
      )}</tbody>
    </table>
  </article>;
}

function OwnerLogo({ infra }) {
  if (infra) return <div className="owner-dummy-logo">SI</div>;
  return <img className="owner-logo" src="/report-assets/image1.jpeg" alt="Securite Technologies" />;
}

function workbookCellStyle(cell, scale) {
  const style = reportStyles[cell.style] || reportStyles[0];
  const border = { ...style.border, ...(cell.mergeBorder || {}) };
  const css = {
    fontFamily: style.font.family || "Arial",
    fontSize: `${Math.max(style.font.size * scale, 5.5)}pt`,
    fontWeight: style.font.bold ? 700 : 400,
    fontStyle: style.font.italic ? "italic" : "normal",
    textDecoration: style.font.underline ? "underline" : "none",
    color: style.font.color || "#000",
    backgroundColor: cell.fill || style.fill || "#fff",
    textAlign: style.align || "left",
    verticalAlign: "middle",
    whiteSpace: style.wrap ? "normal" : "nowrap",
  };
  for (const side of ["top", "right", "bottom", "left"]) {
    const value = border[side];
    css[`border${side[0].toUpperCase()}${side.slice(1)}`] = value
      ? `${value.width} ${value.style} ${value.color}`
      : "none";
  }
  return css;
}

function fillWorkbookCell(cell, row, client, report) {
  if (Object.prototype.hasOwnProperty.call(report.reportData || {}, cell.ref)) return report.reportData[cell.ref];
  const value = cell.value;
  const rowText = row.cells.map((item) => item.value).join(" ").toLowerCase();
  const isDateCell = [14, 15, 16, 17, 22].includes(reportStyles[cell.style]?.numberFormat);
  if (isDateCell && /^\d+(\.\d+)?$/.test(value)) {
    return prettyDate(rowText.includes("next scheduled") ? report.nextDate : report.date);
  }
  if (/digitide solutions/i.test(value)) return client.name;
  if (/icc devi gaurav tech park/i.test(value)) return client.address;
  if (/mr\.?\s*ajit pathak/i.test(value)) return client.contact;
  if (value.replace(/\D/g, "") === "9923388802") return client.phone;
  if (/for securite technologies/i.test(value)) return `For ${report.amcBy}`;
  if (/sikandar|naushad/i.test(value)) return report.engineer;
  return value;
}

function ReportContentEditor({ client, report, onChange }) {
  const template = getReportTemplate(report.service);
  const fields = template.rows.flatMap((row) => row.cells
    .filter((cell) => isEditableReportCell(cell, row))
    .map((cell) => ({
      ...cell,
      label: `${cell.ref} — ${row.cells.find((item) => item.value && item.ref !== cell.ref)?.value || "Report value"}`,
      value: Object.prototype.hasOwnProperty.call(report.reportData || {}, cell.ref)
        ? report.reportData[cell.ref]
        : fillWorkbookCell(cell, row, client, { ...report, reportData: {} }),
    })));
  return <section className="panel form-card report-content-editor">
    <SectionTitle number="02" title="Edit complete report contents" text="System information, status, remarks, deficiencies, recommendations and checklist values" />
    <div className="report-field-grid">{fields.map((field) =>
      <label key={field.ref}><span>{field.label}</span><textarea rows={field.value.length > 80 ? 4 : 2} value={field.value} onChange={(event) => onChange(field.ref, event.target.value)} /></label>
    )}</div>
  </section>;
}

function isEditableReportCell(cell, row) {
  if (cell.images?.length || cell.value.includes("Preventive Maintenance Report")) return false;
  const rowText = row.cells.map((item) => item.value).join(" ").toLowerCase();
  if (/building\/facility|address:|contact person|contact number|date of inspection|next scheduled|conducted by|facility representative|signature:|for securite|serina biswas/.test(rowText)) return false;
  if (/^[a-z]$|^\d+$|^sr\.?no\.?$/i.test(cell.value.trim())) return false;
  return Boolean(cell.value.trim()) && cell.ref[0] !== "A";
}

function ClientProfile({ client, visits, onBack, onEdit, onReview, canEdit }) {
  const history = visits.filter((v) => v.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date));
  const serviceList = client.services?.length ? client.services : [client.service];
  return <><div className="review-actions"><button className="back-button" onClick={onBack}>Back</button><div>{canEdit && <button className="outline" onClick={() => onEdit(client)}><Edit3 size={16} /> Edit</button>}<button className="primary" onClick={() => onReview(client)}><ClipboardCheck size={16} /> Review AMC</button></div></div><div className="profile-grid"><section className="panel profile-main"><div className="profile-hero"><div className="profile-logo">{client.name[0]}</div><div><AmcBadge date={client.nextAmc} /><h2>{client.name}</h2><p>{client.address}</p></div></div><div className="detail-grid"><Detail label="Contact" value={client.contact} /><Detail label="Phone" value={client.phone} /><Detail label="Email" value={client.email} /><Detail label="GST number" value={client.gstNumber || "-"} /><Detail label="City" value={client.city || cityFromAddress(client.address)} /><Detail label="AMC By" value={client.amcBy || amcByOptions[0]} /><Detail label="Customer login" value={client.portalEmail || client.email} /><Detail label="Customer password" value={client.portalPassword || "-"} /></div></section><section className="panel contract-card"><span className="eyebrow">Active contract</span><h2>{serviceList.join(", ")}</h2><div className="contract-date"><span>Next maintenance visit</span><strong>{prettyDate(client.nextAmc)}</strong></div><Detail label="AMC type" value={client.amcType} /><Detail label="Contract status" value={getAmcStatus(client.nextAmc).label} /></section></div><section className="panel history-panel"><div className="panel-head"><h3>Service History</h3><Badge muted>{history.length} records</Badge></div>{history.length ? history.map((v) => <div className="history-row" key={v.id}><div><strong>{prettyDate(v.date)} - {v.status}</strong><span>{v.service} by {v.engineer}</span><p>{v.notes}</p></div><div className="history-actions"><Badge>{prettyDate(v.nextDate)}</Badge><button className="outline small-btn" onClick={() => onReview(client, v)}>View / Edit Report</button></div></div>) : <div className="empty">No service history recorded yet.</div>}</section></>;
}

function Stat({ label, value, note, icon: Icon, warning }) { return <div className="stat"><div className={`stat-icon ${warning ? "warning" : ""}`}><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small className={warning ? "danger" : ""}>{note}</small></div></div>; }
function Panel({ title, action, onClick, children }) { return <div className="panel"><div className="panel-head"><h3>{title}</h3><button className="text-button" onClick={onClick}>{action}</button></div><div>{children}</div></div>; }
function VisitRow({ client, onReview }) { return <div className="visit"><DateTile date={client.nextAmc} /><div className="visit-main"><strong>{client.name}</strong><span>{client.service} - {client.amcType}</span></div><AmcBadge date={client.nextAmc} /><button className="text-button" onClick={onReview}>Review</button></div>; }
function DateTile({ date }) { const d = new Date(date); return <div className="date-tile"><strong>{d.getDate()}</strong><span>{d.toLocaleString("en", { month: "short" })}</span></div>; }
function DataTable({ heads, children }) { return <div className="table-scroll"><table><thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Badge({ children, muted }) { return <span className={`badge ${muted ? "muted" : ""}`}>{children}</span>; }
function AmcBadge({ date }) { const status = getAmcStatus(date); return <span className={`badge amc-${status.level}`}>{status.label}</span>; }
function NameCell({ item }) { return <div className="name-cell"><div className="initial">{item.name[0]}</div><div><strong>{item.name}</strong><span>{item.email}</span></div></div>; }
function Detail({ label, value }) { return <div className="detail"><span>{label}</span><strong>{value}</strong></div>; }
function Field({ label, wide, textarea, ...props }) { return <label className={wide ? "wide" : ""}><span>{label}</span>{textarea ? <textarea rows="4" {...props} /> : <input {...props} />}</label>; }
function Select({ label, options, ...props }) { return <label><span>{label}</span><select {...props}>{options.map((x) => <option key={x}>{x}</option>)}</select></label>; }
function MultiServiceSelect({ services, selected, onToggle }) {
  return <label className="wide"><span>Required services</span><div className="multi-service-list">{services.map((service) => <label key={service.id} className="check-row"><input type="checkbox" checked={selected.includes(service.name)} onChange={() => onToggle(service.name)} /> <span>{service.name}</span></label>)}</div></label>;
}
function SelectBare({ value, onChange, options }) { return <select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((x) => <option key={x} value={x}>{x === "all" ? "All statuses" : x}</option>)}</select>; }
function SectionTitle({ number, title, text }) { return <div className="section-title"><span>{number}</span><div><h2>{title}</h2><p>{text}</p></div></div>; }
function FormShell({ children, onSubmit, onCancel, label, errors, narrow }) { return <form onSubmit={onSubmit} className={`form-layout ${narrow ? "narrow" : ""}`}>{errors?.length > 0 && <div className="form-alert">{errors.map((e) => <span key={e}>{e}</span>)}</div>}{children}<div className="form-actions"><button type="button" className="outline" onClick={onCancel}>Cancel</button><button className="primary" type="submit"><Plus size={16} />{label}</button></div></form>; }
function cityFromAddress(address) { return address?.split(",").at(-2)?.trim() || address?.split(",")[0]?.trim() || ""; }
function initialsFor(name) {
  return String(name || "U").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "U";
}

export default App;
