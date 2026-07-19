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
import { create } from "zustand";
import "./styles.css";

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
};

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
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(source);
  }
}
const profileKey = (profile) =>
  `umbra_external_evidence_${profile?.company || ""}:${profile?.name || ""}`;
const statePath = (profile) =>
  `/api/state?foreman=${encodeURIComponent(profile?.name || "")}&company=${encodeURIComponent(profile?.company || "")}`;
const useUmbra = create((set) => ({
  profile: JSON.parse(localStorage.getItem("umbra_foreman_profile") || "null"),
  state: null,
  setState: (state) => set({ state }),
  setProfile: (profile) => {
    localStorage.setItem("umbra_foreman_profile", JSON.stringify(profile));
    set({ profile, state: null });
  },
}));

function useData() {
  const profile = useUmbra((store) => store.profile);
  const state = useUmbra((store) => store.state);
  const setState = useUmbra((store) => store.setState);
  const refresh = async () => setState(await api(statePath(profile)));
  useEffect(() => {
    refresh();
  }, []);
  return { profile, state, setState, refresh };
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
  const hasTeam = Boolean(state?.workers?.length);
  const hasExternalEvidence = Boolean(
    localStorage.getItem(profileKey(profile)),
  );
  const navigation = [
    { label: "Team", to: "/team", available: true },
    { label: "External Factors", to: "/external", available: hasTeam },
    {
      label: "Behavioral Factors",
      to: "/behavioral",
      available: hasTeam && hasExternalEvidence,
    },
    { label: "Shift / Morning Brief", to: "/shift", available: false },
    { label: "Live Incident", to: "/incident", available: false },
    { label: "Reports", to: "/reports", available: false },
  ];
  const availableSteps = navigation.filter((item) => item.available);
  const activeStepIndex = availableSteps.findIndex(
    (item) => item.to === location.pathname,
  );
  const previousStep = availableSteps[activeStepIndex - 1];
  const nextStep = availableSteps[activeStepIndex + 1];
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
                title="Complete the previous step first"
              >
                {item.label}
              </span>
            ),
          )}
        </nav>
        {profile && (
          <span className="foremanIdentity">
            <span aria-hidden="true">👷</span>
            <span>
              <b>{profile.name}</b>
              <small>{profile.company}</small>
            </span>
          </span>
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
function PendingScreen({ title, detail }) {
  return (
    <Shell>
      <main>
        <section className="panel pendingScreen">
          <p>REACT MIGRATION</p>
          <h1>{title}</h1>
          <p>
            {detail ||
              "This screen will be migrated next. The complete existing version remains available at localhost:3000."}
          </p>
        </section>
      </main>
    </Shell>
  );
}
function Team() {
  const { profile, state, setState } = useData();
  const [message, setMessage] = useState("");
  const [editingWorker, setEditingWorker] = useState(null);
  const submit = async (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const data = await api(
        editingWorker
          ? `/api/team-member/${editingWorker.id}`
          : "/api/team-member",
        {
          method: "POST",
          body: JSON.stringify({ ...input, profile }),
        },
      );
      setState(data.state);
      event.currentTarget.reset();
      setEditingWorker(null);
      setMessage(
        editingWorker ? "Employee profile updated." : "Employee profile added.",
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
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState("");
  const savedEvidence = state?.sites
    ?.map((site) => ({ site, assessment: site.propertyAssessment }))
    .find((entry) => entry.assessment);
  const hasCrewEvidence = Boolean(localStorage.getItem(profileKey(profile)));
  const submit = async (event) => {
    event.preventDefault();
    if (files.length < 2)
      return setMessage("Add at least two photos from different angles.");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      setMessage("Analyzing the object and calculating external exposure...");
      const siteId = state.sites[0]?.id;
      const photos = await Promise.all(
        files.map(async (file, index) => ({
          image: await compactImage(file),
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
      setDraft(preview.draft);
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
      setState(confirmed.state);
      setFiles([]);
      setMessage("Object assessment saved. Opening Behavioral Factors...");
      navigate("/behavioral");
    } catch (error) {
      setMessage(error.message);
    }
  };
  const analysis = draft?.assessment;
  const weather = draft?.forecast;
  const exposure = draft?.exposure;
  const objectName = draft?.objectName;
  const visibleSavedEvidence = hasCrewEvidence ? savedEvidence : null;
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
                  <div className="externalPhotoPreview">
                    {files.map((file, index) => (
                      <figure key={`${file.name}-${index}`}>
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Object angle ${index + 1}`}
                        />
                        <figcaption>Angle {index + 1}</figcaption>
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
                      </figure>
                    ))}
                  </div>
                )}
                <button>Assess object &amp; parse weather</button>
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
                      <dt>Current weather</dt>
                      <dd>
                        UVI {weather.uvi} · {weather.temperatureC}°C ·{" "}
                        {weather.cloudCover}% cloud cover ·{" "}
                        {String(weather.localHour).padStart(2, "0")}:00
                      </dd>
                    </div>
                    <div>
                      <dt>Visible site evidence</dt>
                      <dd>{analysis.summary}</dd>
                    </div>
                    <div>
                      <dt>Albedo / surface multiplier</dt>
                      <dd>
                        {analysis.setting} · {exposure.albedoFactor}×
                      </dd>
                    </div>
                    <div>
                      <dt>Planning external dose</dt>
                      <dd>
                        {exposure.baseUvi} × {exposure.sunAltitudeFactor}× sun/time
                        × {exposure.cloudFactor}× cloud × {exposure.albedoFactor}×
                        albedo = <b>{exposure.doseIndex}</b>
                      </dd>
                    </div>
                  </dl>
                  <p className="calculationNote">
                    Peak sun factor applies from 11:00–16:00. Dense cloud lowers
                    the dose; light cloud or haze may increase it. Reflective
                    concrete, glass, metal, sand, or water can raise the albedo
                    factor.
                  </p>
                  <div className="parserActions">
                    <button type="button" onClick={confirmDraft}>
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
            {visibleSavedEvidence ? (
              <>
                <h2>
                  {visibleSavedEvidence.site.name} ·{" "}
                  {visibleSavedEvidence.assessment.setting} exposure
                </h2>
                <p>{visibleSavedEvidence.assessment.summary}</p>
                <ul>
                  {(visibleSavedEvidence.assessment.factors || []).map(
                    (factor) => (
                      <li key={factor}>{factor}</li>
                    ),
                  )}
                </ul>
                <small>
                  Water feature:{" "}
                  {visibleSavedEvidence.assessment.waterFeature || "unknown"} ·
                  confidence:{" "}
                  {visibleSavedEvidence.assessment.confidence || "unavailable"}
                </small>
              </>
            ) : (
              <p>
                Submitted object assessments are saved here for this crew,
                including visible materials, shade observations, albedo, and
                confidence.
              </p>
            )}
            <div className="evidenceTimeline">
              <p className="eyebrow">EVIDENCE TIMELINE</p>
              {(visibleSavedEvidence ? state?.activity || [] : [])
                .filter((item) =>
                  /weather|imagery|photo|UV|surface/i.test(
                    `${item.message} ${item.detail}`,
                  ),
                )
                .slice(0, 4)
                .map((item) => (
                  <div key={item.id}>
                    <time>
                      {new Date(item.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    <span>{item.message}</span>
                    <small>{item.detail}</small>
                  </div>
                ))}
              {!visibleSavedEvidence && (
                <small>
                  The saved history of object uploads, weather refreshes, and
                  assessment updates will appear here.
                </small>
              )}
            </div>
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
              <PendingScreen
                title="Behavioral Factors"
                detail="Protection status will be migrated after the environmental evidence screen is reviewed."
              />
            }
          />
          <Route
            path="/shift"
            element={<PendingScreen title="Shift / Morning Brief" />}
          />
          <Route
            path="/incident"
            element={<PendingScreen title="Live Incident" />}
          />
          <Route path="/reports" element={<PendingScreen title="Reports" />} />
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
