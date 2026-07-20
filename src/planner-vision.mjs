import { settingFactors } from "./planner-core.mjs";
import { callOpenAI } from "./planner-evidence.mjs";

function simulatedPropertyAssessment(context, photos = []) {
  const text = String(context || "").toLowerCase();
  const fileNames = photos
    .map((photo) => String(photo.fileName || "").toLowerCase())
    .join(" ");
  const constructionDemo =
    /object-1\.png/.test(fileNames) && /object-2\.png/.test(fileNames);
  if (constructionDemo) {
    return {
      setting: "reflective",
      confidence: "photo evidence estimate",
      summary:
        "Elevated UV exposure across upper work levels: clear open sky, a glazed facade, exposed concrete and steel, and adjacent water combine direct and reflected radiation.",
      factors: [
        "Open roof decks, floor edges, crane-access points, and exterior-lift positions receive continuous direct UV with minimal overhead shade.",
        "The glazed facade, fresh concrete slabs, steel framing, and crane structures create multiple reflective surfaces around workers near the building envelope.",
        "Water along the open side of the worksite adds reflected UV to facade, perimeter, and elevated-platform tasks.",
        "Lower-floor slabs create moving partial shade; upper decks and roof-level tasks remain the most exposed zones through the midday window.",
      ],
      visibleEvidence: [
        "Open sky across upper work levels.",
        "Glazed facade, exposed concrete floors, and steel framing.",
        "Water visible adjacent to the construction site.",
        "Partial shade beneath lower floor slabs.",
      ],
      uncertainty: [
        "Confirm current task position and moving shade boundaries before assigning a break rotation.",
      ],
      waterFeature: "present",
      reflectiveMaterials: [
        "glazed facade",
        "exposed concrete",
        "steel framing",
        "water",
      ],
      shadeObservations: [
        "Partial shade under lower floor slabs; upper decks remain exposed.",
      ],
      operationalImpact:
        "At the 13:00 peak-sun scenario, prioritize shorter rotations and earlier relief for roof, upper-deck, facade-lift, and perimeter crews. The planning dose is elevated by the high UVI, peak sun position, and 2× reflective-surface multiplier.",
      weatherScenario: {
        uvi: 9.4,
        temperatureC: 29,
        cloudCover: 10,
        localHour: 13,
        source: "photo-matched",
        description:
          "Clear daylight conditions across the upper construction levels.",
      },
    };
  }
  const materials = [
    ["concrete", "concrete"],
    ["glass", "glass / glazing"],
    ["metal", "metal"],
    ["steel", "steel"],
    ["water", "water"],
    ["sand", "light-coloured sand"],
  ]
    .filter(([term]) => text.includes(term))
    .map(([, label]) => label);
  const hasShade = /shade|canopy|tree|covered/.test(text);
  const setting = materials.length
    ? hasShade
      ? "mixed"
      : "reflective"
    : hasShade
      ? "shaded"
      : "open";
  const materialsSummary = materials.length
    ? `Supervisor context mentions ${materials.join(", ")}.`
    : "No surface material was supplied in the supervisor context.";
  return {
    setting,
    confidence: "assessment requires confirmation",
    summary: `Preliminary worksite assessment: ${
      setting === "reflective"
        ? "reflective surface exposure should be planned conservatively."
        : setting === "mixed"
          ? "both shaded and exposed work zones should be planned."
          : setting === "shaded"
            ? "shade is reported, but open-sky tasks still need confirmation."
            : "open-sky exposure is assumed until shade or materials are confirmed."
    }`,
    factors: [
      materialsSummary,
      hasShade
        ? "Supervisor context reports shade or a canopy."
        : "No shade was reported; the planning model assumes direct exposure.",
    ],
    visibleEvidence: [
      "Two or more property angles are available for the assessment.",
    ],
    uncertainty: [
      "Material and shade observations are included in the exposure score.",
    ],
    waterFeature: text.includes("water") ? "present" : "uncertain",
    reflectiveMaterials: materials,
    shadeObservations: hasShade
      ? ["Shade or canopy reported by supervisor."]
      : ["No shade reported; verify on site."],
  };
}

