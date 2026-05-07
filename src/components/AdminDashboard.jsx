"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./AdminDashboard.module.css";

const NAV_ITEMS = [
  { id: "overview", label: "Übersicht" },
  { id: "bookings", label: "Buchungen" },
  { id: "team", label: "Mitarbeiter" },
  { id: "caller", label: "Quellen" },
  { id: "settings", label: "Einstellungen" },
];

const STATUS_LABELS = {
  PENDING: "Ausstehend",
  CONFIRMED: "Bestätigt",
  RESCHEDULED: "Umgebucht",
  CANCELLED: "Storniert",
  COMPLETED: "Abgeschlossen",
};

const WEEKDAYS = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 0, label: "So" },
];

const TEMPLATE_VARIABLES = [
  { key: "firstName", label: "Vorname", desc: "Vorname des Kunden" },
  { key: "lastName", label: "Nachname", desc: "Nachname des Kunden" },
  { key: "mitarbeiterName", label: "Mitarbeiter", desc: "Name des Mitarbeiters" },
  { key: "datum", label: "Datum & Uhrzeit", desc: "Datum und Uhrzeit des Termins" },
  { key: "meetLink", label: "Meet-Link", desc: "Google Meet Link (wird als Button dargestellt)" },
  { key: "confirmLink", label: "Bestätigen-Link", desc: "Link zum Bestätigen (als Button)" },
  { key: "rescheduleLink", label: "Umbuchen-Link", desc: "Link zum Umbuchen (als Button)" },
  { key: "cancelLink", label: "Stornieren-Link", desc: "Link zum Stornieren (als Button)" },
  { key: "reason", label: "Storno-Grund", desc: "Grund der Stornierung (nur Stornomail)" },
];

const DEFAULT_EMAIL_TEMPLATES = {
  booking: {
    subject: "Ihr Meeting mit {{mitarbeiterName}}",
    body: "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} wurde eingetragen.\nDatum: {{datum}}\nGoogle Meet: {{meetLink}}\n\nBitte bestätigen Sie den Termin: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  reminderUnconfirmed: {
    subject: "Bitte bestätigen Sie Ihren Termin mit {{mitarbeiterName}}",
    body: "Hallo {{firstName}},\n\nIhr Termin am {{datum}} ist noch nicht bestätigt.\nGoogle Meet: {{meetLink}}\n\nBestätigen: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  reminderConfirmed: {
    subject: "Erinnerung: Ihr Termin mit {{mitarbeiterName}}",
    body: "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} findet am {{datum}} statt.\nGoogle Meet: {{meetLink}}",
  },
  reschedule: {
    subject: "Ihr Meeting wurde auf {{datum}} verschoben",
    body: "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} wurde umgebucht.\nNeuer Termin: {{datum}}\nGoogle Meet: {{meetLink}}\n\nBestätigen: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  cancellation: {
    subject: "Ihr Meeting vom {{datum}} wurde storniert",
    body: "Hallo {{firstName}},\n\nder Termin mit {{mitarbeiterName}} am {{datum}} wurde storniert.\n{{reason}}",
  },
};

const TEMPLATE_LABELS = {
  booking: "Buchungsmail",
  reminderUnconfirmed: "Reminder nicht bestätigt",
  reminderConfirmed: "Reminder bestätigt",
  reschedule: "Umbuchungsmail",
  cancellation: "Stornomail",
};

const DEFAULT_EMAIL_COLORS = {
  headerBg:   "#0f172a",
  footerBg:   "#f8fafc",
  confirmBtn: "#6b21a8",
  meetBtn:    "#2563eb",
};

const EMAIL_COLOR_FIELDS = [
  { key: "headerBg",   label: "Header" },
  { key: "footerBg",   label: "Footer" },
  { key: "confirmBtn", label: "Bestätigen-Button" },
  { key: "meetBtn",    label: "Meet-Button" },
];

function emptyTeamForm() {
  return {
    name: "",
    email: "",
    slug: "",
    isActive: true,
    bookingTitle: "Termin buchen",
    bookingIntro: "Wählen Sie einen freien Termin für ein persönliches Beratungsgespräch.",
    bookingNote: "360 Vista Beratung per Google Meet",
    disabledWeekdays: [0],
    meetingDurationMinutes: 30,
    workStartMinutes: 480,
    workEndMinutes: 1080,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    reminderLeadMinutes: 1440,
    reminderLeadOptions: [1440],
    reminderConfigs: [{ days: 1, hour: 9, minute: 0 }],
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpUsername: "",
    smtpPassword: "",
    smtpFromName: "",
    smtpFromEmail: "",
    icsDescription: "Ihr Termin mit 360 Vista findet per Google Meet statt.",
    emailTemplates: DEFAULT_EMAIL_TEMPLATES,
    emailColors: { ...DEFAULT_EMAIL_COLORS },
  };
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function isBetween(value, start, end) {
  const date = new Date(value);
  return date >= start && date < end;
}

function isActiveStatus(status) {
  return ["PENDING", "CONFIRMED", "RESCHEDULED"].includes(status);
}

function formatDateTime(isoString) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(isoString));
}

