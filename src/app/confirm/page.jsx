import styles from "@/components/RescheduleClient.module.css";
import { prisma } from "@/lib/db";
import { getHubSpotConfigured, syncHubSpotUpdate } from "@/lib/hubspot";
import { compactError, findMeetingByToken, isActiveMeeting } from "@/lib/meetings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "360 Vista - Termin bestätigen",
};

async function confirmMeeting(token) {
  const meeting = await findMeetingByToken(token, ["confirmation"]);
  if (!meeting) return { type: "error", title: "Link ungültig" };
  if (!isActiveMeeting(meeting)) {
    return { type: "error", title: "Termin ist nicht mehr aktiv" };
  }
  if (new Date() > meeting.expiresAt) {
    return { type: "error", title: "Link ist abgelaufen" };
  }

  const confirmed = await prisma.meetingToken.update({
    where: { id: meeting.id },
    data: {
      status: "CONFIRMED",
      confirmedAt: meeting.confirmedAt || new Date(),
    },
    include: { mitarbeiter: true },
  });

  if ((await getHubSpotConfigured()) && confirmed.hubspotMeetingId) {
    try {
      await syncHubSpotUpdate({
        meeting: confirmed,
        mitarbeiter: confirmed.mitarbeiter,
        meetLink: confirmed.meetLink,
        outcome: "SCHEDULED",
      });
      await prisma.meetingToken.update({
        where: { id: confirmed.id },
        data: { hubspotSyncStatus: "synced" },
      });
    } catch (err) {
      await prisma.meetingToken.update({
        where: { id: confirmed.id },
        data: { hubspotSyncStatus: "failed", syncError: compactError(err) },
      });
    }
  }

  return {
    type: "success",
    title: "Termin bestätigt",
    meetLink: confirmed.meetLink,
  };
}

export default async function ConfirmPage({ searchParams }) {
  const params = await searchParams;
  const result = await confirmMeeting(params?.token);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={result.type === "success" ? styles.successBox : styles.errorBox}>
          <h1>{result.title}</h1>
          {result.type === "success" ? (
            <>
              <p>Danke, der Termin ist jetzt als bestätigt markiert.</p>
              {result.meetLink && <a href={result.meetLink}>Google Meet öffnen</a>}
            </>
          ) : (
            <>
              <p>Bitte prüfen Sie den Link aus Ihrer E-Mail.</p>
              <a href="/">Zur Buchungsseite</a>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
