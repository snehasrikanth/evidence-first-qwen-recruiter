export async function createIntake({ jobName, jobDescription, files, consent }) {
  const body = new FormData();
  body.append("job_name", jobName);
  body.append("job_description", jobDescription);
  body.append("professional_research_consent", consent ? "true" : "false");
  for (const file of files) {
    body.append("resumes", file);
  }
  const response = await fetch("/jobs/intake", {
    method: "POST",
    body,
  });
  return readJson(response);
}

export async function runResearch(jobId, extra = {}) {
  const response = await fetch(`/jobs/${jobId}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      consent_confirmed: true,
      ...extra,
    }),
  });
  return readJson(response);
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg || JSON.stringify(item)).join(" ")
          : payload.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}
