
import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DetectLabelsCommand,
  RekognitionClient,
  type BoundingBox as RekognitionBoundingBox,
  type Instance as RekognitionInstance,
  type Label as RekognitionLabel,
} from "@aws-sdk/client-rekognition";

const allowedStreams = ["wet", "dry", "sanitary", "special"] as const;

type Stream = (typeof allowedStreams)[number];
type WasteCategoryId =
  | "organic"
  | "plastic_packaging"
  | "paper_cardboard"
  | "glass"
  | "metal"
  | "sanitary"
  | "hazardous"
  | "unknown";

type WasteGroup = {
  id: WasteCategoryId;
  name: string;
  streams: Stream[] | null;
  pattern: RegExp | null;
  materialSpecific: boolean;
  advice: string;
};

const unknownWasteGroup: WasteGroup = {
  id: "unknown",
  name: "Unknown or unclassified",
  streams: null,
  pattern: null,
  materialSpecific: false,
  advice: "Review this label manually; it does not establish a waste material.",
};

const wasteGroups: WasteGroup[] = [
  {
    id: "organic",
    name: "Organic waste",
    streams: ["wet"],
    pattern: /\b(food|fruit|vegetable|produce|citrus|banana|orange|apple|peel|leftover|plant|plants|leaf|leaves|foliage|bread|egg shells?)\b/i,
    materialSpecific: true,
    advice: "Place food scraps and suitable organic waste in the wet-waste stream.",
  },
  {
    id: "plastic_packaging",
    name: "Plastic and packaging",
    streams: ["dry"],
    pattern: /\b(plastic|polymer|packaging|package|wrapper)\b/i,
    materialSpecific: true,
    advice: "Check the packaging material and local collection rules before sorting.",
  },
  {
    id: "paper_cardboard",
    name: "Paper and cardboard",
    streams: ["dry"],
    pattern: /\b(paper|cardboard|paperboard|newspaper|corrugated)\b/i,
    materialSpecific: true,
    advice: "Keep recyclable paper and cardboard dry and reasonably clean.",
  },
  {
    id: "glass",
    name: "Glass",
    streams: ["dry"],
    pattern: /\bglass\b/i,
    materialSpecific: true,
    advice: "Separate glass where accepted and handle broken glass carefully.",
  },
  {
    id: "metal",
    name: "Metal",
    streams: ["dry"],
    pattern: /\b(metal|aluminum|aluminium|steel|tin can)\b/i,
    materialSpecific: true,
    advice: "Separate recyclable metal items according to local collection rules.",
  },
  {
    id: "sanitary",
    name: "Sanitary waste",
    streams: ["sanitary"],
    pattern: /\b(diaper|nappy|sanitary napkin|sanitary pad|tampon|menstrual product)\b/i,
    materialSpecific: true,
    advice: "Wrap sanitary waste securely and follow local collection guidance.",
  },
  {
    id: "hazardous",
    name: "Potentially hazardous waste",
    streams: ["special"],
    pattern: /\b(battery|batteries|chemical|chemicals|pesticide|medicine|medication|pharmaceutical|paint|solvent|electronic waste|electronic device|light bulb|fluorescent)\b/i,
    materialSpecific: true,
    advice: "Keep potentially hazardous items separate and use an authorized collection point.",
  },
  unknownWasteGroup,
];

type BoundingBox = { left: number; top: number; width: number; height: number };
type DetectedLabel = {
  name: string;
  confidence: number;
  parents: string[];
  categoryId: WasteCategoryId;
  materialSpecific: boolean;
  modelOutput?: RekognitionLabel;
  instances: {
    boundingBox: BoundingBox | null;
    confidence: number | null;
    modelOutput?: RekognitionInstance;
  }[];
};

