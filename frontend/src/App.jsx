import { useMemo, useState } from "react";
import { createIntake, runResearch } from "./api.js";

const FIT_LABELS = {
  strong_role_alignment: "Strong demonstrated alignment",
  potential_role_alignment: "Potential alignment — review needed",
  insufficient_demonstrated_evidence: "Insufficient demonstrated evidence",
  analysis_unavailable: "Analysis unavailable — review needed",
};

function scoreText(value) {
  return value == null ? "n/a" : `${Number(value).toFixed(1)}`;
}

function groupSuggestions(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    for (const source of candidate.sources || []) {
      if (source.status !== "needs_identity_review") continue;
      const key = `${candidate.resume_id}:${source.platform}`;
      if (!groups.has(key)) {
        groups.set(key, {
          resumeId: candidate.resume_id,
          filename: candidate.original_filename,
          platform: source.platform,
          options: [],
        });
      }
      groups.get(key).options.push(source);
    }
  }
  return [...groups.values()];
}

export default function App() {
  const [jobName, setJobName] = useState("Senior Applied AI Scientist");
  const [jobDescription, setJobDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [job, setJob] = useState(null);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmations, setConfirmations] = useState({});
  const [openCard, setOpenCard] = useState(null);

  const suggestions = useMemo(
    () => (run ? groupSuggestions(run.candidates) : []),
    [run]
  );

  const shortlisted = useMemo(() => {
    if (!run) return [];
    return run.candidates
      .filter((item) => item.fit_analysis?.decision?.top_30_percent)
      .sort(
        (a, b) =>
          (a.fit_analysis.decision.shortlist_rank || 99) -
          (b.fit_analysis.decision.shortlist_rank || 99)
      );
  }, [run]);

  const ranked = useMemo(() => {
    if (!run) return [];
    return [...run.candidates].sort((a, b) => {
      const aScore = a.fit_analysis?.decision?.evidence_score ?? -1;
      const bScore = b.fit_analysis?.decision?.evidence_score ?? -1;
      return bScore - aScore;
    });
  }, [run]);

  async function handleSave(event) {
    event.preventDefault();
    setError("");
    if (files.length < 1 || files.length > 20) {
      setError("Upload between 1 and 20 resumes.");
      return;
    }
    setBusy("Reading and saving resumes locally…");
    try {
      const payload = await createIntake({
        jobName,
        jobDescription,
        files,
        consent,
      });
      setJob(payload.job);
      setRun(null);
      setConfirmations({});
    } catch (exc) {
      setError(exc.message);
    } finally {
      setBusy("");
    }
  }

  async function handleResearch(extra = {}) {
    if (!job) return;
    setError("");
    setBusy(
      "Searching public profiles and asking local Qwen to organize the evidence…"
    );
    try {
      const payload = await runResearch(job.job_id, extra);
      setRun(payload.run);
      const first = payload.run.candidates?.[0]?.resume_id;
      setOpenCard(first || null);
    } catch (exc) {
      setError(exc.message);
    } finally {
      setBusy("");
    }
  }

  async function handleConfirmIdentities(event) {
    event.preventDefault();
    const candidates = [];
    for (const [resumeId, platforms] of Object.entries(confirmations)) {
      const entry = { resume_id: resumeId, identity_confirmed: true };
      if (platforms.github) entry.github_url = platforms.github;
      if (platforms.linkedin) entry.linkedin_url = platforms.linkedin;
      if (entry.github_url || entry.linkedin_url) candidates.push(entry);
    }
    if (!candidates.length) return;
    await handleResearch({ candidates });
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local-first · Human review</p>
          <h1>Evidence-First Recruiting</h1>
        </div>
        <p className="topbar-note">
          Scores show demonstrated evidence against this job only. Nobody is
          rejected automatically.
        </p>
      </header>

      <main className="layout">
        <section className="panel intake">
          <div className="step">1</div>
          <h2>Job and resumes</h2>
          <form onSubmit={handleSave}>
            <label>
              Job name
              <input
                value={jobName}
                maxLength={200}
                onChange={(event) => setJobName(event.target.value)}
                required
              />
            </label>
            <label>
              Job description
              <textarea
                value={jobDescription}
                maxLength={50000}
                rows={12}
                placeholder="Paste the complete role description and required qualifications."
                onChange={(event) => setJobDescription(event.target.value)}
                required
              />
            </label>
            <label className="file-label">
              Resumes
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt"
                onChange={(event) => setFiles([...event.target.files])}
              />
              <span className="hint">
                {files.length
                  ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
                  : "1–20 PDF, DOCX, or TXT files, up to 10 MB each"}
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              Candidates were told their public GitHub or LinkedIn may be reviewed.
            </label>
            <button className="primary" type="submit" disabled={Boolean(busy)}>
              Save job and resumes
            </button>
          </form>
        </section>

        <section className="panel work">
          {!job && (
            <div className="empty">
              <h2>Review starts after you save a job</h2>
              <p>
                Upload the Applied AI JD and Edge Cases resumes, confirm notice,
                then run evidence research. The same FastAPI backend as before
                does the scoring.
              </p>
            </div>
          )}

          {job && (
            <>
              <div className="step-row">
                <div className="step">2</div>
                <div>
                  <h2>{job.job_name}</h2>
                  <p className="muted">
                    {job.resume_count} resumes saved · job {job.job_id.slice(0, 8)}
                  </p>
                </div>
              </div>

              {!job.professional_research_consent && (
                <p className="banner warn">
                  Profile research is off because notice was not confirmed at
                  intake. Save again with the checkbox to analyze.
                </p>
              )}

              <button
                className="primary"
                type="button"
                disabled={!job.professional_research_consent || Boolean(busy)}
                onClick={() => handleResearch()}
              >
                Find public profiles and analyze candidates
              </button>

              <ul className="resume-list">
                {job.resumes.map((resume) => (
                  <li key={resume.resume_id}>
                    <strong>{resume.original_filename}</strong>
                    <span
                      className={
                        resume.parsing_status === "complete" ? "ok" : "bad"
                      }
                    >
                      {resume.parsing_status}
                    </span>
                    {resume.extracted_links?.length ? (
                      <p>
                        {resume.extracted_links.map((link) => (
                          <a key={link} href={link} target="_blank" rel="noreferrer">
                            {link}
                          </a>
                        ))}
                      </p>
                    ) : (
                      <p className="muted">No profile URL on this resume.</p>
                    )}
                    {resume.parsing_error && (
                      <p className="bad">{resume.parsing_error}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {run && (
            <div className="results">
              <div className="step-row">
                <div className="step">3</div>
                <div>
                  <h2>Evidence review</h2>
                  <p className="muted">{run.safety_notice}</p>
                </div>
              </div>

              {suggestions.length > 0 && (
                <form className="confirm" onSubmit={handleConfirmIdentities}>
                  <p className="banner warn">
                    These profile matches are suggestions. They are not scored
                    until you confirm the identity.
                  </p>
                  {suggestions.map((group) => (
                    <fieldset key={`${group.resumeId}-${group.platform}`}>
                      <legend>
                        {group.filename} · {group.platform}
                      </legend>
                      <label>
                        <input
                          type="radio"
                          name={`${group.resumeId}-${group.platform}`}
                          checked={!confirmations[group.resumeId]?.[group.platform]}
                          onChange={() =>
                            setConfirmations((current) => ({
                              ...current,
                              [group.resumeId]: {
                                ...current[group.resumeId],
                                [group.platform]: "",
                              },
                            }))
                          }
                        />
                        Do not confirm
                      </label>
                      {group.options.map((source) => (
                        <label key={source.url}>
                          <input
                            type="radio"
                            name={`${group.resumeId}-${group.platform}`}
                            checked={
                              confirmations[group.resumeId]?.[group.platform] ===
                              source.url
                            }
                            onChange={() =>
                              setConfirmations((current) => ({
                                ...current,
                                [group.resumeId]: {
                                  ...current[group.resumeId],
                                  [group.platform]: source.url,
                                },
                              }))
                            }
                          />
                          <span>
                            {source.url}
                            {source.match_signals?.length
                              ? ` — ${source.match_signals.join("; ")}`
                              : ""}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                  <button className="primary" type="submit" disabled={Boolean(busy)}>
                    Confirm selected identities and rerun
                  </button>
                </form>
              )}

              {run.rubric && (
                <details>
                  <summary>Role-specific rubric</summary>
                  <ul className="rubric">
                    {run.rubric.criteria.map((criterion) => (
                      <li key={criterion.criterion_id}>
                        <strong>
                          {criterion.title} · {criterion.weight.toFixed(1)}% ·{" "}
                          {criterion.required ? "Required" : "Preferred"}
                        </strong>
                        <p>{criterion.description}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {shortlisted.length > 0 && (
                <div className="shortlist">
                  <h3>Top 30% for human review</h3>
                  <p className="muted">
                    Strongest demonstrated evidence. This is not a hiring
                    decision.
                  </p>
                  <ol>
                    {shortlisted.map((candidate) => (
                      <li key={candidate.resume_id}>
                        <span>#{candidate.fit_analysis.decision.shortlist_rank}</span>
                        {candidate.original_filename}
                        <em>
                          {scoreText(
                            candidate.fit_analysis.decision.evidence_score
                          )}
                          /100
                        </em>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {ranked.map((candidate) => {
                const decision = candidate.fit_analysis?.decision;
                const score = decision?.evidence_score;
                const open = openCard === candidate.resume_id;
                return (
                  <article
                    key={candidate.resume_id}
                    className={`card ${decision?.top_30_percent ? "top" : ""}`}
                  >
                    <button
                      type="button"
                      className="card-head"
                      onClick={() =>
                        setOpenCard(open ? null : candidate.resume_id)
                      }
                    >
                      <div>
                        <h3>{candidate.original_filename}</h3>
                        <p>
                          {FIT_LABELS[decision?.fit_label] ||
                            candidate.fit_analysis?.summary}
                        </p>
                      </div>
                      <div className={`score ${fitTone(decision)}`}>
                        <strong>{scoreText(score)}</strong>
                        <span>/100</span>
                      </div>
                    </button>
                    {open && (
                      <div className="card-body">
                        <div className="metrics">
                          <Metric
                            label="Required"
                            value={
                              decision
                                ? `${decision.required_criteria_met}/${decision.required_criteria_total}`
                                : "n/a"
                            }
                          />
                          <Metric
                            label="Coverage"
                            value={
                              decision
                                ? `${Math.round(decision.evidence_coverage)}%`
                                : "n/a"
                            }
                          />
                          <Metric
                            label="Preferred"
                            value={
                              decision?.preferred_criteria_score == null
                                ? "n/a"
                                : scoreText(decision.preferred_criteria_score)
                            }
                          />
                        </div>
                        {decision?.hard_requirement_gaps?.length > 0 && (
                          <div className="banner bad">
                            <strong>Required qualification not met</strong>
                            <ul>
                              {decision.hard_requirement_gaps.map((gap) => (
                                <li key={gap}>{gap}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {decision?.experience_check && (
                          <p className="muted">
                            Experience: required{" "}
                            {decision.experience_check.required_years ?? "n/a"}{" "}
                            yrs · stated{" "}
                            {decision.experience_check.stated_years ?? "n/a"} ·
                            from dates{" "}
                            {decision.experience_check.calculated_years ?? "n/a"}
                          </p>
                        )}
                        <p>{candidate.fit_analysis.summary}</p>
                        {candidate.fit_analysis.strengths?.length > 0 && (
                          <>
                            <h4>Evidence-backed strengths</h4>
                            <ul>
                              {candidate.fit_analysis.strengths.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {candidate.fit_analysis.unknowns?.length > 0 && (
                          <>
                            <h4>Evidence did not show</h4>
                            <ul>
                              {candidate.fit_analysis.unknowns.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {(candidate.sources || []).length === 0 && (
                          <p className="muted">
                            No candidate-provided professional profile was
                            available. The resume was assessed on its own.
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {(busy || error) && (
        <div className="toast">
          {busy && <p className="busy">{busy}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function fitTone(decision) {
  if (!decision) return "neutral";
  if (decision.hard_requirement_gaps?.length) return "bad";
  if (decision.fit_label === "strong_role_alignment") return "good";
  if ((decision.evidence_score ?? 0) >= 35) return "mid";
  return "bad";
}
