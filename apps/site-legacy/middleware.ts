import { NextResponse, type NextRequest } from "next/server";

const malformedWildcardSuffixPattern = /\/(?::path\*|%3Apath\*|%3Apath%2A)$/i;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.nextUrl.hostname.toLowerCase();

  if (hostname === "img.printlykiddo.com" && pathname === "/") {
    return NextResponse.redirect("https://printlykiddo.com/", 308);
  }

  if (!malformedWildcardSuffixPattern.test(pathname)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname.replace(malformedWildcardSuffixPattern, "") || "/";

  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