type YoloDetection = {
  className: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
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

function toValidBoundingBox(
  box: RekognitionBoundingBox | undefined,
): BoundingBox | null {
  const { Left, Top, Width, Height } = box ?? {};
  if (
    typeof Left !== "number" ||
    typeof Top !== "number" ||
    typeof Width !== "number" ||
    typeof Height !== "number" ||
    ![Left, Top, Width, Height].every(Number.isFinite) ||
    Left < 0 ||
    Top < 0 ||
    Width <= 0 ||
    Height <= 0 ||
    Left + Width > 1 ||
    Top + Height > 1
  ) {
    return null;
  }

  return { left: Left, top: Top, width: Width, height: Height };
}

function getWasteGroup(name: string): WasteGroup {
  return (
    wasteGroups.find(
      (candidate) =>
        candidate.id !== "unknown" && candidate.pattern?.test(name),
    ) ?? unknownWasteGroup
  );
}

function isMaterialSpecific(name: string, group: WasteGroup): boolean {
  return group.id === "plastic_packaging"
    ? /\b(plastic|polymer)\b/i.test(name)
    : group.id === "organic"
      ? !/^(plant|plants|produce)$/i.test(name.trim())
      : group.materialSpecific;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseYoloOutput(output: string): YoloDetection[] {
  const payload: unknown = JSON.parse(output);
  if (!isRecord(payload) || !Array.isArray(payload.detections)) {
    throw new Error("YOLO inference returned an invalid response.");
  }

  return payload.detections.map((value, index) => {
    if (!isRecord(value) || !isRecord(value.boundingBox)) {
      throw new Error(`YOLO detection ${index} has an invalid shape.`);
    }

    const { className, confidence } = value;
    const { x, y, width, height } = value.boundingBox;
    if (
      typeof className !== "string" ||
      className.trim().length === 0 ||
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 1.001 ||
      y + height > 1.001
    ) {
      throw new Error(`YOLO detection ${index} contains invalid values.`);
    }

    const left = Math.max(0, x);
    const top = Math.max(0, y);
    const right = Math.min(1, x + width);
    const bottom = Math.min(1, y + height);
    if (right <= left || bottom <= top) {
      throw new Error(`YOLO detection ${index} has an empty bounding box.`);
    }

    return {
      className: className.trim(),
      confidence,
      boundingBox: {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      },
    };
  });
}

async function runYoloInference(
  imageBytes: Buffer,
  imageType: "image/jpeg" | "image/png",
): Promise<YoloDetection[]> {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "segregation-score-"),
  );
  const imagePath = join(
    temporaryDirectory,
    imageType === "image/jpeg" ? "upload.jpg" : "upload.png",
  );
  const modelPath =
    process.env.YOLO_MODEL_PATH?.trim() ||
    "C:\\segregation-score\\runs\\taco\\baseline\\weights\\best.pt";

  try {
    await writeFile(imagePath, imageBytes, { flag: "wx" });

    const output = await new Promise<string>((resolve, reject) => {
      execFile(/* turbopackIgnore: true */
        process.env.PYTHON_EXECUTABLE?.trim() || "python",
        [join(process.cwd(), "scripts", "yolo_inference.py"), imagePath],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, YOLO_MODEL_PATH: modelPath },
          maxBuffer: 1024 * 1024,
          shell: false,
          timeout: 120_000,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            const detail = stderr.trim() || error.message;
            reject(new Error(`YOLO inference process failed: ${detail}`));
            return;
          }
          resolve(stdout);
        },
      );
    });

    return parseYoloOutput(output);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

function hasValidImageSignature(
  imageBytes: Buffer,
  imageType: string,
): imageType is "image/jpeg" | "image/png" {
  if (imageType === "image/jpeg") {
    return (
      imageBytes.length >= 3 &&
      imageBytes[0] === 0xff &&
      imageBytes[1] === 0xd8 &&
      imageBytes[2] === 0xff
    );
  }

  return (
    imageType === "image/png" &&
    imageBytes.length >= 8 &&
    imageBytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  );
}

function summarizeCategories(
  labels: DetectedLabel[],
  stream: Stream,
): WasteCategorySummary[] {
  return wasteGroups.map((group) => {
    const labelIndexes = labels.flatMap((label, index) =>
      label.categoryId === group.id ? [index] : [],
    );
    const matchedLabels = labelIndexes.map((index) => labels[index]);

    return {
      id: group.id,
      name: group.name,
      count: matchedLabels.length,
      evidenceLabels: [...new Set(matchedLabels.map((label) => label.name))],
      labelIndexes,
      materialSpecific:
        matchedLabels.length > 0 &&
        matchedLabels.some((label) => label.materialSpecific),
      compatible: group.streams?.includes(stream) ?? null,
      advice: group.advice,
    };
  });
}

