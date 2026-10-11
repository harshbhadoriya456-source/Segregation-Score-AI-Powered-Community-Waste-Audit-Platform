"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent } from "react";

type IconName =
  | "leaf"
  | "recycle"
  | "shield"
  | "alert"
  | "upload"
  | "image"
  | "check"
  | "arrow"
  | "scan"
  | "info"
  | "file"
  | "spark"
  | "minus";

const STREAMS = [
  { id: "wet", label: "Wet waste", description: "Food scraps, peels and other organic matter.", icon: "leaf" },
  { id: "dry", label: "Dry waste", description: "Paper, cardboard, plastic, metal and glass.", icon: "recycle" },
  { id: "sanitary", label: "Sanitary", description: "Used hygiene products and personal care items.", icon: "shield" },
  { id: "special", label: "Special care", description: "Hazardous items and electronic waste.", icon: "alert" },
] as const;

type Stream = (typeof STREAMS)[number]["id"];
type Priority = "high" | "review" | "normal" | "uncertain";
type Tone = "success" | "warning" | "danger" | "neutral";

type WasteCategoryId =
  | "organic"
  | "plastic_packaging"
  | "paper_cardboard"
  | "glass"
  | "metal"
  | "sanitary"
  | "hazardous"
  | "unknown";
type BoundingBox = { left: number; top: number; width: number; height: number };
type DetectedInstance = {
  boundingBox: BoundingBox | null;
  confidence: number | null;
};
type DetectedLabel = {
  name: string;
  confidence: number;
  parents?: string[];
  categoryId?: WasteCategoryId;
  materialSpecific?: boolean;
  instances?: DetectedInstance[];
};
type WasteCategorySummary = {
  id: WasteCategoryId;
  name: string;
  count: number;
  evidenceLabels: string[];
  labelIndexes: number[];
  materialSpecific: boolean;
  compatible: boolean | null;
  advice: string;
};
type EvidenceGroup = {
  categoryId?: WasteCategoryId;
  name: string;
  evidenceLabel: string | null;
  evidenceLabels?: string[];
  confidence: number | null;
  strength: "strong" | "uncertain";
  compatible: boolean;
  materialSpecific?: boolean;
};
type Assessment = {
  score: number | null;
  scoreLabel: string;
  status: string;
  verdictLabel?: string;
  priority?: Priority;
  matchedCategories: string[];
  possibleMismatches: string[];
  hazardSignals: string[];
  evidenceGroups: EvidenceGroup[];
  recommendations: string[];
  explanation: string;
};
type Analysis = {
  source: "yolo" | "rekognition";
  detectedLabels: DetectedLabel[];
  categories: WasteCategorySummary[];
  localGuidance: string | null;
  labelModelVersion?: string | null;
  note: string;
  assessment?: Assessment;
};
type ApiResponse = {
  fileName?: string;
  error?: string;
  source?: "yolo" | "rekognition";
  detectedLabels?: DetectedLabel[];
  categories?: WasteCategorySummary[];
  localGuidance?: string | null;
  modelOutput?: {
    labelModelVersion: string | null;
    labels: unknown[];
  };
  note?: string;
  assessment?: Partial<Assessment>;
};
type MessageKind = "info" | "error" | "success";

const ACCEPTED_TYPES = ["image/jpeg", "image/png"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const STYLES = `
@keyframes ss-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes ss-reveal { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes ss-scan { 0% { top: -20%; } 100% { top: 110%; } }
@keyframes ss-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@keyframes ss-bar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.ss-rise { animation: ss-rise 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.ss-d1 { animation-delay: 0.08s; }
.ss-d2 { animation-delay: 0.16s; }
.ss-d3 { animation-delay: 0.24s; }
.ss-reveal { animation: ss-reveal 0.55s ease-out both; }
.ss-scan-line { animation: ss-scan 2.2s ease-in-out infinite; }
.ss-pulse { animation: ss-pulse 1.8s ease-in-out infinite; }
.ss-pulse-2 { animation-delay: 0.3s; }
.ss-pulse-3 { animation-delay: 0.6s; }
.ss-bar { transform-origin: left center; animation: ss-bar 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.ss-lift { transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .ss-scan-line { display: none; }
}
`;

const BACKGROUND_STYLE = {
  backgroundColor: "#f7f4ec",
  backgroundImage:
    "radial-gradient(circle at 85% -5%, rgba(143, 184, 128, 0.28), transparent 45%), radial-gradient(circle at 0% 40%, rgba(29, 59, 42, 0.07), transparent 40%), radial-gradient(rgba(29, 59, 42, 0.045) 1px, transparent 1px)",
  backgroundSize: "auto, auto, 22px 22px",
} as const;

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
    focusable: false,
  };
  switch (name) {
    case "leaf":
      return (
        <svg {...common}>
          <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" />
          <path d="M5 19l7-7" />
        </svg>
      );
    case "recycle":
      return (
        <svg {...common}>
          <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8" />
          <path d="M20 4v4h-4" />
          <path d="M20 12a8 8 0 0 1-13.7 5.6L4 16" />
          <path d="M4 20v-4h4" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M12 4l9 16H3L12 4z" />
          <path d="M12 10v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M4 20h16" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 16l-5-5-8 8" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M7 17L17 7" />
          <path d="M9 7h8v8" />
        </svg>
      );
    case "scan":
      return (
        <svg {...common}>
          <path d="M4 8V5a1 1 0 0 1 1-1h3" />
          <path d="M16 4h3a1 1 0 0 1 1 1v3" />
          <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
          <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
          <path d="M4 12h16" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M7 3h7l5 5v13H7z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
        </svg>
      );
    case "minus":
      return (
        <svg {...common}>
          <path d="M6 12h12" />
        </svg>
      );
  }
}

function normalizeAssessment(raw?: Partial<Assessment>): Assessment | undefined {
  if (!raw) return undefined;
  return {
    score: typeof raw.score === "number" ? raw.score : null,
    scoreLabel: raw.scoreLabel ?? "",
    status: raw.status ?? "insufficient_evidence",
    verdictLabel: raw.verdictLabel,
    priority: raw.priority,
    matchedCategories: raw.matchedCategories ?? [],
    possibleMismatches: raw.possibleMismatches ?? [],
    hazardSignals: raw.hazardSignals ?? [],
    evidenceGroups: raw.evidenceGroups ?? [],
    recommendations: raw.recommendations ?? [],
    explanation: raw.explanation ?? "",
  };
}

