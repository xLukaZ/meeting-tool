"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import SlotPicker from "@/components/SlotPicker";
import styles from "./RescheduleClient.module.css";

const HIDDEN_WEEKDAYS = [0, 6];

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

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function isHiddenOrDisabled(date, disabledWeekdays = []) {
  return new Set([...disabledWeekdays, ...HIDDEN_WEEKDAYS]).has(date.getDay());
}

function buildSuggestionCandidates(meeting) {
  const start = new Date(meeting.startTime);
  const end = new Date(meeting.endTime);
  const duration = end.getTime() - start.getTime();
  const disabledWeekdays = meeting.disabledWeekdays || [];
  const candidates = [];
  const seen = new Set();

  function pushCandidate(date, type) {
    if (isHiddenOrDisabled(date, disabledWeekdays)) return;
    const key = date.toISOString();
    if (seen.has(key)) return;

    seen.add(key);
    candidates.push({
      type,
      start: key,
      end: new Date(date.getTime() + duration).toISOString(),
    });
  }

  for (let offset = 1; offset <= 10; offset += 1) {
    pushCandidate(addDays(start, offset), "sameTime");
  }

  for (let weeks = 1; weeks <= 5; weeks += 1) {
    pushCandidate(addDays(start, weeks * 7), "sameWeekday");
  }

  return candidates;
}

