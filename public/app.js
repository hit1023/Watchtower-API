const API_BASE = "https://watchtower-api.s-quad.com";
const state = { key: sessionStorage.getItem("watchtower_api_key") ?? "" };

const elements = {
  connectForm: document.querySelector("#connect-form"),
  apiKey: document.querySelector("#api-key"),
  connectionState: document.querySelector("#connection-state"),
  console: document.querySelector("#console"),
  watchForm: document.querySelector("#watch-form"),
  watchFormState: document.querySelector("#watch-form-state"),
  watchList: document.querySelector("#watch-list"),
  eventList: document.querySelector("#event-list"),
  eventCount: document.querySelector("#event-count"),
  refreshButton: document.querySelector("#refresh-button"),
};

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `form-state ${kind}`.trim();
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${state.key}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
  return payload;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function hostname(value) {
  try { return new URL(value).hostname; } catch { return value; }
}

function appendMeta(container, values) {
  for (const value of values) {
    const span = document.createElement("span");
    span.textContent = value;
    container.append(span);
  }
}

function createWatchCard(watch) {
  const card = document.createElement("article");
  card.className = "watch-card";
  const top = document.createElement("div");
  top.className = "watch-top";
  const link = document.createElement("a");
  link.className = "watch-url";
  link.href = watch.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = hostname(watch.url);
  const run = document.createElement("button");
  run.className = "run-button";
  run.type = "button";
  run.textContent = "Run now";
  run.addEventListener("click", async () => {
    run.disabled = true;
    run.textContent = "Running…";
    try {
      const result = await api(`/v1/watches/${encodeURIComponent(watch.id)}/run`, { method: "POST" });
      run.textContent = result.data.changed ? "Change found" : "No change";
      await loadData();
    } catch (error) {
      run.textContent = error.message;
    } finally {
      window.setTimeout(() => { run.disabled = false; run.textContent = "Run now"; }, 1800);
    }
  });
  top.append(link, run);
  const instruction = document.createElement("p");
  instruction.className = "watch-instruction";
  instruction.textContent = watch.instruction;
  const meta = document.createElement("div");
  meta.className = "watch-meta";
  appendMeta(meta, [`${watch.interval_minutes} min`, `threshold ${watch.importance_threshold}`, `next ${formatDate(watch.next_run_at)}`]);
  card.append(top, instruction, meta);
  return card;
}

function createEventCard(event) {
  const card = document.createElement("article");
  card.className = "event-card";
  const top = document.createElement("div");
  top.className = "event-top";
  const summary = document.createElement("p");
  summary.className = "event-summary";
  summary.textContent = event.summary;
  const importance = document.createElement("span");
  importance.className = "importance";
  importance.textContent = `${Math.round(event.importance * 100)}%`;
  top.append(summary, importance);
  const meta = document.createElement("div");
  meta.className = "event-meta";
  appendMeta(meta, [event.category, formatDate(event.created_at)]);
  card.append(top, meta);
  return card;
}

async function loadData() {
  const [watchesPayload, eventsPayload] = await Promise.all([api("/v1/watches?limit=25"), api("/v1/events?limit=25")]);
  const watches = watchesPayload.data;
  const events = eventsPayload.data;
  elements.watchList.replaceChildren();
  elements.watchList.classList.toggle("empty-state", watches.length === 0);
  if (watches.length === 0) elements.watchList.textContent = "まだ監視がありません。左のフォームから登録してください。";
  else watches.forEach((watch) => elements.watchList.append(createWatchCard(watch)));
  elements.eventList.replaceChildren();
  elements.eventList.classList.toggle("empty-state", events.length === 0);
  if (events.length === 0) elements.eventList.textContent = "重要な変化はまだ検出されていません。";
  else events.forEach((event) => elements.eventList.append(createEventCard(event)));
  elements.eventCount.textContent = String(events.length);
}

async function connect(key) {
  state.key = key.trim();
  setStatus(elements.connectionState, "Connecting…");
  await loadData();
  sessionStorage.setItem("watchtower_api_key", state.key);
  elements.console.classList.remove("is-locked");
  setStatus(elements.connectionState, "Connected to watchtower-api.s-quad.com", "success");
}

elements.connectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await connect(elements.apiKey.value); }
  catch (error) { state.key = ""; setStatus(elements.connectionState, error.message, "error"); }
});

elements.watchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = elements.watchForm.querySelector("button[type=submit]");
  button.disabled = true;
  setStatus(elements.watchFormState, "Creating watch…");
  try {
    const payload = {
      url: document.querySelector("#watch-url").value,
      instruction: document.querySelector("#instruction").value,
      interval_minutes: Number(document.querySelector("#interval").value),
      importance_threshold: Number(document.querySelector("#threshold").value),
    };
    const created = await api("/v1/watches", { method: "POST", body: JSON.stringify(payload) });
    setStatus(elements.watchFormState, `Created ${created.data.id}`, "success");
    elements.watchForm.reset();
    await loadData();
  } catch (error) { setStatus(elements.watchFormState, error.message, "error"); }
  finally { button.disabled = false; }
});

elements.refreshButton.addEventListener("click", async () => {
  elements.refreshButton.disabled = true;
  try { await loadData(); }
  catch (error) { setStatus(elements.connectionState, error.message, "error"); }
  finally { elements.refreshButton.disabled = false; }
});

if (state.key) {
  elements.apiKey.value = state.key;
  connect(state.key).catch((error) => {
    sessionStorage.removeItem("watchtower_api_key");
    setStatus(elements.connectionState, error.message, "error");
  });
}