type Verdict = { tone: Tone; icon: IconName; title: string; description: string };

function getVerdict(status: string, priority?: Priority): Verdict {
  if (status === "high_priority_review" || priority === "high") {
    return {
      tone: "danger",
      icon: "alert",
      title: "High-priority safety review",
      description: "A potential safety signal was detected. Verify the item visually before handling or disposal.",
    };
  }

  switch (status) {
    case "possible_mismatch":
      return {
        tone: "warning",
        icon: "alert",
        title: "Possible sorting mismatch",
        description: "Some detected categories may not belong in this waste stream.",
      };
    case "likely_match":
      return {
        tone: "success",
        icon: "check",
        title: "Likely category match",
        description: "Detected categories appear compatible with this waste stream.",
      };
    default:
      return {
        tone: "neutral",
        icon: "minus",
        title: "Insufficient evidence",
        description: "The photo did not provide enough evidence for a reliable verdict.",
      };
  }
}

const TONE_STYLES: Record<Tone, { card: string; iconWrap: string }> = {
  danger: { card: "border-red-200 bg-red-50/70", iconWrap: "bg-red-100 text-red-700" },
  warning: { card: "border-amber-200 bg-amber-50/70", iconWrap: "bg-amber-100 text-amber-800" },
  success: { card: "border-[#cfe2c2] bg-[#f4f9f0]", iconWrap: "bg-[#dfeed5] text-[#3f6a36]" },
  neutral: { card: "border-[#e2e7de] bg-[#f8f9f5]", iconWrap: "bg-white text-[#73806f]" },
};

const PRIORITY_META: Record<Priority, { label: string; className: string }> = {
  high: { label: "High-priority review", className: "bg-red-100 text-red-800" },
  review: { label: "Review needed", className: "bg-amber-100 text-amber-800" },
  normal: { label: "Normal priority", className: "bg-[#dfeed5] text-[#3f6a36]" },
  uncertain: { label: "Evidence uncertain", className: "bg-white text-[#667363] ring-1 ring-[#e0e6dc]" },
};

const CATEGORY_TONES: Record<WasteCategoryId, { color: string; background: string }> = {
  organic: { color: "#63834d", background: "rgb(99 131 77 / 12%)" },
  plastic_packaging: { color: "#4b7f91", background: "rgb(75 127 145 / 12%)" },
  paper_cardboard: { color: "#a47c3f", background: "rgb(164 124 63 / 12%)" },
  glass: { color: "#6373a0", background: "rgb(99 115 160 / 12%)" },
  metal: { color: "#66737a", background: "rgb(102 115 122 / 12%)" },
  sanitary: { color: "#9b6379", background: "rgb(155 99 121 / 12%)" },
  hazardous: { color: "#b55342", background: "rgb(181 83 66 / 12%)" },
  unknown: { color: "#778074", background: "rgb(119 128 116 / 12%)" },
};

function SectionEyebrow({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6f8a68]">{children}</p>
  );
}

