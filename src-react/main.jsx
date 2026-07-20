import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Behavioral from "./Behavioral.jsx";
import ProtectedShift from "./ProtectedShift.jsx";
import {
  api,
  hasCompleteCrewPlacement,
  profileKey,
  protectionPlanKey,
  useData,
  useUmbra,
} from "./umbra-data.js";
import "./styles.css";

async function compactImage(file) {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Cannot read ${file.name}`));
      element.src = source;
    });
    const maxDimension = 1600;
    const scale = Math.min(
      1,
      maxDimension / Math.max(image.width, image.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(source);
  }
}
function Shell({ children }) {
  const { profile, state } = useData();
  return (
    <>
      <AppHeader profile={profile} state={state} />
      {children}
    </>
  );
}
function AppHeader({ profile, state, showControls = true }) {
  const location = useLocation();
  const navigate = useNavigate();
  const setProfile = useUmbra((store) => store.setProfile);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const hasTeam = Boolean(state?.workers?.length);
  const hasExternalEvidence = Boolean(
    localStorage.getItem(profileKey(profile)),
  );
  const hasAppliedProtectionPlan = Boolean(
    localStorage.getItem(protectionPlanKey(profile)),
  );
  const hasPlacedEveryCrewMember = hasCompleteCrewPlacement(state);
  const navigation = [
    { label: "Team", to: "/team", available: true },
    { label: "External Factors", to: "/external", available: hasTeam },
    {
      label: "Behavioral Factors",
      to: "/behavioral",
      available: hasTeam && hasExternalEvidence,
    },
    {
      label: "Shift / Morning Brief",
      to: "/shift",
      available:
        hasTeam &&
        hasExternalEvidence &&
        hasPlacedEveryCrewMember &&
        hasAppliedProtectionPlan,
    },
    {
      label: "Live Incident",
      to: "/incident",
      available: false,
      lockedMessage: "Coming soon — Live Incident is outside this MVP flow.",
    },
    {
      label: "Reports",
      to: "/reports",
      available: false,
      lockedMessage: "Coming soon — Reports is outside this MVP flow.",
    },
  ];
  const availableSteps = navigation.filter((item) => item.available);
  const activeStepIndex = availableSteps.findIndex(
    (item) => item.to === location.pathname,
  );
  const previousStep = availableSteps[activeStepIndex - 1];
  const nextStep = availableSteps[activeStepIndex + 1];
  const signOut = () => {
    if (!window.confirm("End this shift and return to foreman sign-in?"))
      return;
    setProfile(null);
    setProfileMenuOpen(false);
    navigate("/");
  };
  return (
    <div className="reactHeaderWrap">
      <header className="reactHeader">
        <div className="brand">
          UMBRA <span>B2B UV-COMPLIANCE</span>
        </div>
        <nav className="modeNav">
          {navigation.map((item) =>
            item.available ? (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive || (!profile && item.to === "/team") ? "active" : ""
                }
              >
                {item.label}
              </NavLink>
            ) : (
              <span
                key={item.to}
                className="locked"
                aria-disabled="true"
                title={
                  item.lockedMessage ||
                  (item.to === "/shift" && !hasPlacedEveryCrewMember
                    ? "Place every crew member on an assessed worksite first"
                    : "Complete the previous step first")
                }
              >
                {item.label}
              </span>
            ),
          )}
        </nav>
        {profile && (
          <div className="foremanProfileMenu">
            <button
              type="button"
              className="foremanIdentity"
              aria-expanded={profileMenuOpen}
              aria-controls="foremanActions"
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">👷</span>
              <span>
                <b>{profile.name}</b>
                <small>{profile.company}</small>
              </span>
            </button>
            {profileMenuOpen && (
              <div id="foremanActions" className="foremanActions">
                <button type="button" disabled title="Coming soon">
                  Settings
                  <small>Coming soon</small>
                </button>
                <button type="button" className="signOut" onClick={signOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
        {!profile && (
          <span className="headerProfileSpacer" aria-hidden="true" />
        )}
      </header>
      {showControls && (
        <div className="modeSliderControls" aria-label="Workflow navigation">
          <button
            type="button"
            disabled={!previousStep}
            onClick={() => previousStep && navigate(previousStep.to)}
            aria-label="Previous available step"
          >
            ‹
          </button>
          <button
            type="button"
            disabled={!nextStep}
            onClick={() => nextStep && navigate(nextStep.to)}
            aria-label="Next available step"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
function Onboarding() {
  const setProfile = useUmbra((store) => store.setProfile);
  const submit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setProfile({ name: values.name.trim(), company: values.company.trim() });
  };
  return (
    <>
      <AppHeader showControls={false} />
      <section className="foremanOnboarding">
        <p className="eyebrow">FIRST SHIFT SETUP</p>
        <h1>Tell Umbra who is leading this crew.</h1>
        <p className="onboardingDescription">
          Complete the foreman profile before operational steps become
          available.
        </p>
        <form onSubmit={submit}>
          <input name="name" required placeholder="Foreman / supervisor name" />
          <input name="company" required placeholder="Company name" />
          <button>Start Umbra shift</button>
        </form>
      </section>
    </>
  );
}
function Team() {
  const { profile, state, setState } = useData();
  const [message, setMessage] = useState("");
  const [editingWorker, setEditingWorker] = useState(null);
  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const wasEditing = Boolean(editingWorker);
    const input = Object.fromEntries(new FormData(form));
    try {
      const data = await api(
        wasEditing
          ? `/api/team-member/${editingWorker.id}`
          : "/api/team-member",
        {
          method: "POST",
          body: JSON.stringify({ ...input, profile }),
        },
      );
      setState(data.state);
      form.reset();
      setEditingWorker(null);
      setMessage(
        wasEditing ? "Employee profile updated." : "Employee profile added.",
      );
    } catch (error) {
      setMessage(error.message);
    }
  };
  const deleteWorker = async (worker) => {
    if (!window.confirm(`Delete ${worker.name}'s employee profile?`)) return;
    try {
      const data = await api(`/api/team-member/${worker.id}/delete`, {
        method: "POST",
        body: JSON.stringify({ profile }),
      });
      setState(data.state);
      if (editingWorker?.id === worker.id) setEditingWorker(null);
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <Shell>
      <main className="reactWorkspace">
        <section id="teamMode" className="modeView">
          <section className="shiftHero">
            <div>
              <p className="eyebrow">TEAM PROFILES</p>
              <h1>Know your crew before the shift begins.</h1>
              <h2>One worker at a time. Consent-aware.</h2>
              <p>
                Medical markers and sensitivity are self-reported
                occupational-health context.
              </p>
            </div>
          </section>
          <section className="secondaryPanel">
            <p className="eyebrow formLabel">ADD EMPLOYEE PROFILE</p>
            <section className="teamProfilePanel">
              <form key={editingWorker?.id || "new"} onSubmit={submit}>
                <label className="profileField">
                  <span>Full name</span>
                  <input
                    name="name"
                    required
                    placeholder="Full name"
                    defaultValue={editingWorker?.name || ""}
                  />
                  <small>Identifies the employee in the safety plan.</small>
                </label>
                <label className="profileField">
                  <span>Age</span>
                  <input
                    name="age"
                    type="number"
                    min="18"
                    max="100"
                    required
                    placeholder="Age"
                    defaultValue={editingWorker?.age || ""}
                  />
                  <small>Helps apply a cautious heat-recovery modifier.</small>
                </label>
                <label className="profileField">
                  <span>Individual sensitivity</span>
                  <select
                    name="photosensitivity"
                    required
                    defaultValue={
                      editingWorker?.exposureProfile?.photosensitivity || ""
                    }
                  >
                    <option value="">Individual sensitivity</option>
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                  </select>
                  <small>Self-reported sensitivity affects UV priority.</small>
                </label>
                <label className="profileField">
                  <span>Fitzpatrick type</span>
                  <select
                    name="fitzpatrickType"
                    required
                    defaultValue={
                      editingWorker?.exposureProfile?.fitzpatrickType || ""
                    }
                  >
                    <option value="">Self-reported Fitzpatrick type</option>
                    {[1, 2, 3, 4, 5, 6].map((type) => (
                      <option key={type} value={type}>
                        Type {type}
                      </option>
                    ))}
                  </select>
                  <small>A 1–6 skin-response scale used in UV planning.</small>
                </label>
                <label className="profileField">
                  <span>
                    Medical markers <em>optional</em>
                  </span>
                  <input
                    name="medicalMarkers"
                    placeholder="Optional self-reported medical markers"
                    defaultValue={
                      editingWorker?.exposureProfile?.medicalMarkers || ""
                    }
                  />
                  <small>
                    Record photosensitivity context, such as medication.
                  </small>
                </label>
                <label className="consentCheck">
                  <input
                    name="profileSignature"
                    type="checkbox"
                    value="acknowledged"
                    required
                  />
                  <span>I confirm these profile details are accurate.</span>
                </label>
                <button>
                  {editingWorker ? "Save changes" : "Add to team"}
                </button>
                {message && <small className="teamMessage">{message}</small>}
              </form>
            </section>
          </section>
          <section className="shiftGrid">
            <article className="crewPanel">
              <div className="panelTitle">
                <div>
                  <p className="eyebrow">TODAY'S CREW</p>
                  <h2>Employee profiles</h2>
                </div>
                <span className="chip">
                  {state?.workers?.length || 0} profiles
                </span>
              </div>
              {state?.workers?.length ? (
                <>
                  <div className="crewProfileHeader">
                    <span />
                    <span>
                      Employee & age{" "}
                      <InfoTip text="Age helps Umbra apply a cautious heat-recovery modifier." />
                    </span>
                    <span>
                      Fitzpatrick type{" "}
                      <InfoTip text="A self-reported 1–6 skin-response scale used for UV planning." />
                    </span>
                    <span>
                      Sensitivity{" "}
                      <InfoTip text="Self-reported individual sensitivity affects UV-planning priority." />
                    </span>
                    <span>
                      Medical markers{" "}
                      <InfoTip text="Self-reported photosensitivity context, not a medical diagnosis." />
                    </span>
                    <span>
                      Actions{" "}
                      <InfoTip text="Edit or delete this employee profile." />
                    </span>
                  </div>
                  {state.workers.map((worker) => {
                    const workerProfile = worker.exposureProfile || {};
                    return (
                      <article className="crewProfileRow" key={worker.id}>
                        <span
                          className="crewInitial figurine builder"
                          aria-hidden="true"
                        >
                          <i />
                          <em />
                        </span>
                        <span>
                          <b>{worker.name}</b>
                          <small>{worker.age || "—"} years old</small>
                        </span>
                        <span>
                          <small>Fitzpatrick type</small>
                          <b>
                            {workerProfile.fitzpatrickType || "Not recorded"}
                          </b>
                        </span>
                        <span>
                          <small>Sensitivity</small>
                          <b>
                            {workerProfile.photosensitivity || "Not recorded"}
                          </b>
                        </span>
                        <span>
                          <small>Medical markers</small>
                          <b>
                            {workerProfile.medicalMarkers || "None reported"}
                          </b>
                        </span>
                        <span className="crewActions">
                          <button
                            type="button"
                            className="crewEdit"
                            title="Edit employee profile"
                            onClick={() => setEditingWorker(worker)}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="crewDelete"
                            title="Delete employee profile"
                            onClick={() => deleteWorker(worker)}
                          >
                            ×
                          </button>
                        </span>
                      </article>
                    );
                  })}
                </>
              ) : (
                <p className="crewEmpty">
                  Add the first employee profile to begin the team roster.
                </p>
              )}
            </article>
          </section>
        </section>
      </main>
    </Shell>
  );
}
function InfoTip({ text }) {
  return (
    <span className="infoTip" data-tooltip={text}>
      i
    </span>
  );
}
function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);
  return null;
}
function External() {
  const { profile, state, setState } = useData();
  const [files, setFiles] = useState([]);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState("");
  const [expandedEvidenceId, setExpandedEvidenceId] = useState(null);
  const savedEvidence = (state?.sites || [])
    .filter((site) => site.propertyAssessment)
    .map((site) => ({ site, assessment: site.propertyAssessment }));
  const hasCrewEvidence = Boolean(localStorage.getItem(profileKey(profile)));
  const submit = async (event) => {
    event.preventDefault();
    if (files.length < 2)
      return setMessage("Add at least two photos from different angles.");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      setMessage("Analyzing the object and calculating external exposure...");
      const siteId = "site_north";
      const photos = await Promise.all(
        files.map(async (file, index) => ({
          image: await compactImage(file),
          fileName: file.name,
          angle: `Angle ${index + 1}`,
          note: form.notes || "",
        })),
      );
      const preview = await api("/api/property/preview", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          profile,
          objectName: form.objectName,
          location: form.location,
          notes: form.notes,
          photos,
        }),
      });
      setDraft({ ...preview.draft, saved: false });
      setMessage("Review the calculation, then save it or recalculate.");
    } catch (error) {
      setMessage(error.message);
    }
  };
  const confirmDraft = async () => {
    if (!draft) return;
    try {
      setMessage("Saving the approved object assessment...");
      const confirmed = await api("/api/property/confirm", {
        method: "POST",
        body: JSON.stringify({ profile, draft }),
      });
      localStorage.setItem(profileKey(profile), "true");
      localStorage.removeItem(protectionPlanKey(profile));
      setState(confirmed.state);
      setExpandedEvidenceId(confirmed.site.id);
      setDraft((current) => (current ? { ...current, saved: true } : current));
      setMessage("Object assessment saved in the table below.");
    } catch (error) {
      setMessage(error.message);
    }
  };
  const deleteObject = async (site) => {
    const objectName = site.propertyObjectName || site.name;
    if (!window.confirm(`Delete the saved assessment for ${objectName}?`))
      return;
    try {
      const data = await api(
        `/api/property/${encodeURIComponent(site.id)}/delete`,
        {
          method: "POST",
          body: JSON.stringify({ profile }),
        },
      );
      localStorage.removeItem(protectionPlanKey(profile));
      if (!(data.state.sites || []).some((entry) => entry.propertyAssessment)) {
        localStorage.removeItem(profileKey(profile));
      }
      setState(data.state);
      if (draft?.site?.id === site.id) {
        setDraft(null);
        setFiles([]);
      }
      if (expandedEvidenceId === site.id) setExpandedEvidenceId(null);
      setMessage(`${objectName} was removed from saved external evidence.`);
    } catch (error) {
      setMessage(error.message);
    }
  };
  const analysis = draft?.assessment;
  const weather = draft?.forecast;
  const exposure = draft?.exposure;
  const objectName = draft?.objectName;
  const savedEvidenceRows = hasCrewEvidence ? savedEvidence : [];
  return (
    <Shell>
      <main className="reactWorkspace">
        <section id="externalMode" className="modeView">
          <section className="externalHero">
            <p className="eyebrow">ENVIRONMENTAL PARAMETERS</p>
            <h1>See the conditions that shape UV exposure.</h1>
            <p>
              Combine location, current meteorology, and a couple of object
              photos to build a more grounded external-risk assessment.
            </p>
          </section>
          <section className="externalGrid">
            <article className="externalForm">
              <p className="eyebrow">OBJECT &amp; LOCATION</p>
              <h2>Add environmental evidence</h2>
              <form onSubmit={submit}>
                <input name="objectName" required placeholder="Object name" />
                <input
                  name="location"
                  required
                  placeholder="Object location / work zone"
                />
                <input
                  name="notes"
                  placeholder="Object notes: asphalt, sand, concrete, glazing"
                />
                <label className="externalPhoto">
                  Add at least two object photos from different angles
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => setFiles([...event.target.files])}
                  />
                </label>
                {files.length > 0 && (
                  <div
                    className={`externalPhotoPreview${analysis ? " externalPhotoEvidence" : ""}`}
                  >
                    {files.map((file, index) => (
                      <figure key={`${file.name}-${index}`}>
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Object angle ${index + 1}`}
                        />
                        <figcaption>Angle {index + 1}</figcaption>
                        {!draft?.saved && (
                          <button
                            type="button"
                            className="removeExternalPhoto"
                            aria-label={`Remove angle ${index + 1}`}
                            onClick={() =>
                              setFiles((current) =>
                                current.filter((_, item) => item !== index),
                              )
                            }
                          >
                            ×
                          </button>
                        )}
                      </figure>
                    ))}
                  </div>
                )}
                {analysis && (
                  <details className="calculationGuide">
                    <summary>How Umbra calculated this dose</summary>
                    <p>
                      <b>dose = UVI × sun/time × cloud × albedo</b>
                      {" · "}Peak sun from 11:00–16:00 uses a 1.35× factor.
                      Dense cloud reduces the dose; light haze can raise it.
                      Reflective concrete, glass, metal, sand, and water raise
                      the albedo factor.
                    </p>
                  </details>
                )}
                <button>
                  {analysis
                    ? "Reassess object & parse weather"
                    : "Assess object & parse weather"}
                </button>
                {message && (
                  <small className="externalMessage">{message}</small>
                )}
              </form>
            </article>
            <aside className="weatherCard">
              <p className="eyebrow">CURRENT OBJECT PARSER</p>
              {analysis && weather ? (
                <>
                  <h2>{objectName} — analysis ready</h2>
                  <dl className="externalAnalysis">
                    <div>
                      <dt>
                        {weather.source === "photo-matched"
                          ? "Daylight exposure scenario"
                          : "Current weather"}
                      </dt>
                      <dd>
                        UVI {weather.uvi} · {weather.temperatureC}°C ·{" "}
                        {weather.cloudCover}% cloud cover ·{" "}
                        {String(weather.localHour).padStart(2, "0")}:00
                        {weather.source === "photo-matched" && (
                          <small>{weather.description}</small>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Site evidence assessment</dt>
                      <dd>{analysis.summary}</dd>
                    </div>
                    {(analysis.factors || []).length > 0 && (
                      <div>
                        <dt>Surface and shade context</dt>
                        <dd>{analysis.factors.join(" ")}</dd>
                      </div>
                    )}
                    {analysis.operationalImpact && (
                      <div>
                        <dt>Operational implication</dt>
                        <dd>{analysis.operationalImpact}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Albedo / surface multiplier</dt>
                      <dd>
                        {analysis.setting} · {exposure.albedoFactor}×
                      </dd>
                    </div>
                    <div>
                      <dt>Planning external dose</dt>
                      <dd>
                        {exposure.baseUvi} × {exposure.sunAltitudeFactor}×
                        sun/time × {exposure.cloudFactor}× cloud ×{" "}
                        {exposure.albedoFactor}× albedo ={" "}
                        <b>{exposure.doseIndex}</b>
                      </dd>
                    </div>
                  </dl>
                  <div className="parserActions">
                    <button
                      type="button"
                      className="saveObjectButton"
                      onClick={confirmDraft}
                      disabled={draft.saved}
                      aria-label={
                        draft.saved ? "Saved below" : "OK — save object"
                      }
                    >
                      OK — save &amp; continue
                    </button>
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => {
                        setDraft(null);
                        setMessage("Adjust the evidence and recalculate.");
                      }}
                    >
                      Recalculate
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2>Analysis results will appear here</h2>
                  <p>
                    Add an object name, location, and two photos, then run the
                    assessment to view current weather, Vision findings, albedo,
                    and the planning dose calculation.
                  </p>
                </>
              )}
            </aside>
          </section>
          <section className="reasoning externalEvidence">
            <p className="eyebrow">SAVED EXTERNAL EVIDENCE</p>
            {savedEvidenceRows.length > 0 && (
              <div className="savedEvidenceTable" role="table">
                <div className="savedEvidenceHead" role="row">
                  <span>Object</span>
                  <span>Location</span>
                  <span>Site evidence</span>
                  <span>Albedo</span>
                  <span>Planning dose</span>
                  <span>Saved</span>
                  <span>Actions</span>
                </div>
                {savedEvidenceRows.map(({ site, assessment }) => {
                  const storedExposure = assessment.exposure;
                  const isExpanded = expandedEvidenceId === site.id;
                  return (
                    <React.Fragment key={site.id}>
                      <div className="savedEvidenceRow" role="row">
                        <span>
                          <b>{site.propertyObjectName || site.name}</b>
                          <small>
                            {site.propertyPhotos?.length || 0} angles
                          </small>
                        </span>
                        <span>{site.propertyLocation || "Not recorded"}</span>
                        <span>
                          {(assessment.reflectiveMaterials || []).join(", ") ||
                            assessment.summary}
                        </span>
                        <span>
                          {assessment.setting} ·{" "}
                          {storedExposure?.albedoFactor || "—"}×
                        </span>
                        <span>
                          {storedExposure
                            ? `${storedExposure.doseIndex} (UVI ${storedExposure.baseUvi})`
                            : "—"}
                        </span>
                        <span>
                          {assessment.assessedAt
                            ? new Date(
                                assessment.assessedAt,
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </span>
                        <span className="savedEvidenceActions">
                          <button
                            type="button"
                            className="savedEvidenceView"
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedEvidenceId((current) =>
                                current === site.id ? null : site.id,
                              )
                            }
                          >
                            {isExpanded ? "Hide" : "View"}
                          </button>
                          <button
                            type="button"
                            className="savedEvidenceDelete"
                            title="Delete saved object assessment"
                            aria-label={`Delete ${site.propertyObjectName || site.name}`}
                            onClick={() => deleteObject(site)}
                          >
                            ×
                          </button>
                        </span>
                      </div>
                      {isExpanded && (
                        <section
                          className="savedEvidenceDetail"
                          aria-label={`${site.propertyObjectName || site.name} full assessment`}
                        >
                          <div className="savedEvidenceDetailHeader">
                            <div>
                              <p className="eyebrow">FULL OBJECT ASSESSMENT</p>
                              <h3>{site.propertyObjectName || site.name}</h3>
                            </div>
                            <span className="detailDose">
                              Planning dose{" "}
                              <b>{storedExposure?.doseIndex || "—"}</b>
                            </span>
                          </div>
                          <div className="savedEvidenceDetailGrid">
                            <article>
                              <p className="eyebrow">
                                {site.forecast?.source === "photo-matched"
                                  ? "DAYLIGHT EXPOSURE SCENARIO"
                                  : "CURRENT WEATHER"}
                              </p>
                              <p>
                                UVI {site.forecast?.uvi ?? "—"} ·{" "}
                                {site.forecast?.temperatureC ?? "—"}°C ·{" "}
                                {site.forecast?.cloudCover ?? "—"}% cloud cover
                                ·{" "}
                                {String(
                                  site.forecast?.localHour ?? "—",
                                ).padStart(2, "0")}
                                :00
                              </p>
                            </article>
                            <article>
                              <p className="eyebrow">SITE EVIDENCE</p>
                              <p>{assessment.summary}</p>
                            </article>
                            <article className="detailWide">
                              <p className="eyebrow">
                                SURFACE AND SHADE CONTEXT
                              </p>
                              <ul>
                                {(assessment.factors || []).map((factor) => (
                                  <li key={factor}>{factor}</li>
                                ))}
                              </ul>
                            </article>
                            {assessment.operationalImpact && (
                              <article className="detailWide">
                                <p className="eyebrow">
                                  OPERATIONAL IMPLICATION
                                </p>
                                <p>{assessment.operationalImpact}</p>
                              </article>
                            )}
                            <article className="detailWide doseBreakdown">
                              <p className="eyebrow">PLANNING EXTERNAL DOSE</p>
                              <p>
                                {storedExposure?.baseUvi ?? "—"} ×{" "}
                                {storedExposure?.sunAltitudeFactor ?? "—"}×
                                sun/time × {storedExposure?.cloudFactor ?? "—"}×
                                cloud × {storedExposure?.albedoFactor ?? "—"}×
                                albedo ={" "}
                                <b>{storedExposure?.doseIndex ?? "—"}</b>
                              </p>
                            </article>
                          </div>
                          {site.propertyPhotos?.length > 0 && (
                            <div className="savedEvidencePhotos">
                              {site.propertyPhotos.map((photo, index) => (
                                <figure key={`${photo.angle}-${index}`}>
                                  <img
                                    src={photo.image}
                                    alt={`${site.propertyObjectName || site.name}, ${photo.angle}`}
                                  />
                                  <figcaption>{photo.angle}</figcaption>
                                </figure>
                              ))}
                            </div>
                          )}
                        </section>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            {!savedEvidenceRows.length && (
              <p className="emptyEvidence">
                Confirm an object assessment to save its weather, image
                evidence, albedo multiplier, and planning dose here.
              </p>
            )}
          </section>
        </section>
      </main>
    </Shell>
  );
}
function App() {
  const profile = useUmbra((store) => store.profile);
  return (
    <BrowserRouter>
      <ScrollToTop />
      {!profile ? (
        <Onboarding />
      ) : (
        <Routes>
          <Route path="/team" element={<Team />} />
          <Route path="/external" element={<External />} />
          <Route
            path="/behavioral"
            element={
              <Shell>
                <Behavioral />
              </Shell>
            }
          />
          <Route
            path="/shift"
            element={
              <Shell>
                <ProtectedShift />
              </Shell>
            }
          />
          <Route path="/incident" element={<Navigate to="/shift" replace />} />
          <Route path="/reports" element={<Navigate to="/shift" replace />} />
          <Route path="*" element={<Navigate to="/team" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
