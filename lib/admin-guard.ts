import { NextResponse } from "next/server";
import { isAdmin } from "./auth";

/** Returns a 401 response if the caller is not the admin, otherwise null. */
export async function guardAdmin(): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
