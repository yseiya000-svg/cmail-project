import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { listContacts, readContact, writeContact } from "@/lib/obsidian";
import { authOptions } from "@/lib/authOptions";
import type { ContactNote } from "@/types";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = req.nextUrl.searchParams.get("email");
  if (email) {
    const note = readContact(email);
    return NextResponse.json({ contact: note });
  }
  return NextResponse.json({ contacts: listContacts() });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const note = (await req.json()) as ContactNote;
  if (!note?.email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  try {
    writeContact(note);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
