"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./AdminDashboard.module.css";

const NAV_ITEMS = [
  { id: "overview", label: "Uebersicht" },
  { id: "bookings", label: "Buchungen" },
  { id: "team", label: "Mitarbeiter" },
  { id: "settings", label: "Einstellungen" },
];

const STATUS_LABELS = {
  PENDING: "Ausstehend",
  CONFIRMED: "Bestaetigt",
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

const DEFAULT_EMAIL_TEMPLATES = {
  booking: {
    active: true,
    subject: "Ihr Meeting mit {{mitarbeiterName}}",
    body:
      "Hallo {{firstName}},\n\nIhr Termin am {{datum}} wurde eingetragen.\nMeeting-Link: {{meetLink}}\n\nBestaetigen: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  reminderUnconfirmed: {
    active: true,
    subject: "Bitte bestaetigen Sie Ihren Termin mit {{mitarbeiterName}}",
    body:
      "Hallo {{firstName}},\n\nIhr Termin am {{datum}} ist noch nicht bestaetigt.\nMeeting-Link: {{meetLink}}\n\nBestaetigen: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  reminderConfirmed: {
    active: true,
    subject: "Erinnerung: Ihr Termin mit {{mitarbeiterName}}",
    body:
      "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} findet am {{datum}} statt.\nMeeting-Link: {{meetLink}}",
  },
  reschedule: {
    active: true,
    subject: "Ihr Meeting wurde auf {{datum}} verschoben",
    body:
      "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} wurde umgebucht.\nNeuer Termin: {{datum}}\nMeeting-Link: {{meetLink}}\n\nBestaetigen: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  cancellation: {
    active: true,
    subject: "Ihr Meeting vom {{datum}} wurde storniert",
    body:
      "Hallo {{firstName}},\n\nder Termin mit {{mitarbeiterName}} am {{datum}} wurde storniert.\n{{reason}}",
  },
};

const TEMPLATE_LABELS = {
  booking: "Buchungsmail",
  reminderUnconfirmed: "Reminder nicht bestaetigt",
  reminderConfirmed: "Reminder bestaetigt",
  reschedule: "Umbuchungsmail",
  cancellation: "Stornomail",
};

function emptyTeamForm() {
  return {
    name: "",
    email: "",
    slug: "",
    isActive: true,
    bookingTitle: "Termin buchen",
    bookingIntro: "Waehlen Sie einen freien Termin fuer ein persoenliches Beratungsgespraech.",
    bookingNote: "360 Vista Beratung per Google Meet",
    disabledWeekdays: [0],
    meetingDurationMinutes: 30,
    workStartMinutes: 480,
    workEndMinutes: 1080,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: true,
    smtpUsername: "",
    smtpPassword: "",
    smtpFromName: "",
    smtpFromEmail: "",
    icsDescription: "Ihr Termin mit 360 Vista findet per Google Meet statt.",
    emailTemplates: DEFAULT_EMAIL_TEMPLATES,
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
        const [meetingsResponse, teamResponse] = await Promise.all([
          fetch("/api/meetings?limit=500"),
          fetch("/api/team"),
        ]);
        const [meetingsData, teamData] = await Promise.all([
          meetingsResponse.json(),
          teamResponse.json(),
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
      employees: team.length,
    };
  }, [meetings, team]);

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
      emailTemplates: {
        ...DEFAULT_EMAIL_TEMPLATES,
        ...(person.emailTemplates || {}),
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

      setTeam((current) => current.map((person) => (person.id === data.id ? data : person)));
      setEditingPerson(null);
      setIntegrationState((current) => ({
        ...current,
        smtp: team.some((person) => person.smtpConfigured) || data.smtpConfigured,
      }));
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
              <StatCard label="Heute" value={stats.today} />
              <StatCard label="Aktive Termine" value={stats.active} />
              <StatCard label="Sync-Fehler" value={stats.failed} />
              <StatCard label="Mitarbeiter" value={stats.employees} />
            </div>
            <section className={styles.panel}>
              <h2>Naechste Buchungen</h2>
              <MeetingsTable meetings={filteredMeetings.slice(0, 10)} compact />
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
                  <option value="CONFIRMED">Bestaetigt</option>
                  <option value="CANCELLED">Storniert</option>
                </select>
              </div>
            </div>
            <MeetingsTable meetings={filteredMeetings} />
          </section>
        )}

        {!loading && !error && activeView === "team" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Mitarbeiter</h2>
              <button type="button" className={styles.primaryButton} onClick={openCreatePerson}>
                Mitarbeiter hinzufuegen
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
              <IntegrationRow label="HubSpot" connected={integrationState.hubspot} detail="Token liegt verschluesselt in der Datenbank." />
              <IntegrationRow label="Google Calendar API" connected={integrationState.googleCalendar} detail="Mitarbeiter verbinden ihren Kalender per OAuth." />
              <IntegrationRow label="SMTP pro Mitarbeiter" connected={integrationState.smtp} detail="Alle Auto-Mails laufen ueber den Mitarbeiter-SMTP." />
            </section>
          </div>
        )}
      </section>

      {showTeamModal && (
        <div className={styles.modalBackdrop} role="presentation">
          <form className={styles.modal} onSubmit={addTeamMember}>
            <h2>Mitarbeiter hinzufuegen</h2>
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
              Buchungsseiten-Ueberschrift
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
                  <input type="password" value={teamForm.smtpPassword} placeholder="Leer lassen = nicht aendern" onChange={(event) => updateForm("smtpPassword", event.target.value)} />
                </label>
                <label>
                  From Name
                  <input value={teamForm.smtpFromName} onChange={(event) => updateForm("smtpFromName", event.target.value)} />
                </label>
                <label>
                  From E-Mail
                  <input type="email" value={teamForm.smtpFromEmail} onChange={(event) => updateForm("smtpFromEmail", event.target.value)} />
                </label>
                <Toggle label="SMTP secure" checked={teamForm.smtpSecure} onClick={() => updateForm("smtpSecure", !teamForm.smtpSecure)} />
              </div>
            </fieldset>

            <label>
              ICS Beschreibung
              <textarea value={teamForm.icsDescription} onChange={(event) => updateForm("icsDescription", event.target.value)} />
            </label>

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

function MeetingsTable({ meetings, compact = false }) {
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
            {compact && <th>Meet</th>}
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
              {compact && (
                <td>
                  {meeting.meetLink ? (
                    <a className={styles.tableLink} href={meeting.meetLink}>
                      Oeffnen
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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

function EmailTemplateEditor({ title, template, onChange }) {
  return (
    <section className={styles.templateCard}>
      <h3>{title}</h3>
      <label>
        Betreff
        <input value={template.subject || ""} onChange={(event) => onChange("subject", event.target.value)} />
      </label>
      <label>
        Inhalt
        <textarea value={template.body || ""} onChange={(event) => onChange("body", event.target.value)} />
      </label>
    </section>
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