function formatTime(isoString) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(isoString));
}

function minutesToTime(minutes) {
  const hours = Math.floor(Number(minutes || 0) / 60);
  const mins = Number(minutes || 0) % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function contactName(meeting) {
  return `${meeting.firstName || ""} ${meeting.lastName || ""}`.trim();
}

function getReminderInfo(meeting) {
  const reminders = Array.isArray(meeting.reminders) ? meeting.reminders : [];
  if (!reminders.length) return [{ label: "Deaktiviert", tone: "muted" }];

  return reminders.map((reminder) => {
    if (reminder.sentAt) {
      return { label: `Gesendet ${formatDateTime(reminder.sentAt)}`, tone: "sent" };
    }
    if (reminder.status === "failed") {
      return { label: `Fehler ${formatDateTime(reminder.scheduledSendAt)}`, tone: "failed" };
    }
    if (!isActiveStatus(meeting.status)) {
      return { label: "-", tone: "muted" };
    }

    const scheduledAt = new Date(reminder.scheduledSendAt);
    const prefix = scheduledAt <= new Date() ? "Fällig seit" : "Geplant";
    return { label: `${prefix} ${formatDateTime(scheduledAt)}`, tone: scheduledAt <= new Date() ? "due" : "planned" };
  });
}


export default function AdminDashboard({ integrations, adminEmail }) {
  const [activeView, setActiveView] = useState("overview");
  const [meetings, setMeetings] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [teamForm, setTeamForm] = useState(emptyTeamForm());
  const [teamError, setTeamError] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);
  const [callers, setCallers] = useState([]);
  const [callerForm, setCallerForm] = useState({ name: "" });
  const [callerError, setCallerError] = useState("");
  const [savingCaller, setSavingCaller] = useState(false);
  const [editingCaller, setEditingCaller] = useState(null);
  const [hubspotToken, setHubspotToken] = useState("");
  const [savingHubspot, setSavingHubspot] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [integrationState, setIntegrationState] = useState(integrations);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const [meetingsResponse, teamResponse, callersResponse] = await Promise.all([
          fetch("/api/meetings?limit=500"),
          fetch("/api/team"),
          fetch("/api/callers"),
        ]);
        const [meetingsData, teamData, callersData] = await Promise.all([
          meetingsResponse.json(),
          teamResponse.json(),
          callersResponse.json(),
        ]);

        if (!meetingsResponse.ok) {
          throw new Error(meetingsData.error || "Buchungen konnten nicht geladen werden.");
        }
        if (!teamResponse.ok) {
          throw new Error(teamData.error || "Mitarbeiter konnten nicht geladen werden.");
        }

        if (active) {
          setMeetings(meetingsData.meetings || []);
          setTeam(teamData.mitarbeiter || []);
          setCallers(callersData.callers || []);
        }
      } catch (err) {
        if (active) setError(err.message || "Dashboard konnte nicht geladen werden.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const todayStart = startOfDay(new Date());
    const tomorrow = addDays(todayStart, 1);

    return {
      booked: meetings.length,
      confirmed: meetings.filter((meeting) => meeting.status === "CONFIRMED" || meeting.confirmedAt).length,
      rescheduled: meetings.filter((meeting) => meeting.rescheduledAt).length,
      attended: meetings.filter((meeting) => meeting.status === "COMPLETED").length,
      today: meetings.filter(
        (meeting) => isActiveStatus(meeting.status) && isBetween(meeting.startTime, todayStart, tomorrow)
      ).length,
      active: meetings.filter((meeting) => isActiveStatus(meeting.status)).length,
      failed: meetings.filter(
        (meeting) =>
          meeting.googleSyncStatus === "failed" ||
          meeting.hubspotSyncStatus === "failed" ||
          meeting.mailSyncStatus === "failed"
      ).length,
      remindersSent: meetings.reduce(
        (total, meeting) => total + (meeting.reminders || []).filter((reminder) => reminder.sentAt).length,
        0
      ),
    };
  }, [meetings]);

  const filteredMeetings = useMemo(
    () =>
      meetings.filter((meeting) => {
        const statusMatches =
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE" && isActiveStatus(meeting.status)) ||
          meeting.status === statusFilter;
        const employeeMatches =
          employeeFilter === "ALL" || meeting.mitarbeiterId === employeeFilter;
        return statusMatches && employeeMatches;
      }),
    [meetings, statusFilter, employeeFilter]
  );

  function openCreatePerson() {
    setTeamForm(emptyTeamForm());
    setShowTeamModal(true);
    setTeamError("");
  }

  function openEditPerson(person) {
    setTeamForm({
      ...emptyTeamForm(),
      ...person,
      smtpPassword: "",
      reminderConfigs: Array.isArray(person.reminderConfigs) && person.reminderConfigs.length > 0
        ? person.reminderConfigs
        : Array.isArray(person.reminderLeadOptions) && person.reminderLeadOptions.length > 0
          ? person.reminderLeadOptions.map((minutes) => ({
              days: Math.floor(minutes / (24 * 60)),
              hour: 9,
              minute: 0,
            }))
          : [],
      emailTemplates: {
        ...DEFAULT_EMAIL_TEMPLATES,
        ...(person.emailTemplates || {}),
      },
      emailColors: {
        ...DEFAULT_EMAIL_COLORS,
        ...(person.emailColors || {}),
      },
    });
    setEditingPerson(person);
    setTeamError("");
  }

  function updateForm(field, value) {
    setTeamForm((current) => ({ ...current, [field]: value }));
  }

  function toggleDisabledWeekday(day) {
    setTeamForm((current) => {
      const existing = current.disabledWeekdays || [];
      return {
        ...current,
        disabledWeekdays: existing.includes(day)
          ? existing.filter((value) => value !== day)
          : [...existing, day].sort((a, b) => a - b),
      };
    });
  }

  function updateTemplate(key, field, value) {
    setTeamForm((current) => ({
      ...current,
      emailTemplates: {
        ...current.emailTemplates,
        [key]: {
          ...(current.emailTemplates?.[key] || DEFAULT_EMAIL_TEMPLATES[key]),
          [field]: value,
        },
      },
    }));
  }

  async function addTeamMember(event) {
    event.preventDefault();
    setSavingTeam(true);
    setTeamError("");

    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: teamForm.name,
          email: teamForm.email,
          slug: teamForm.slug,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Mitarbeiter konnte nicht angelegt werden.");

      setTeam((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      setShowTeamModal(false);
      setTeamForm(emptyTeamForm());
    } catch (err) {
      setTeamError(err.message || "Mitarbeiter konnte nicht angelegt werden.");
    } finally {
      setSavingTeam(false);
    }
  }

  async function saveTeamMember(event) {
    event.preventDefault();
    if (!editingPerson) return;

    setSavingTeam(true);
    setTeamError("");

    try {
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingPerson.id, ...teamForm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Mitarbeiter konnte nicht gespeichert werden.");

      setTeam((current) => {
        const updated = current.map((person) => (person.id === data.id ? data : person));
        setIntegrationState((s) => ({ ...s, smtp: updated.some((p) => p.smtpConfigured) }));
        return updated;
      });
      setEditingPerson(null);
    } catch (err) {
      setTeamError(err.message || "Mitarbeiter konnte nicht gespeichert werden.");
    } finally {
      setSavingTeam(false);
    }
  }

  async function disconnectCalendar(person) {
    setTeamError("");
    try {
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: person.id, disconnectCalendar: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kalender konnte nicht getrennt werden.");
      setTeam((current) => current.map((item) => (item.id === data.id ? data : item)));
    } catch (err) {
      setTeamError(err.message || "Kalender konnte nicht getrennt werden.");
    }
  }

  async function saveCaller(event) {
    event.preventDefault();
    if (!callerForm.name.trim()) return;
    setSavingCaller(true);
    setCallerError("");
    try {
      if (editingCaller) {
        const response = await fetch("/api/callers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingCaller.id, name: callerForm.name }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setCallers((current) => current.map((c) => (c.id === data.id ? data : c)));
        setEditingCaller(null);
      } else {
        const response = await fetch("/api/callers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: callerForm.name }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setCallers((current) => [...current, data]);
      }
      setCallerForm({ name: "" });
    } catch (err) {
      setCallerError(err.message || "Quelle konnte nicht gespeichert werden.");
    } finally {
      setSavingCaller(false);
    }
  }

  async function toggleCallerActive(caller) {
    try {
      const response = await fetch("/api/callers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: caller.id, isActive: !caller.isActive }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCallers((current) => current.map((c) => (c.id === data.id ? data : c)));
    } catch (err) {
      setCallerError(err.message || "Quelle konnte nicht aktualisiert werden.");
    }
  }

  async function saveHubspotToken() {
    if (!hubspotToken.trim()) {
      setSettingsMessage("Bitte HubSpot Private-App Token eintragen.");
      return;
    }

    setSavingHubspot(true);
    setSettingsMessage("");

    try {
      const response = await fetch("/api/settings/hubspot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: hubspotToken.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "HubSpot Token konnte nicht gespeichert werden.");

      setHubspotToken("");
      setIntegrationState((current) => ({ ...current, hubspot: true }));
      setSettingsMessage("HubSpot Token gespeichert.");
    } catch (err) {
      setSettingsMessage(err.message || "HubSpot Token konnte nicht gespeichert werden.");
    } finally {
      setSavingHubspot(false);
    }
  }

  async function deleteMeeting(meeting) {
    const label = `${contactName(meeting) || meeting.email} am ${formatDateTime(meeting.startTime)}`;
      if (!window.confirm(`Termin wirklich löschen?\n\n${label}`)) return;

    setError("");
    try {
      const response = await fetch(`/api/meetings?id=${encodeURIComponent(meeting.id)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Termin konnte nicht gelöscht werden.");
      setMeetings((current) => current.filter((item) => item.id !== meeting.id));
    } catch (err) {
      setError(err.message || "Termin konnte nicht gelöscht werden.");
    }
  }

  return (
    <main className={styles.dashboard}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>360 Vista</div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? styles.activeNav : ""}
              onClick={() => setActiveView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className={styles.main}>
        <header className={styles.mainHeader}>
          <div>
            <p>Admin: {adminEmail}</p>
            <h1>{NAV_ITEMS.find((item) => item.id === activeView)?.label}</h1>
          </div>
        </header>

        {loading && (
          <div className={styles.state}>
            <span className={styles.spinner} />
            Daten werden geladen
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        {!loading && !error && activeView === "overview" && (
          <div className={styles.contentStack}>
            <div className={styles.statsGrid}>
              <StatCard label="Gebucht" value={stats.booked} />
              <StatCard label="Bestätigt" value={stats.confirmed} />
              <StatCard label="Umgebucht" value={stats.rescheduled} />
              <StatCard label="Wahrgenommen" value={stats.attended} />
              <StatCard label="Heute" value={stats.today} />
              <StatCard label="Sync-Fehler" value={stats.failed} />
              <StatCard label="Reminder gesendet" value={stats.remindersSent} />
            </div>
            <section className={styles.panel}>
              <h2>Nächste Buchungen</h2>
              <MeetingsTable meetings={filteredMeetings.slice(0, 10)} compact onDelete={deleteMeeting} />
            </section>
          </div>
        )}

        {!loading && !error && activeView === "bookings" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Alle Buchungen</h2>
              <div className={styles.filterControls}>
                <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}>
                  <option value="ALL">Alle Mitarbeiter</option>
                  {team.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="ALL">Alle Status</option>
                  <option value="ACTIVE">Aktiv</option>
                  <option value="PENDING">Ausstehend</option>
                  <option value="CONFIRMED">Bestätigt</option>
                  <option value="CANCELLED">Storniert</option>
                </select>
              </div>
            </div>
            <MeetingsTable meetings={filteredMeetings} onDelete={deleteMeeting} />
          </section>
        )}

        {!loading && !error && activeView === "team" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Mitarbeiter</h2>
              <button type="button" className={styles.primaryButton} onClick={openCreatePerson}>
                Mitarbeiter hinzufügen
              </button>
            </div>

            {teamError && <p className={styles.error}>{teamError}</p>}

            <div className={styles.teamList}>
              {team.map((person) => (
                <div className={styles.teamRow} key={person.id}>
                  <div>
                    <strong>{person.name}</strong>
                    <span>{person.email}</span>
                    <a className={styles.tableLink} href={person.bookingUrl}>
                      {person.bookingUrl}
                    </a>
                  </div>
                  <span className={`${styles.statusBadge} ${person.isActive ? styles.badgeActive : styles.badgeMuted}`}>
                    {person.isActive ? "Aktiv" : "Inaktiv"}
                  </span>
                  <div className={styles.rowActions}>
                    <span className={`${styles.statusBadge} ${person.calendarConnected ? styles.badgeActive : styles.badgeMuted}`}>
                      {person.calendarConnected ? "Kalender" : "Kein Kalender"}
                    </span>
                    <span className={`${styles.statusBadge} ${person.smtpConfigured ? styles.badgeActive : styles.badgeMuted}`}>
                      {person.smtpConfigured ? "SMTP" : "Kein SMTP"}
                    </span>
                    <button type="button" className={styles.secondaryButton} onClick={() => openEditPerson(person)}>
                      Bearbeiten
                    </button>
                    {person.calendarConnected ? (
                      <button type="button" className={styles.secondaryButton} onClick={() => disconnectCalendar(person)}>
                        Kalender trennen
                      </button>
                    ) : (
                      <a className={styles.secondaryLinkButton} href={`/api/team/connect?mitarbeiterId=${person.id}`}>
                        Kalender verbinden
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && !error && activeView === "caller" && (
          <CallerView
            callers={callers}
            meetings={meetings}
            team={team}
            callerForm={callerForm}
            setCallerForm={setCallerForm}
            editingCaller={editingCaller}
            setEditingCaller={(c) => {
              setEditingCaller(c);
              setCallerForm({ name: c ? c.name : "" });
              setCallerError("");
            }}
            callerError={callerError}
            savingCaller={savingCaller}
            onSave={saveCaller}
            onToggleActive={toggleCallerActive}
          />
        )}

        {!loading && !error && activeView === "settings" && (
          <div className={styles.contentStack}>
            <section className={styles.panel}>
              <h2>HubSpot</h2>
              {settingsMessage && <p className={styles.state}>{settingsMessage}</p>}
              <label className={styles.settingLabel}>
                Private-App Token
                <input
                  type="password"
                  value={hubspotToken}
                  placeholder={integrationState.hubspot ? "Token ist gespeichert" : "pat-na1-..."}
                  onChange={(event) => setHubspotToken(event.target.value)}
                />
              </label>
              <button type="button" className={styles.primaryButton} disabled={savingHubspot} onClick={saveHubspotToken}>
                {savingHubspot ? "Wird gespeichert" : "HubSpot Token speichern"}
              </button>
            </section>

            <section className={styles.panel}>
              <h2>Integrationen</h2>
              <IntegrationRow label="HubSpot" connected={integrationState.hubspot} detail="Token liegt verschlüsselt in der Datenbank." />
              <IntegrationRow label="Google Calendar API" connected={integrationState.googleCalendar} detail="Mitarbeiter verbinden ihren Kalender per OAuth." />
              <IntegrationRow label="SMTP pro Mitarbeiter" connected={integrationState.smtp} detail="Alle Auto-Mails laufen über den Mitarbeiter-SMTP." />
            </section>
          </div>
        )}
      </section>

      {showTeamModal && (
        <div className={styles.modalBackdrop} role="presentation">
          <form className={styles.modal} onSubmit={addTeamMember}>
            <h2>Mitarbeiter hinzufügen</h2>
            <label>
              Name
              <input value={teamForm.name} onChange={(event) => updateForm("name", event.target.value)} />
            </label>
            <label>
              E-Mail
              <input type="email" value={teamForm.email} onChange={(event) => updateForm("email", event.target.value)} />
            </label>
            <label>
              URL-Slug
              <input value={teamForm.slug} placeholder="johannes-boesler" onChange={(event) => updateForm("slug", event.target.value)} />
            </label>
            {teamError && <p className={styles.error}>{teamError}</p>}
            <div className={styles.modalActions}>
              <button type="submit" className={styles.primaryButton} disabled={savingTeam}>
                {savingTeam ? "Wird gespeichert" : "Speichern"}
              </button>
              <button type="button" className={styles.secondaryButton} disabled={savingTeam} onClick={() => setShowTeamModal(false)}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {editingPerson && (
        <div className={styles.modalBackdrop} role="presentation">
          <form className={`${styles.modal} ${styles.wideModal}`} onSubmit={saveTeamMember}>
            <h2>Mitarbeiter bearbeiten</h2>

            <div className={styles.formGrid}>
              <label>
                Name
                <input value={teamForm.name} onChange={(event) => updateForm("name", event.target.value)} />
              </label>
              <label>
                E-Mail
                <input type="email" value={teamForm.email} onChange={(event) => updateForm("email", event.target.value)} />
              </label>
              <label>
                URL-Slug
                <input value={teamForm.slug} onChange={(event) => updateForm("slug", event.target.value)} />
              </label>
              <Toggle label="Mitarbeiter aktiv" checked={teamForm.isActive} onClick={() => updateForm("isActive", !teamForm.isActive)} />
            </div>

            <label>
              Buchungsseiten-Überschrift
              <input value={teamForm.bookingTitle} onChange={(event) => updateForm("bookingTitle", event.target.value)} />
            </label>
            <label>
              Einleitung
              <textarea value={teamForm.bookingIntro} onChange={(event) => updateForm("bookingIntro", event.target.value)} />
            </label>
            <label>
              Notiz / Tagline
              <input value={teamForm.bookingNote} onChange={(event) => updateForm("bookingNote", event.target.value)} />
            </label>

            <fieldset className={styles.weekdayFieldset}>
              <legend>Terminregeln</legend>
              <div className={styles.formGrid}>
                <label>
                  Dauer in Minuten
                  <input type="number" min="15" max="240" value={teamForm.meetingDurationMinutes} onChange={(event) => updateForm("meetingDurationMinutes", Number(event.target.value))} />
                </label>
                <label>
                  Buffer vorher
                  <input type="number" min="0" max="240" value={teamForm.bufferBeforeMinutes} onChange={(event) => updateForm("bufferBeforeMinutes", Number(event.target.value))} />
                </label>
                <label>
                  Arbeitsbeginn
                  <input type="time" value={minutesToTime(teamForm.workStartMinutes)} onChange={(event) => updateForm("workStartMinutes", timeToMinutes(event.target.value))} />
                </label>
                <label>
                  Arbeitsende
                  <input type="time" value={minutesToTime(teamForm.workEndMinutes)} onChange={(event) => updateForm("workEndMinutes", timeToMinutes(event.target.value))} />
                </label>
                <label>
                  Buffer nachher
                  <input type="number" min="0" max="240" value={teamForm.bufferAfterMinutes} onChange={(event) => updateForm("bufferAfterMinutes", Number(event.target.value))} />
                </label>
              </div>
              <div className={styles.weekdayGrid}>
                {WEEKDAYS.map((day) => (
                  <label key={day.value}>
                    <input type="checkbox" checked={(teamForm.disabledWeekdays || []).includes(day.value)} onChange={() => toggleDisabledWeekday(day.value)} />
                    {day.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className={styles.weekdayFieldset}>
              <legend>SMTP</legend>
              <div className={styles.formGrid}>
                <label>
                  Host
                  <input value={teamForm.smtpHost} onChange={(event) => updateForm("smtpHost", event.target.value)} />
                </label>
                <label>
                  Port
                  <input type="number" value={teamForm.smtpPort} onChange={(event) => updateForm("smtpPort", Number(event.target.value))} />
                </label>
                <label>
                  Username
                  <input value={teamForm.smtpUsername} onChange={(event) => updateForm("smtpUsername", event.target.value)} />
                </label>
                <label>
                  Passwort
                  <input type="password" value={teamForm.smtpPassword} placeholder="Leer lassen = nicht ändern" onChange={(event) => updateForm("smtpPassword", event.target.value)} />
                </label>
                <label>
                  From Name
                  <input value={teamForm.smtpFromName} onChange={(event) => updateForm("smtpFromName", event.target.value)} />
                </label>
                <label>
                  From E-Mail
                  <input type="email" value={teamForm.smtpFromEmail} onChange={(event) => updateForm("smtpFromEmail", event.target.value)} />
                </label>
                <Toggle label="Direktes SSL/TLS (Port 465)" checked={teamForm.smtpSecure} onClick={() => updateForm("smtpSecure", !teamForm.smtpSecure)} />
              </div>
            </fieldset>

            <label>
              ICS Beschreibung
              <textarea value={teamForm.icsDescription} onChange={(event) => updateForm("icsDescription", event.target.value)} />
            </label>

            <fieldset className={styles.weekdayFieldset}>
              <legend>E-Mail Versand</legend>
              <div className={styles.formGrid}>
                <div className={styles.staticSetting}>
                  <span>Buchung, Bestätigung und Absage</span>
                  <strong>Sofort</strong>
                </div>
                <div className={styles.staticSetting}>
                  <span>Reminder-Mails</span>
                  <strong>{(teamForm.reminderConfigs || []).length || "Keine"}</strong>
                </div>
              </div>
              <p className={styles.fieldHint}>
                Lege fest, wann Reminder-Mails versendet werden. Du kannst mehrere Zeitpunkte kombinieren.
              </p>
              <ReminderConfigList
                configs={teamForm.reminderConfigs || []}
                onChange={(configs) => updateForm("reminderConfigs", configs)}
              />
            </fieldset>

            <EmailColorEditor
              colors={teamForm.emailColors || DEFAULT_EMAIL_COLORS}
              onChange={(key, value) =>
                setTeamForm((current) => ({
                  ...current,
                  emailColors: { ...(current.emailColors || DEFAULT_EMAIL_COLORS), [key]: value },
                }))
              }
            />

            <section className={styles.templateGrid}>
              {Object.entries(DEFAULT_EMAIL_TEMPLATES).map(([key]) => (
                <EmailTemplateEditor
                  key={key}
                  title={TEMPLATE_LABELS[key]}
                  template={teamForm.emailTemplates?.[key] || DEFAULT_EMAIL_TEMPLATES[key]}
                  onChange={(field, value) => updateTemplate(key, field, value)}
                />
              ))}
            </section>

            {teamError && <p className={styles.error}>{teamError}</p>}
            <div className={styles.modalActions}>
              <button type="submit" className={styles.primaryButton} disabled={savingTeam}>
                {savingTeam ? "Wird gespeichert" : "Speichern"}
              </button>
              <button type="button" className={styles.secondaryButton} disabled={savingTeam} onClick={() => setEditingPerson(null)}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }) {
  return (
    <div className={styles.statCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MeetingsTable({ meetings, compact = false, onDelete }) {
  if (!meetings.length) return <p className={styles.empty}>Keine Termine gefunden.</p>;

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Kontakt</th>
            <th>E-Mail</th>
            <th>Mitarbeiter</th>
            <th>{compact ? "Uhrzeit" : "Datum/Zeit"}</th>
            <th>Status</th>
            <th>Sync</th>
            <th>Reminder</th>
            {compact && <th>Meet</th>}
            {!compact && <th>Aktion</th>}
          </tr>
        </thead>
        <tbody>
          {meetings.map((meeting) => (
            <tr key={meeting.id}>
              <td>{contactName(meeting) || "Unbekannt"}</td>
              <td>{meeting.email}</td>
              <td>{meeting.mitarbeiter?.name || "Nicht zugeordnet"}</td>
              <td>
                {compact
                  ? `${formatTime(meeting.startTime)} bis ${formatTime(meeting.endTime)}`
                  : formatDateTime(meeting.startTime)}
              </td>
              <td>
                <span className={`${styles.statusBadge} ${meeting.status === "CANCELLED" ? styles.badgeCancelled : styles.badgeActive}`}>
                  {STATUS_LABELS[meeting.status] || meeting.status}
                </span>
              </td>
              <td>
                {[meeting.googleSyncStatus, meeting.hubspotSyncStatus, meeting.mailSyncStatus]
                  .filter(Boolean)
                  .join(" / ")}
              </td>
              <td>
                <ReminderBadge meeting={meeting} />
              </td>
              {compact && (
                <td>
                  {meeting.meetLink ? (
                    <a className={styles.tableLink} href={meeting.meetLink}>
                      Öffnen
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              )}
              {!compact && (
                <td>
                  <button type="button" className={styles.dangerButton} onClick={() => onDelete(meeting)}>
                    Löschen
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReminderBadge({ meeting }) {
  const items = getReminderInfo(meeting);
  return (
    <div className={styles.reminderStack}>
      {items.map((info) => (
        <span key={info.label} className={`${styles.reminderBadge} ${styles[`reminder${info.tone}`] || ""}`}>
          {info.label}
        </span>
      ))}
    </div>
  );
}

function Toggle({ label, checked, onClick }) {
  return (
    <button type="button" className={styles.toggleRow} role="switch" aria-checked={checked} onClick={onClick}>
      <span>{label}</span>
      <span className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}>
        <span />
      </span>
    </button>
  );
}

function CallerView({ callers, meetings, team, callerForm, setCallerForm, editingCaller, setEditingCaller, callerError, savingCaller, onSave, onToggleActive }) {
  const [copied, setCopied] = useState(null);

  const activeTeam = team.filter((m) => m.isActive);

  function callerStats(callerId) {
    const ms = meetings.filter((m) => m.callerId === callerId);
    const total = ms.length;
    const confirmed = ms.filter((m) => m.status === "CONFIRMED" || m.confirmedAt).length;
    const cancelled = ms.filter((m) => m.status === "CANCELLED").length;
    const rescheduled = ms.filter((m) => m.status === "RESCHEDULED").length;
    const completed = ms.filter((m) => m.status === "COMPLETED").length;
    const showRate = (confirmed + completed) > 0
      ? Math.round((completed / (completed + cancelled)) * 100)
      : null;
    return { total, confirmed, cancelled, rescheduled, completed, showRate };
  }

  function copyLink(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function callerLink(callerSlug, mitarbeiterSlug) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/${mitarbeiterSlug}?caller=${callerSlug}`;
  }

  return (
    <div className={styles.contentStack}>
      {/* Add / Edit form */}
      <section className={styles.panel}>
        <h2>{editingCaller ? "Quelle bearbeiten" : "Neue Quelle anlegen"}</h2>
        <form className={styles.callerForm} onSubmit={onSave}>
          <label className={styles.settingLabel}>
            Name
            <input
              value={callerForm.name}
              onChange={(e) => setCallerForm({ name: e.target.value })}
              placeholder="z.B. Cold Caller 1, Instagram Kampagne, Google Ads…"
            />
          </label>
          {callerError && <p className={styles.error}>{callerError}</p>}
          <div className={styles.callerFormActions}>
            <button type="submit" className={styles.primaryButton} disabled={savingCaller || !callerForm.name.trim()}>
              {savingCaller ? "Wird gespeichert…" : editingCaller ? "Speichern" : "Quelle anlegen"}
            </button>
            {editingCaller && (
              <button type="button" className={styles.secondaryButton} onClick={() => setEditingCaller(null)}>
                Abbrechen
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Caller list */}
      {callers.length === 0 ? (
        <p className={styles.empty}>Noch keine Quellen angelegt.</p>
      ) : (
        callers.map((caller) => {
          const s = callerStats(caller.id);
          return (
            <section key={caller.id} className={`${styles.panel} ${!caller.isActive ? styles.callerInactive : ""}`}>
              <div className={styles.callerHeader}>
                <div className={styles.callerName}>
                  <strong>{caller.name}</strong>
                  {!caller.isActive && <span className={styles.callerBadgeOff}>Inaktiv</span>}
                </div>
                <div className={styles.callerActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setEditingCaller(caller)}>
                    Bearbeiten
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={() => onToggleActive(caller)}>
                    {caller.isActive ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className={styles.callerStats}>
                <div className={styles.callerStat}><span>Gebucht</span><strong>{s.total}</strong></div>
                <div className={styles.callerStat}><span>Bestätigt</span><strong>{s.confirmed}</strong></div>
                <div className={styles.callerStat}><span>Abgeschlossen</span><strong>{s.completed}</strong></div>
                <div className={styles.callerStat}><span>Storniert</span><strong>{s.cancelled}</strong></div>
                <div className={styles.callerStat}><span>Umgebucht</span><strong>{s.rescheduled}</strong></div>
                <div className={styles.callerStat}>
                  <span>Showrate</span>
                  <strong>{s.showRate !== null ? `${s.showRate}%` : "–"}</strong>
                </div>
              </div>

              {/* Booking links */}
              {activeTeam.length > 0 && (
                <div className={styles.callerLinks}>
                  <p className={styles.fieldHint}>Buchungslinks für diese Quelle:</p>
                  {activeTeam.map((m) => {
                    const link = callerLink(caller.slug, m.slug || m.bookingUrl?.replace("/", ""));
                    const key = `${caller.id}-${m.id}`;
                    return (
                      <div key={m.id} className={styles.callerLinkRow}>
                        <span className={styles.callerLinkLabel}>{m.name}</span>
                        <code className={styles.callerLinkUrl}>{link}</code>
                        <button
                          type="button"
                          className={styles.callerCopyBtn}
                          onClick={() => copyLink(link, key)}
                        >
                          {copied === key ? "✓ Kopiert" : "Kopieren"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

function EmailColorEditor({ colors, onChange }) {
  return (
    <section className={styles.colorEditorSection}>
      <h3 className={styles.colorEditorTitle}>Mail-Design</h3>
      <div className={styles.colorEditorGrid}>
        {EMAIL_COLOR_FIELDS.map(({ key, label }) => {
          const value = colors[key] || DEFAULT_EMAIL_COLORS[key];
          return (
            <label key={key} className={styles.colorEditorField}>
              <span>{label}</span>
              <div className={styles.colorEditorInput}>
                <input
                  type="color"
                  value={value}
                  onChange={(e) => onChange(key, e.target.value)}
                />
                <input
                  type="text"
                  value={value}
                  maxLength={7}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(key, v);
                  }}
                />
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function EmailTemplateEditor({ title, template, onChange }) {
  const [showVars, setShowVars] = useState(false);
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);

  function insertVariable(key) {
    const placeholder = `{{${key}}}`;
    const activeEl = document.activeElement;
    const isSubject = activeEl === subjectRef.current;
    const isBody = activeEl === bodyRef.current;

    if (isSubject) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + placeholder + el.value.slice(end);
      onChange("subject", next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + placeholder.length, start + placeholder.length);
      });
    } else {
      const el = bodyRef.current;
      const start = el ? (el.selectionStart ?? el.value.length) : (template.body || "").length;
      const end = el ? (el.selectionEnd ?? el.value.length) : start;
      const current = template.body || "";
      const next = current.slice(0, start) + placeholder + current.slice(end);
      onChange("body", next);
      if (el) {
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(start + placeholder.length, start + placeholder.length);
        });
      }
    }
  }

  return (
    <section className={styles.templateCard}>
      <h3>{title}</h3>
      <label>
        Betreff
        <input
          ref={subjectRef}
          value={template.subject || ""}
          onChange={(event) => onChange("subject", event.target.value)}
        />
      </label>
      <label>
        Inhalt
        <textarea
          ref={bodyRef}
          value={template.body || ""}
          onChange={(event) => onChange("body", event.target.value)}
        />
      </label>

      <div className={styles.varSection}>
        <button
          type="button"
          className={styles.varToggle}
          onClick={() => setShowVars((v) => !v)}
        >
          {showVars ? "▾" : "▸"}&nbsp; Verfügbare Platzhalter
        </button>
        {showVars && (
          <div className={styles.varGrid}>
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                className={styles.varChip}
                title={`${v.desc} — klicken zum Einfügen`}
                onClick={() => insertVariable(v.key)}
              >
                <code>{`{{${v.key}}}`}</code>
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ReminderConfigList({ configs, onChange }) {
  const [addDays, setAddDays] = useState("1");
  const [addTime, setAddTime] = useState("09:00");

  function handleAdd() {
    const days = parseInt(addDays, 10);
    if (!Number.isInteger(days) || days < 0 || days > 30) return;
    const [h, m] = addTime.split(":").map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return;
    const newEntry = { days, hour: h, minute: m };
    const key = JSON.stringify(newEntry);
    if (configs.some((c) => JSON.stringify(c) === key)) return;
    onChange([...configs, newEntry]);
    setAddDays("1");
    setAddTime("09:00");
  }

  function handleRemove(index) {
    onChange(configs.filter((_, i) => i !== index));
  }

  function configLabel(c) {
    const time = `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")} Uhr`;
    if (c.days === 0) return `Am Tag des Termins um ${time}`;
    return `${c.days} ${c.days === 1 ? "Tag" : "Tage"} vorher um ${time}`;
  }

  return (
    <div className={styles.reminderConfigSection}>
      {configs.length === 0 && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>Keine Reminder konfiguriert – es werden keine Reminder-Mails versendet.</p>
      )}
      {configs.map((c, i) => (
        <div key={i} className={styles.reminderConfigRow}>
          <span>{configLabel(c)}</span>
          <button type="button" className={styles.reminderRemoveBtn} onClick={() => handleRemove(i)} aria-label="Entfernen">✕</button>
        </div>
      ))}
      <div className={styles.reminderAddRow}>
        <input
          type="number"
          min="0"
          max="30"
          value={addDays}
          onChange={(e) => setAddDays(e.target.value)}
          className={styles.reminderDaysInput}
        />
        <span className={styles.reminderAddLabel}>Tage vorher um</span>
        <input
          type="time"
          value={addTime}
          onChange={(e) => setAddTime(e.target.value)}
          className={styles.reminderTimeInput}
        />
        <button type="button" className={styles.secondaryButton} onClick={handleAdd}>
          + Hinzufügen
        </button>
      </div>
    </div>
  );
}

function IntegrationRow({ label, connected, detail }) {
  return (
    <div className={styles.integrationRow}>
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <span className={`${styles.statusBadge} ${connected ? styles.badgeActive : styles.badgeMuted}`}>
        {connected ? "Verbunden" : "Nicht verbunden"}
      </span>
    </div>
  );
}
