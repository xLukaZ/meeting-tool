"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./SlotPicker.module.css";

const DEFAULT_DISABLED_WEEKDAYS = [0];
const HIDDEN_WEEKDAYS = [0, 6];
const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr"];

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function formatSelectedDate(date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function isDisabledDate(date, disabledWeekdays) {
  return disabledWeekdays.includes(date.getDay());
}

function nextAvailableDate(date, disabledWeekdays) {
  const copy = new Date(date);
  for (let index = 0; index < 40; index += 1) {
    if (!isDisabledDate(copy, disabledWeekdays)) return copy;
    copy.setDate(copy.getDate() + 1);
  }
  return copy;
}

function createMonthDays(monthDate) {
  const monthStart = startOfMonth(monthDate);
  const gridStart = new Date(monthStart);
  const startOffset = (gridStart.getDay() + 6) % 7;
  gridStart.setDate(gridStart.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export default function SlotPicker({
  selectedEmployeeId,
  selectedSlot,
  onSlotChange,
  disabledWeekdays = DEFAULT_DISABLED_WEEKDAYS,
}) {
  const today = new Date();
  const calendarDisabledWeekdays = useMemo(
    () => Array.from(new Set([...disabledWeekdays, ...HIDDEN_WEEKDAYS])),
    [disabledWeekdays]
  );
  const initialDate = nextAvailableDate(today, calendarDisabledWeekdays);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(initialDate));
  const [selectedDate, setSelectedDate] = useState(null);
  const [pickerView, setPickerView] = useState("calendar");
  const [freeSlots, setFreeSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const monthDays = useMemo(
    () => createMonthDays(monthDate).filter((day) => !HIDDEN_WEEKDAYS.includes(day.getDay())),
    [monthDate]
  );

  const availabilityByDay = useMemo(() => {
    const map = new Map();
    for (const slot of freeSlots) {
      const slotDate = new Date(slot.start);
      map.set(dayKey(slotDate), true);
    }
    return map;
  }, [freeSlots]);

  const availableSlotsForSelectedDay = useMemo(
    () =>
      selectedDate
        ? freeSlots
            .filter((slot) => sameDay(new Date(slot.start), selectedDate))
            .map((slot) => ({
              start: new Date(slot.start),
              end: new Date(slot.end),
            }))
            .sort((a, b) => a.start - b.start)
        : [],
    [freeSlots, selectedDate]
  );

  useEffect(() => {
    if (!selectedEmployeeId) {
      setFreeSlots([]);
      return;
    }

    const controller = new AbortController();
    const from = startOfMonth(monthDate);
    const to = endOfMonth(monthDate);

    async function loadMonthSlots() {
      setLoading(true);
      setError("");
      onSlotChange(null);

      try {
        const params = new URLSearchParams({
          mitarbeiterId: selectedEmployeeId,
          dateFrom: from.toISOString(),
          dateTo: to.toISOString(),
        });
        const response = await fetch(`/api/availability?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Slots konnten nicht geladen werden.");
        }

        setFreeSlots(data.slots || []);
      } catch (err) {
        if (err.name !== "AbortError") {
          setFreeSlots([]);
          setError(err.message || "Slots konnten nicht geladen werden.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadMonthSlots();
    return () => controller.abort();
  }, [selectedEmployeeId, monthDate, onSlotChange]);

  function moveMonth(direction) {
    const nextMonth = new Date(monthDate);
    nextMonth.setMonth(nextMonth.getMonth() + direction);
    setMonthDate(startOfMonth(nextMonth));
    setSelectedDate(null);
    setPickerView("calendar");
    onSlotChange(null);
  }

  function selectDay(day) {
    if (isDisabledDate(day, calendarDisabledWeekdays)) return;
    setSelectedDate(day);
    setPickerView("slots");
    onSlotChange(null);
  }

  function selectSlot(slot) {
    onSlotChange({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
    });
  }

  function backToCalendar() {
    setPickerView("calendar");
    onSlotChange(null);
  }

  return (
    <section className={styles.wrapper}>
      {pickerView === "calendar" && (
      <div className={styles.section}>
        <div className={styles.monthHeader}>
          <div>
            <h2 className={styles.heading}>Termin im Monat wählen</h2>
            <p>{formatMonth(monthDate)}</p>
          </div>
          <div className={styles.monthControls}>
            <button type="button" onClick={() => moveMonth(-1)}>
              Vorheriger Monat
            </button>
            <button type="button" onClick={() => moveMonth(1)}>
              Nächster Monat
            </button>
          </div>
        </div>

        <div className={styles.legend}>
          <span><i className={styles.greenDot} /> verfügbar</span>
          <span><i className={styles.redDot} /> ausgebucht</span>
        </div>

        <div className={styles.monthGrid}>
          {WEEKDAY_LABELS.map((label) => (
            <span className={styles.weekdayLabel} key={label}>{label}</span>
          ))}
          {monthDays.map((day) => {
            const inMonth = day.getMonth() === monthDate.getMonth();
            const disabled = isDisabledDate(day, calendarDisabledWeekdays);
            const hasAvailability = !disabled && availabilityByDay.has(dayKey(day));
            const selected = selectedDate && sameDay(day, selectedDate);

            return (
              <button
                type="button"
                key={day.toISOString()}
                disabled={disabled || !inMonth}
                className={`${styles.dayCell} ${selected ? styles.selectedDay : ""} ${
                  !inMonth ? styles.outsideMonth : ""
                }`}
                onClick={() => selectDay(day)}
              >
                <span>{day.getDate()}</span>
                {inMonth && <i className={hasAvailability ? styles.greenDot : styles.redDot} />}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {pickerView === "slots" && selectedDate && (
      <div className={styles.section}>
        <div className={styles.slotHeader}>
          <div>
            <h2 className={styles.heading}>Uhrzeit wählen</h2>
            <p>{formatSelectedDate(selectedDate)}</p>
          </div>
          <button type="button" className={styles.backButton} onClick={backToCalendar}>
            Zurück zum Kalender
          </button>
        </div>
        {loading && (
          <div className={styles.loadingRow}>
            <span className={styles.spinner} />
            Verfügbarkeiten werden geladen
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {!loading && !error && availableSlotsForSelectedDay.length > 0 && (
          <div className={styles.slotGrid}>
            {availableSlotsForSelectedDay.map((slot) => {
              const isSelected =
                selectedSlot &&
                new Date(selectedSlot.start).getTime() === slot.start.getTime();
              return (
                <button
                  type="button"
                  key={slot.start.toISOString()}
                  className={`${styles.slotButton} ${
                    isSelected ? styles.selectedSlot : ""
                  }`}
                  onClick={() => selectSlot(slot)}
                >
                  {formatTime(slot.start)}
                </button>
              );
            })}
          </div>
        )}
        {!loading && !error && availableSlotsForSelectedDay.length === 0 && (
          <p className={styles.emptyDay}>
            An diesem Tag ist kein freier Termin verfügbar.
          </p>
        )}
      </div>
      )}
    </section>
  );
}
