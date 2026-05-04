"use client";

import { useState } from "react";
import SlotPicker from "@/components/SlotPicker";
import styles from "@/app/page.module.css";

const initialContact = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
};

function formatDateTime(isoString) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
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

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function BookingPageClient({ employee }) {
  const [step, setStep] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [contact, setContact] = useState(initialContact);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [booking, setBooking] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function updateContact(event) {
    const { name, value } = event.target;
    setContact((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
  }

  function validateContact() {
    const nextErrors = {};
    if (!contact.firstName.trim()) nextErrors.firstName = "Vorname ist Pflicht.";
    if (!contact.lastName.trim()) nextErrors.lastName = "Nachname ist Pflicht.";
    if (!contact.email.trim()) {
      nextErrors.email = "E-Mail ist Pflicht.";
    } else if (!isEmail(contact.email)) {
      nextErrors.email = "Bitte geben Sie eine gültige E-Mail ein.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submitBooking(event) {
    event.preventDefault();
    setSubmitError("");

    if (!selectedSlot) {
      setSubmitError("Bitte wählen Sie zuerst einen freien Termin aus.");
      setStep(1);
      return;
    }

    if (!validateContact()) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mitarbeiterId: employee.id,
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
          email: contact.email.trim(),
          firstName: contact.firstName.trim(),
          lastName: contact.lastName.trim(),
          phone: contact.phone.trim() || undefined,
          company: contact.company.trim() || undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error("Dieser Termin wurde gerade vergeben. Bitte wählen Sie einen anderen Slot.");
        }
        throw new Error(data.error || "Der Termin konnte nicht gebucht werden.");
      }

      setBooking({
        meetLink: data.meetLink,
        email: contact.email.trim(),
        token: data.rescheduleToken || data.token,
      });
      setStep(3);
    } catch (err) {
      setSubmitError(err.message || "Der Termin konnte nicht gebucht werden.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <a className={styles.logo} href="https://360-vista.de">
            360° Vista
          </a>
          <p className={styles.kicker}>{employee.bookingNote}</p>
          <h1>{employee.bookingTitle}</h1>
          <p>{employee.bookingIntro}</p>
        </div>
      </section>

      <div className={styles.shell}>
        <nav className={styles.steps} aria-label="Buchungsschritte">
          {["Termin", "Kontaktdaten", "Bestätigung"].map((label, index) => (
            <span
              key={label}
              className={`${styles.step} ${step === index + 1 ? styles.activeStep : ""}`}
            >
              {index + 1}. {label}
            </span>
          ))}
        </nav>

        {step === 1 && (
          <section className={styles.panel}>
            <div className={styles.employeeSummary}>
              <span>{employee.initials}</span>
              <div>
                <strong>{employee.name}</strong>
                <small>{employee.email}</small>
              </div>
            </div>
            <SlotPicker
              selectedEmployeeId={employee.id}
              selectedSlot={selectedSlot}
              onSlotChange={setSelectedSlot}
              showEmployees={false}
              disabledWeekdays={employee.disabledWeekdays}
            />

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!selectedSlot}
                onClick={() => setStep(2)}
              >
                Weiter
              </button>
            </div>
          </section>
        )}

        {step === 2 && selectedSlot && (
          <section className={styles.panel}>
            <div className={styles.summary}>
              <strong>Gewählter Termin</strong>
              <span>{formatDateTime(selectedSlot.start)} bis {formatTime(selectedSlot.end)}</span>
              <span>{employee.name}</span>
            </div>

            <form className={styles.form} onSubmit={submitBooking}>
              <label>
                Vorname*
                <input
                  name="firstName"
                  value={contact.firstName}
                  onChange={updateContact}
                  autoComplete="given-name"
                />
                {fieldErrors.firstName && <span>{fieldErrors.firstName}</span>}
              </label>

              <label>
                Nachname*
                <input
                  name="lastName"
                  value={contact.lastName}
                  onChange={updateContact}
                  autoComplete="family-name"
                />
                {fieldErrors.lastName && <span>{fieldErrors.lastName}</span>}
              </label>

              <label>
                E-Mail*
                <input
                  name="email"
                  type="email"
                  value={contact.email}
                  onChange={updateContact}
                  autoComplete="email"
                />
                {fieldErrors.email && <span>{fieldErrors.email}</span>}
              </label>

              <label>
                Telefon
                <input
                  name="phone"
                  value={contact.phone}
                  onChange={updateContact}
                  autoComplete="tel"
                />
              </label>

              <label className={styles.fullWidth}>
                Firma
                <input
                  name="company"
                  value={contact.company}
                  onChange={updateContact}
                  autoComplete="organization"
                />
              </label>

              {submitError && <p className={styles.error}>{submitError}</p>}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setStep(1)}
                >
                  Zurück
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className={styles.buttonLoading}>
                      <span className={styles.spinner} />
                      Wird gebucht
                    </span>
                  ) : (
                    "Termin buchen"
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        {step === 3 && booking && selectedSlot && (
          <section className={`${styles.panel} ${styles.confirmation}`}>
            <div className={styles.checkmark}>✓</div>
            <h2>Termin eingetragen</h2>
            <div className={styles.summary}>
              <span>{formatDateTime(selectedSlot.start)} bis {formatTime(selectedSlot.end)}</span>
              <span>{employee.name}</span>
            </div>
            {booking.meetLink && (
              <a className={styles.primaryLink} href={booking.meetLink}>
                Google Meet öffnen
              </a>
            )}
            {booking.token && (
              <a className={styles.secondaryLink} href={`/umbuchen?token=${booking.token}`}>
                Termin umbuchen oder stornieren
              </a>
            )}
            <p>Die E-Mail mit Bestaetigungslink und ICS wurde an {booking.email} gesendet.</p>
            <p>
              Den Termin können Sie über den Link in der E-Mail umbuchen oder stornieren.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
