import { z } from "zod";

export const bookingSchema = z.object({
  mitarbeiterId: z.string().uuid(),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  phone: z.string().optional(),
  company: z.string().optional(),
});

export const rescheduleSchema = z.object({
  token: z.string().trim().min(20).max(200),
  newStartTime: z.string().datetime({ offset: true }),
  newEndTime: z.string().datetime({ offset: true }),
});

export const cancelSchema = z.object({
  token: z.string().trim().min(20).max(200),
  reason: z.string().trim().min(3).max(500),
});
