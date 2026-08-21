const currentSiteEl = document.getElementById("current-site");
const toggleCurrentBtn = document.getElementById("toggle-current");
const profileSelect = document.getElementById("profile");
const siteListEl = document.getElementById("site-list");
const reloadBtn = document.getElementById("reload");

let sites = [];
let currentOrigin = null;

function normalizeOrigin(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
  } catch {
    return null;
  }
  return null;
}

function populateProfiles(profiles, current) {
  profileSelect.innerHTML = "";
  for (const [key, p] of Object.entries(profiles)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = p.label;
    profileSelect.appendChild(opt);
  }
  profileSelect.value = current;
}

function renderCurrentSite() {
  const included = !!currentOrigin && sites.includes(currentOrigin);
  if (!currentOrigin) {
    currentSiteEl.textContent = "（対象外のページ）";
    toggleCurrentBtn.disabled = true;
    toggleCurrentBtn.textContent = "追加";
    return;
  }
  currentSiteEl.textContent = currentOrigin;
  currentSiteEl.title = currentOrigin;
  toggleCurrentBtn.disabled = false;
  toggleCurrentBtn.textContent = included ? "削除" : "追加";
}

function renderSiteList() {
  siteListEl.innerHTML = "";
  if (sites.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "なし";
    siteListEl.appendChild(li);
    return;
  }
  for (const origin of sites) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "site-name";
    span.textContent = origin;
    span.title = origin;
    const btn = document.createElement("button");
    btn.textContent = "削除";
    btn.addEventListener("click", () => removeSite(origin));
    li.appendChild(span);
    li.appendChild(btn);
    siteListEl.appendChild(li);
  }
}

function refresh(res) {
  if (!res) return;
  sites = res.sites || [];
  if (res.profile && res.profiles) populateProfiles(res.profiles, res.profile);
  renderSiteList();
  renderCurrentSite();
}

function send(msg, cb) {
  chrome.runtime.sendMessage(msg, (res) => {
    if (chrome.runtime.lastError) return;
    if (cb) cb(res);
  });
}

function removeSite(origin) {
  send({ type: "removeSite", origin }, refresh);
}

send({ type: "getStatus" }, refresh);

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  currentOrigin = tab ? normalizeOrigin(tab.url) : null;
  renderCurrentSite();
});

if (chrome.permissions && chrome.permissions.onAdded) {
  chrome.permissions.onAdded.addListener(() => send({ type: "getStatus" }, refresh));
  chrome.permissions.onRemoved.addListener(() => send({ type: "getStatus" }, refresh));
}

toggleCurrentBtn.addEventListener("click", () => {
  if (!currentOrigin) return;
  const isIncluded = sites.includes(currentOrigin);
  if (isIncluded) {
    send({ type: "removeSite", origin: currentOrigin }, refresh);
  } else {
    chrome.permissions.request({ origins: [`${currentOrigin}/*`] }, (granted) => {
      if (chrome.runtime.lastError) return;
      if (!granted) return;
      send({ type: "addSite", origin: currentOrigin }, refresh);
    });
  }
});

profileSelect.addEventListener("change", () => {
  send({ type: "setProfile", profile: profileSelect.value });
});

reloadBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id !== undefined) chrome.tabs.reload(tab.id);
});
