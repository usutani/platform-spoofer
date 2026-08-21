const STORAGE_SITES = "spooferSites";
const STORAGE_PROFILE = "spooferProfile";
const STORAGE_ENABLED_LEGACY = "spooferEnabled";

const PROFILES = {
  "windows-chrome": {
    label: "Windows / Chrome",
    platform: "Win32",
    brand: "Google Chrome",
    platformName: "Windows",
    platformVersion: "15.0.0",
    architecture: "x86",
    bitness: "64",
    ua: (ver) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`,
  },
  "macos-chrome": {
    label: "macOS / Chrome",
    platform: "MacIntel",
    brand: "Google Chrome",
    platformName: "macOS",
    platformVersion: "13.0.0",
    architecture: "x86",
    bitness: "64",
    ua: (ver) =>
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`,
  },
  "windows-edge": {
    label: "Windows / Edge",
    platform: "Win32",
    brand: "Microsoft Edge",
    platformName: "Windows",
    platformVersion: "15.0.0",
    architecture: "x86",
    bitness: "64",
    ua: (ver) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36 Edg/${ver}.0.0.0`,
  },
};

const state = {
  sites: new Set(),
  profile: "windows-chrome",
};

const attachedTabs = new Set();

function getChromeVersion() {
  const m = navigator.userAgent.match(/Chrome\/(\d+)/);
  return m ? m[1] : "138";
}

function getProfile() {
  return PROFILES[state.profile] || PROFILES["windows-chrome"];
}

function buildUserAgent(profile) {
  return profile.ua(getChromeVersion());
}

function buildUserAgentMetadata(profile) {
  const ver = getChromeVersion();
  return {
    brands: [
      { brand: "Not)A;Brand", version: "99" },
      { brand: "Chromium", version: ver },
      { brand: profile.brand, version: ver },
    ],
    fullVersionList: [
      { brand: "Not)A;Brand", version: "99.0.0.0" },
      { brand: "Chromium", version: `${ver}.0.0.0` },
      { brand: profile.brand, version: `${ver}.0.0.0` },
    ],
    fullVersion: `${ver}.0.0.0`,
    platform: profile.platformName,
    platformVersion: profile.platformVersion,
    architecture: profile.architecture,
    bitness: profile.bitness,
    model: "",
    mobile: false,
  };
}

function isWebUrl(url) {
  return !!url && /^https?:\/\//.test(url);
}

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isEnabledUrl(url) {
  const origin = getOrigin(url);
  return !!origin && state.sites.has(origin);
}

function sortedSites() {
  return [...state.sites].sort();
}

function persistSites() {
  chrome.storage.local.set({ [STORAGE_SITES]: sortedSites() });
}

function profileLabels() {
  return Object.fromEntries(
    Object.entries(PROFILES).map(([key, p]) => [key, { label: p.label }])
  );
}

async function applyOverride(tabId) {
  const profile = getProfile();
  try {
    if (!attachedTabs.has(tabId)) {
      try {
        await chrome.debugger.attach({ tabId }, "1.3");
        attachedTabs.add(tabId);
      } catch (e) {
        console.warn("[Platform Spoofer] attach failed:", e.message || e);
      }
    }
    await chrome.debugger.sendCommand(
      { tabId },
      "Emulation.setUserAgentOverride",
      {
        userAgent: buildUserAgent(profile),
        platform: profile.platform,
        userAgentMetadata: buildUserAgentMetadata(profile),
      }
    );
  } catch (e) {
    console.warn("[Platform Spoofer] applyOverride failed:", e.message || e);
  }
}

async function detachTab(tabId) {
  attachedTabs.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch (e) {
    console.warn("[Platform Spoofer] detach failed:", e.message || e);
  }
}

async function detachAll() {
  for (const tabId of [...attachedTabs]) await detachTab(tabId);
}

async function detachOrigin(origin) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined && getOrigin(tab.url) === origin) {
      await detachTab(tab.id);
    }
  }
}

async function syncAttachedTabs() {
  const targets = await chrome.debugger.getTargets();
  for (const t of targets) {
    if (t.tabId !== undefined && t.attached && isWebUrl(t.url)) {
      attachedTabs.add(t.tabId);
    }
  }
}

async function applyToExistingTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id === undefined || !isWebUrl(tab.url)) continue;
    if (isEnabledUrl(tab.url)) {
      applyOverride(tab.id);
    } else if (attachedTabs.has(tab.id)) {
      detachTab(tab.id);
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading") return;
  if (!isWebUrl(tab.url)) return;
  if (isEnabledUrl(tab.url)) {
    applyOverride(tabId);
  } else if (attachedTabs.has(tabId)) {
    detachTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId !== undefined) attachedTabs.delete(source.tabId);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "getStatus") {
    sendResponse({
      sites: sortedSites(),
      profile: state.profile,
      profiles: profileLabels(),
    });
    return;
  }
  if (msg.type === "addSite") {
    if (typeof msg.origin === "string" && isWebUrl(msg.origin)) {
      state.sites.add(msg.origin);
      persistSites();
      applyToExistingTabs();
    }
    sendResponse({ sites: sortedSites() });
    return;
  }
  if (msg.type === "removeSite") {
    if (typeof msg.origin === "string" && state.sites.delete(msg.origin)) {
      persistSites();
      detachOrigin(msg.origin);
    }
    sendResponse({ sites: sortedSites() });
    return;
  }
  if (msg.type === "setProfile") {
    if (PROFILES[msg.profile]) {
      state.profile = msg.profile;
      chrome.storage.local.set({ [STORAGE_PROFILE]: state.profile });
      applyToExistingTabs();
    }
    sendResponse({ sites: sortedSites(), profile: state.profile });
    return;
  }
});

chrome.runtime.onStartup.addListener(applyToExistingTabs);

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(STORAGE_ENABLED_LEGACY);
  applyToExistingTabs();
});

async function init() {
  const res = await chrome.storage.local.get([STORAGE_SITES, STORAGE_PROFILE]);
  if (Array.isArray(res[STORAGE_SITES])) {
    for (const site of res[STORAGE_SITES]) {
      if (typeof site === "string") state.sites.add(site);
    }
  }
  if (typeof res[STORAGE_PROFILE] === "string" && PROFILES[res[STORAGE_PROFILE]]) {
    state.profile = res[STORAGE_PROFILE];
  }
  await syncAttachedTabs();
  applyToExistingTabs();
}

init();
