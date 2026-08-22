const STORAGE_SITES = "spooferSites";
const STORAGE_PROFILE = "spooferProfile";
const STORAGE_ENABLED_LEGACY = "spooferEnabled";

const PROFILES = {
  "windows-chrome": {
    label: "Windows / Chrome",
    file: "profiles/windows-chrome.js",
  },
  "macos-chrome": {
    label: "macOS / Chrome",
    file: "profiles/macos-chrome.js",
  },
  "windows-edge": {
    label: "Windows / Edge",
    file: "profiles/windows-edge.js",
  },
};

const SCRIPT_ID = "ps-spoof";

const state = {
  sites: new Set(),
  profile: "windows-chrome",
};

function getChromeVersion() {
  const m = navigator.userAgent.match(/Chrome\/(\d+)/);
  return m ? m[1] : "138";
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

function patternToOrigin(pattern) {
  try {
    if (pattern.endsWith("/*")) pattern = pattern.slice(0, -2);
    return new URL(pattern).origin;
  } catch {
    return null;
  }
}

async function loadProfileConfig(key) {
  const entry = PROFILES[key] || PROFILES["windows-chrome"];
  try {
    const url = chrome.runtime.getURL(entry.file);
    const res = await fetch(url);
    const text = await res.text();
    const m = text.match(/self\.__PS_PROFILE__\s*=\s*(\{[\s\S]*?\});/);
    if (m) {
      const cfg = Function(`"use strict"; return (${m[1]});`)();
      return cfg;
    }
  } catch (e) {
    console.warn("[Platform Spoofer] loadProfileConfig failed:", e.message || e);
  }
  return {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{V}.0.0.0 Safari/537.36",
    platform: "Win32",
    vendor: "Google Inc.",
    brandList: [
      ["Not)A;Brand", "99"],
      ["Chromium", "{V}"],
      ["Google Chrome", "{V}"],
    ],
    mobile: false,
    platformName: "Windows",
    platformVersion: "15.0.0",
    architecture: "x86",
    bitness: "64",
    model: "",
  };
}

function buildSpoofValues(cfg) {
  const ver = getChromeVersion();
  const fullVer = `${ver}.0.0.0`;
  const sub = (s) => String(s).replaceAll("{V}", ver);
  const userAgent = sub(cfg.ua);
  const brands = cfg.brandList.map(([brand, v]) => ({
    brand,
    version: sub(v),
  }));
  const fullVersionList = cfg.brandList.map(([brand, v]) => ({
    brand,
    version: v === "{V}" ? fullVer : sub(v),
  }));
  return { userAgent, brands, fullVersionList, cfg, ver, fullVer };
}

async function rebuildRules(sites, cfg) {
  const { userAgent, brands, fullVersionList, cfg: c } = buildSpoofValues(cfg);

  const chUa = brands.map((b) => `"${b.brand}";v="${b.version}"`).join(", ");
  const chFull = fullVersionList
    .map((b) => `"${b.brand}";v="${b.version}"`)
    .join(", ");

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);

  if (sites.length === 0) {
    if (removeRuleIds.length)
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] });
    return;
  }

  const addRules = sites.map((origin, i) => {
    let hostname;
    try {
      hostname = new URL(origin).hostname;
    } catch {
      hostname = origin;
    }
    return {
      id: i + 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "User-Agent", operation: "set", value: userAgent },
          { header: "Sec-CH-UA", operation: "set", value: chUa },
          { header: "Sec-CH-UA-Mobile", operation: "set", value: c.mobile ? "?1" : "?0" },
          { header: "Sec-CH-UA-Platform", operation: "set", value: `"${c.platformName}"` },
          {
            header: "Sec-CH-UA-Full-Version-List",
            operation: "set",
            value: chFull,
          },
        ],
      },
      condition: {
        requestDomains: [hostname],
      },
    };
  });

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

async function rebuildContentScripts(sites, profileKey) {
  const entry = PROFILES[profileKey] || PROFILES["windows-chrome"];
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const exists = registered.some((s) => s.id === SCRIPT_ID);
  if (exists) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    } catch (e) {
      console.warn("[Platform Spoofer] unregister failed:", e.message || e);
    }
  }
  if (sites.length === 0) return;
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        matches: sites.map((o) => `${o}/*`),
        js: [entry.file, "spoof.js"],
        runAt: "document_start",
        allFrames: true,
        world: "MAIN",
        persistAcrossSessions: true,
      },
    ]);
  } catch (e) {
    console.warn("[Platform Spoofer] registerContentScripts failed:", e.message || e);
  }
}

async function rebuildAll() {
  const sites = sortedSites();
  const cfg = await loadProfileConfig(state.profile);
  await rebuildRules(sites, cfg);
  await rebuildContentScripts(sites, state.profile);
}

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
    (async () => {
      if (typeof msg.origin === "string" && isWebUrl(msg.origin)) {
        state.sites.add(msg.origin);
        persistSites();
        await rebuildAll();
      }
      sendResponse({ sites: sortedSites() });
    })();
    return true;
  }
  if (msg.type === "removeSite") {
    (async () => {
      if (typeof msg.origin === "string" && state.sites.delete(msg.origin)) {
        persistSites();
        await rebuildAll();
        try {
          const { origins: granted } = await chrome.permissions.getAll();
          const toRemove = (granted || []).filter((pat) => {
            const o = patternToOrigin(pat);
            return o && o === msg.origin;
          });
          if (toRemove.length) {
            await chrome.permissions.remove({ origins: toRemove });
          }
        } catch (e) {
          console.warn("[Platform Spoofer] remove permission failed:", e.message || e);
        }
      }
      sendResponse({ sites: sortedSites() });
    })();
    return true;
  }
  if (msg.type === "setProfile") {
    (async () => {
      if (PROFILES[msg.profile]) {
        state.profile = msg.profile;
        chrome.storage.local.set({ [STORAGE_PROFILE]: state.profile });
        await rebuildAll();
      }
      sendResponse({ sites: sortedSites(), profile: state.profile });
    })();
    return true;
  }
});

chrome.permissions.onAdded.addListener(async (perms) => {
  if (!perms.origins || perms.origins.length === 0) return;
  let changed = false;
  for (const pattern of perms.origins) {
    const origin = patternToOrigin(pattern);
    if (origin && isWebUrl(origin) && !state.sites.has(origin)) {
      state.sites.add(origin);
      changed = true;
    }
  }
  if (changed) {
    persistSites();
    await rebuildAll();
  }
});

chrome.permissions.onRemoved.addListener(async (perms) => {
  if (!perms.origins || perms.origins.length === 0) return;
  let changed = false;
  for (const pattern of perms.origins) {
    const origin = patternToOrigin(pattern);
    if (origin && state.sites.delete(origin)) changed = true;
  }
  if (changed) {
    persistSites();
    await rebuildAll();
  }
});

chrome.runtime.onStartup.addListener(rebuildAll);

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(STORAGE_ENABLED_LEGACY);
  rebuildAll();
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
  await rebuildAll();
}

init();
