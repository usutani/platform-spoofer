const toggle = document.getElementById("toggle");
const profileSelect = document.getElementById("profile");
const reloadBtn = document.getElementById("reload");
const statusEl = document.getElementById("status");

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

function updateStatus(enabled) {
  statusEl.textContent = enabled
    ? "有効（http(s) タブに自動適用中）"
    : "無効（実環境に戻ります）";
}

chrome.runtime.sendMessage({ type: "getStatus" }, (res) => {
  if (chrome.runtime.lastError) return;
  toggle.checked = res.enabled;
  populateProfiles(res.profiles, res.profile);
  updateStatus(res.enabled);
});

toggle.addEventListener("change", () => {
  chrome.runtime.sendMessage(
    { type: "setEnabled", enabled: toggle.checked },
    (res) => {
      if (chrome.runtime.lastError) return;
      updateStatus(res.enabled);
    }
  );
});

profileSelect.addEventListener("change", () => {
  chrome.runtime.sendMessage(
    { type: "setProfile", profile: profileSelect.value },
    (res) => {
      if (chrome.runtime.lastError) return;
      updateStatus(res.enabled);
    }
  );
});

reloadBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id !== undefined) chrome.tabs.reload(tab.id);
});