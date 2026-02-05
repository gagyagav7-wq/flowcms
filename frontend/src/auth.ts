import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        GitHub({
            clientId: process.env.GITHUB_ID!,
            clientSecret: process.env.GITHUB_SECRET!,
            authorization: {
                params: {
                    // Request repo (read/write) and user read access
                    scope: "repo read:user",
                },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account }) {
            // Persist the GitHub access token to the JWT
            if (account) {
                token.accessToken = account.access_token;
            }
            return token;
        },
        async session({ session, token }) {
            // Expose access token to client session
            session.accessToken = token.accessToken as string;
            return session;
        },
    },
    pages: {
        signIn: "/",
        error: "/auth/error",
    },
    session: {
        strategy: "jwt",
    },
});

// Type augmentation for session
declare module "next-auth" {
    interface Session {
        accessToken: string;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        accessToken?: string;
    }
}