function assessWaste(
  stream: Stream,
  labels: DetectedLabel[],
  localGuidance?: string,
) {
  const evidenceGroups = wasteGroups
    .filter((group) => group.id !== "unknown")
    .map((group) => {
      const matchedLabels = labels
        .filter((label) => label.categoryId === group.id)
        .sort((a, b) => b.confidence - a.confidence);

      if (matchedLabels.length === 0) return null;

      const strongest = matchedLabels[0];

      return {
        id: group.id,
        name: group.name,
        compatible: group.streams?.includes(stream) ?? false,
        evidenceLabel: strongest.name,
        evidenceLabels: matchedLabels.map((label) => label.name),
        confidence: strongest.confidence,
        strength:
          strongest.confidence * (strongest.materialSpecific ? 1 : 0.5),
        materialSpecific: matchedLabels.some(
          (label) => label.materialSpecific,
        ),
        advice: group.advice,
      };
    })
    .filter((group) => group !== null);

  const strongGroups = evidenceGroups.filter(
    (group) => group.strength >= 75
  );

  const uncertainGroups = evidenceGroups.filter(
    (group) => group.strength < 75
  );

  const compatibleGroups = strongGroups.filter(
    (group) => group.compatible
  );

  const possibleMismatches = strongGroups.filter(
    (group) => !group.compatible
  );

  // Hazard signals take priority over ordinary sorting mismatches.
  const hazardLabels = labels.filter(
    (label) => label.categoryId === "hazardous",
  );
  const highConfidenceHazards = hazardLabels.filter(
    (label) => label.confidence >= 75,
  );

  const status =
    highConfidenceHazards.length > 0
      ? "high_priority_review"
      : strongGroups.length === 0
        ? "insufficient_evidence"
        : possibleMismatches.length > 0
          ? "possible_mismatch"
          : "likely_match";

  const score =
    strongGroups.length === 0
      ? null
      : Math.round(
          (compatibleGroups.length / strongGroups.length) * 100
        );

  const recommendations = [
    ...(hazardLabels.length > 0
      ? [
          `Potentially hazardous label${hazardLabels.length === 1 ? "" : "s"}: ${[
            ...new Set(hazardLabels.map((label) => label.name)),
          ].join(", ")}. Verify visually before handling and follow local authorized disposal guidance.`,
        ]
      : []),
    ...(labels.some(
      (label) =>
        label.categoryId === "plastic_packaging" &&
        !label.materialSpecific,
    )
      ? [
          "Packaging was recognized, but its material was not established. Inspect the item or its markings before sorting it as plastic, paper, or another material.",
        ]
      : []),
    ...possibleMismatches.map(
      (group) =>
        `${group.name} may not belong in this stream. ${group.advice}`
    ),
    ...(uncertainGroups.length > 0
      ? [
          `Review uncertain evidence: ${uncertainGroups
            .map((group) => group.name)
            .join(", ")}.`,
        ]
      : []),
    ...(labels.some((label) => label.categoryId === "unknown")
      ? [
          `Manually review unclassified labels: ${[
            ...new Set(
              labels
                .filter((label) => label.categoryId === "unknown")
                .map((label) => label.name),
            ),
          ].join(", ")}.`,
        ]
      : []),
    ...(evidenceGroups.length === 0
      ? [
          "No recognized waste category matched the current rules. Try a clearer photo with the waste more visible.",
        ]
      : [
          "Inspect the full bin manually. Objects may be hidden, missed, or misclassified.",
        ]),
    ...(localGuidance ? [`Local disposal guidance: ${localGuidance}`] : []),
  ];

  const verdictLabel =
    status === "high_priority_review"
      ? "High-priority safety review"
      : status === "possible_mismatch"
        ? "Possible sorting mismatch"
        : status === "likely_match"
          ? "Likely category match"
          : "Insufficient evidence";

  return {
    score,
    scoreLabel:
      "Compatibility of recognized categories only—not bin purity",
    status,
    verdictLabel,
    priority:
      status === "high_priority_review"
        ? "high"
        : status === "possible_mismatch"
          ? "review"
          : status === "likely_match"
            ? "normal"
            : "uncertain",
    hazardSignals: [...new Set(hazardLabels.map((label) => label.name))],
    evidenceGroups: evidenceGroups.map((group) => ({
      categoryId: group.id,
      name: group.name,
      evidenceLabel: group.evidenceLabel,
      evidenceLabels: [...new Set(group.evidenceLabels)],
      confidence: group.confidence,
      strength: group.strength >= 75 ? "strong" : "uncertain",
      compatible: group.compatible,
      materialSpecific: group.materialSpecific,
    })),
    matchedCategories: compatibleGroups.map((group) => group.name),
    possibleMismatches: possibleMismatches.map((group) => group.name),
    recommendations: [...new Set(recommendations)],
    explanation:
      "This rule-based assessment evaluates recognized labels, not the proportion of correctly sorted items. Model predictions and confidence do not verify an object, its material, or segregation accuracy. Potential hazard labels require human verification and do not confirm that a hazardous item is present.",
  };
}



