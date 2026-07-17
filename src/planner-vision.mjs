import { settingFactors } from "./planner-core.mjs";
import { callOpenAI } from "./planner-evidence.mjs";

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
    const result = await callOpenAI([
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
    ]);
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
  if (!process.env.OPENAI_API_KEY) {
    return {
      setting: "uncertain",
      confidence: "unavailable",
      summary:
        "Property imagery is stored, but GPT-5.6 vision is unavailable until credentials are configured.",
      factors: [
        "No vision classification was produced. A conservative uncertain exposure setting is active.",
      ],
      visibleEvidence: [],
      uncertainty: ["No live image assessment was performed."],
      waterFeature: "unknown",
      reflectiveMaterials: [],
      shadeObservations: [],
    };
  }
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
    const result = await callOpenAI([{ role: "user", content }]);
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
    const result = await callOpenAI([
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
    ]);
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
