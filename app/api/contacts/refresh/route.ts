import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { analyzeContact, MissingApiKeyError } from "@/lib/claude";
import { authOptions } from "@/lib/authOptions";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { email, displayName } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  try {
    const note = await analyzeContact(email, displayName);
    return NextResponse.json({ contact: note });
  } catch (err: any) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: err.message, code: "MISSING_API_KEY" },
        { status: 400 }
      );
    }
    console.error("contact refresh error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
