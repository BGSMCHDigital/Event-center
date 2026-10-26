import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import type { AppRole } from "@/hooks/useUserRole";
import { Loader2, Eye, Pencil, Download, FileText, Check, X, Trash2, Globe, Clock } from "lucide-react";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } from "docx";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";
import { format, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type EventRow = {
  id: string;
  title: string;
  submitter_name: string;
  submitter_email: string;
  submitter_department: string | null;
  submitter_phone: string | null;
  status: "pending_review" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
  description: string;
  location: string;
  event_date: string;
  event_date_type: string;
  start_date: string | null;
  end_date: string | null;
  event_dates: string[] | null;
  organizing_department_name: string;
  highlights: string | null;
  participants: string | null;
  generated_headline: string | null;
  generated_subheading: string | null;
  generated_article: string | null;
  generated_summary: string | null;
  generated_hashtags: string | null;
  generated_sdgs: string | null;
  edited_article: string | null;
  editor_id: string | null;
  editor_notes: string | null;
  website_uploaded: boolean;
  website_uploaded_at: string | null;
};

type EventImage = {
  id: string;
  image_url: string;
  caption: string | null;
};

function formatEventDate(event: EventRow): string {
  try {
    if (event.event_date_type === "range" && event.start_date && event.end_date) {
      return `${format(parseISO(event.start_date), "dd")}–${format(parseISO(event.end_date), "dd MMM yyyy")}`;
    }
    if (event.event_date_type === "multiple" && event.event_dates && event.event_dates.length > 0) {
      return event.event_dates.map(d => format(parseISO(d), "dd MMM yyyy")).join(", ");
    }
    // single or fallback
    return format(parseISO(event.event_date), "dd MMM yyyy");
  } catch {
    return event.event_date;
  }
}

export default function SubmissionsPage() {
  const { user, role, isAdmin } = useOutletContext<{ user: User; role: AppRole; isAdmin: boolean; isEditor: boolean }>();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [viewingEvent, setViewingEvent] = useState<EventRow | null>(null);
  const [viewingImages, setViewingImages] = useState<EventImage[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load submissions");
    } else {
      setEvents((data as unknown as EventRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const toggleWebsiteUploaded = async (item: EventRow) => {
    const next = !item.website_uploaded;
    const { error } = await supabase
      .from("events")
      .update({ website_uploaded: next, website_uploaded_at: next ? new Date().toISOString() : null })
      .eq("id", item.id);

    if (error) {
      toast.error("Failed to update website status");
    } else {
      toast.success(next ? "Marked as uploaded to website" : "Reverted to pending");
      setEvents((prev) =>
        prev.map((e) => (e.id === item.id ? { ...e, website_uploaded: next } : e))
      );
    }
  };

  const updateStatus = async (id: string, status: "approved" | "rejected", notes?: string) => {
    const update: Record<string, unknown> = { status };
    if (notes !== undefined) update.editor_notes = notes;

    const { error } = await supabase.from("events").update(update).eq("id", id);

    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success(`Submission ${status}`);
      fetchEvents();
    }
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast.error("Please enter a reason for rejection");
      return;
    }
    if (rejectingId) {
      updateStatus(rejectingId, "rejected", rejectReason.trim());
      setRejectingId(null);
      setRejectReason("");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { data: images } = await supabase.from("event_images").select("image_url").eq("event_id", id);

      if (images && images.length > 0) {
        const filePaths = images
          .map((img) => {
            try {
              const url = new URL(img.image_url);
              const match = url.pathname.match(/\/object\/(?:public|sign)\/event-images\/(.+)/);
              return match ? decodeURIComponent(match[1]) : null;
            } catch { return null; }
          })
          .filter(Boolean) as string[];

        if (filePaths.length > 0) {
          await supabase.storage.from("event-images").remove(filePaths).catch(() => {});
        }

        await supabase.from("event_images").delete().eq("event_id", id);
      }

      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;

      toast.success("Submission deleted");
      fetchEvents();
    } catch {
      toast.error("Failed to delete submission");
    }
  };

  const fetchEventImages = async (eventId: string): Promise<EventImage[]> => {
    const { data } = await supabase
      .from("event_images")
      .select("id, image_url, caption")
      .eq("event_id", eventId);
    return (data as EventImage[]) || [];
  };

  const loadRemoteImage = async (
    url: string
  ): Promise<{ buffer: ArrayBuffer; dataUrl: string; width: number; height: number; type: "png" | "jpg" }> => {
    const res = await fetch(url);
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = dataUrl;
    });
    return {
      buffer,
      dataUrl,
      width: img.naturalWidth,
      height: img.naturalHeight,
      type: blob.type.includes("png") ? "png" : "jpg",
    };
  };

  const handleDownload = async (event: EventRow) => {
    const eventDateDisplay = formatEventDate(event);

    const children: Paragraph[] = [
      new Paragraph({ text: event.title, heading: HeadingLevel.HEADING_1, spacing: { after: 300 } }),
      new Paragraph({ children: [new TextRun({ text: `Author: ${event.submitter_name}`, size: 22 })] }),
      new Paragraph({ children: [new TextRun({ text: `Email: ${event.submitter_email}`, size: 22 })] }),
      ...(event.submitter_department ? [new Paragraph({ children: [new TextRun({ text: `Department: ${event.submitter_department}`, size: 22 })] })] : []),
      ...(event.submitter_phone ? [new Paragraph({ children: [new TextRun({ text: `Phone: ${event.submitter_phone}`, size: 22 })] })] : []),
      new Paragraph({ children: [new TextRun({ text: `Event Date: ${eventDateDisplay}`, size: 22 })] }),
      new Paragraph({ children: [new TextRun({ text: `Location: ${event.location}`, size: 22 })] }),
      new Paragraph({ children: [new TextRun({ text: `Organizing Department: ${event.organizing_department_name}`, size: 22 })], spacing: { after: 300 } }),
    ];

    if (event.participants) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Participants: ${event.participants}`, size: 22 })], spacing: { after: 200 } }));
    }

    if (event.generated_headline) {
      children.push(new Paragraph({ text: event.generated_headline, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }));
    }

    if (event.generated_subheading) {
      children.push(new Paragraph({ children: [new TextRun({ text: event.generated_subheading, italics: true, size: 24 })], spacing: { after: 200 } }));
    }

    const articleText = event.edited_article || event.generated_article || event.description;
    articleText.split("\n").forEach((line) => {
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 24 })], spacing: { after: 120 } }));
    });

    if (event.highlights) {
      children.push(new Paragraph({ text: "Highlights", heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 200 } }));
      event.highlights.split("\n").forEach((line) => {
        children.push(new Paragraph({ children: [new TextRun({ text: line, size: 24 })], spacing: { after: 120 } }));
      });
    }

    if (event.generated_hashtags) {
      children.push(new Paragraph({ text: "" }));
      children.push(new Paragraph({
        children: [new TextRun({ text: "Hashtags: ", bold: true, size: 22 }), new TextRun({ text: event.generated_hashtags, size: 22 })],
        spacing: { before: 200 },
      }));
    }

    if (event.generated_sdgs) {
      children.push(new Paragraph({
        children: [new TextRun({ text: "Relevant SDGs: ", bold: true, size: 22 }), new TextRun({ text: event.generated_sdgs, size: 22 })],
        spacing: { after: 300 },
      }));
    }

    const images = await fetchEventImages(event.id);
    if (images.length > 0) {
      children.push(new Paragraph({ text: "Event Images", heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 200 } }));
      for (const image of images) {
        try {
          const imgData = await loadRemoteImage(image.image_url);
          const maxW = 500;
          const scale = Math.min(maxW / imgData.width, 1);
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  type: imgData.type,
                  data: imgData.buffer,
                  transformation: { width: Math.round(imgData.width * scale), height: Math.round(imgData.height * scale) },
                  altText: { title: image.caption || "Event image", description: image.caption || "Event image", name: image.caption || "Event image" },
                }),
              ],
              spacing: { before: 200, after: image.caption ? 60 : 200 },
            })
          );
          if (image.caption) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: image.caption, italics: true, size: 20 })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
              })
            );
          }
        } catch {
          // skip images that fail to load
        }
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${event.title.replace(/\s+/g, "_")}.docx`);
  };

  const handleDownloadPdf = async (event: EventRow) => {
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = margin;

      const addText = (text: string, fontSize: number, opts?: { bold?: boolean; italic?: boolean }) => {
        pdf.setFontSize(fontSize);
        pdf.setFont("helvetica", opts?.bold ? "bold" : opts?.italic ? "italic" : "normal");
        const lines = pdf.splitTextToSize(text, contentW);
        for (const line of lines) {
          if (y > pageH - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += fontSize * 0.45;
        }
        y += 3;
      };

      addText(event.title, 18, { bold: true });
      addText(`Author: ${event.submitter_name}`, 10);
      addText(`Email: ${event.submitter_email}`, 10);
      if (event.submitter_department) addText(`Department: ${event.submitter_department}`, 10);
      if (event.submitter_phone) addText(`Phone: ${event.submitter_phone}`, 10);
      addText(`Event Date: ${formatEventDate(event)}`, 10);
      addText(`Location: ${event.location}`, 10);
      addText(`Organizing Department: ${event.organizing_department_name}`, 10);
      if (event.participants) addText(`Participants: ${event.participants}`, 10);
      y += 3;

      if (event.generated_headline) addText(event.generated_headline, 14, { bold: true });
      if (event.generated_subheading) addText(event.generated_subheading, 11, { italic: true });

      const articleText = event.edited_article || event.generated_article || event.description;
      articleText.split("\n").forEach((para) => {
        if (para.trim()) addText(para, 11);
      });

      if (event.highlights) {
        addText("Highlights", 13, { bold: true });
        event.highlights.split("\n").forEach((line) => {
          if (line.trim()) addText(line, 11);
        });
      }

      if (event.generated_hashtags) addText(`Hashtags: ${event.generated_hashtags}`, 10);
      if (event.generated_sdgs) addText(`Relevant SDGs: ${event.generated_sdgs}`, 10);

      const images = await fetchEventImages(event.id);
      if (images.length > 0) {
        y += 3;
        addText("Event Images", 13, { bold: true });
        for (const image of images) {
          try {
            const imgData = await loadRemoteImage(image.image_url);
            const pxToMm = 0.264583;
            const scale = Math.min(contentW / (imgData.width * pxToMm), 1);
            const w = imgData.width * pxToMm * scale;
            const h = imgData.height * pxToMm * scale;
            if (y + h > pageH - margin) {
              pdf.addPage();
              y = margin;
            }
            pdf.addImage(imgData.dataUrl, imgData.type === "png" ? "PNG" : "JPEG", margin, y, w, h);
            y += h + 4;
            if (image.caption) addText(image.caption, 9, { italic: true });
          } catch {
            // skip images that fail to load
          }
        }
      }

      pdf.save(`${event.title.replace(/\s+/g, "_")}.pdf`);
    } catch {
      toast.error("Failed to export PDF");
    }
  };


  const statusMap = (s: string) => {
    if (s === "pending_review") return "submitted" as const;
    return s as "approved" | "rejected";
  };

  const departments = Array.from(
    new Set(events.map((e) => e.organizing_department_name).filter(Boolean))
  ).sort();

  const filteredEvents =
    departmentFilter === "all"
      ? events
      : events.filter((e) => e.organizing_department_name === departmentFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
      <p className="mt-1 text-muted-foreground">Review and manage all event submissions.</p>

      {departments.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="department-filter" className="text-sm font-medium text-muted-foreground">
            Filter by department
          </label>
          <select
            id="department-filter"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-8 rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Submitter</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Website Submission</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {events.length === 0 ? "No submissions yet." : "No submissions match the selected department."}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((item) => (
                  <tr key={item.id} className={`border-b last:border-0 transition-colors ${item.website_uploaded ? "bg-green-50 hover:bg-green-100/70 dark:bg-green-950/30 dark:hover:bg-green-950/50" : "hover:bg-muted/30"}`}>
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate">{item.title}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{item.submitter_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{item.submitter_email}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><StatusBadge status={statusMap(item.status)} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={async () => {
                          setViewingEvent(item);
                          const { data } = await supabase.from("event_images").select("id, image_url, caption").eq("event_id", item.id);
                          setViewingImages((data as EventImage[]) || []);
                        }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Download Word (with images)" onClick={() => handleDownload(item)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Download PDF (with images)" onClick={() => handleDownloadPdf(item)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                        {isAdmin && item.status === "pending_review" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700" title="Approve" onClick={() => updateStatus(item.id, "approved")}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Reject" onClick={() => { setRejectingId(item.id); setRejectReason(""); }}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete" onClick={() => { if (confirm("Are you sure you want to delete this submission and all associated files?")) handleDelete(item.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant={item.website_uploaded ? "outline" : "ghost"}
                        size="sm"
                        className={item.website_uploaded ? "h-8 gap-1.5 border-green-600/40 text-green-700 hover:text-green-800" : "h-8 gap-1.5 text-muted-foreground"}
                        title={item.website_uploaded ? "Click to revert to Pending" : "Mark as uploaded to website"}
                        onClick={() => toggleWebsiteUploaded(item)}
                      >
                        {item.website_uploaded ? <Globe className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        {item.website_uploaded ? "Uploaded to Website" : "Pending"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rejection Reason Modal */}
      <Dialog open={!!rejectingId} onOpenChange={(open) => { if (!open) { setRejectingId(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>Please provide a reason for rejecting this submission.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason for rejection</Label>
            <Textarea
              id="reject-reason"
              placeholder="Enter reason…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectingId(null); setRejectReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Submission Modal */}
      <Dialog open={!!viewingEvent} onOpenChange={(open) => { if (!open) { setViewingEvent(null); setViewingImages([]); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {viewingEvent && (
            <>
              <DialogHeader>
                <DialogTitle>{viewingEvent.title}</DialogTitle>
                <DialogDescription>
                  Submitted by {viewingEvent.submitter_name} on {new Date(viewingEvent.created_at).toLocaleDateString()}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                  <div><span className="font-medium text-muted-foreground">Location:</span> {viewingEvent.location}</div>
                  <div><span className="font-medium text-muted-foreground">Event Date:</span> {formatEventDate(viewingEvent)}</div>
                  <div><span className="font-medium text-muted-foreground">Organizing Department:</span> {viewingEvent.organizing_department_name}</div>
                  <div><span className="font-medium text-muted-foreground">Email:</span> {viewingEvent.submitter_email}</div>
                  {viewingEvent.submitter_department && (
                    <div><span className="font-medium text-muted-foreground">Department:</span> {viewingEvent.submitter_department}</div>
                  )}
                  {viewingEvent.submitter_phone && (
                    <div><span className="font-medium text-muted-foreground">Phone:</span> {viewingEvent.submitter_phone}</div>
                  )}
                  {viewingEvent.participants && (
                    <div className="col-span-2"><span className="font-medium text-muted-foreground">Participants:</span> {viewingEvent.participants}</div>
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-muted-foreground mb-1">Description</h4>
                  <p className="whitespace-pre-wrap">{viewingEvent.description}</p>
                </div>
                {viewingEvent.highlights && (
                  <div>
                    <h4 className="font-medium text-muted-foreground mb-1">Highlights</h4>
                    <p className="whitespace-pre-wrap">{viewingEvent.highlights}</p>
                  </div>
                )}
                {viewingEvent.generated_headline && (
                  <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                    <h4 className="font-semibold">Generated Article</h4>
                    <p className="font-medium">{viewingEvent.generated_headline}</p>
                    {viewingEvent.generated_subheading && (
                      <p className="italic text-muted-foreground">{viewingEvent.generated_subheading}</p>
                    )}
                    {viewingEvent.generated_article && <p className="whitespace-pre-wrap">{viewingEvent.generated_article}</p>}
                    {viewingEvent.edited_article && (
                      <div className="mt-2">
                        <span className="font-medium text-muted-foreground">Edited Article:</span>
                        <p className="whitespace-pre-wrap">{viewingEvent.edited_article}</p>
                      </div>
                    )}
                    {viewingEvent.generated_hashtags && (
                      <div className="mt-2">
                        <span className="font-medium text-muted-foreground">Hashtags:</span>
                        <p className="whitespace-pre-wrap">{viewingEvent.generated_hashtags}</p>
                      </div>
                    )}
                    {viewingEvent.generated_sdgs && (
                      <div className="mt-2">
                        <span className="font-medium text-muted-foreground">Relevant SDGs:</span>
                        <p className="whitespace-pre-wrap">{viewingEvent.generated_sdgs}</p>
                      </div>
                    )}
                  </div>
                )}
                {viewingEvent.editor_notes && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <h4 className="font-medium text-destructive mb-1">Rejection Reason</h4>
                    <p>{viewingEvent.editor_notes}</p>
                  </div>
                )}
                <div>
                  <h4 className="font-semibold mb-2">Event Images</h4>
                  {viewingImages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No images uploaded for this submission</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {viewingImages.map((img) => (
                        <div key={img.id} className="rounded-md border overflow-hidden">
                          <img src={img.image_url} alt={img.caption || "Event image"} className="w-full h-auto object-cover aspect-video" />
                          {img.caption && <p className="text-xs p-1 text-muted-foreground">{img.caption}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
