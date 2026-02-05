import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const { pathname } = req.nextUrl;

    // Public routes that don't require authentication
    const publicRoutes = ["/", "/api/auth"];

    // Check if current path is public
    const isPublicRoute = publicRoutes.some(
        (route) => pathname === route || pathname.startsWith(route)
    );

    // Redirect to login if accessing protected route without auth
    if (!isLoggedIn && !isPublicRoute) {
        const loginUrl = new URL("/", req.nextUrl.origin);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
});

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico, sitemap.xml, robots.txt (metadata files)
         * - public folder files
         */
        "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.png$).*)",
    ],
};
