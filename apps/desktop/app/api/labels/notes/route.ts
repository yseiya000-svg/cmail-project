import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { readLabelNote, writeLabelNote, listLabelNotes } from "@/lib/obsidian";
import { authOptions } from "@/lib/authOptions";
import type { LabelNote } from "@/types";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const labelName = req.nextUrl.searchParams.get("labelName");
  if (labelName) {
    const note = readLabelNote(labelName);
    return NextResponse.json({ note });
  }
  return NextResponse.json({ notes: listLabelNotes() });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const note = (await req.json()) as LabelNote;
  if (!note?.labelName) {
    return NextResponse.json({ error: "labelName required" }, { status: 400 });
  }
  try {
    writeLabelNote(note);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
