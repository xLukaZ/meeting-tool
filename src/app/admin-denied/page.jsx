import styles from "@/components/RescheduleClient.module.css";

export const metadata = {
  title: "360 Vista - Kein Admin-Zugriff",
};

export default function AdminDeniedPage() {
  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.errorBox}>
          <h1>Kein Admin-Zugriff</h1>
          <p>
            Dieses System hat bereits einen Admin. Nur dieser Google Account kann
            das Dashboard oeffnen.
          </p>
          <a href="/">Zur Buchungsseite</a>
        </div>
      </section>
    </main>
  );
}
