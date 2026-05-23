import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { regeneratePreferences, MissingApiKeyError } from "@/lib/claude";
import { authOptions } from "@/lib/authOptions";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const content = await regeneratePreferences();
    return NextResponse.json({ ok: true, content });
  } catch (err: any) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: err.message, code: "MISSING_API_KEY" },
        { status: 400 }
      );
    }
    console.error("preferences regen error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
