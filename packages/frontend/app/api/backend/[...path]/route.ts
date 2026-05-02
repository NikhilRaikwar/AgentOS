import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const backendSecret = process.env.BACKEND_API_SECRET || "";

async function proxy(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!backendSecret) {
    return NextResponse.json({ error: "BACKEND_API_SECRET is not configured on the frontend server." }, { status: 503 });
  }

  const { path } = await context.params;
  const target = new URL(path.join("/"), backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`);
  target.search = req.nextUrl.search;

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  const res = await fetch(target, {
    method: req.method,
    headers: {
      "accept": req.headers.get("accept") || "application/json",
      "content-type": req.headers.get("content-type") || "application/json",
      "x-agentos-api-key": backendSecret
    },
    body,
    cache: "no-store"
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json"
    }
  });
}

export const GET = proxy;
export const POST = proxy;
