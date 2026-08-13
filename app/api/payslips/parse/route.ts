import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { PayslipExtractionSchema } from "@/lib/payslipSchema";

const EXTRACTION_PROMPT = `You are extracting figures from an Australian payslip. Payslip layouts vary
widely — read whatever is on the page rather than assuming a fixed format. Extract:

- gross: gross pay for this period
- paygw_tax: PAYG withholding tax for this period
- super: superannuation guarantee contribution for this period
- net: net (take-home) pay for this period
- help_hecs: any HELP/HECS repayment withheld this period (0 if none shown)
- allowances: any separately itemised allowances or loadings (e.g. weekday/Saturday/Sunday
  loading, travel allowance), each as {label, amount}. Empty array if none.
- period_start, period_end: the pay period dates as ISO YYYY-MM-DD, or null if not shown

All money figures are plain numbers (no "$", no commas). If a figure genuinely isn't present
on the payslip, use 0 for money fields or null for dates — never guess a value that isn't shown.`;

function documentContentBlock(bytes: Uint8Array, contentType: string) {
  const data = Buffer.from(bytes).toString("base64");
  if (contentType === "application/pdf") {
    return { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } };
  }
  if (contentType === "image/png") {
    return { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data } };
  }
  if (contentType === "image/webp") {
    return { type: "image" as const, source: { type: "base64" as const, media_type: "image/webp" as const, data } };
  }
  return { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } };
}

function contentTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const payslipId = body?.payslipId;
  if (typeof payslipId !== "string") {
    return NextResponse.json({ error: "payslipId is required" }, { status: 400 });
  }

  const { data: payslip, error: payslipError } = await supabase
    .from("payslips")
    .select("*")
    .eq("id", payslipId)
    .eq("user_id", user.id)
    .single();
  if (payslipError || !payslip) {
    return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
  }
  if (!payslip.file_path) {
    return NextResponse.json({ error: "Payslip has no uploaded file" }, { status: 400 });
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from("payslips").download(payslip.file_path);
  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "Could not download payslip file" }, { status: 500 });
  }

  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  const contentType = contentTypeFromPath(payslip.file_path);

  const anthropic = new Anthropic();
  const message = await anthropic.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    output_config: {
      format: zodOutputFormat(PayslipExtractionSchema),
      effort: "low",
    },
    messages: [
      {
        role: "user",
        content: [documentContentBlock(bytes, contentType), { type: "text", text: EXTRACTION_PROMPT }],
      },
    ],
  });

  if (message.stop_reason === "refusal" || !message.parsed_output) {
    return NextResponse.json({ error: "Could not extract figures from this payslip" }, { status: 422 });
  }

  const extracted = message.parsed_output;

  const { error: updateError } = await supabase
    .from("payslips")
    .update({
      status: "parsed",
      gross: extracted.gross,
      paygw_tax: extracted.paygw_tax,
      super: extracted.super,
      net: extracted.net,
      help_hecs: extracted.help_hecs,
      allowances: extracted.allowances,
      period_start: extracted.period_start,
      period_end: extracted.period_end,
    })
    .eq("id", payslipId);
  if (updateError) {
    return NextResponse.json({ error: "Extracted figures but failed to save them" }, { status: 500 });
  }

  return NextResponse.json({ extracted });
}
