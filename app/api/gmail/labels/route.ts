import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { listLabels } from "@/lib/gmail";
import { authOptions } from "@/lib/authOptions";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const labels = await listLabels(session.accessToken as string);
    return NextResponse.json({ labels });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
