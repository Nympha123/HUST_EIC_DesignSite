import { NextResponse } from "next/server";
import {
  getMinisterSessionSecret,
  hasValidMinisterSession,
  ministerSessionCookieName,
} from "@/lib/admin-session";

function getAllowedCodes() {
  return (process.env.MINISTER_ACCESS_CODES ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  return NextResponse.json({
    ok: true,
    isMinister: hasValidMinisterSession(request),
  });
}

export async function POST(request: Request) {
  let submittedCode = "";

  try {
    const body = (await request.json()) as { code?: unknown };
    submittedCode = typeof body.code === "string" ? body.code.trim() : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const isAuthorized = getAllowedCodes().includes(submittedCode);

  if (!isAuthorized) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(ministerSessionCookieName, getMinisterSessionSecret(), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  response.cookies.delete(ministerSessionCookieName);

  return response;
}
