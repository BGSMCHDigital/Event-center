# WordPress draft upload for EventReporter

**Purpose:** Admin/Editor > Dashboard > Submissions > Website Submission > Create WordPress Draft. Uses saved event title, edited/generated article (or description), summary, subheading, highlights and all uploaded event images. First image becomes the WordPress featured image; remaining images are embedded in the draft gallery. Publishing is always performed manually in WordPress.

## Setup (required before use)

1. Apply `supabase/migrations/20261026_wordpress_drafts.sql` in Supabase SQL editor or migration workflow.
2. Deploy `supabase/functions/create-wordpress-draft/index.ts` as the Edge Function `create-wordpress-draft`; keep JWT authentication enabled. The function also validates the user's Supabase role.
3. In Supabase Edge Function secrets configure:
   - `WORDPRESS_SITE_URL` — your WordPress HTTPS origin, without a trailing slash.
   - `WORDPRESS_USERNAME` — a WordPress user with permission to upload media and create posts.
   - `WORDPRESS_APPLICATION_PASSWORD` — a WordPress Application Password for that user (not their regular password).
   - Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions.
4. Ensure the WordPress REST API `/wp-json/wp/v2/posts` and `/wp-json/wp/v2/media` are accessible to that account. Store the password as a server secret ONLY, not in React or GitHub.
5. Ensure event image URLs point to the configured Supabase storage host and images are accessible from the Edge Function.

**Security / behavior:** Only authenticated admin/editor roles can invoke the function; only approved events can create drafts. The function never publishes posts. Previously synced events link to their existing WordPress draft instead of creating duplicates. Existing `website_uploaded` remains a separate, manual website-published tracking control; saving a draft does not mark an event as published.

**Note:** The draft post and its media are created through separate REST calls. In the event of a transient failure, already-uploaded media can remain in the WordPress media library. For production, add a durable queue/lock for concurrent clicks and implement media cleanup/retries if needed.

## Target WordPress website

WordPress site URL: `https://news.bgsmch.acu.edu.in`
WordPress admin: `https://news.bgsmch.acu.edu.in/wp-admin/`
Set the Supabase secret `WORDPRESS_SITE_URL` to `https://news.bgsmch.acu.edu.in` (without `/wp-admin/`). The admin editor URL is derived automatically from the returned post ID.

WordPress REST API availability could not be confirmed externally. Verify that `/wp-json/wp/v2/posts` and `/wp-json/wp/v2/media` work for an authenticated WordPress application-password account before deployment.
