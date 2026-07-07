import { NextResponse, type NextRequest } from "next/server";
import { PARTICLE_SESSION_COOKIE } from "@/lib/particleAuthConstants";

const protectedRoutePrefixes = [
  "/dashboard(.*)",
  "/trade(.*)",
  "/deposits(.*)",
  "/withdrawals(.*)",
  "/positions(.*)",
  "/risk(.*)",
  "/activity(.*)",
  "/profile(.*)",
  "/settings(.*)",
  "/kill(.*)",
].map((pattern) => pattern.replace("(.*)", ""));

function isProtectedRoute(pathname: string) {
  return protectedRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(PARTICLE_SESSION_COOKIE)?.value);

  if (isProtectedRoute(pathname) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/sign-in" && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
