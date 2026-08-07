# Auth (Supabase) + documents (Cloudflare R2)

## Sign up / Sign in

1. Create a project at [supabase.com](https://supabase.com).
2. Copy **Project URL** and **publishable** (or anon) key into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. In the Supabase SQL editor, run:

`supabase/migrations/20260807000000_auth_profiles_practices.sql`

This creates `profiles`, `practices`, `practice_members`, `client_documents` with RLS, and a trigger that creates a practice when a user signs up.

4. Auth → URL configuration: add redirect `http://localhost:3000/auth/callback`.

5. Optional: Auth → Providers → Email → turn **off** “Confirm email” while developing so sign-up lands straight on `/dashboard`.

6. Restart `npm run dev`. **Sign up** (`/create-account`) and **Sign in** (`/sign-in`) use Supabase Auth.

Without Supabase keys, both forms still work in **local mode** and open `/dashboard`.

## Cloudflare R2 documents

1. Cloudflare dashboard → R2 → create bucket `hydratax-documents`.
2. Create an API token with Object Read & Write (S3-compatible credentials).
3. Set:

```bash
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=hydratax-documents
# Optional public base URL / custom domain:
# CLOUDFLARE_R2_PUBLIC_URL=https://docs.yourdomain.com
```

Uploads in **Client → Documents** prefer R2, then Vercel Blob, then local memory.  
Private R2 files download via `/api/documents/download?key=...` (session required).  
When Supabase is configured, document metadata is stored in `client_documents`.
