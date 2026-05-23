import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { createLabel, deleteLabel, patchLabel } from "@/lib/gmail";
import { writeLabelNote, renameLabelNote } from "@/lib/obsidian";
import { authOptions } from "@/lib/authOptions";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { name } = await req.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  try {
    const label = await createLabel(session.accessToken as string, name.trim());
    // Obsidian 側にも空のノートファイルを作る
    try {
      writeLabelNote({
        labelId: label.id,
        labelName: label.name,
        excludeFromLearning: false,
        body: "",
      });
    } catch {
      // ファイル作成失敗してもラベル自体はできているのでスルー
    }
    return NextResponse.json({ label });
  } catch (err: any) {
    console.error("create label error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, name, oldName } = await req.json();
  if (!id || !name || typeof name !== "string") {
    return NextResponse.json({ error: "id and name required" }, { status: 400 });
  }
  try {
    const label = await patchLabel(session.accessToken as string, id, name.trim());
    // Obsidian 側のファイルもリネーム
    if (oldName) {
      try { renameLabelNote(oldName, label.name); } catch { /* best-effort */ }
    }
    return NextResponse.json({ label });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteLabel(session.accessToken as string, id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
