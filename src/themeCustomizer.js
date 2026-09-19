const STORAGE_KEY = "vram-theme-settings";

const root = document.documentElement;

const resetLight = document.getElementById("themeResetLight");
const resetDark = document.getElementById("themeResetDark");

let settings = loadSettings();

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function normalizeHex(value) {
  let hex = value.trim();

  if (!hex.startsWith("#")) {
    hex = `#${hex}`;
  }

  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    hex =
      "#" +
      hex
        .slice(1)
        .split("")
        .map((character) => character + character)
        .join("");
  }

  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }

  return hex.toLowerCase();
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function componentToHex(value) {
  return Number(value).toString(16).padStart(2, "0");
}

function rgbToHex({ r, g, b }) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function readCssColor(variable) {
  const value = getComputedStyle(root).getPropertyValue(variable).trim();

  const hex = normalizeHex(value);
  if (hex) return hexToRgb(hex);

  // Handles formats such as:
  // rgb(17, 17, 17)
  // rgb(17 17 17)
  const numbers = value.match(/[\d.]+/g);

  if (!numbers || numbers.length < 3) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: Math.round(Number(numbers[0])),
    g: Math.round(Number(numbers[1])),
    b: Math.round(Number(numbers[2])),
  };
}

function relativeLuminance({ r, g, b }) {
  const toLinear = (value) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(a, b) {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);

  return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05);
}

// WCAG 2.x AA threshold for normal-sized text.
const MIN_CONTRAST_RATIO = 4.5;

function updateContrastWarning() {
  const warning = document.getElementById("themeContrastWarning");
  if (!warning) return;

  const text = readCssColor("--text");
  const background = readCssColor("--background");

  const ratio = text && background ? contrastRatio(text, background) : 21;
  const low = ratio < MIN_CONTRAST_RATIO;

  warning.classList.toggle("hidden", !low);

  if (low) {
    warning.textContent =
      `Low contrast (${ratio.toFixed(1)}:1), text may be hard to read. ` +
      `WCAG recommends a ratio of at least ${MIN_CONTRAST_RATIO}:1.`;
  }
}

