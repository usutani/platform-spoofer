(() => {
  const cfg = self.__PS_PROFILE__;
  self.__PS_PROFILE__ = null;
  if (!cfg) return;

  function getChromeMajor() {
    const m = navigator.userAgent.match(/Chrome\/(\d+)/);
    return m ? m[1] : "138";
  }

  const ver = getChromeMajor();
  const fullVer = `${ver}.0.0.0`;
  const sub = (s) => String(s).replaceAll("{V}", ver);

  const userAgent = sub(cfg.ua);
  const appVersion = userAgent.replace(/^Mozilla\//, "");

  const brands = cfg.brandList.map(([brand, v]) => ({
    brand,
    version: sub(v),
  }));
  const fullVersionList = cfg.brandList.map(([brand, v]) => ({
    brand,
    version: v === "{V}" ? fullVer : sub(v),
  }));

  const highEntropy = {
    architecture: cfg.architecture,
    bitness: cfg.bitness,
    model: cfg.model,
    platform: cfg.platformName,
    platformVersion: cfg.platformVersion,
    uaFullVersion: fullVer,
    fullVersionList,
    wow64: false,
  };

  const supportedHints = new Set(Object.keys(highEntropy));

  const userAgentData = {
    brands,
    mobile: cfg.mobile,
    platform: cfg.platformName,
    toJSON() {
      return { brands, mobile: cfg.mobile, platform: cfg.platformName };
    },
    getHighEntropyValues(hints) {
      return new Promise((resolve, reject) => {
        if (!Array.isArray(hints)) {
          reject(new TypeError("hints must be an array"));
          return;
        }
        for (const h of hints) {
          if (!supportedHints.has(h)) {
            reject(new TypeError(`Unsupported hint: ${h}`));
            return;
          }
        }
        const out = {};
        for (const h of hints) out[h] = highEntropy[h];
        resolve(out);
      });
    },
  };

  function define(target, prop, value) {
    try {
      Object.defineProperty(target, prop, {
        value,
        configurable: true,
        writable: true,
      });
    } catch {
      // ignore if property is not configurable
    }
  }

  const proto = Object.getPrototypeOf(navigator);
  if (proto && proto !== Object.prototype) {
    define(proto, "userAgent", userAgent);
    define(proto, "appVersion", appVersion);
    define(proto, "platform", cfg.platform);
    define(proto, "vendor", cfg.vendor);
    define(proto, "userAgentData", userAgentData);
  }
  define(navigator, "userAgent", userAgent);
  define(navigator, "appVersion", appVersion);
  define(navigator, "platform", cfg.platform);
  define(navigator, "vendor", cfg.vendor);
  define(navigator, "userAgentData", userAgentData);
})();
