import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const employee = await prisma.mitarbeiter.findFirst({
    where: { isActive: true, slug: { not: null } },
    orderBy: { name: "asc" },
    select: { slug: true },
  });

  if (employee?.slug) redirect(`/${employee.slug}`);
  redirect("/admin");
}
