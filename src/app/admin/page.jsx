import { redirect } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { getAdminSession } from "@/lib/session";
import { getHubSpotConfigured } from "@/lib/hubspot";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "360 Vista - Admin",
};

function isRealValue(value) {
  return Boolean(
    value &&
      !value.startsWith("local-") &&
      !value.startsWith("xxx") &&
      !value.includes("placeholder")
  );
}

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect(`/api/admin/login?callbackUrl=${encodeURIComponent("/admin")}`);
  }

  const [hubspot, smtpConfiguredCount] = await Promise.all([
    getHubSpotConfigured(),
    prisma.mitarbeiter.count({
      where: {
        smtpHost: { not: null },
        smtpPort: { not: null },
        smtpUsername: { not: null },
        smtpPassword: { not: null },
        smtpFromEmail: { not: null },
      },
    }),
  ]);

  const integrations = {
    hubspot,
    googleCalendar: Boolean(
      isRealValue(process.env.GOOGLE_CLIENT_ID) &&
        isRealValue(process.env.GOOGLE_CLIENT_SECRET) &&
        isRealValue(process.env.GOOGLE_REDIRECT_URI)
    ),
    smtp: smtpConfiguredCount > 0,
  };

  return <AdminDashboard integrations={integrations} adminEmail={session.googleEmail} />;
}