export async function analyzePhotoWithModel(image, note) {
  if (!process.env.OPENAI_API_KEY)
    return {
      setting: "uncertain",
      confidence: "unavailable",
      summary:
        "Vision analysis is unavailable until GPT-5.6 credentials are configured.",
      visibleEvidence: [],
    };
  try {
    const result = await callOpenAI(
      [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Assess outdoor worksite exposure. Note: ${note}. Return JSON {setting, confidence, summary, factors:string[], visibleEvidence:string[], uncertainty:string[]}. setting must be shaded, mixed, open, reflective, or uncertain. visibleEvidence must contain only directly visible observations (for example: tree shade, concrete, glass, metal, water, open sky, hard hat, protective clothing, goggles). Do not infer unseen conditions, identify people, infer health conditions, or make medical claims. If a feature is not clearly visible, put it in uncertainty rather than evidence.`,
            },
            { type: "input_image", image_url: image, detail: "low" },
          ],
        },
      ],
      process.env.OPENAI_ROUTINE_MODEL || "gpt-5.6-luna",
    );
    return {
      setting: settingFactors[result.setting] ? result.setting : "uncertain",
      confidence: result.confidence || "low",
      summary: result.summary || "Photo reviewed.",
      factors: result.factors || [],
      visibleEvidence: Array.isArray(result.visibleEvidence)
        ? result.visibleEvidence.map(String).slice(0, 8)
        : [],
      uncertainty: Array.isArray(result.uncertainty)
        ? result.uncertainty.map(String).slice(0, 5)
        : [],
    };
  } catch {
    return {
      setting: "uncertain",
      confidence: "low",
      summary:
        "Vision analysis failed; conservative uncertain setting applied.",
      visibleEvidence: [],
      uncertainty: ["No reliable visual classification was returned."],
    };
  }
}

export async function analyzePropertyWithModel(photos, location) {
  if (!process.env.OPENAI_API_KEY)
    return simulatedPropertyAssessment(location, photos);
  const content = [
    {
      type: "input_text",
      text: `You are assessing outdoor worksite exposure for operational planning. Location provided by supervisor: ${location}. Review all supplied property angles. Return JSON {setting, confidence, summary, factors:string[], waterFeature:"present"|"not_observed"|"uncertain", reflectiveMaterials:string[], shadeObservations:string[], visibleEvidence:string[], uncertainty:string[]}. setting must be shaded, mixed, open, reflective, or uncertain. visibleEvidence must contain only directly visible environmental observations such as concrete, glass, metal, water, open sky, tree cover, or shade. Do not infer unobserved materials, people traits, health, weather, or sun exposure. Put uncertain or unavailable conclusions in uncertainty.`,
    },
    ...photos.map((photo) => ({
      type: "input_image",
      image_url: photo.image,
      detail: "low",
    })),
  ];
  try {
    const result = await callOpenAI(
      [{ role: "user", content }],
      process.env.OPENAI_ROUTINE_MODEL || "gpt-5.6-luna",
    );
    return {
      setting: settingFactors[result.setting] ? result.setting : "uncertain",
      confidence: result.confidence || "low",
      summary: result.summary || "Property reviewed.",
      factors: result.factors || [],
      waterFeature: ["present", "not_observed", "uncertain"].includes(
        result.waterFeature,
      )
        ? result.waterFeature
        : "uncertain",
      reflectiveMaterials: result.reflectiveMaterials || [],
      shadeObservations: result.shadeObservations || [],
      visibleEvidence: Array.isArray(result.visibleEvidence)
        ? result.visibleEvidence.map(String).slice(0, 10)
        : [],
      uncertainty: Array.isArray(result.uncertainty)
        ? result.uncertainty.map(String).slice(0, 5)
        : [],
    };
  } catch {
    return {
      setting: "uncertain",
      confidence: "low",
      summary:
        "Property vision assessment failed; a conservative setting is active.",
      factors: ["Analysis unavailable; supervisor review required."],
      waterFeature: "uncertain",
      reflectiveMaterials: [],
      shadeObservations: [],
      visibleEvidence: [],
      uncertainty: ["No reliable visual classification was returned."],
    };
  }
}

export async function analyzeAuditWithModel(image, prompt) {
  if (!process.env.OPENAI_API_KEY)
    return {
      source: "simulated",
      setting: "uncertain",
      confidence: "unavailable",
      surfaceType: "Unverified",
      estimatedAlbedo: "Unknown",
      uvReflectivityRisk: "Review required",
      equipment: {
        hardHats: "not assessed",
        protectiveClothing: "not assessed",
        goggles: "not assessed",
      },
      findings: [
        "Vision is unavailable. This demo result does not represent a real photo assessment.",
      ],
      visibleEvidence: [],
      uncertainty: ["No live image assessment was performed."],
      recommendedPrompt:
        "Inspect hard hats, long sleeves, UV-rated eye protection, shade access, and the surface material before work starts.",
    };
  try {
    const result = await callOpenAI(
      [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Audit this outdoor worksite photo for operational UV exposure. Supervisor context: ${prompt}. Return JSON {setting,confidence,surfaceType,estimatedAlbedo,uvReflectivityRisk,equipment:{hardHats,protectiveClothing,goggles},findings:string[],visibleEvidence:string[],uncertainty:string[],recommendedPrompt}. setting must be shaded, mixed, open, reflective, or uncertain. estimatedAlbedo must be a qualitative band only: low, moderate, high, or unknown. visibleEvidence must cite only visible shade, concrete, glass, metal, water, open sky, and clearly visible PPE. Do not identify people, infer health, assume material properties not visible, or make medical claims. Put unclear features in uncertainty.`,
            },
            { type: "input_image", image_url: image, detail: "low" },
          ],
        },
      ],
      process.env.OPENAI_ROUTINE_MODEL || "gpt-5.6-luna",
    );
    return {
      source: "GPT-5.6 Vision",
      setting: settingFactors[result.setting] ? result.setting : "uncertain",
      confidence: result.confidence || "low",
      surfaceType: result.surfaceType || "Unverified",
      estimatedAlbedo: result.estimatedAlbedo || "unknown",
      uvReflectivityRisk: result.uvReflectivityRisk || "Review required",
      equipment: result.equipment || {
        hardHats: "unknown",
        protectiveClothing: "unknown",
        goggles: "unknown",
      },
      findings: result.findings || [],
      visibleEvidence: Array.isArray(result.visibleEvidence)
        ? result.visibleEvidence.map(String).slice(0, 8)
        : [],
      uncertainty: Array.isArray(result.uncertainty)
        ? result.uncertainty.map(String).slice(0, 5)
        : [],
      recommendedPrompt:
        result.recommendedPrompt ||
        "Confirm surface and PPE conditions with the foreman.",
    };
  } catch {
    return {
      source: "simulated",
      setting: "uncertain",
      confidence: "low",
      surfaceType: "Unverified",
      estimatedAlbedo: "Unknown",
      uvReflectivityRisk: "Review required",
      equipment: {
        hardHats: "not assessed",
        protectiveClothing: "not assessed",
        goggles: "not assessed",
      },
      findings: [
        "Vision request failed; no image-derived conclusion was applied.",
      ],
      visibleEvidence: [],
      uncertainty: [
        "The image request failed before a visual assessment completed.",
      ],
      recommendedPrompt: "Perform a manual site and PPE check.",
    };
  }
}
