// Images and uploads go directly between the browser and Supabase Storage,
// so the Supabase project must be allowed by the Content Security Policy.
// NEXT_PUBLIC_SUPABASE_URL has to be set when the site is built.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

export default {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: ${supabase}; font-src 'self'; connect-src 'self' ${supabase}; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};
