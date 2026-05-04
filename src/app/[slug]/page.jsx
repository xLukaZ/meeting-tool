import { notFound } from "next/navigation";
import BookingPageClient from "@/components/BookingPageClient";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const employee = await prisma.mitarbeiter.findUnique({
    where: { slug },
    select: { name: true, bookingTitle: true },
  });

  return {
    title: employee
      ? `360 Vista – ${employee.bookingTitle}`
      : "360 Vista – Termin buchen",
  };
}

export default async function EmployeeBookingPage({ params }) {
  const { slug } = await params;
  const employee = await prisma.mitarbeiter.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      email: true,
      slug: true,
      bookingTitle: true,
      bookingIntro: true,
      bookingNote: true,
      disabledWeekdays: true,
      meetingDurationMinutes: true,
      isActive: true,
    },
  });

  if (!employee || !employee.isActive) notFound();

  return (
    <BookingPageClient
      employee={{
        ...employee,
        initials: initials(employee.name),
      }}
    />
  );
}
