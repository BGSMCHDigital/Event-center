import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const escaped = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraphs = (s: string) => s.split(/\n\s*\n/).filter(Boolean).map(p => "<p>" + escaped(p).replace(/\n/g, "<br>") + "</p>").join("\n");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const site = Deno.env.get("WORDPRESS_SITE_URL")?.replace(/\/$/, "");
    const wpUser = Deno.env.get("WORDPRESS_USERNAME");
    const wpPassword = Deno.env.get("WORDPRESS_APPLICATION_PASSWORD");
    if (!site || !site.startsWith("https://") || !wpUser || !wpPassword) return json({ error: "WordPress connection is not configured" }, 503);
    const auth = request.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const supabase = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await supabase.auth.getUser(auth.substring(7));
    if (userError || !user) return json({ error: "Session invalid" }, 401);
    const adminDb = createClient(url, service);
    const { data: roleRow } = await adminDb.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (!["admin", "editor"].includes(roleRow?.role)) return json({ error: "Insufficient permissions" }, 403);
    const input = await request.json();
    const eventId = input?.event_id;
    if (typeof eventId !== "string" || !/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "Invalid event ID" }, 400);
    const { data: event, error: eventError } = await adminDb.from("events").select("*").eq("id", eventId).single();
    if (eventError || !event) return json({ error: "Event not found" }, 404);
    if (event.status !== "approved") return json({ error: "Final approval is required before WordPress draft creation" }, 409);
    const { data: previous } = await adminDb.from("wordpress_drafts").select("post_id,edit_url").eq("event_id", eventId).maybeSingle();
    if (previous) return json({ post_id: previous.post_id, edit_url: previous.edit_url, existing: true });

    const wpHeaders = { Authorization: "Basic " + btoa(wpUser + ":" + wpPassword) };
    const media: number[] = [];
    const { data: images, error: imageError } = await adminDb.from("event_images").select("image_url,caption").eq("event_id", eventId).order("created_at");
    if (imageError) throw imageError;
    const allowedHost = new URL(url).host;
    for (let i = 0; i < (images ?? []).length; i++) {
      const img = images![i];
      const source = new URL(img.image_url);
      if (source.protocol !== "https:" || source.host !== allowedHost || !source.pathname.includes("/storage/v1/object/")) {
        throw new Error("Event image URL is outside the approved storage host");
      }
      const download = await fetch(source.toString());
      if (!download.ok) throw new Error("Could not download event image " + (i + 1));
      const blob = await download.blob();
      if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type) || blob.size > 10 * 1024 * 1024) throw new Error("Unsupported or oversized event image");
      const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const upload = await fetch(site + "/wp-json/wp/v2/media", {
        method: "POST",
        headers: { ...wpHeaders, "Content-Type": blob.type, "Content-Disposition": 'attachment; filename="event-' + eventId + "-" + (i + 1) + "." + extension + '"' },
        body: blob,
      });
      if (!upload.ok) throw new Error("WordPress media upload failed: " + upload.status);
      const item = await upload.json();
      media.push(item.id);
    }

    const article = event.edited_article || event.generated_article || event.description;
    let content = event.generated_subheading ? "<p><em>" + escaped(event.generated_subheading) + "</em></p>\n" : "";
    content += paragraphs(article);
    if (event.highlights) content += "<h2>Highlights</h2>" + paragraphs(event.highlights);
    if (media.length) {
      for (const id of media) {
        const mediaResponse = await fetch(site + "/wp-json/wp/v2/media/" + id + "?context=edit", { headers: wpHeaders });
        if (!mediaResponse.ok) throw new Error("Unable to read uploaded media");
        const m = await mediaResponse.json();
        content += '<figure class="wp-block-image"><img src="' + escaped(m.source_url) + '" alt="' + escaped(m.alt_text || "") + '"></figure>';
      }
    }
    const postResponse = await fetch(site + "/wp-json/wp/v2/posts", {
      method: "POST", headers: { ...wpHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: event.generated_headline || event.title,
        content,
        excerpt: event.generated_summary || event.description.slice(0, 250),
        status: "draft",
        featured_media: media[0] || 0,
      }),
    });
    if (!postResponse.ok) throw new Error("WordPress draft creation failed: " + postResponse.status + " " + (await postResponse.text()).slice(0, 300));
    const post = await postResponse.json();
    const editUrl = site + "/wp-admin/post.php?post=" + post.id + "&action=edit";
    const { error: saveError } = await adminDb.from("wordpress_drafts").insert({ event_id: eventId, post_id: post.id, edit_url: editUrl, created_by: user.id });
    if (saveError) return json({ post_id: post.id, edit_url: editUrl, warning: "Draft created but sync record could not be saved; avoid retrying until verified." });
    return json({ post_id: post.id, edit_url: editUrl, image_count: media.length, status: "draft" });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "WordPress upload failed" }, 500);
  }
});
