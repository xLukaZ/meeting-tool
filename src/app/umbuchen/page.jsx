import { Suspense } from "react";
import RescheduleClient from "@/components/RescheduleClient";

export const metadata = {
  title: "360 Vista – Termin umbuchen",
};

export default function ReschedulePage() {
  return (
    <Suspense fallback={null}>
      <RescheduleClient />
    </Suspense>
  );
}