const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart form data with a photo." },
        { status: 415 }
      );
    }

    const formData = await request.formData();
    const photo = formData.get("photo");
    const streamValue = formData.get("stream");

    if (!(photo instanceof File)) {
      return NextResponse.json(
        { error: "Please upload a photo." },
        { status: 400 }
      );
    }

    if (
      typeof streamValue !== "string" ||
      !allowedStreams.includes(streamValue as Stream)
    ) {
      return NextResponse.json(
        { error: "Please select a valid waste stream." },
        { status: 400 }
      );
    }

    if (!["image/jpeg", "image/png"].includes(photo.type)) {
      return NextResponse.json(
        { error: "Please upload a JPG or PNG image." },
        { status: 415 }
      );
    }

    if (photo.size === 0 || photo.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "The photo must be non-empty and no larger than 5 MB." },
        { status: 413 }
      );
    }

    const imageBytes = Buffer.from(await photo.arrayBuffer());
    if (
      imageBytes.length !== photo.size ||
      !hasValidImageSignature(imageBytes, photo.type)
    ) {
      return NextResponse.json(
        { error: "The uploaded file does not match its declared image type." },
        { status: 415 },
      );
    }

    let labels: DetectedLabel[];
    let source: "yolo" | "rekognition";
    let modelOutput:
      | { labelModelVersion: string | null; labels: unknown[] }
      | undefined;

    try {
      const detections = await runYoloInference(imageBytes, photo.type);
      labels = detections.map((detection) => {
        const group = getWasteGroup(detection.className);
        return {
          name: detection.className,
          confidence: detection.confidence * 100,
          parents: [],
          categoryId: group.id,
          materialSpecific: isMaterialSpecific(detection.className, group),
          instances: [
            {
              boundingBox: {
                left: detection.boundingBox.x,
                top: detection.boundingBox.y,
                width: detection.boundingBox.width,
                height: detection.boundingBox.height,
              },
              confidence: detection.confidence * 100,
            },
          ],
        };
      });
      source = "yolo";
    } catch (error) {
      console.error("YOLO inference failed; falling back to Rekognition:", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      });

      const result = await rekognition.send(
        new DetectLabelsCommand({
          Image: { Bytes: imageBytes },
          MaxLabels: 20,
          MinConfidence: 70,
        }),
      );

      labels = (result.Labels ?? []).map((label) => {
        const name = label.Name ?? "Unknown";
        const group = getWasteGroup(name);

        return {
          name,
          confidence: label.Confidence ?? 0,
          parents: (label.Parents ?? [])
            .map((parent) => parent.Name)
            .filter(
              (parentName): parentName is string => Boolean(parentName),
            ),
          categoryId: group.id,
          materialSpecific: isMaterialSpecific(name, group),
          modelOutput: label,
          instances: (label.Instances ?? []).map((instance) => ({
            boundingBox: toValidBoundingBox(instance.BoundingBox),
            confidence:
              typeof instance.Confidence === "number"
                ? instance.Confidence
                : null,
            modelOutput: instance,
          })),
        };
      });
      source = "rekognition";
      modelOutput = {
        labelModelVersion: result.LabelModelVersion ?? null,
        labels: result.Labels ?? [],
      };
    }

    const localGuidance = process.env.WASTE_DISPOSAL_GUIDANCE?.trim();
    const assessment = assessWaste(
      streamValue as Stream,
      labels,
      localGuidance,
    );
    const categories = summarizeCategories(labels, streamValue as Stream);

    return NextResponse.json({
      success: true,
      message: "Image analysis completed.",
      stream: streamValue,
      fileName: photo.name,
      source,
      detectedLabels: labels,
      modelOutput,
      categories,
      assessment,
      localGuidance: localGuidance || null,
      analysisStatus: "completed",
      note:
        source === "yolo"
          ? "YOLO detections and confidence scores are visual predictions, not verified objects, material composition, or proof of correct waste segregation. Boxes may overlap."
          : "Counts summarize recognized labels, not unique physical objects. Rekognition labels are visual clues, not verified objects, material confirmation, or proof of correct waste segregation.",
    });
  } catch (error) {
    console.error("Image analysis error:", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error:
          "Image analysis is unavailable. Check AWS credentials, region, account status, and Rekognition permissions.",
        analysisStatus: "unavailable",
      },
      { status: 503 }
    );
  }
}
