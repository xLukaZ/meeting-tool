import { z } from "zod";

export const bookingSchema = z
  .object({
    mitarbeiterId: z.string().uuid(),
    startTime: z.string().datetime({ offset: true }),
    endTime: z.string().datetime({ offset: true }),
    email: z.string().trim().email(),
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    phone: z.string().optional(),
    company: z.string().optional(),
    callerSlug: z.string().trim().max(100).optional(),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "endTime muss nach startTime liegen",
    path: ["endTime"],
  });

export const rescheduleSchema = z
  .object({
    token: z.string().trim().min(20).max(200),
    newStartTime: z.string().datetime({ offset: true }),
    newEndTime: z.string().datetime({ offset: true }),
  })
  .refine((data) => new Date(data.newEndTime) > new Date(data.newStartTime), {
    message: "newEndTime muss nach newStartTime liegen",
    path: ["newEndTime"],
  });

export const cancelSchema = z.object({
  token: z.string().trim().min(20).max(200),
  reason: z.string().trim().min(3).max(500),
});