export default function Home() {
  const [stream, setStream] = useState<Stream>("wet");
  const [photo, setPhoto] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<MessageKind>("info");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState<{
    labelIndex: number;
    instanceIndex: number | null;
  } | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const elements = Array.from(page.querySelectorAll<HTMLElement>("[data-reveal]"));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    page.classList.add("motion-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -36px 0px" },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo);
    };
  }, [photo]);

  function showMessage(text: string, kind: MessageKind) {
    setMessage(text);
    setMessageKind(kind);
  }

  function selectDetection(labelIndex: number, instanceIndex: number | null) {
    setSelectedDetection({ labelIndex, instanceIndex });
  }

  function selectCategory(category: WasteCategorySummary) {
    const labelIndex =
      category.labelIndexes.find(
        (index) =>
          (analysis?.detectedLabels[index]?.instances?.some(
            (instance) => instance.boundingBox !== null,
          ) ?? false),
      ) ?? category.labelIndexes[0];
    if (labelIndex === undefined) return;
    const firstInstanceIndex = analysis?.detectedLabels[
      labelIndex
    ]?.instances?.findIndex((instance) => instance.boundingBox !== null);
    selectDetection(
      labelIndex,
      firstInstanceIndex !== undefined && firstInstanceIndex >= 0
        ? firstInstanceIndex
        : null,
    );
  }

  function handleFile(file?: File) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      showMessage("Please select a JPG or PNG image.", "error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showMessage("Image must be smaller than 5 MB.", "error");
      return;
    }
    showMessage("", "info");
    setAnalysis(null);
    setSelectedDetection(null);
    selectedFileRef.current = file;
    setFileName(file.name);
    setPhoto(URL.createObjectURL(file));
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (isAnalyzing) return;
    handleFile(event.dataTransfer.files?.[0]);
  }

  async function analyzePhoto() {
    if (!photo) {
      showMessage("Upload a waste photo before starting the audit.", "error");
      return;
    }
    const file = selectedFileRef.current ?? inputRef.current?.files?.[0];
    if (!file) {
      showMessage("Please select the photo again.", "error");
      return;
    }
    setIsAnalyzing(true);
    setAnalysis(null);
    setSelectedDetection(null);
    showMessage("", "info");
    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("stream", stream);
      const response = await fetch("/api/analyze", { method: "POST", body: formData });
      const result: ApiResponse = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setAnalysis({
        source: result.source ?? "rekognition",
        detectedLabels: result.detectedLabels ?? [],
        categories: result.categories ?? [],
        localGuidance: result.localGuidance ?? null,
        labelModelVersion: result.modelOutput?.labelModelVersion ?? null,
        note: result.note ?? "",
        assessment: normalizeAssessment(result.assessment),
      });
      showMessage(`Audit completed for ${result.fileName ?? fileName}.`, "success");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
        "error",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  const activeStream = STREAMS.find((item) => item.id === stream) ?? STREAMS[0];
  const analysisModelName =
    analysis?.source === "yolo" ? "TACO YOLO26n" : "Amazon Rekognition";
  const assessment = analysis?.assessment;
  const verdict = assessment ? getVerdict(assessment.status, assessment.priority) : null;
  const hasHazards = (assessment?.hazardSignals.length ?? 0) > 0;
  const scoreRing = assessment?.score === null || assessment?.score === undefined
    ? 0
    : Math.min(100, Math.max(0, assessment.score));
  const confidenceBands = analysis
    ? [
        {
          label: "High · 90–100%",
          count: analysis.detectedLabels.filter((label) => label.confidence >= 90).length,
          tone: "high",
        },
        {
          label: "Mid · 75–89%",
          count: analysis.detectedLabels.filter(
            (label) => label.confidence >= 75 && label.confidence < 90,
          ).length,
          tone: "mid",
        },
        {
          label: "Lower · under 75%",
          count: analysis.detectedLabels.filter((label) => label.confidence < 75).length,
          tone: "low",
        },
      ].filter((band) => band.count > 0)
    : [];
  const largestConfidenceBand = Math.max(1, ...confidenceBands.map((band) => band.count));
  const visibleCategories = (analysis?.categories ?? []).filter(
    (category) => category.count > 0,
  );
  const mappedLabelCount = (analysis?.categories ?? [])
    .filter((category) => category.id !== "unknown")
    .reduce((count, category) => count + category.count, 0);
  const unclassifiedLabelCount =
    analysis?.categories.find((category) => category.id === "unknown")?.count ?? 0;
  const largestCategoryCount = Math.max(
    1,
    ...visibleCategories.map((category) => category.count),
  );
  const boxedInstanceCount =
    analysis?.detectedLabels.reduce(
      (count, label) =>
        count +
        (label.instances?.filter((instance) => instance.boundingBox !== null)
          .length ?? 0),
      0,
    ) ?? 0;

  return (
    <div ref={pageRef} className="site-shell relative min-h-screen text-[#1f2a24]" style={BACKGROUND_STYLE}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <header className="site-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/" className="brand-lockup group">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1d3b2a] text-[#c9e59a] shadow-md shadow-[#1d3b2a]/20 transition-transform duration-300 group-hover:-rotate-6">
              <Icon name="recycle" className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-[16px] font-semibold tracking-[-0.02em]">
                Segregation <span className="text-[#5d8a4d]">Score</span>
              </span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8a9785]">
                Waste audit
              </span>
            </span>
          </Link>

          <nav aria-label="Main navigation" className="site-nav">
            <a href="#streams">The streams</a>
            <a href="#audit">Run an audit</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-grain" aria-hidden="true" />
          <div className="hero-inner mx-auto max-w-7xl px-5 sm:px-8">
            <div className="hero-copy" data-reveal>
              <p className="hero-kicker">
                <span className="hero-kicker-mark" />
                Environmental intelligence · made tangible
              </p>
              <h1>
                <span>Waste less.</span>
                <span className="hero-headline-accent">See more.</span>
              </h1>
              <p className="hero-description">
                A clearer view of what belongs where. Make each sorting decision
                with more context, one photo at a time.
              </p>
              <div className="hero-actions">
                <a href="#audit" className="hero-cta">
                  Start your audit <Icon name="arrow" className="h-4 w-4" />
                </a>
                <a href="#streams" className="hero-text-link">Explore the streams</a>
              </div>
            </div>

            <div
              className="hero-visual"
              data-reveal
              role="img"
              aria-label="An illustrated view of Earth surrounded by material signals"
              onPointerMove={(event) => {
                if (
                  event.pointerType !== "mouse" ||
                  window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ) {
                  return;
                }
                const bounds = event.currentTarget.getBoundingClientRect();
                const x = (event.clientX - bounds.left - bounds.width / 2) / bounds.width;
                const y = (event.clientY - bounds.top - bounds.height / 2) / bounds.height;
                event.currentTarget.style.setProperty("--pointer-x", `${x * 8}px`);
                event.currentTarget.style.setProperty("--pointer-y", `${y * 8}px`);
              }}
              onPointerLeave={(event) => {
                event.currentTarget.style.setProperty("--pointer-x", "0px");
                event.currentTarget.style.setProperty("--pointer-y", "0px");
              }}
            >
              <div className="hero-visual-caption">
                <span>01 — 04</span>
                <span>A wider perspective</span>
              </div>
              <div className="earth-stage" aria-hidden="true">
                <span className="earth-halo earth-halo-one" />
                <span className="earth-halo earth-halo-two" />
                <span className="earth-orbit earth-orbit-one"><i /></span>
                <span className="earth-orbit earth-orbit-two"><i /></span>
                <svg className="earth-art" viewBox="0 0 480 480" fill="none">
                  <defs>
                    <radialGradient id="earth-light" cx="34%" cy="27%" r="75%">
                      <stop offset="0%" stopColor="#80aa72" />
                      <stop offset="55%" stopColor="#28593f" />
                      <stop offset="100%" stopColor="#102e22" />
                    </radialGradient>
                    <linearGradient id="earth-edge" x1="90" y1="90" x2="390" y2="400">
                      <stop stopColor="#d2ef9f" stopOpacity=".8" />
                      <stop offset="1" stopColor="#a2c682" stopOpacity=".08" />
                    </linearGradient>
                    <clipPath id="earth-clip"><circle cx="240" cy="240" r="154" /></clipPath>
                  </defs>
                  <circle cx="240" cy="240" r="177" fill="#b9dc87" fillOpacity=".07" />
                  <circle cx="240" cy="240" r="154" fill="url(#earth-light)" />
                  <g clipPath="url(#earth-clip)">
                    <path d="M107 178l23-21 18 4 12-17 29-8 13 11 22 1 10 16-12 12-3 20-19 8-4 22-20 8-17 22-21-5-9-20-20-8-10-23-18-4-7-18 13-10z" fill="#b8cf87" fillOpacity=".88" />
                    <path d="M216 247l22-11 21 8 11 20-7 19 10 16-9 31-17 17-12 29-17-10-7-31-15-20 2-22-12-20 5-19-9-18 14-9z" fill="#c3d893" fillOpacity=".78" />
                    <path d="M271 144l18-15 26 5 11 14 26 2 17 16-5 22 16 14-11 18-23-4-15 14-18-7-8-20-21-7-5-24-18-8 10-20z" fill="#c3d893" fillOpacity=".83" />
                    <path d="M319 256l18-11 22 8 9 19-10 18-20 6-18-13-6-15 5-12z" fill="#b8cf87" fillOpacity=".76" />
                    <path d="M100 238c34 84 105 142 194 154" stroke="#d9edb7" strokeOpacity=".22" strokeWidth="2" />
                    <path d="M110 129c49-38 113-58 183-53" stroke="#d9edb7" strokeOpacity=".18" strokeWidth="2" />
                    <path d="M240 83c-35 48-54 101-54 157s19 109 54 157" stroke="#d9edb7" strokeOpacity=".2" strokeWidth="2" />
                    <path d="M240 83c35 48 54 101 54 157s-19 109-54 157" stroke="#d9edb7" strokeOpacity=".16" strokeWidth="2" />
                  </g>
                  <circle cx="240" cy="240" r="154" stroke="url(#earth-edge)" strokeWidth="1.5" />
                  <path d="M136 133c25-22 55-37 88-44" stroke="#e4f4c7" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <span className="earth-signal signal-organic"><Icon name="leaf" className="h-4 w-4" /><span>ORGANIC</span></span>
                <span className="earth-signal signal-material"><Icon name="recycle" className="h-4 w-4" /><span>MATERIAL</span></span>
                <span className="earth-signal signal-care"><Icon name="shield" className="h-4 w-4" /><span>SPECIAL CARE</span></span>
              </div>
              <div className="hero-visual-foot">
                <span>See the signal.</span>
                <span className="hero-visual-line" />
                <span>Choose with care.</span>
              </div>
            </div>
          </div>
          <a className="scroll-cue" href="#streams">
            <span className="scroll-cue-line" />
            Scroll to explore
          </a>
        </section>

        <section id="streams" className="streams-section">
          <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
            <div className="streams-heading" data-reveal>
              <SectionEyebrow>Four streams · one clearer decision</SectionEyebrow>
              <h2>Good sorting starts<br /><em>with seeing the difference.</em></h2>
              <p>
                Different materials ask for different care. Choose the stream
                you are checking to begin with the right context.
              </p>
            </div>
            <div className="stream-story-grid">
              {STREAMS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  data-reveal
                  className={`stream-story-card stream-story-${item.id}`}
                  onClick={() => {
                    setStream(item.id);
                    document.getElementById("audit")?.scrollIntoView({
                      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                        ? "auto"
                        : "smooth",
                    });
                  }}
                  aria-label={`Select ${item.label} and start an audit`}
                >
                  <span className="stream-card-index">0{index + 1} / STREAM</span>
                  <span className="stream-card-art"><Icon name={item.icon} className="h-8 w-8" /></span>
                  <span className="stream-card-title">{item.label}</span>
                  <span className="stream-card-description">{item.description}</span>
                  <span className="stream-card-action">Select stream <Icon name="arrow" className="h-4 w-4" /></span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="audit" className="audit-section">
          <div className="audit-section-heading mx-auto max-w-7xl px-5 sm:px-8" data-reveal>
            <div>
              <SectionEyebrow>From image to insight</SectionEyebrow>
              <h2>A more considered<br /><em>waste audit.</em></h2>
            </div>
            <p>
              Choose what you are checking. Add a clear photo. Review the
              evidence and decide what to do next.
            </p>
          </div>

        <div className="workspace-layout mx-auto grid max-w-7xl gap-6 px-5 pb-24 sm:px-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-start">
          {/* Audit workspace */}
          <section
            aria-labelledby="audit-title"
            data-reveal
            className="workspace-panel rounded-[28px] border border-white bg-white/90 p-5 shadow-[0_24px_60px_-40px_rgba(29,59,42,0.35)] sm:p-7"
          >
            <SectionEyebrow>Audit workspace</SectionEyebrow>
            <h2 id="audit-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#183025]">
              Check a waste bin
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#748270]">
              Choose the stream you are checking, then add a clear photo of the items.
            </p>

            <fieldset className="mt-7" disabled={isAnalyzing}>
              <legend className="mb-3 flex w-full items-center justify-between text-sm font-semibold text-[#1f2f24]">
                <span>Waste stream</span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-[#9aa796]">Step 1 of 2</span>
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {STREAMS.map((item) => {
                  const selected = stream === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setStream(item.id);
                        setAnalysis(null);
                      }}
                      className={`ss-lift group relative flex flex-col rounded-2xl border p-4 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#cfe3c4] disabled:cursor-not-allowed ${
                        selected
                          ? "border-[#4f7a45] bg-[#f1f7ec] shadow-[0_12px_28px_-20px_rgba(29,59,42,0.6)]"
                          : "border-[#e1e8dc] bg-white hover:-translate-y-0.5 hover:border-[#b7cfad] hover:shadow-[0_12px_24px_-20px_rgba(29,59,42,0.4)]"
                      }`}
                    >
                      <span
                        className={`ss-lift grid h-10 w-10 place-items-center rounded-xl ${
                          selected ? "bg-[#1d3b2a] text-[#c9e59a]" : "bg-[#f1f4ec] text-[#5f7a58] group-hover:bg-[#e8f0df]"
                        }`}
                      >
                        <Icon name={item.icon} className="h-5 w-5" />
                      </span>
                      <span className="mt-3 text-sm font-semibold text-[#1f2f24]">{item.label}</span>
                      <span className="mt-1 text-xs leading-5 text-[#7a8877]">{item.description}</span>
                      <span
                        aria-hidden="true"
                        className={`absolute right-3.5 top-3.5 grid h-5 w-5 place-items-center rounded-full border transition-all duration-200 ${
                          selected ? "border-[#4f7a45] bg-[#4f7a45] text-white" : "border-[#d3dccb] bg-white text-transparent"
                        }`}
                      >
                        <Icon name="check" className="h-3 w-3" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#1f2f24]">Waste photo</span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-[#9aa796]">Step 2 of 2</span>
              </div>

              <input
                ref={inputRef}
                id="waste-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="peer sr-only"
                disabled={isAnalyzing}
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <label
                htmlFor="waste-photo"
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isAnalyzing) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`group relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-5 text-center transition-all duration-200 peer-focus-visible:ring-4 peer-focus-visible:ring-[#cfe3c4] ${
                  isDragging
                    ? "border-[#4f7a45] bg-[#eef6e7]"
                    : photo
                      ? "border-[#b9d0ae] bg-[#f8fbf5]"
                      : "border-[#c8d7bf] bg-[#fafcf8] hover:border-[#8fb181] hover:bg-[#f3f8ef]"
                }`}
              >
                {photo ? (
                  <>
                    <img
                      src={photo}
                      alt="Selected waste photo preview"
                      className="ss-reveal max-h-64 w-full rounded-xl object-contain"
                    />
                    {isAnalyzing && (
                      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                        <span className="ss-scan-line absolute inset-x-0 h-20 bg-gradient-to-b from-transparent via-[#b7d66b]/45 to-transparent" />
                      </span>
                    )}
                    <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe6d2] bg-white px-3 py-1.5 text-xs font-medium text-[#48703f]">
                      <Icon name="image" className="h-3.5 w-3.5" />
                      {isAnalyzing ? "Scanning photo" : "Click or drop to replace"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#4f7a45] shadow-sm ring-1 ring-[#e3ebdc] transition-transform duration-200 group-hover:-translate-y-1">
                      <Icon name="upload" className="h-5 w-5" />
                    </span>
                    <span className="mt-4 text-sm font-semibold text-[#1f2f24]">
                      {isDragging ? "Release to add the photo" : "Drop a photo here, or browse"}
                    </span>
                    <span className="mt-1.5 text-xs text-[#8a9786]">JPG or PNG, up to 5 MB</span>
                  </>
                )}
              </label>

              {fileName && (
                <p className="mt-2.5 flex items-center gap-2 text-xs text-[#748270]">
                  <Icon name="file" className="h-3.5 w-3.5 shrink-0 text-[#5d8a4d]" />
                  <span className="min-w-0 truncate">{fileName}</span>
                </p>
              )}
            </div>

            {message && (
              <div
                role={messageKind === "error" ? "alert" : "status"}
                className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
                  messageKind === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : messageKind === "success"
                      ? "border-[#cfe2c2] bg-[#f4f9f0] text-[#3f6a36]"
                      : "border-[#e2e7de] bg-[#f8f9f5] text-[#5f6f60]"
                }`}
              >
                {message}
              </div>
            )}

            <button
              type="button"
              onClick={analyzePhoto}
              disabled={isAnalyzing || !photo}
              aria-busy={isAnalyzing}
              className="group mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#1d3b2a] px-5 py-4 text-sm font-semibold text-white shadow-[0_12px_24px_-14px_rgba(29,59,42,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#25503a] hover:shadow-[0_16px_28px_-14px_rgba(29,59,42,0.6)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#cfe3c4] active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#3b5a48] disabled:opacity-70 disabled:shadow-none"
            >
              {isAnalyzing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" />
                  Analyzing photo
                </>
              ) : (
                <>
                  Run waste audit
                  <Icon name="arrow" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
            {!photo && !isAnalyzing && (
              <p className="mt-3 text-center text-xs text-[#9aa796]">Add a photo to enable the audit.</p>
            )}
            <p className="mt-4 text-center text-[11px] leading-5 text-[#9aa796]">
              Your photo is sent for analysis only when you run the audit.
            </p>
          </section>

          {/* Results */}
          <section aria-labelledby="results-title" aria-live="polite" className="results-panel min-w-0" data-reveal>
            <div className="flex items-center justify-between gap-3">
              <div>
                <SectionEyebrow>Results</SectionEyebrow>
                <h2 id="results-title" className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-[#183025]">
                  Audit summary
                </h2>
              </div>
              <span className="rounded-full border border-[#dbe5d3] bg-white/80 px-3 py-1.5 text-[11px] font-medium text-[#48703f]">
                {activeStream.label}
              </span>
            </div>

            {isAnalyzing && (
              <div className="mt-5 rounded-[24px] border border-[#e1e8dc] bg-white/90 p-7 text-center shadow-[0_18px_40px_-34px_rgba(29,59,42,0.4)]">
                <div className="mx-auto flex w-fit items-center gap-1.5" aria-hidden="true">
                  <span className="ss-pulse h-2 w-2 rounded-full bg-[#5d8a4d]" />
                  <span className="ss-pulse ss-pulse-2 h-2 w-2 rounded-full bg-[#5d8a4d]" />
                  <span className="ss-pulse ss-pulse-3 h-2 w-2 rounded-full bg-[#5d8a4d]" />
                </div>
                <p className="mt-4 text-sm font-semibold text-[#1f2f24]">Analyzing your photo</p>
                <p className="mt-1 text-xs leading-5 text-[#7a8877]">
                  Waiting for the image analysis to return. This usually takes a few moments.
                </p>
              </div>
            )}

            {!isAnalyzing && !analysis && (
              <div className="mt-5 rounded-[24px] border border-dashed border-[#c8d7bf] bg-white/60 p-8 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#eaf2e2] text-[#3f6a36]">
                  <Icon name="scan" className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm font-semibold text-[#1f2f24]">Your audit results will appear here</p>
                <p className="mx-auto mt-1.5 max-w-xs text-xs leading-5 text-[#7a8877]">
                  Select a waste stream, add a photo, and run the audit to see detected categories, possible mismatches, and suggested next steps.
                </p>
              </div>
            )}

            {analysis && (
              <div
                className="ss-reveal mt-5 space-y-4"
                key={`${stream}-${analysis.detectedLabels.length}-${analysis.note}`}
              >
                {photo && (
                  <figure className="rounded-2xl border border-[#e1e8dc] bg-white p-4 sm:p-5">
                    <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <span>
                        <span className="block text-sm font-semibold text-[#1f2f24]">
                          Detected-object overlay
                        </span>
                        <span className="mt-1 block text-[11px] leading-5 text-[#7a8877]">
                          Boxes come from {analysisModelName} predictions. Labels and boxes may overlap and do not prove unique physical objects.
                        </span>
                      </span>
                      <span className="rounded-full bg-[#f1f5ee] px-2.5 py-1 text-[10px] font-medium text-[#5f7a58]">
                        {boxedInstanceCount} boxed instances
                      </span>
                      {analysis.labelModelVersion && (
                        <span className="w-full text-right text-[10px] text-[#7a8877]">
                          {analysisModelName} model {analysis.labelModelVersion}
                        </span>
                      )}
                    </figcaption>
                    <div className="detection-image-frame">
                      <img
                        src={photo}
                        alt={`Waste photo with ${analysisModelName} object-instance boxes`}
                        className="detection-image"
                      />
                      <div className="detection-box-layer">
                        {analysis.detectedLabels.flatMap((label, labelIndex) =>
                          (label.instances ?? []).flatMap((instance, instanceIndex) => {
                            if (!instance.boundingBox) return [];
                            const tone =
                              CATEGORY_TONES[label.categoryId ?? "unknown"];
                            const selected =
                              selectedDetection?.labelIndex === labelIndex &&
                              selectedDetection.instanceIndex === instanceIndex;
                            const { left, top, width, height } = instance.boundingBox;
                            return (
                              [<button
                                key={`${label.name}-${labelIndex}-${instanceIndex}`}
                                type="button"
                                className={`detection-box${selected ? " detection-box-active" : ""}`}
                                style={{
                                  left: `${left * 100}%`,
                                  top: `${top * 100}%`,
                                  width: `${width * 100}%`,
                                  height: `${height * 100}%`,
                                  borderColor: tone.color,
                                  backgroundColor: tone.background,
                                  outlineColor: tone.color,
                                  color: tone.color,
                                }}
                                aria-label={`${label.name}, label confidence ${label.confidence} percent${
                                  instance.confidence === null
                                    ? ""
                                    : `, instance confidence ${instance.confidence} percent`
                                }`}
                                aria-pressed={selected}
                                title={`${label.name} · label confidence ${label.confidence}%${
                                  instance.confidence === null
                                    ? ""
                                    : ` · instance confidence ${instance.confidence}%`
                                }`}
                                onClick={() =>
                                  selectDetection(labelIndex, instanceIndex)
                                }
                              >
                                <span
                                  className={`detection-box-label${top < 0.12 ? " detection-box-label-below" : ""}${left + width > 0.82 ? " detection-box-label-right" : ""}`}
                                >
                                  {label.name} · label {label.confidence}%
                                  {instance.confidence === null
                                    ? ""
                                    : ` · box ${instance.confidence}%`}
                                </span>
                              </button>
                              ]
                            );
                          }),
                        )}
                      </div>
                    </div>
                    {boxedInstanceCount === 0 && (
                      <p className="mt-3 rounded-xl bg-[#f7f9f4] px-3 py-2.5 text-xs leading-5 text-[#687565]">
                        {analysisModelName} returned no usable instance bounding boxes for these labels. They can be reviewed as image-level labels, but no object locations are available.
                      </p>
                    )}
                    <div className="detection-inventory">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-xs font-semibold text-[#1f2f24]">
                          Detection inventory
                        </h3>
                        <span className="text-[10px] text-[#7a8877]">
                          {boxedInstanceCount} localized instances
                        </span>
                      </div>
                      {analysis.detectedLabels.length > 0 ? (
                        <ul className="detection-inventory-list">
                          {analysis.detectedLabels.flatMap((label, labelIndex) => {
                            const boxedInstances = (label.instances ?? [])
                              .map((instance, instanceIndex) => ({
                                instance,
                                instanceIndex,
                              }))
                              .filter(({ instance }) => instance.boundingBox);

                            if (boxedInstances.length === 0) {
                              return [
                                <li
                                  key={`${label.name}-${labelIndex}-image-label`}
                                  className="detection-inventory-item"
                                >
                                  <span className="detection-inventory-title">
                                    {label.name}
                                  </span>
                                  <span className="detection-inventory-meta">
                                    {analysisModelName} prediction: {label.name} · label confidence {label.confidence}% · image-level, no box
                                    {(label.instances?.length ?? 0) > 0 &&
                                      ` · ${label.instances?.length} instance record(s) without usable box coordinates`}
                                  </span>
                                  <span className="detection-inventory-meta">
                                    {label.categoryId === "unknown"
                                      ? "Waste classification: uncertain · no waste-material category inferred"
                                      : label.categoryId === "plastic_packaging" &&
                                          !label.materialSpecific
                                        ? "Waste classification: uncertain · packaging material not established"
                                        : `Unverified waste-category candidate: ${
                                            analysis.categories.find(
                                              (category) =>
                                                category.id === label.categoryId,
                                            )?.name ?? label.categoryId
                                          }`}
                                  </span>
                                  {!!label.parents?.length && (
                                    <span className="detection-inventory-meta">
                                      Parent labels: {label.parents.join(", ")}
                                    </span>
                                  )}
                                </li>,
                              ];
                            }

                            return boxedInstances.map(
                              ({ instance, instanceIndex }) => (
                                <li
                                  key={`${label.name}-${labelIndex}-${instanceIndex}`}
                                >
                                  <button
                                    type="button"
                                    className="detection-inventory-item"
                                    aria-pressed={
                                      selectedDetection?.labelIndex ===
                                        labelIndex &&
                                      selectedDetection.instanceIndex ===
                                        instanceIndex
                                    }
                                    onClick={() =>
                                      selectDetection(labelIndex, instanceIndex)
                                    }
                                  >
                                    <span className="detection-inventory-title">
                                      {analysisModelName} prediction: {label.name}
                                      {boxedInstances.length > 1 &&
                                        ` · Instance ${instanceIndex + 1}`}
                                    </span>
                                    <span className="detection-inventory-meta">
                                      {label.confidence}% label confidence
                                      {instance.confidence === null
                                        ? " · instance confidence unavailable"
                                        : ` · ${instance.confidence}% instance confidence`}
                                    </span>
                                    <span className="detection-inventory-meta">
                                      {label.categoryId === "unknown"
                                        ? "Waste classification: uncertain · no waste-material category inferred"
                                        : label.categoryId === "plastic_packaging" &&
                                            !label.materialSpecific
                                          ? "Waste classification: uncertain · packaging material not established"
                                          : `Unverified waste-category candidate: ${
                                              analysis.categories.find(
                                                (category) =>
                                                  category.id === label.categoryId,
                                              )?.name ?? label.categoryId
                                            }`}
                                    </span>
                                    {!!label.parents?.length && (
                                      <span className="detection-inventory-meta">
                                        Parent labels: {label.parents.join(", ")}
                                      </span>
                                    )}
                                  </button>
                                </li>
                              ),
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="mt-2 text-[11px] text-[#7a8877]">
                          {analysisModelName} returned no labels for this image.
                        </p>
                      )}
                      <p className="mt-3 text-[10px] leading-4 text-[#7a8877]">
                        Model confidence describes confidence in a prediction, not the probability that the object or material is correct.
                      </p>
                    </div>
                  </figure>
                )}

                {hasHazards && assessment && (
                  <div role="alert" className="rounded-2xl border-2 border-red-300 bg-red-50 p-5">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-600 text-white">
                        <Icon name="alert" className="h-4.5 w-4.5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-red-900">Potential safety concern</p>
                        <p className="mt-1 text-xs leading-5 text-red-800">
                          Hazard-associated {analysisModelName} label signals: {assessment.hazardSignals.join(", ")}. These are not verified objects.
                        </p>
                        <p className="mt-2 text-xs font-medium leading-5 text-red-800">
                          Verify visually before handling. AI labels alone do not confirm that a hazardous item is present.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <section
                  aria-labelledby="category-distribution-title"
                  className="category-dashboard rounded-2xl border border-[#e1e8dc] bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#819078]">
                        Waste intelligence
                      </p>
                      <h3
                        id="category-distribution-title"
                        className="mt-1 text-sm font-semibold text-[#1f2f24]"
                      >
                        Recognized-label distribution
                      </h3>
                    </div>
                    <span className="rounded-full bg-[#f1f5ee] px-2.5 py-1 text-[10px] font-medium text-[#5f7a58]">
                      {analysis.detectedLabels.length} labels
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-[#7a8877]">
                    Category counts come from this analysis response. Select a category to inspect its evidence.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[#f7f9f4] p-3">
                      <span className="block text-[9px] font-semibold uppercase tracking-wider text-[#849080]">
                        Rule-mapped labels
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-[#31513a]">
                        {mappedLabelCount} of {analysis.detectedLabels.length}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[#f7f9f4] p-3">
                      <span className="block text-[9px] font-semibold uppercase tracking-wider text-[#849080]">
                        Unclassified labels
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-[#687565]">
                        {unclassifiedLabelCount}
                      </span>
                    </div>
                  </div>

                  {visibleCategories.length > 0 ? (
                    <ul className="category-distribution mt-4">
                      {visibleCategories.map((category) => {
                        const tone = CATEGORY_TONES[category.id];
                        return (
                          <li key={category.id}>
                            <button
                              type="button"
                              className="category-distribution-row"
                              onClick={() => selectCategory(category)}
                              aria-label={`Select ${category.name}, ${category.count} recognized label detections`}
                            >
                              <span className="category-distribution-name">
                                {category.name}
                              </span>
                              <span
                                className="category-distribution-track"
                                aria-hidden="true"
                              >
                                <span
                                  className="category-distribution-fill"
                                  style={{
                                    width: `${(category.count / largestCategoryCount) * 100}%`,
                                    backgroundColor: tone.color,
                                  }}
                                />
                              </span>
                              <span className="category-distribution-count">
                                {category.count}
                              </span>
                            </button>
                            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pl-0.5">
                              <span className="text-[10px] leading-4 text-[#849080]">
                                {category.evidenceLabels.join(", ")}
                              </span>
                              <span
                                className={`text-[9px] font-semibold ${
                                  category.compatible === false
                                    ? "text-amber-800"
                                    : category.compatible === true
                                      ? "text-[#527347]"
                                      : "text-[#778074]"
                                }`}
                              >
                                {category.compatible === false
                                  ? "Possible mismatch"
                                  : category.compatible === true
                                    ? "Compatible stream"
                                    : "Unclassified"}
                              </span>
                            </div>
                            {category.id === "plastic_packaging" &&
                              !category.materialSpecific && (
                                <p className="mt-1 pl-0.5 text-[10px] text-amber-800">
                                  Packaging detected; material not established.
                                </p>
                              )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="chart-empty mt-4">
                      No waste-category labels were returned. Treat the image as unclassified and review it manually.
                    </p>
                  )}

                  <div
                    className={`mt-4 rounded-xl border p-3 ${
                      hasHazards
                        ? "border-red-200 bg-red-50 text-red-900"
                        : "border-[#e1e8dc] bg-[#f7f9f4] text-[#5f6f60]"
                    }`}
                    role={hasHazards ? "status" : undefined}
                  >
                    <p className="text-xs font-semibold">
                      {hasHazards
                        ? "Safety review: human verification required"
                        : "Safety review: no potential-hazard label was returned"}
                    </p>
                    <p className="mt-1 text-[10px] leading-5">
                      {hasHazards
                        ? "A hazard-associated label is a precaution, not confirmation of a hazardous object. Verify visually before handling."
                        : "This is not proof that the image contains no hazardous material; inspect the items before handling."}
                    </p>
                  </div>
                  <p className="chart-footnote">
                    Counts are recognized label detections, not physical waste composition. A single item can produce multiple overlapping labels. Model confidence is not segregation accuracy.
                  </p>
                  {analysis.localGuidance && (
                    <p className="mt-3 rounded-xl border border-[#e1e8dc] bg-[#f7f9f4] p-3 text-[11px] leading-5 text-[#5f6f60]">
                      <span className="font-semibold text-[#1f2f24]">
                        Configured local guidance:
                      </span>{" "}
                      {analysis.localGuidance}
                    </p>
                  )}
                </section>

                {assessment && verdict ? (
                  <article className={`verdict-card ss-lift rounded-2xl border p-5 ${TONE_STYLES[verdict.tone].card}`}>
                    <div className="flex items-start gap-4">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${TONE_STYLES[verdict.tone].iconWrap}`}>
                        <Icon name={verdict.icon} className="h-5 w-5" />
                      </span>
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a8877]">Verdict</p>
                          <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#183025]">
                            {assessment.status === "high_priority_review" || assessment.priority === "high"
                              ? verdict.title
                              : assessment.verdictLabel || verdict.title}
                          </h3>
                          <p className="mt-1 text-sm leading-6 text-[#5f6f60]">{verdict.description}</p>
                          {assessment.priority && PRIORITY_META[assessment.priority] && (
                            <span
                              className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${PRIORITY_META[assessment.priority].className}`}
                            >
                              {PRIORITY_META[assessment.priority].label}
                            </span>
                          )}
                        </div>
                        <div
                          className="verdict-score"
                          style={{
                            background: `linear-gradient(#fffefa, #fffefa) padding-box, conic-gradient(#759765 0 ${scoreRing}%, #e2eadb ${scoreRing}% 100%) border-box`,
                          }}
                          aria-label={`Recognized-category compatibility: ${
                            assessment.score === null ? "not available" : `${assessment.score} percent`
                          }`}
                        >
                          <strong>{assessment.score === null ? "—" : assessment.score}</strong>
                          {assessment.score !== null && <span className="verdict-score-percent">%</span>}
                          <span className="verdict-score-label">category<br />compatibility</span>
                        </div>
                      </div>
                    </div>

                    {assessment.scoreLabel && (
                      <p className="mt-4 border-t border-black/5 pt-3 text-[11px] leading-5 text-[#7a8877]">
                        {assessment.scoreLabel}
                      </p>
                    )}

                    {(assessment.matchedCategories.length > 0 || assessment.possibleMismatches.length > 0) && (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {assessment.matchedCategories.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-[#3f6a36]">Likely compatible</p>
                            <ul className="mt-2 flex flex-wrap gap-1.5">
                              {assessment.matchedCategories.map((item) => (
                                <li key={item} className="rounded-full bg-white px-2.5 py-1 text-xs text-[#3f6a36] ring-1 ring-[#d3e4c6]">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {assessment.possibleMismatches.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-amber-800">Check these items</p>
                            <ul className="mt-2 flex flex-wrap gap-1.5">
                              {assessment.possibleMismatches.map((item) => (
                                <li key={item} className="rounded-full bg-white px-2.5 py-1 text-xs text-amber-800 ring-1 ring-amber-200">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {assessment.recommendations.length > 0 && (
                      <div className="mt-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#5f7a58]">Recommended actions</p>
                        <ol className="mt-2.5 space-y-2">
                          {assessment.recommendations.map((item, index) => (
                            <li key={`${index}-${item}`} className="flex gap-3 rounded-xl bg-white/80 p-3 ring-1 ring-black/5">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#eaf2e2] text-[11px] font-semibold text-[#3f6a36]">
                                {index + 1}
                              </span>
                              <span className="text-sm leading-6 text-[#3b4a3e]">{item}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {assessment.explanation && (
                      <p className="mt-5 border-t border-black/5 pt-4 text-xs leading-6 text-[#5f6f60]">
                        {assessment.explanation}
                      </p>
                    )}
                  </article>
                ) : (
                  <p className="rounded-2xl border border-[#e2e7de] bg-white p-4 text-sm text-[#5f6f60]">
                    A detailed assessment was not returned for this photo.
                  </p>
                )}

                {assessment && assessment.evidenceGroups.length > 0 && (
                  <div className="rounded-2xl border border-[#e1e8dc] bg-white p-5">
                    <h3 className="text-sm font-semibold text-[#1f2f24]">Evidence by category</h3>
                    <ul className="mt-4 space-y-3">
                      {assessment.evidenceGroups.map((group) => (
                        <li key={group.name} className="rounded-xl bg-[#f7f9f4] p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#1f2f24]">{group.name}</p>
                              <p className="mt-0.5 text-xs leading-5 text-[#7a8877]">
                                Evidence labels: {(group.evidenceLabels?.length
                                  ? group.evidenceLabels
                                  : [group.evidenceLabel ?? "Unknown"]
                                ).join(", ")}
                              </p>
                              {group.categoryId === "plastic_packaging" &&
                                !group.materialSpecific && (
                                  <p className="mt-1 text-[10px] leading-4 text-amber-800">
                                    The packaging label does not identify its material.
                                  </p>
                                )}
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                group.strength === "strong" ? "bg-[#dfeed5] text-[#3f6a36]" : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {group.strength === "strong" ? "Stronger evidence" : "Uncertain"}
                            </span>
                          </div>
                          {group.confidence !== null ? (
                            <div className="mt-3 flex items-center gap-3">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e6ebe2]">
                                <div
                                  className="ss-bar h-full rounded-full bg-[#6f9a5c]"
                                  style={{ width: `${Math.min(100, Math.max(0, group.confidence))}%` }}
                                />
                              </div>
                              <span className="w-12 text-right text-[11px] font-medium tabular-nums text-[#5f6f60]">
                                {group.confidence}%
                              </span>
                            </div>
                          ) : (
                            <p className="mt-3 text-[11px] text-[#7a8877]">Confidence unavailable</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <figure className="insight-chart-card">
                  <figcaption className="insight-chart-heading">
                    <span>
                      <span className="chart-overline">Image analysis</span>
                      <span className="chart-title">Detected-label confidence</span>
                    </span>
                    <span className="chart-count">{analysis.detectedLabels.length} labels</span>
                  </figcaption>
                  <p className="chart-description">
                    Counts of recognized labels grouped by the image model’s confidence range.
                  </p>
                  {confidenceBands.length > 0 ? (
                    <ul
                      className="confidence-chart"
                      role="img"
                      aria-label={`Recognized label counts by model confidence: ${confidenceBands
                        .map((band) => `${band.label}, ${band.count}`)
                        .join("; ")}`}
                    >
                      {confidenceBands.map((band) => (
                        <li key={band.label} className={`confidence-row confidence-${band.tone}`}>
                          <span className="confidence-label">{band.label}</span>
                          <span className="confidence-track" aria-hidden="true">
                            <span
                              className="confidence-fill"
                              style={{ width: `${(band.count / largestConfidenceBand) * 100}%` }}
                            />
                          </span>
                          <span className="confidence-count">{band.count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="chart-empty">No detected labels were returned to group.</p>
                  )}
                  <p className="chart-footnote">
                    These counts describe label detection only—not the probability that waste is correctly segregated.
                  </p>
                </figure>

                <div className="flex gap-3 rounded-2xl border border-[#e1e8dc] bg-[#f7f9f4] p-4">
                  <span className="mt-0.5 text-[#5d8a4d]">
                    <Icon name="info" className="h-4 w-4" />
                  </span>
                  <div className="space-y-2 text-xs leading-5 text-[#5f6f60]">
                    <p>
                      <span className="font-semibold text-[#1f2f24]">About confidence.</span> Model confidence describes how sure the image labeler is about what it sees. It is not the probability that your waste is correctly segregated.
                    </p>
                    {analysis.note && <p>{analysis.note}</p>}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
        </section>

        <section className="closing-section" data-reveal>
          <div className="closing-orbit closing-orbit-one" aria-hidden="true" />
          <div className="closing-orbit closing-orbit-two" aria-hidden="true" />
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-9 px-5 py-20 sm:px-8 md:flex-row md:items-end md:py-28">
            <div className="closing-copy">
              <SectionEyebrow>Small choices, made visible</SectionEyebrow>
              <h2>Better decisions<br /><em>begin with a closer look.</em></h2>
              <p>
                Use visual evidence as a starting point. Take a moment to
                verify, then follow the disposal guidance where you live.
              </p>
            </div>
            <a href="#audit" className="closing-cta">
              Start another audit <Icon name="arrow" className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer relative border-t border-[#e3e8dd] px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
          <p className="text-xs font-semibold text-[#48703f]">
            Segregation <span className="text-[#5d8a4d]">Score</span>
          </p>
          <p className="text-[11px] leading-5 text-[#8a9786]">
            AI-assisted visual guidance. Always follow your local waste-disposal rules.
          </p>
        </div>
      </footer>
    </div>
  );
}