export default function RescheduleClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || searchParams.get("t");

  const [meeting, setMeeting] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const employee = useMemo(() => {
    if (!meeting) return null;
    return {
      id: meeting.mitarbeiterId,
      name: meeting.mitarbeiterName,
      initials: meeting.mitarbeiterName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    };
  }, [meeting]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Link ungültig");
      return;
    }

    let active = true;

    async function loadMeeting() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/reschedule?token=${encodeURIComponent(token)}`);
        const data = await response.json();

        if (!response.ok) {
          if (response.status === 404) throw new Error("Link ungültig");
          if (response.status === 410) throw new Error(data.error || "Bereits storniert");
          throw new Error(data.error || "Termin konnte nicht geladen werden.");
        }

        if (active) {
          setMeeting(data);
        }
      } catch (err) {
        if (active) setError(err.message || "Termin konnte nicht geladen werden.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadMeeting();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!meeting?.mitarbeiterId) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const candidates = buildSuggestionCandidates(meeting);
    if (!candidates.length) {
      setSuggestions([]);
      return;
    }

    async function loadSuggestions() {
      setSuggestionsLoading(true);

      try {
        const starts = candidates.map((candidate) => new Date(candidate.start).getTime());
        const ends = candidates.map((candidate) => new Date(candidate.end).getTime());
        const params = new URLSearchParams({
          mitarbeiterId: meeting.mitarbeiterId,
          dateFrom: new Date(Math.min(...starts)).toISOString(),
          dateTo: new Date(Math.max(...ends)).toISOString(),
        });
        const response = await fetch(`/api/availability?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Vorschläge konnten nicht geladen werden.");

        const availableStarts = new Set(
          (data.slots || []).map((slot) => new Date(slot.start).getTime())
        );
        setSuggestions(
          candidates
            .filter((candidate) => availableStarts.has(new Date(candidate.start).getTime()))
            .slice(0, 6)
        );
      } catch (err) {
        if (err.name !== "AbortError") setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }

    loadSuggestions();
    return () => controller.abort();
  }, [meeting]);

  async function rescheduleMeeting() {
    if (!selectedSlot || !token) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch("/api/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newStartTime: selectedSlot.start,
          newEndTime: selectedSlot.end,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error("Dieser Termin wurde gerade vergeben. Bitte wählen Sie einen anderen Slot.");
        }
        throw new Error(data.error || "Der Termin konnte nicht umgebucht werden.");
      }

      setSuccess({
        type: "rescheduled",
        start: selectedSlot.start,
        end: selectedSlot.end,
        meetLink: data.meetLink || meeting.meetLink,
      });
    } catch (err) {
      setSubmitError(err.message || "Der Termin konnte nicht umgebucht werden.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelMeeting() {
    if (!token) return;
    if (cancelReason.trim().length < 3) {
      setSubmitError("Bitte geben Sie einen kurzen Grund für die Stornierung an.");
      return;
    }

    setCancelling(true);
    setSubmitError("");

    try {
      const response = await fetch("/api/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: cancelReason.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Der Termin konnte nicht storniert werden.");
      }

      setShowCancelModal(false);
      setSuccess({ type: "cancelled" });
    } catch (err) {
      setSubmitError(err.message || "Der Termin konnte nicht storniert werden.");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.centerState}>
          <span className={styles.spinner} />
          Termin wird geladen
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.errorBox}>
            <h1>{error}</h1>
            <p>Bitte prüfen Sie den Link aus Ihrer E-Mail oder buchen Sie einen neuen Termin.</p>
            <a href="/">Zur Buchungsseite</a>
          </div>
        </section>
      </main>
    );
  }

  if (success?.type === "cancelled") {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.successBox}>
            <h1>Ihr Termin wurde storniert</h1>
            <a href="/">Neuen Termin buchen</a>
          </div>
        </section>
      </main>
    );
  }

  if (success?.type === "rescheduled") {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.successBox}>
            <h1>Termin erfolgreich umgebucht</h1>
            <p>
              Neuer Termin: {formatDateTime(success.start)} bis {formatTime(success.end)}
            </p>
            {success.meetLink && <a href={success.meetLink}>Google Meet öffnen</a>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <p>360 Vista</p>
          <h1>Termin umbuchen</h1>
        </header>

        <section className={styles.infoBox}>
          <strong>Aktueller Termin</strong>
          <span>{formatDateTime(meeting.startTime)} bis {formatTime(meeting.endTime)}</span>
          <span>{meeting.mitarbeiterName}</span>
          {meeting.meetLink && <a href={meeting.meetLink}>Google Meet öffnen</a>}
        </section>

        <section className={styles.panel}>
          <h2>Neuen Termin wählen</h2>
          <SuggestionList
            suggestions={suggestions}
            loading={suggestionsLoading}
            selectedSlot={selectedSlot}
            onSelect={setSelectedSlot}
          />
          {employee && (
            <SlotPicker
              employees={[employee]}
              selectedEmployeeId={meeting.mitarbeiterId}
              onEmployeeChange={() => {}}
              selectedSlot={selectedSlot}
              onSlotChange={setSelectedSlot}
              showEmployees={false}
              disabledWeekdays={meeting.disabledWeekdays || [0]}
            />
          )}

          {submitError && <p className={styles.error}>{submitError}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelLink}
              onClick={() => setShowCancelModal(true)}
            >
              Termin stornieren
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!selectedSlot || submitting}
              onClick={rescheduleMeeting}
            >
              {submitting ? (
                <span className={styles.buttonLoading}>
                  <span className={styles.buttonSpinner} />
                  Wird umgebucht
                </span>
              ) : (
                "Termin umbuchen"
              )}
            </button>
          </div>
        </section>
      </div>

      {showCancelModal && (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={styles.modal} role="dialog" aria-modal="true">
            <h2>Termin stornieren?</h2>
            <p>
              Möchten Sie den Termin am {formatDateTime(meeting.startTime)} wirklich
              stornieren?
            </p>
            <label className={styles.reasonField}>
              Grund der Stornierung
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="z.B. Termin passt zeitlich nicht mehr"
              />
            </label>
            {submitError && <p className={styles.error}>{submitError}</p>}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={cancelling}
                onClick={cancelMeeting}
              >
                {cancelling ? "Wird storniert" : "Ja, stornieren"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={cancelling}
                onClick={() => setShowCancelModal(false)}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SuggestionList({ suggestions, loading, selectedSlot, onSelect }) {
  if (loading) {
    return (
      <div className={styles.suggestionBox}>
        <strong>Passende Beispieltermine</strong>
        <span>Vorschläge werden geprüft</span>
      </div>
    );
  }

  if (!suggestions.length) return null;

  return (
    <div className={styles.suggestionBox}>
      <strong>Passende Beispieltermine</strong>
      <div className={styles.suggestionGrid}>
        {suggestions.map((suggestion) => {
          const selected =
            selectedSlot &&
            new Date(selectedSlot.start).getTime() === new Date(suggestion.start).getTime();
          return (
            <button
              type="button"
              key={suggestion.start}
              className={selected ? styles.selectedSuggestion : ""}
              onClick={() => onSelect({ start: suggestion.start, end: suggestion.end })}
            >
              <span>
                {suggestion.type === "sameTime"
                  ? "Gleiche Uhrzeit"
                  : "Gleicher Wochentag"}
              </span>
              <strong>{formatDateTime(suggestion.start)}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}
