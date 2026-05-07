import { redirect } from "next/navigation";
import { renderEmailPreview } from "@/lib/mailer";

// Only accessible in development — hard redirect in production
export default function EmailPreviewPage() {
  if (process.env.NODE_ENV === "production") redirect("/");

  const FAKE = {
    confirmLink: "http://localhost:3000/confirm?token=PREVIEW",
    rescheduleLink: "http://localhost:3000/umbuchen?token=PREVIEW",
    cancelLink: "http://localhost:3000/cancel?token=PREVIEW",
    meetLink: "https://meet.google.com/abc-defg-hij",
  };

  const emails = [
    {
      label: "Buchungsmail",
      html: renderEmailPreview({
        body: "Hallo Max,\n\nIhr Termin mit Anna Müller wurde eingetragen.\nDatum: Montag, 12. Mai 2025, 10:00 Uhr\nGoogle Meet: " + FAKE.meetLink,
        meetLink: FAKE.meetLink,
        confirmLink: FAKE.confirmLink,
        rescheduleLink: FAKE.rescheduleLink,
        cancelLink: FAKE.cancelLink,
      }),
    },
    {
      label: "Reminder – nicht bestätigt",
      html: renderEmailPreview({
        body: "Hallo Max,\n\nIhr Termin am Montag, 12. Mai 2025, 10:00 Uhr ist noch nicht bestätigt.\nGoogle Meet: " + FAKE.meetLink,
        meetLink: FAKE.meetLink,
        confirmLink: FAKE.confirmLink,
        rescheduleLink: FAKE.rescheduleLink,
        cancelLink: FAKE.cancelLink,
      }),
    },
    {
      label: "Reminder – bestätigt",
      html: renderEmailPreview({
        body: "Hallo Max,\n\nIhr Termin mit Anna Müller findet am Montag, 12. Mai 2025, 10:00 Uhr statt.\nGoogle Meet: " + FAKE.meetLink,
        meetLink: FAKE.meetLink,
      }),
    },
    {
      label: "Umbuchungsmail",
      html: renderEmailPreview({
        body: "Hallo Max,\n\nIhr Termin mit Anna Müller wurde umgebucht.\nNeuer Termin: Dienstag, 13. Mai 2025, 14:00 Uhr\nGoogle Meet: " + FAKE.meetLink,
        meetLink: FAKE.meetLink,
        confirmLink: FAKE.confirmLink,
        rescheduleLink: FAKE.rescheduleLink,
        cancelLink: FAKE.cancelLink,
      }),
    },
    {
      label: "Stornomail",
      html: renderEmailPreview({
        body: "Hallo Max,\n\nder Termin mit Anna Müller am Montag, 12. Mai 2025, 10:00 Uhr wurde storniert.\nGrund: Terminkonflikt auf unserer Seite.",
      }),
    },
  ];

  return (
    <div style={{ fontFamily: "Arial, sans-serif", background: "#0f172a", minHeight: "100vh", padding: "32px 16px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: "20px 28px", marginBottom: 32, border: "1px solid #334155" }}>
          <h1 style={{ color: "#f1f5f9", margin: 0, fontSize: 20, fontWeight: 800 }}>E-Mail Vorschau</h1>
          <p style={{ color: "#94a3b8", margin: "6px 0 0", fontSize: 14 }}>Nur in Development sichtbar · Buttons sind nicht klickbar</p>
        </div>

        {emails.map(({ label, html }) => (
          <div key={label} style={{ marginBottom: 40 }}>
            <div style={{ background: "#1e293b", borderRadius: "10px 10px 0 0", padding: "12px 20px", border: "1px solid #334155", borderBottom: "none" }}>
              <span style={{ color: "#94a3b8", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
            </div>
            <div
              style={{ border: "1px solid #334155", borderRadius: "0 0 10px 10px", overflow: "hidden" }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
