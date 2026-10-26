import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Pencil, Send, RotateCcw, ArrowLeft, Upload, X, FileText, FileDown, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } from "docx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import { format, parseISO } from "date-fns";

type ArticleData = {
  headline: string;
  subheading: string;
  article: string;
  hashtags: string;
  sdgs: string;
};

type EventDateType = "single" | "range" | "multiple";

type FormData = {
  title: string;
  eventDateType: EventDateType;
  eventDate: string;
  startDate: string;
  endDate: string;
  multipleDates: string[];
  location: string;
  organizingDepartmentName: string;
  description: string;
  highlights: string;
  participants: string;
  submitterName: string;
  submitterEmail: string;
  submitterDepartment: string;
  submitterPhone: string;
};

const DRAFT_KEY = "event-report-draft";

function loadDraft(): { form: FormData; articleData: ArticleData | null; step: "form" | "preview" } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Migration from old draft format
    if (parsed.form && !parsed.form.eventDateType) {
      parsed.form.eventDateType = "single";
      parsed.form.startDate = parsed.form.startDate || "";
      parsed.form.endDate = parsed.form.endDate || "";
      parsed.form.multipleDates = parsed.form.multipleDates || [""];
    }
    if (parsed.form && parsed.form.organizerName && !parsed.form.organizingDepartmentName) {
      parsed.form.organizingDepartmentName = parsed.form.organizerName;
      delete parsed.form.organizerName;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(form: FormData, articleData: ArticleData | null, step: "form" | "preview") {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, articleData, step }));
  } catch {}
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function formatEventDateForDisplay(form: FormData): string {
  try {
    if (form.eventDateType === "single" && form.eventDate) {
      return format(parseISO(form.eventDate), "dd MMM yyyy");
    }
    if (form.eventDateType === "range" && form.startDate && form.endDate) {
      return `${format(parseISO(form.startDate), "dd")}–${format(parseISO(form.endDate), "dd MMM yyyy")}`;
    }
    if (form.eventDateType === "multiple" && form.multipleDates.length > 0) {
      const validDates = form.multipleDates.filter(Boolean);
      return validDates.map(d => format(parseISO(d), "dd MMM yyyy")).join(", ");
    }
  } catch {}
  return "";
}

function computeDateFields(form: FormData): { startDate: string; endDate: string; eventDate: string; eventDates: string[] } {
  if (form.eventDateType === "single") {
    return { startDate: form.eventDate, endDate: form.eventDate, eventDate: form.eventDate, eventDates: [] };
  }
  if (form.eventDateType === "range") {
    return { startDate: form.startDate, endDate: form.endDate, eventDate: form.startDate, eventDates: [] };
  }
  // multiple
  const validDates = form.multipleDates.filter(Boolean).sort();
  const minDate = validDates[0] || "";
  const maxDate = validDates[validDates.length - 1] || "";
  return { startDate: minDate, endDate: maxDate, eventDate: minDate, eventDates: validDates };
}

async function loadImageAsArrayBuffer(file: File): Promise<{ buffer: ArrayBuffer; width: number; height: number; type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        resolve({
          buffer: reader.result as ArrayBuffer,
          width: img.naturalWidth,
          height: img.naturalHeight,
          type: file.type.includes("png") ? "png" : "jpg",
        });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Resize/compress phone photos so uploads succeed on mobile networks
async function compressImageForUpload(file: File, maxDim = 1920, quality = 0.82): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    return blob || file;
  } catch {
    return file;
  }
}

async function loadImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const defaultForm: FormData = {
  title: "",
  eventDateType: "single",
  eventDate: "",
  startDate: "",
  endDate: "",
  multipleDates: [""],
  location: "",
  organizingDepartmentName: "",
  description: "",
  highlights: "",
  participants: "",
  submitterName: "",
  submitterEmail: "",
  submitterDepartment: "",
  submitterPhone: "",
};

