import { z } from "zod";

// Extraction schema for the Claude payslip-parsing route (spec §7). Kept separate from
// lib/types.ts's Payslip (the DB row shape) since this is specifically what we ask the
// model to return.
export const PayslipExtractionSchema = z.object({
  gross: z.number(),
  paygw_tax: z.number(),
  super: z.number(),
  net: z.number(),
  help_hecs: z.number(),
  allowances: z.array(z.object({ label: z.string(), amount: z.number() })),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
});

export type PayslipExtraction = z.infer<typeof PayslipExtractionSchema>;