function setGoogleFont(fontName, persist = true) {
  const name = fontName.trim();

  if (!name) return;

  let link = document.getElementById("customGoogleFont");

  if (!link) {
    link = document.createElement("link");
    link.id = "customGoogleFont";
    link.rel = "stylesheet";
    document.head.append(link);
  }

  const encodedFamily = encodeURIComponent(name).replace(/%20/g, "+");

  link.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}&display=swap`;

  const safeName = name.replace(/["\\]/g, "");

  root.style.setProperty("--font-family", `"${safeName}", "Roboto Slab", Georgia, serif`);

  if (persist) {
    settings.font = name;
    saveSettings();
  }
}

function resetGoogleFont() {
  root.style.removeProperty("--font-family");
  document.getElementById("customGoogleFont")?.remove();

  delete settings.font;
  saveSettings();

  const fontInput = document.getElementById("themeFont");
  if (fontInput) fontInput.value = "";
}

function setupColorControl({ key, cssVariable, prefix }) {
  const red = document.getElementById(`${prefix}R`);
  const green = document.getElementById(`${prefix}G`);
  const blue = document.getElementById(`${prefix}B`);

  const redOutput = document.getElementById(`${prefix}ROutput`);
  const greenOutput = document.getElementById(`${prefix}GOutput`);
  const blueOutput = document.getElementById(`${prefix}BOutput`);

  const hexInput = document.getElementById(`${prefix}Hex`);
  const preview = document.getElementById(`${prefix}Preview`);
  const resetButton = document.getElementById(`${prefix}Reset`);

  if (!red || !green || !blue || !hexInput || !redOutput || !greenOutput || !blueOutput) {
    return;
  }

  function syncControls(rgb) {
    red.value = String(rgb.r);
    green.value = String(rgb.g);
    blue.value = String(rgb.b);

    redOutput.value = String(rgb.r);
    greenOutput.value = String(rgb.g);
    blueOutput.value = String(rgb.b);

    const hex = rgbToHex(rgb);
    hexInput.value = hex;

    if (preview) {
      preview.style.backgroundColor = hex;
    }
  }

  function applyRgb(rgb) {
    const hex = rgbToHex(rgb);

    root.style.setProperty(cssVariable, hex);

    settings[key] = hex;
    saveSettings();

    syncControls(rgb);
    updateContrastWarning();
  }

  function readSliders() {
    return {
      r: Number(red.value),
      g: Number(green.value),
      b: Number(blue.value),
    };
  }

  for (const slider of [red, green, blue]) {
    slider.addEventListener("input", () => {
      applyRgb(readSliders());
    });
  }

  hexInput.addEventListener("input", () => {
    const rgb = hexToRgb(hexInput.value);

    if (!rgb) return;

    applyRgb(rgb);
  });

  hexInput.addEventListener("blur", () => {
    const rgb = hexToRgb(hexInput.value);

    if (rgb) {
      syncControls(rgb);
    } else {
      syncControls(readCssColor(cssVariable));
    }
  });

  resetButton?.addEventListener("click", () => {
    root.style.removeProperty(cssVariable);

    delete settings[key];
    saveSettings();

    requestAnimationFrame(() => {
      syncControls(readCssColor(cssVariable));
      updateContrastWarning();
    });
  });

  syncControls(readCssColor(cssVariable));
}

function applyStoredSettings() {
  if (settings.mode) {
    root.setAttribute("data-theme", settings.mode);
  }

  if (settings.textColor) {
    root.style.setProperty("--text", settings.textColor);
  }

  if (settings.backgroundColor) {
    root.style.setProperty("--background", settings.backgroundColor);
  }

  if (settings.font) {
    setGoogleFont(settings.font, false);
  }
}

export function initThemeCustomizer() {
  applyStoredSettings();

  const toggle = document.getElementById("themeCustomizerToggle");
  const panel = document.getElementById("themeCustomizerPanel");
  const close = document.getElementById("themeCustomizerClose");

  const fontInput = document.getElementById("themeFont");
  const fontApply = document.getElementById("themeFontApply");
  const fontReset = document.getElementById("themeFontReset");

  const resetAll = document.getElementById("themeResetAll");

  if (!panel || !toggle) return;

  if (settings.font && fontInput) {
    fontInput.value = settings.font;
  }

  function setOpen(open) {
    panel.classList.toggle("hidden", !open);
    toggle.setAttribute("aria-expanded", String(open));

    if (open) {
      requestAnimationFrame(() => {
        fontInput?.focus();
      });
    }
  }

  toggle.addEventListener("click", () => {
    setOpen(panel.classList.contains("hidden"));
  });

  close?.addEventListener("click", () => {
    setOpen(false);
    toggle.focus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.classList.contains("hidden")) {
      setOpen(false);
      toggle.focus();
    }
  });

  function applyFontFromInput() {
    const fontName = fontInput?.value.trim();

    if (fontName) {
      setGoogleFont(fontName);
    }
  }

  fontApply?.addEventListener("click", applyFontFromInput);

  fontInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      applyFontFromInput();
    }
  });

  fontReset?.addEventListener("click", resetGoogleFont);

  setupColorControl({
    key: "textColor",
    cssVariable: "--text",
    prefix: "themeText",
  });

  setupColorControl({
    key: "backgroundColor",
    cssVariable: "--background",
    prefix: "themeBackground",
  });

  updateContrastWarning();

  resetAll?.addEventListener("click", () => {
    settings = {};
    localStorage.removeItem(STORAGE_KEY);

    root.style.removeProperty("--text");
    root.style.removeProperty("--background");
    root.style.removeProperty("--font-family");

    document.getElementById("customGoogleFont")?.remove();

    if (fontInput) {
      fontInput.value = "";
    }

    requestAnimationFrame(() => {
      location.reload();
    });
  });

  resetLight?.addEventListener("click", () => {
    settings = {
      mode: "light",
    };

    root.style.removeProperty("--text");
    root.style.removeProperty("--background");
    root.style.removeProperty("--font-family");

    document.getElementById("customGoogleFont")?.remove();

    root.setAttribute("data-theme", "light");

    if (fontInput) {
      fontInput.value = "";
    }

    saveSettings();

    requestAnimationFrame(() => {
      updateColorControls("themeText", "#111111");
      updateColorControls("themeBackground", "#b3d4ef");
      updateContrastWarning();
    });
  });

  resetDark?.addEventListener("click", () => {
    settings = {
      mode: "dark",
    };

    root.style.removeProperty("--text");
    root.style.removeProperty("--background");
    root.style.removeProperty("--font-family");

    document.getElementById("customGoogleFont")?.remove();

    root.setAttribute("data-theme", "dark");

    if (fontInput) {
      fontInput.value = "";
    }

    saveSettings();

    requestAnimationFrame(() => {
      updateColorControls("themeText", "#e8eef6");
      updateColorControls("themeBackground", "#131f30");
      updateContrastWarning();
    });
  });
}

function updateColorControls(prefix, hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;

  const red = document.getElementById(`${prefix}R`);
  const green = document.getElementById(`${prefix}G`);
  const blue = document.getElementById(`${prefix}B`);

  const redOutput = document.getElementById(`${prefix}ROutput`);
  const greenOutput = document.getElementById(`${prefix}GOutput`);
  const blueOutput = document.getElementById(`${prefix}BOutput`);

  const hexInput = document.getElementById(`${prefix}Hex`);
  const preview = document.getElementById(`${prefix}Preview`);

  if (red) red.value = rgb.r;
  if (green) green.value = rgb.g;
  if (blue) blue.value = rgb.b;

  if (redOutput) redOutput.value = rgb.r;
  if (greenOutput) greenOutput.value = rgb.g;
  if (blueOutput) blueOutput.value = rgb.b;

  if (hexInput) hexInput.value = hex;

  if (preview) {
    preview.style.backgroundColor = hex;
  }
}