export default function SubmitEventPage() {
  const draft = loadDraft();

  const [step, setStep] = useState<"form" | "preview">(draft?.step || "form");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [articleData, setArticleData] = useState<ArticleData | null>(draft?.articleData || null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormData>(draft?.form || { ...defaultForm });

  // Auto-save draft on changes
  useEffect(() => {
    const timeout = setTimeout(() => saveDraft(form, articleData, step), 500);
    return () => clearTimeout(timeout);
  }, [form, articleData, step]);

  const update = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = [...imageFiles, ...files].slice(0, 10);
    setImageFiles(newFiles);
    setImagePreviewUrls(newFiles.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (index: number) => {
    const newFiles = imageFiles.filter((_, i) => i !== index);
    setImageFiles(newFiles);
    setImagePreviewUrls(newFiles.map((f) => URL.createObjectURL(f)));
  };

  const validateDates = (): boolean => {
    if (form.eventDateType === "single") {
      if (!form.eventDate) { toast.error("Please select an event date."); return false; }
    } else if (form.eventDateType === "range") {
      if (!form.startDate || !form.endDate) { toast.error("Please select both start and end dates."); return false; }
      if (form.endDate < form.startDate) { toast.error("End date must be on or after start date."); return false; }
    } else if (form.eventDateType === "multiple") {
      const validDates = form.multipleDates.filter(Boolean);
      if (validDates.length === 0) { toast.error("Please add at least one date."); return false; }
    }
    return true;
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validateDates()) return;

    setLoading(true);
    try {
      const displayDate = formatEventDateForDisplay(form);
      const { data, error } = await supabase.functions.invoke("generate-article", {
        body: {
          title: form.title,
          eventDate: displayDate,
          location: form.location,
          organizerName: form.organizingDepartmentName,
          description: form.description,
          highlights: form.highlights,
          participants: form.participants,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setArticleData(data);
      setStep("preview");
      toast.success("Article generated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate article. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = () => {
    setEditing(false);
    handleGenerate();
  };

  const updateArticle = (field: keyof ArticleData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setArticleData((prev) => (prev ? { ...prev, [field]: e.target.value } : prev));

  // --- Export as DOCX ---
  const handleExportDocx = useCallback(async () => {
    if (!articleData) return;
    try {
      const children: (Paragraph)[] = [
        new Paragraph({ text: articleData.headline, heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ text: articleData.subheading, italics: true, size: 26 })],
          spacing: { after: 300 },
        }),
      ];

      articleData.article.split("\n").forEach((line) => {
        children.push(new Paragraph({ children: [new TextRun({ text: line, size: 24 })], spacing: { after: 120 } }));
      });

      children.push(new Paragraph({ text: "" }));
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Hashtags: ", bold: true, size: 22 }), new TextRun({ text: articleData.hashtags, size: 22 })],
          spacing: { before: 200 },
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Relevant SDGs: ", bold: true, size: 22 }), new TextRun({ text: articleData.sdgs, size: 22 })],
          spacing: { after: 300 },
        })
      );

      // Embed images
      for (const file of imageFiles) {
        try {
          const imgData = await loadImageAsArrayBuffer(file);
          const maxW = 500;
          const scale = Math.min(maxW / imgData.width, 1);
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  type: imgData.type as "png" | "jpg",
                  data: imgData.buffer,
                  transformation: { width: Math.round(imgData.width * scale), height: Math.round(imgData.height * scale) },
                  altText: { title: file.name, description: file.name, name: file.name },
                }),
              ],
              spacing: { before: 200, after: 200 },
            })
          );
        } catch {}
      }

      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${form.title.replace(/\s+/g, "_") || "article"}.docx`);
      toast.success("DOCX exported successfully!");
    } catch {
      toast.error("Failed to export DOCX");
    }
  }, [articleData, imageFiles, form.title]);

  // --- Export as PDF ---
  const handleExportPdf = useCallback(async () => {
    if (!articleData) return;
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = margin;

      const addText = (text: string, fontSize: number, opts?: { bold?: boolean; italic?: boolean }) => {
        pdf.setFontSize(fontSize);
        const style = opts?.bold ? "bold" : opts?.italic ? "italic" : "normal";
        pdf.setFont("helvetica", style);
        const lines = pdf.splitTextToSize(text, contentW);
        for (const line of lines) {
          if (y > pdf.internal.pageSize.getHeight() - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += fontSize * 0.45;
        }
        y += 3;
      };

      addText(articleData.headline, 18, { bold: true });
      y += 2;
      addText(articleData.subheading, 12, { italic: true });
      y += 4;

      articleData.article.split("\n").forEach((para) => {
        if (para.trim()) addText(para, 11);
      });

      y += 4;
      addText(`Hashtags: ${articleData.hashtags}`, 10);
      addText(`Relevant SDGs: ${articleData.sdgs}`, 10);

      // Embed images
      for (const file of imageFiles) {
        try {
          const dataUrl = await loadImageAsDataUrl(file);
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = dataUrl;
          });
          const maxW = contentW;
          const scale = Math.min(maxW / (img.naturalWidth * 0.264583), 1);
          const w = img.naturalWidth * 0.264583 * scale;
          const h = img.naturalHeight * 0.264583 * scale;
          if (y + h > pdf.internal.pageSize.getHeight() - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.addImage(dataUrl, file.type.includes("png") ? "PNG" : "JPEG", margin, y, w, h);
          y += h + 5;
        } catch {}
      }

      pdf.save(`${form.title.replace(/\s+/g, "_") || "article"}.pdf`);
      toast.success("PDF exported successfully!");
    } catch {
      toast.error("Failed to export PDF");
    }
  }, [articleData, imageFiles, form.title]);

  const handleSubmit = async () => {
    if (!articleData) return;

    const dateFields = computeDateFields(form);

    // Schema validation before submission
    const requiredFields = {
      title: form.title.trim(),
      eventDate: dateFields.eventDate,
      location: form.location.trim(),
      organizingDepartmentName: form.organizingDepartmentName.trim(),
      description: form.description.trim(),
      submitterName: form.submitterName.trim(),
      submitterEmail: form.submitterEmail.trim(),
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      toast.error("Missing required fields. Please go back and complete the form.");
      return;
    }

    if (!articleData.headline || !articleData.article) {
      toast.error("Article data is incomplete. Please regenerate the article.");
      return;
    }
    setSubmitting(true);
    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const blob = await compressImageForUpload(imageFiles[i]);
        const path = `${crypto.randomUUID()}.jpg`;
        let lastErr: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const { error: uploadError } = await supabase.storage
              .from("event-images")
              .upload(path, blob, { contentType: "image/jpeg", upsert: true });
            if (uploadError) throw uploadError;
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
        if (lastErr) {
          throw new Error(`Photo ${i + 1} could not be uploaded. Please check your internet connection and try again.`);
        }
        const { data: urlData } = supabase.storage.from("event-images").getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .insert({
          title: form.title,
          event_date: dateFields.eventDate,
          event_date_type: form.eventDateType,
          start_date: dateFields.startDate,
          end_date: dateFields.endDate,
          event_dates: dateFields.eventDates.length > 0 ? dateFields.eventDates : null,
          location: form.location,
          organizing_department_name: form.organizingDepartmentName,
          description: form.description,
          highlights: form.highlights || null,
          participants: form.participants || null,
          submitter_name: form.submitterName,
          submitter_email: form.submitterEmail,
          submitter_department: form.submitterDepartment || null,
          submitter_phone: form.submitterPhone || null,
          generated_headline: articleData.headline,
          generated_subheading: articleData.subheading,
          generated_article: articleData.article,
          generated_summary: null,
          generated_hashtags: articleData.hashtags,
          generated_sdgs: articleData.sdgs,
          edited_article: editing ? articleData.article : null,
          status: "pending_review" as const,
        })
        .select("id")
        .single();

      if (eventError) throw eventError;

      if (uploadedUrls.length > 0 && eventData) {
        const { error: imgError } = await supabase.from("event_images").insert(
          uploadedUrls.map((url) => ({ event_id: eventData.id, image_url: url }))
        );
        if (imgError) throw imgError;
      }

      toast.success("Report submitted successfully! It's now pending review.");
      clearDraft();
      setStep("form");
      setArticleData(null);
      setImageFiles([]);
      setImagePreviewUrls([]);
      setEditing(false);
      setForm({ ...defaultForm });
    } catch (err: any) {
      toast.error(err?.message === "Failed to fetch" ? "Network problem while submitting. Please check your connection and tap Submit again." : (err?.message || "Failed to submit report."));
    } finally {
      setSubmitting(false);
    }
  };

  // Multiple dates helpers
  const addDate = () => setForm(prev => ({ ...prev, multipleDates: [...prev.multipleDates, ""] }));
  const removeDate = (index: number) => setForm(prev => ({
    ...prev,
    multipleDates: prev.multipleDates.filter((_, i) => i !== index),
  }));
  const updateMultipleDate = (index: number, value: string) => setForm(prev => ({
    ...prev,
    multipleDates: prev.multipleDates.map((d, i) => i === index ? value : d),
  }));

  if (step === "preview" && articleData) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <nav className="border-b bg-card">
          <div className="container flex h-16 items-center justify-between">
            <Link to="/" className="text-xl font-semibold tracking-tight">
              BGS MCH <span className="text-accent">EventReporter</span>
            </Link>
            <div className="flex items-center gap-3">
              <Button variant="ghost" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link to="/signup">Get Started</Link>
              </Button>
            </div>
          </div>
        </nav>
        <main className="flex-1 container py-8">
          <div className="mx-auto max-w-3xl">
            <Button variant="ghost" size="sm" className="mb-4" onClick={() => setStep("form")}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Form
            </Button>

            <h1 className="text-2xl font-semibold tracking-tight">Article Preview</h1>
            <p className="mt-1 text-muted-foreground">Review the AI-generated article. Edit if needed, then submit.</p>

            <div className="mt-6 space-y-6">
              {/* Headline */}
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Headline</Label>
                {editing ? (
                  <Input value={articleData.headline} onChange={updateArticle("headline")} className="text-xl font-semibold" />
                ) : (
                  <h2 className="text-xl font-semibold font-editorial">{articleData.headline}</h2>
                )}
              </div>

              {/* Subheading */}
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Subheading</Label>
                {editing ? (
                  <Input value={articleData.subheading} onChange={updateArticle("subheading")} />
                ) : (
                  <p className="text-lg text-muted-foreground italic">{articleData.subheading}</p>
                )}
              </div>

              {/* Article */}
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Article</Label>
                {editing ? (
                  <Textarea value={articleData.article} onChange={updateArticle("article")} rows={15} />
                ) : (
                  <div className="prose prose-sm max-w-none rounded-lg border bg-card p-6 whitespace-pre-wrap">
                    {articleData.article}
                  </div>
                )}
              </div>

              {/* Attached Images */}
              {imagePreviewUrls.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Attached Images</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {imagePreviewUrls.map((url, i) => (
                      <div key={i} className="relative rounded-md border overflow-hidden">
                        <img src={url} alt={imageFiles[i]?.name || "Event image"} className="w-full h-auto object-cover aspect-video" />
                        <div className="absolute top-1.5 right-1.5 rounded-full bg-green-500 text-white h-5 w-5 flex items-center justify-center">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hashtags */}
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Hashtags</Label>
                {editing ? (
                  <Input value={articleData.hashtags} onChange={updateArticle("hashtags")} />
                ) : (
                  <p className="text-sm text-accent">{articleData.hashtags}</p>
                )}
              </div>

              {/* SDGs */}
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Relevant SDGs</Label>
                {editing ? (
                  <Input value={articleData.sdgs} onChange={updateArticle("sdgs")} />
                ) : (
                  <p className="text-sm">{articleData.sdgs}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-4 border-t">
                <Button variant="outline" onClick={handleRegenerate} disabled={loading}>
                  <RotateCcw className="mr-1 h-4 w-4" />
                  {loading ? "Regenerating…" : "Regenerate"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(!editing)}>
                  <Pencil className="mr-1 h-4 w-4" />
                  {editing ? "Done Editing" : "Manually Edit"}
                </Button>
                <Button variant="outline" onClick={handleExportPdf}>
                  <FileDown className="mr-1 h-4 w-4" /> Export PDF
                </Button>
                <Button variant="outline" onClick={handleExportDocx}>
                  <FileText className="mr-1 h-4 w-4" /> Export DOCX
                </Button>
                <Button variant="generate" onClick={handleSubmit} disabled={submitting}>
                  <Send className="mr-1 h-4 w-4" />
                  {submitting ? "Submitting…" : "Submit Report"}
                </Button>
              </div>
            </div>
          </div>
        </main>
        <footer className="border-t py-8">
          <div className="container text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} BGS MCH EventReporter. Built for BGS Medical College and Hospital campus newsrooms.
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            BGS MCH <span className="text-accent">EventReporter</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>
      <main className="flex-1 container py-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Submit Event Report</h1>
          <p className="mt-1 text-muted-foreground">Fill in the event details below. AI will generate a professional article.</p>

          <form onSubmit={handleGenerate} className="mt-8 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Event Title</Label>
          <Input id="title" value={form.title} onChange={update("title")} placeholder="Annual Science Symposium 2026" required />
        </div>

        {/* Event Date Type */}
        <div className="space-y-3">
          <Label>Event Date Type</Label>
          <RadioGroup
            value={form.eventDateType}
            onValueChange={(val) => setForm(prev => ({ ...prev, eventDateType: val as EventDateType }))}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="single" id="date-single" />
              <Label htmlFor="date-single" className="font-normal cursor-pointer">Single Day</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="range" id="date-range" />
              <Label htmlFor="date-range" className="font-normal cursor-pointer">Date Range</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="multiple" id="date-multiple" />
              <Label htmlFor="date-multiple" className="font-normal cursor-pointer">Multiple Dates</Label>
            </div>
          </RadioGroup>

          {/* Conditional date fields */}
          {form.eventDateType === "single" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="eventDate">Event Date</Label>
                <Input id="eventDate" type="date" value={form.eventDate} onChange={update("eventDate")} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" value={form.location} onChange={update("location")} placeholder="Main Auditorium" required />
              </div>
            </div>
          )}

          {form.eventDateType === "range" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input id="startDate" type="date" value={form.startDate} onChange={update("startDate")} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input id="endDate" type="date" value={form.endDate} onChange={update("endDate")} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location-range">Location</Label>
                <Input id="location-range" value={form.location} onChange={update("location")} placeholder="Main Auditorium" required />
              </div>
            </div>
          )}

          {form.eventDateType === "multiple" && (
            <div className="space-y-3">
              {form.multipleDates.map((date, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor={`multi-date-${index}`}>Date {index + 1}</Label>
                    <Input
                      id={`multi-date-${index}`}
                      type="date"
                      value={date}
                      onChange={(e) => updateMultipleDate(index, e.target.value)}
                      required
                    />
                  </div>
                  {form.multipleDates.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-destructive" onClick={() => removeDate(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addDate}>
                <Plus className="mr-1 h-4 w-4" /> Add Date
              </Button>
              <div className="space-y-2">
                <Label htmlFor="location-multi">Location</Label>
                <Input id="location-multi" value={form.location} onChange={update("location")} placeholder="Main Auditorium" required />
              </div>
            </div>
          )}
        </div>

        {/* Location shown only for single day (already in grid above) */}
        {form.eventDateType === "single" ? null : null}

        <div className="space-y-2">
          <Label htmlFor="organizingDepartmentName">Organizing Department Name</Label>
          <Input id="organizingDepartmentName" value={form.organizingDepartmentName} onChange={update("organizingDepartmentName")} placeholder="Department of Computer Science" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Event Description</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={update("description")}
            placeholder="Describe what happened at the event, the purpose, and any notable moments…"
            rows={5}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="participants">Notable Participants / Speakers</Label>
          <Textarea
            id="participants"
            value={form.participants}
            onChange={update("participants")}
            placeholder="List notable guests, speakers, or participants…"
            rows={3}
          />
        </div>

        {/* Image Upload */}
        <div className="space-y-2">
          <Label>Event Photos (Optional)</Label>
          <div className="rounded-lg border border-dashed p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageSelect}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> Upload Photos
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">Max 10 images. JPG, PNG, or WebP.</p>
            {imageFiles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {imageFiles.map((file, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={imagePreviewUrls[i] || URL.createObjectURL(file)}
                      alt={file.name}
                      className="h-16 w-16 rounded-md object-cover border"
                    />
                    <div className="absolute -top-1 -left-1 rounded-full bg-green-500 text-white h-4 w-4 flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3" />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive text-destructive-foreground h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Submitter Info */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-4">Your Information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="submitterName">Your Name</Label>
              <Input id="submitterName" value={form.submitterName} onChange={update("submitterName")} placeholder="John Doe" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="submitterEmail">Email Address</Label>
              <Input id="submitterEmail" type="email" value={form.submitterEmail} onChange={update("submitterEmail")} placeholder="john@university.edu" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="submitterDepartment">Department</Label>
              <Input id="submitterDepartment" value={form.submitterDepartment} onChange={update("submitterDepartment")} placeholder="Computer Science" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="submitterPhone">Phone Number</Label>
              <Input id="submitterPhone" type="tel" value={form.submitterPhone} onChange={update("submitterPhone")} placeholder="+91 98765 43210" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t">
          <Button type="submit" variant="generate" size="lg" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Generate Article
              </>
            )}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/">Cancel</Link>
          </Button>
        </div>
      </form>
        </div>
      </main>
      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} BGS MCH EventReporter. Built for BGS Medical College and Hospital campus newsrooms.
        </div>
      </footer>
    </div>
  );
}
