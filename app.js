Warning: truncated output (original token count: 68976)
Total output lines: 5718


const _mojibakeCache = new Map();
const IMPORT_STORAGE_KEY = "raporMerkeziImportsV1";
const ANNUAL_INPUT_STORAGE_KEY = "raporMerkeziAnnualInputsV1";
const EXPENSE_EDIT_STORAGE_KEY = "raporMerkeziExpenseEditsV1";
const COST_EDIT_STORAGE_KEY = "raporMerkeziCostEditsV1";
const MANUAL_EDIT_STORAGE_KEY = "raporMerkeziManualEditsV1";
const EDIT_WORKBOOK_MARKER = "RAPOR_MERKEZI_EDIT_V1";
const EDIT_PASSWORD = "2909";
const APP_VERSION_STAMP = "120820261920";
const RAW_BASE_DATA = window.REPORT_DATA;
let DETAIL_BASE = window.REPORT_DETAIL_DATA || { meta: { sources: {} }, sales: [], payroll: [], payrollExpenseRows: [] };
const FX_MATRIX_CACHE = {};
const STATE_STORAGE_MAP = {
  imports: IMPORT_STORAGE_KEY,
  annualInputs: ANNUAL_INPUT_STORAGE_KEY,
  expenseEdits: EXPENSE_EDIT_STORAGE_KEY,
  costEdits: COST_EDIT_STORAGE_KEY,
  manualEdits: MANUAL_EDIT_STORAGE_KEY
};
const APP_STATE_DEFAULTS = {
  imports: { salesRows: [], expenseRows: [], payrollRows: [], files: [] },
  annualInputs: {},
  expenseEdits: {},
  costEdits: {},
  manualEdits: {}
};
let APP_STATE_CACHE = Object.fromEntries(Object.keys(APP_STATE_DEFAULTS).map(key => [key, JSON.parse(JSON.stringify(APP_STATE_DEFAULTS[key]))]));
const APP_STATE_SYNC_TIMERS = {};
let FX_MATRIX_PENDING = null;
let DETAIL_LOAD_PROMISE = null;
let DETAIL_CACHE = null;
const BASE_DATA = buildCanonicalBaseData(RAW_BASE_DATA);
let DATA = hydrateData(BASE_DATA);
let lastExpenseEdit = null;
let lastCostEdit = null;
function latestAvailableYear() {
  const years = Object.keys(DATA.years || {}).sort((a, b) => Number(a) - Number(b));
  return years.length ? years[years.length - 1] : "2025";
}
const state = { year: latestAvailableYear(), month: "all", view: "overview", masterPage: 1, masterPageSize: 50, masterSearch: "", masterCategory: "Tümü", masterMode: "summary", costSearch: "", costCurrency: "Tümü", costCategory: "Tümü", costSortKey: "yearTotal", costSortDir: "desc", escalationSortKey: "deltaPct", escalationSortDir: "desc", productCostSortKey: "totalCost", productCostSortDir: "desc", expenseSortKey: "total", expenseSortDir: "desc", importLog: [], detailPayload: null, detailFilter: "" };

const monthLabels = {
  1:"Ocak",2:"Şubat",3:"Mart",4:"Nisan",5:"Mayıs",6:"Haziran",
  7:"Temmuz",8:"Ağustos",9:"Eylül",10:"Ekim",11:"Kasım",12:"Aralık"
};

const colorClasses = ["blue","green","orange","purple","teal","gold","red","cyan","olive","navy","pink","brown"];

const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];

function money(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Number(v));
}
function num(v, digits = 0) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(v));
}
function pct(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return `%${(Number(v) * 100).toFixed(1)}`;
}
function safe(value) { return Number(value || 0); }
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}

function fixMojibakeText(value) {
  const text = String(value ?? "");
  if (!/[ÃÄÅÂâ]/.test(text)) return text;
  const cached = _mojibakeCache.get(text);
  if (cached !== undefined) return cached;
  let result;
  try {
    result = decodeURIComponent(escape(text));
  } catch (error) {
    result = text
      .replaceAll("Ãœ", "Ü").replaceAll("Ã¼", "ü")
      .replaceAll("Ã‡", "Ç").replaceAll("Ã§", "ç")
      .replaceAll("Ã–", "Ö").replaceAll("Ã¶", "ö")
      .replaceAll("Ä°", "İ").replaceAll("Ä±", "ı")
      .replaceAll("Åž", "Ş").replaceAll("ÅŸ", "ş")
      .replaceAll("Äž", "Ğ").replaceAll("ÄŸ", "ğ")
      .replaceAll("â€”", "—").replaceAll("â€¢", "•")
      .replaceAll("Ã¢", "â").replaceAll("Ã‚", "Â")
      .replaceAll("Å" + String.fromCharCode(0x9e), "Ş")
      .replaceAll("Ä" + String.fromCharCode(0x9f), "ğ")
      .replaceAll("Å", "Ş").replaceAll("Ä", "Ğ");
  }
  // Kaynak veride, cift-encode mojibake duzeltmesinin (yukarida) yakalayamadigi
  // baglamlarda, Turkce harfin ikinci UTF-8 baytinin tek basina Latin-1 C1 kontrol
  // karakterine (U+0080-U+009F) donustugu satirlar kaliyor; ekranda bos kutu (tofu)
  // olarak gorunuyorlar. Bunlarin metinde hicbir mesru anlami yok, guvenle silinir.
  result = result.replace(/[\u0080-\u009f]/g, "");
  _mojibakeCache.set(text, result);
  return result;
}

function repairRenderedText(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const fixed = fixMojibakeText(node.nodeValue);
    if (fixed !== node.nodeValue) node.nodeValue = fixed;
  });
  root.querySelectorAll("input[placeholder], textarea[placeholder], [title]").forEach(el => {
    if (el.placeholder) el.placeholder = fixMojibakeText(el.placeholder);
    if (el.title) el.title = fixMojibakeText(el.title);
  });
}

function isPlaceholderIdentityValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return ["FATURA NO", "UNVANI", "UNVAN", "CARI KODU", "CARI", "MUSTERI", "KOD"].includes(normalized);
}

function hasMeaningfulIdentityValue(value) {
  const normalized = normalizeText(value);
  return Boolean(normalized) && !isPlaceholderIdentityValue(value) && normalized !== "KAYITSIZ" && normalized !== "TANIMSIZ";
}

function salesRowHasIdentity(row) {
  return [row?.customerName, row?.customerCode, row?.invoiceNo].some(hasMeaningfulIdentityValue);
}

function salesIdentityLabel(row) {
  const customerName = String(row?.customerName ?? row?.unvan ?? "").trim();
  if (hasMeaningfulIdentityValue(customerName)) return customerName;
  const customerCode = String(row?.customerCode ?? row?.cariKodu ?? "").trim();
  if (hasMeaningfulIdentityValue(customerCode)) return customerCode;
  const invoiceNo = String(row?.invoiceNo ?? row?.faturaNo ?? "").trim();
  if (hasMeaningfulIdentityValue(invoiceNo)) return `Fatura ${invoiceNo}`;
  return "";
}

function salesDisplayIdentityLabel(row) {
  return salesIdentityLabel(row) || "Kaynak detay satırı";
}

function isRentIncomeCustomer(value) {
  const normalized = normalizeText(fixMojibakeText(value || ""));
  return normalized.includes("NELL MOBILYA") && normalized.includes("KIRA");
}

function isSalesAnalysisCustomer(row) {
  const name = row?.name ?? row?.customerName ?? row?.unvan;
  return isReportableCustomerName(name);
}

function isRentIncomeRow(row) {
  return isRentIncomeCustomer(row?.customerName ?? row?.unvan ?? row?.name);
}

function isReportableCustomerName(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const normalized = normalizeText(fixMojibakeText(text));
  if (isRentIncomeCustomer(text)) return false;
  return ![
    "TANIMSIZ",
    "TANIMSIZ MUSTERI",
    "KAYNAK DETAY SATIRI",
    "BAGLANTI BEKLIYOR",
    "KAYITSIZ",
    "MUSTERI YOK"
  ].includes(normalized);
}

function visibleSalesCustomers(customers = []) {
  return customers
    .filter(isSalesAnalysisCustomer)
    .map((customer, index) => ({ ...customer, rank: index + 1 }));
}

function genericRowLabel(row) {
  return salesIdentityLabel(row)
    || String(row?.employee || "").trim()
    || String(row?.category || row?.kategori || "").trim()
    || String(row?.product || row?.urun || "").trim()
    || String(row?.sourceFile || row?.source || "").trim()
    || "Kaynak detay satırı";
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultAppStateValue(key) {
  return cloneData(APP_STATE_DEFAULTS[key] ?? {});
}

function normalizeImportsState(value) {
  const parsed = value && typeof value === "object" ? value : {};
  return {
    salesRows: Array.isArray(parsed.salesRows) ? parsed.salesRows : [],
    expenseRows: Array.isArray(parsed.expenseRows) ? parsed.expenseRows : [],
    payrollRows: Array.isArray(parsed.payrollRows) ? parsed.payrollRows : [],
    files: Array.isArray(parsed.files) ? parsed.files : []
  };
}

function normalizeAppStateValue(key, value) {
  if (key === "imports") return normalizeImportsState(value);
  if (value && typeof value === "object") return value;
  return defaultAppStateValue(key);
}

function readLocalStateKey(key) {
  const storageKey = STATE_STORAGE_MAP[key];
  if (!storageKey) return defaultAppStateValue(key);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultAppStateValue(key);
    return normalizeAppStateValue(key, JSON.parse(raw));
  } catch (error) {
    return defaultAppStateValue(key);
  }
}

function writeLocalStateKey(key, value) {
  const storageKey = STATE_STORAGE_MAP[key];
  if (!storageKey) return;
  localStorage.setItem(storageKey, JSON.stringify(value));
}

function getAppState(key) {
  if (!Object.prototype.hasOwnProperty.call(APP_STATE_CACHE, key)) {
    APP_STATE_CACHE[key] = readLocalStateKey(key);
  }
  return APP_STATE_CACHE[key];
}

function setAppState(key, value, { sync = true } = {}) {
  const normalized = normalizeAppStateValue(key, value);
  APP_STATE_CACHE[key] = normalized;
  writeLocalStateKey(key, normalized);
  if (sync) syncStateToServer(key, normalized);
  return normalized;
}

function syncStateToServer(serverKey, value) {
  clearTimeout(APP_STATE_SYNC_TIMERS[serverKey]);
  APP_STATE_SYNC_TIMERS[serverKey] = setTimeout(() => {
    fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: serverKey, value })
    }).catch(error => {
      state.importLog.unshift(`Sunucu senkron hatasi (${serverKey}): ${error.message}`);
    });
  }, 200);
}

function logAudit({ action_type, entity, year = state.year, month = null, old_value = null, new_value = null, note = null }) {
  fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action_type, entity, year, month, old_value, new_value, note })
  }).catch(error => {
    state.importLog.unshift(`Islem gunlugu yazilamadi: ${error.message}`);
  });
}

async function bootstrapServerState() {
  const stateKeys = Object.keys(STATE_STORAGE_MAP);
  const isFilled = value => value && typeof value === "object" && Object.keys(value).length > 0;
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return false;
    const server = await res.json();
    const hasServerData = stateKeys.some(key => isFilled(server[key]));
    if (hasServerData) {
      let changed = false;
      stateKeys.forEach(serverKey => {
        const nextValue = isFilled(server[serverKey]) ? server[serverKey] : readLocalStateKey(serverKey);
        const previous = JSON.stringify(getAppState(serverKey));
        setAppState(serverKey, nextValue, { sync: false });
        if (JSON.stringify(nextValue) !== previous) changed = true;
      });
      return changed;
    }
    const localSnapshot = {};
    stateKeys.forEach(serverKey => { localSnapshot[serverKey] = readLocalStateKey(serverKey); });
    const hasLocalData = Object.values(localSnapshot).some(isFilled);
    if (hasLocalData) {
      await Promise.all(Object.entries(localSnapshot).map(([serverKey, value]) =>
        fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: serverKey, value })
        })
      ));
    }
    stateKeys.forEach(serverKey => setAppState(serverKey, localSnapshot[serverKey], { sync: false }));
    return false;
  } catch (error) {
    return false;
  }
}

function loadImports() {
  return normalizeImportsState(getAppState("imports"));
}

function saveImports(imports) {
  setAppState("imports", imports);
}

function loadExpenseEdits() {
  return normalizeAppStateValue("expenseEdits", getAppState("expenseEdits"));
}

function saveExpenseEdits(edits) {
  setAppState("expenseEdits", edits);
}

function loadCostEdits() {
  return normalizeAppStateValue("costEdits", getAppState("costEdits"));
}

function saveCostEdits(edits) {
  setAppState("costEdits", edits);
}

function loadManualEdits() {
  return normalizeAppStateValue("manualEdits", getAppState("manualEdits"));
}

function saveManualEdits(edits) {
  setAppState("manualEdits", edits);
}

function loadAnnualInputs() {
  return normalizeAppStateValue("annualInputs", getAppState("annualInputs"));
}

function saveAnnualInputs(values) {
  setAppState("annualInputs", values);
}

function annualInputsForYear(year = state.year) {
  const all = loadAnnualInputs();
  const current = all[String(year)];
  return {
    MDF: current && current.MDF !== null && current.MDF !== undefined ? Number(current.MDF) : null,
    SUNTA: current && current.SUNTA !== null && current.SUNTA !== undefined ? Number(current.SUNTA) : null
  };
}

function setAnnualInputsForYear(year, values) {
  const all = loadAnnualInputs();
  const next = {};
  if (values.MDF !== null && values.MDF !== undefined) next.MDF = Number(values.MDF);
  if (values.SUNTA !== null && values.SUNTA !== undefined) next.SUNTA = Number(values.SUNTA);
  if (Object.keys(next).length) all[String(year)] = next;
  else delete all[String(year)];
  saveAnnualInputs(all);
}

function normalizeCostRowKeys(costRows) {
  return (costRows || []).map(row => ({
    WKOD: row.WKOD,
    "ÜRÜN": fixMojibakeText(row["ÜRÜN"] ?? row["ÃœRÃœN"] ?? ""),
    KALINLIK_BOY: row.KALINLIK_BOY,
    "KATEGORİ": canonicalCategoryName(fixMojibakeText(row["KATEGORİ"] ?? row["KATEGORÄ°"] ?? "")),
    Base_Price: row.Base_Price,
    Currency: row.Currency,
    months25: row.months25,
    months26: row.months26
  }));
}

function normalizeExpenseRowLabels(yearsObj) {
  Object.values(yearsObj || {}).forEach(yearData => {
    (yearData.expenseRows || []).forEach(row => {
      if (row && row[0]) row[0] = fixMojibakeText(row[0]);
    });
    (yearData.yonRapor?.topCustomers || []).forEach(c => {
      if (c && c.name) c.name = fixMojibakeText(c.name);
    });
  });
}

function normalizeMasterRows(masterRows) {
  (masterRows || []).forEach(row => {
    if (row.name) row.name = fixMojibakeText(row.name);
    if (row.code) row.code = fixMojibakeText(row.code);
    if (row.category) row.category = canonicalCategoryName(fixMojibakeText(row.category));
  });
  return masterRows;
}

function normalizeControlLabels(data) {
  Object.entries(data.controls || {}).forEach(([year, checks]) => {
    const catSum = (data.years[year]?.categories || []).reduce((sum, c) => sum + safe(c.ciro), 0);
    (checks || []).forEach(check => {
      if (!check) return;
      if (check.label) check.label = fixMojibakeText(check.label);
      if (check.label === "Kategori toplam ciro = YÖN_RAPOR toplam ciro" && catSum) check.left = catSum;
    });
  });
}

function buildCanonicalBaseData(base) {
  const data = cloneData(base);
  data.costRows = normalizeCostRowKeys(data.costRows);
  data.masterRows = normalizeMasterRows(data.masterRows);
  normalizeExpenseRowLabels(data.years);
  Object.values(data.years || {}).forEach(yearData => {
    if (!Array.isArray(yearData.expenseRows)) yearData.expenseRows = cloneData(data.expenseRows || []);
  });
  canonicalizeCategoryNames(data);
  dedupeFasonCategories(data.years);
  normalizeControlLabels(data);
  return data;
}

function getHydrationStateSnapshot(overrides = {}) {
  return {
    imports: normalizeImportsState(overrides.imports ?? loadImports()),
    expenseEdits: normalizeAppStateValue("expenseEdits", overrides.expenseEdits ?? loadExpenseEdits()),
    manualEdits: normalizeAppStateValue("manualEdits", overrides.manualEdits ?? loadManualEdits()),
    costEdits: normalizeAppStateValue("costEdits", overrides.costEdits ?? loadCostEdits())
  };
}

function dedupeFasonCategories(yearsObj) {
  Object.values(yearsObj || {}).forEach(yearData => {
    const cats = yearData.categories;
    if (!Array.isArray(cats)) return;
    cats.forEach(fasonCat => {
      const m = /^FASON\s+(.+)$/i.exec(String(fasonCat.name || "").trim());
      if (!m) return;
      const parent = cats.find(c => sameLabel(c.name, m[1]));
      if (!parent || parent === fasonCat) return;
      if (safe(parent.ciro) < safe(fasonCat.ciro)) return;
      parent.ciro = safe(parent.ciro) - safe(fasonCat.ciro);
      parent.adet = safe(parent.adet) - safe(fasonCat.adet);
      if (parent.maliyet !== null && parent.maliyet !== undefined && fasonCat.maliyet) {
        parent.maliyet = safe(parent.maliyet) - safe(fasonCat.maliyet);
      }
      parent.kar = parent.maliyet !== null && parent.maliyet !== undefined ? parent.ciro - parent.maliyet : null;
      parent.marj = parent.ciro && parent.kar !== null ? parent.kar / parent.ciro : parent.marj;
    });
  });
}

function hydrateData(base = BASE_DATA, appState = getHydrationStateSnapshot()) {
  const data = cloneData(base);
  applyImportsToData(data, appState.imports);
  canonicalizeCategoryNames(data);
  applyExpenseEditsToData(data, appState.expenseEdits);
  applyManualEditsToData(data, appState.manualEdits);
  try {
    applyDerivedCostMatrix(data);
  } catch (error) {
    if (typeof console !== "undefined") {
      console.error("Derived cost bootstrap skipped:", error);
    }
  }
  const costDependencyBaseline = {
    costRows: cloneData(data.costRows),
    masterRows: cloneData(data.masterRows)
  };
  applyCostEditsToData(data, appState.costEdits);
  applyCostDependenciesToData(data, costDependencyBaseline);
  applyLinkedCustomerTotals(data);
  refreshLinkedControls(data);
  return data;
}

function recomputeData(overrides = {}) {
  DATA = hydrateData(BASE_DATA, getHydrationStateSnapshot(overrides));
  DETAIL_CACHE = null;
  return DATA;
}

function referenceCostRows() {
  return BASE_DATA?.costRows || [];
}

function referenceExpenseRows(year = state.year) {
  return BASE_DATA?.years?.[String(year)]?.expenseRows || BASE_DATA?.expenseRows || [];
}

async function ensureDetailDataLoaded({ rerender = false } = {}) {
  if (DETAIL_BASE?.sales?.length || window.REPORT_DETAIL_DATA) {
    DETAIL_BASE = window.REPORT_DETAIL_DATA || DETAIL_BASE;
    if (rerender) {
      recomputeData();
      render();
    }
    return DETAIL_BASE;
  }
  if (DETAIL_LOAD_PROMISE) {
    const loaded = await DETAIL_LOAD_PROMISE;
    if (rerender) {
      recomputeData();
      render();
    }
    return loaded;
  }
  DETAIL_LOAD_PROMISE = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `report-detail-data.js?v=${encodeURIComponent(APP_VERSION_STAMP)}`;
    script.async = true;
    script.onload = () => {
      DETAIL_BASE = window.REPORT_DETAIL_DATA || { meta: { sources: {} }, sales: [], payroll: [], payrollExpenseRows: [] };
      resolve(DETAIL_BASE);
    };
    script.onerror = () => reject(new Error("Detay veri dosyasi yuklenemedi."));
    document.body.appendChild(script);
  }).finally(() => {
    DETAIL_LOAD_PROMISE = null;
  });
  const loaded = await DETAIL_LOAD_PROMISE;
  if (rerender) {
    recomputeData();
    render();
  }
  return loaded;
}

function prefetchDetailDataSoon() {
  if (DETAIL_BASE?.sales?.length || DETAIL_LOAD_PROMISE) return;
  const start = () => {
    ensureDetailDataLoaded({ rerender: true }).catch(error => {
      if (typeof console !== "undefined") console.warn("Detail data prefetch failed:", error.message);
    });
  };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => start(), { timeout: 2000 });
    return;
  }
  window.setTimeout(start, 600);
}

async function ensureDetailDataForInteraction() {
  try {
    await ensureDetailDataLoaded();
    return true;
  } catch (error) {
    window.alert(`Detay veri katmani yuklenemedi: ${error.message}`);
    return false;
  }
}

function canonicalCategoryName(value) {
  const text = String(value ?? "").trim();
  if (!text) return text;
  const fixed = fixMojibakeText(text);
  const normalized = normalizeText(fixed).replace(/[^A-Z0-9]/g, "");
  if (["MDF", "SUNTA", "KAPLAMA"].includes(normalized)) return normalized;
  if (normalized.includes("KENARBANT")) return "KENAR BANT";
  if (normalized.includes("CARSAF") || normalized.includes("ARAAF") || /^\?AR\?AF$/i.test(text)) return "ÇARŞAF";
  if (normalized.includes("ISCILIK") || normalized.includes("ICILIK") || normalized.includes("IACILIK") || normalized.includes("ALAK") || /\?{2,}L\?K/i.test(text)) return "İŞÇİLİK";
  if (normalized.includes("DIGER") || normalized.includes("DAAER") || /^D\?\?ER$/i.test(text)) return "DİĞER";
  return fixed;
}

function canonicalizeCategoryNames(data) {
  const applyCategory = item => {
    if (!item || typeof item !== "object") return;
    if ("name" in item) item.name = canonicalCategoryName(item.name);
    if ("kategori" in item) item.kategori = canonicalCategoryName(item.kategori);
    if ("category" in item) item.category = canonicalCategoryName(item.category);
    if ("KATEGORİ" in item) item["KATEGORİ"] = canonicalCategoryName(item["KATEGORİ"]);
    if ("KATEGORÄ°" in item) item["KATEGORÄ°"] = canonicalCategoryName(item["KATEGORÄ°"]);
  };
  Object.values(data?.years || {}).forEach(yearData => {
    (yearData.yonPlus || []).forEach(month => (month.categories || []).forEach(applyCategory));
    (yearData.categories || []).forEach(applyCategory);
    (yearData.yonRapor?.categories || []).forEach(applyCategory);
    (yearData.salesRows || []).forEach(applyCategory);
  });
  (data?.costRows || []).forEach(applyCategory);
  (data?.masterRows || []).forEach(applyCategory);
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I")
    .replace(/ı/g, "I")
    .replace(/\s+/g, " ");
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!text) return 0;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  let normalized = text;
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (comma >= 0) {
    const decimals = text.length - comma - 1;
    normalized = decimals === 3 ? text.replace(/,/g, "") : text.replace(",", ".");
  } else if (dot >= 0) {
    const decimals = text.length - dot - 1;
    const hasMultipleDots = text.indexOf(".") !== dot;
    normalized = hasMultipleDots || decimals === 3 ? text.replace(/\./g, "") : text;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = toNumber(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && window.XLSX?.SSF) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  m = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) return `20${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  m = text.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{2})$/);
  if (m) return `20${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseDateValueWithHint(value, monthHint = null, yearHint = null) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = yearHint || value.getFullYear();
    const month = monthHint || value.getMonth() + 1;
    const day = value.getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  let m = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return parseDateValue(value);
  let a = Number(m[1]);
  let b = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (yearHint) y = yearHint;
  let month;
  let day;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    month = a;
    day = b;
  } else if (monthHint && a === monthHint) {
    month = a;
    day = b;
  } else if (monthHint && b === monthHint) {
    month = b;
    day = a;
  } else {
    month = a;
    day = b;
  }
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inferYear(name, fallback = state.year) {
  const match = String(name || "").match(/20\d{2}/);
  return match ? match[0] : fallback;
}

function monthFromHeader(value) {
  const n = normalizeText(value);
  const map = {
    OCAK: 1, SUBAT: 2, MART: 3, NISAN: 4, MAYIS: 5, HAZIRAN: 6,
    TEMMUZ: 7, AGUSTOS: 8, EYLUL: 9, EKIM: 10, KASIM: 11, ARALIK: 12
  };
  return map[n.replace(/\s/g, "")] || null;
}

function inferMonthFromText(value) {
  const n = normalizeText(value).replace(/\s/g, "");
  const keys = ["OCAK", "SUBAT", "MART", "NISAN", "MAYIS", "HAZIRAN", "TEMMUZ", "AGUSTOS", "EYLUL", "EKIM", "KASIM", "ARALIK"];
  for (const key of keys) if (n.includes(key)) return monthFromHeader(key);
  return null;
}

function headerIndices(headers, label) {
  const out = [];
  headers.forEach((header, index) => {
    if (header === label) out.push(index);
  });
  return out;
}

function chooseLastIndexAfter(indices, minimumIndex) {
  const after = indices.filter(index => index > minimumIndex);
  return after.length ? after[after.length - 1] : (indices.length ? indices[indices.length - 1] : -1);
}

function chooseSalesColumnIndices(headers) {
  const ay = headerIndices(headers, "AY")[0] ?? 1;
  const date = headerIndices(headers, "FATURA TAR")[0] ?? -1;
  const no = headerIndices(headers, "FATURA NO")[0] ?? -1;
  const cari = headerIndices(headers, "CARI KODU")[0] ?? -1;
  const unvan = headerIndices(headers, "UNVANI")[0] ?? -1;
  const code = headerIndices(headers, "KOD")[0] ?? -1;
  const productHeaders = headerIndices(headers, "MALIN/HIZMETIN CINSI");
  const qtyHeaders = headerIndices(headers, "MIKTAR");
  const priceHeaders = headerIndices(headers, "FIYAT");
  const amountHeaders = headerIndices(headers, "TUTAR");
  const unitHeaders = headerIndices(headers, "MALIN");
  const threshold = Math.max(date, code);
  const leftAmountCandidates = amountHeaders.filter(index => index > -1 && (date < 0 || index < date));
  return {
    ay,
    date,
    no,
    cari,
    unvan,
    code,
    leftProduct: productHeaders[0] ?? -1,
    leftQty: qtyHeaders[0] ?? -1,
    leftPrice: priceHeaders[0] ?? -1,
    leftAmount: leftAmountCandidates.length ? leftAmountCandidates[leftAmountCandidates.length - 1] : -1,
    rightProduct: chooseLastIndexAfter(productHeaders, threshold),
    rightQty: chooseLastIndexAfter(qtyHeaders, threshold),
    rightPrice: chooseLastIndexAfter(priceHeaders, threshold),
    rightAmount: chooseLastIndexAfter(amountHeaders, threshold),
    rightUnit: chooseLastIndexAfter(unitHeaders, threshold),
    hasDuplicateDetail: productHeaders.length > 1
  };
}

function categoryFrom(code, product, unit) {
  const text = normalizeText(`${code} ${product} ${unit}`);
  if (text.includes("KENAR") || text.includes("MYLAR") || text.includes("PVC") || normalizeText(unit) === "MT") return "KENAR BANT";
  if (text.includes("CARSAF")) return "ÇARŞAF";
  if (text.includes("ISCILIK") || text.includes("TELALAMA") || text.includes("KALINLASTIRMA")) return "İŞÇİLİK";
  if (text.includes("MDF") || text.startsWith("KM") || text.startsWith("KSM") || text.startsWith("KFM")) return "MDF";
  if (text.includes("SUNTA") || text.startsWith("KS")) return "SUNTA";
  if (normalizeText(unit) === "M2" || text.includes("KAPLAMA")) return "KAPLAMA";
  return "DİĞER";
}

function categoryCostRatios(data) {
  const ratios = {};
  (data.years["2025"]?.categories || []).forEach(c => {
    if (safe(c.ciro) > 0 && c.maliyet !== null && c.maliyet !== undefined) ratios[c.name] = safe(c.maliyet) / safe(c.ciro);
  });
  return { "MDF": .68, "SUNTA": .68, "KAPLAMA": .55, "KENAR BANT": .62, "ÇARŞAF": .55, "İŞÇİLİK": .35, "DİĞER": .60, ...ratios };
}

function emptyYear(year) {
  return {
    overview: { totalRevenue: 0, totalCost: 0, grossProfit: 0, grossMargin: 0, totalExpense: 0, profitBeforeTax: 0, netProfit: 0, netMargin: 0 },
    yonPlus: [],
    yonRapor: { summary: {}, categories: [], topCustomers: [] },
    categories: [],
    expenseRows: []
  };
}

function normalizeExpenseRows(rows = []) {
  return rows.map(row => {
    const normalized = [String(row?.[0] ?? "").trim()];
    for (let month = 1; month <= 12; month += 1) normalized[month] = safe(row?.[month]);
    normalized[13] = Array.from({ length: 12 }, (_, idx) => safe(normalized[idx + 1])).reduce((sum, value) => sum + value, 0);
    return normalized;
  }).filter(row => row[0]);
}

function expenseRowsFromImports(rows = []) {
  const grouped = new Map();
  rows.forEach(row => {
    const label = String(row.kategori || row.category || "DİĞER").trim() || "DİĞER";
    const month = Number(row.month);
    if (!month || month < 1 || month > 12) return;
    const current = grouped.get(label) || [label, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    current[month] += safe(row.tutar ?? row.amount);
    current[13] += safe(row.tutar ?? row.amount);
    grouped.set(label, current);
  });
  return [...grouped.values()].sort((a, b) => safe(b[13]) - safe(a[13]) || a[0].localeCompare(b[0], "tr"));
}

function mergeExpenseRows(baseRows = [], importedRows = []) {
  const normalizedBase = normalizeExpenseRows(baseRows);
  if (!importedRows.length) return normalizedBase;

  const importedMonths = uniqueMonths(importedRows.map(row => row.month));
  const baseOrder = new Map(normalizedBase.map((row, index) => [normalizeText(row[0]), index]));
  const merged = new Map(normalizedBase.map(row => [normalizeText(row[0]), [...row]]));

  if (importedMonths.length) {
    merged.forEach(row => {
      importedMonths.forEach(month => { row[month] = 0; });
      row[13] = Array.from({ length: 12 }, (_, idx) => safe(row[idx + 1])).reduce((sum, value) => sum + value, 0);
    });
  }

  expenseRowsFromImports(importedRows).forEach(row => {
    const key = normalizeText(row[0]);
    const current = merged.get(key) || [row[0], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    current[0] = row[0];
    for (let month = 1; month <= 12; month += 1) current[month] += safe(row[month]);
    current[13] = Array.from({ length: 12 }, (_, idx) => safe(current[idx + 1])).reduce((sum, value) => sum + value, 0);
    merged.set(key, current);
  });

  return [...merged.values()]
    .filter(row => safe(row[13]))
    .sort((left, right) => {
      const leftOrder = baseOrder.has(normalizeText(left[0])) ? baseOrder.get(normalizeText(left[0])) : Number.MAX_SAFE_INTEGER;
      const rightOrder = baseOrder.has(normalizeText(right[0])) ? baseOrder.get(normalizeText(right[0])) : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return safe(right[13]) - safe(left[13]) || left[0].localeCompare(right[0], "tr");
    });
}

function applyImportsToData(data, imports) {
  const salesRows = imports.salesRows || [];
  const expenseRows = imports.expenseRows || [];
  const years = [...new Set([...salesRows.map(r => String(r.yil)), ...expenseRows.map(r => String(r.year))].filter(Boolean))];
  const ratios = categoryCostRatios(data);
  years.forEach(year => {
    const baseYear = cloneData(data.years[year] || emptyYear(year));
    const y = emptyYear(year);
    const months = new Map();
    const cats = new Map();
    const customers = new Map();
    const yearSales = salesRows.filter(r => String(r.yil) === year);
    const importedYearExpenses = expenseRows.filter(r => String(r.year) === year);
    const mergedExpenseRows = mergeExpenseRows(baseYear.expenseRows || [], importedYearExpenses);

    y.meta = baseYear.meta || { year: Number(year), label: String(year) };
    y.expenseRows = mergedExpenseRows;

    for (let i = 1; i <= 12; i++) months.set(i, { month: i, label: monthLabels[i], categories: new Map(), total: { adet: 0, ciro: 0, maliyet: 0, kar: 0, marj: 0 } });

    yearSales.forEach(r => {
      const m = months.get(Number(r.ay));
      if (!m) return;
      const name = r.kategori || "DİĞER";
      const current = m.categories.get(name) || { name, adet: 0, ciro: 0, maliyet: 0, kar: 0, marj: 0 };
      current.adet += safe(r.miktar);
      current.ciro += safe(r.tutar);
      current.maliyet += safe(r.tutar) * safe(ratios[name] ?? .60);
      current.kar = current.ciro - current.maliyet;
      current.marj = current.ciro ? current.kar / current.ciro : 0;
      m.categories.set(name, current);
      const customerName = r.unvan || "Tanımsız";
      if (!isRentIncomeCustomer(customerName)) {
        customers.set(customerName, safe(customers.get(customerName)) + safe(r.tutar));
      }
    });

    y.yonPlus = [...months.values()].map(m => {
      const categories = [...m.categories.values()].sort((a, b) => safe(b.ciro) - safe(a.ciro));
      const total = categories.reduce((acc, c) => {
        acc.adet += safe(c.adet); acc.ciro += safe(c.ciro); acc.maliyet += safe(c.maliyet); acc.kar += safe(c.kar);
        return acc;
      }, { adet: 0, ciro: 0, maliyet: 0, kar: 0, marj: 0 });
      total.marj = total.ciro ? total.kar / total.ciro : 0;
      categories.forEach(c => {
        const all = cats.get(c.name) || { name: c.name, adet: 0, ciro: 0, maliyet: 0, kar: 0, marj: 0 };
        all.adet += safe(c.adet); all.ciro += safe(c.ciro); all.maliyet += safe(c.maliyet); all.kar += safe(c.kar);
        cats.set(c.name, all);
      });
      return { month: m.month, label: m.label, categories, total };
    }).filter(m => m.total.ciro || mergedExpenseRows.some(row => safe(row[m.month])));

    y.categories = [...cats.values()].map(c => ({ ...c, marj: c.ciro ? c.kar / c.ciro : 0 })).sort((a, b) => safe(b.ciro) - safe(a.ciro));
    const totalRevenue = y.yonPlus.reduce((a, m) => a + safe(m.total.ciro), 0);
    const totalCost = y.yonPlus.reduce((a, m) => a + safe(m.total.maliyet), 0);
    const grossProfit = totalRevenue - totalCost;
    const totalExpense = mergedExpenseRows.reduce((a, row) => a + safe(row[13]), 0);
    const netProfit = grossProfit - totalExpense;
    y.overview = {
      totalRevenue, totalCost, grossProfit,
      grossMargin: totalRevenue ? grossProfit / totalRevenue : 0,
      totalExpense, profitBeforeTax: netProfit, netProfit,
      netMargin: totalRevenue ? netProfit / totalRevenue : 0
    };
    y.yonRapor.summary = y.overview;
    y.yonRapor.categories = y.categories.map(c => ({ name: c.name, adet: c.adet, ciro: c.ciro, share: totalRevenue ? c.ciro / totalRevenue : 0 }));
    y.yonRapor.topCustomers = [...customers.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name, revenue], idx) => ({ rank: idx + 1, name, revenue, share: totalRevenue ? revenue / totalRevenue : 0 }));
    data.years[year] = y;
    data.controls[year] = [
      { label: "İçe aktarılan ciro toplamı", left: totalRevenue, right: y.categories.reduce((a, c) => a + safe(c.ciro), 0) },
      { label: "İçe aktarılan maliyet toplamı", left: totalCost, right: y.categories.reduce((a, c) => a + safe(c.maliyet), 0) },
      { label: "İçe aktarılan gider toplamı", left: totalExpense, right: mergedExpenseRows.reduce((a, row) => a + safe(row[13]), 0) }
    ];
  });
}

function recalcExpenseOverview(yearData) {
  if (!yearData) return;
  const totalExpense = (yearData.expenseRows || []).reduce((sum, row) => sum + safe(row?.[13]), 0);
  if (!yearData.overview) return;
  yearData.overview.totalExpense = totalExpense;
  yearData.overview.profitBeforeTax = safe(yearData.overview.grossProfit) - totalExpense;
  yearData.overview.netProfit = safe(yearData.overview.profitBeforeTax) - safe(yearData.overview.corporateTax);
  yearData.overview.netMargin = safe(yearData.overview.totalRevenue) ? yearData.overview.netProfit / yearData.overview.totalRevenue : 0;
  yearData.yonRapor = yearData.yonRapor || {};
  yearData.yonRapor.summary = yearData.overview;
}

function recalcIncomeOverview(yearData) {
  if (!yearData) return;
  (yearData.yonPlus || []).forEach(month => {
    const total = { adet: 0, ciro: 0, maliyet: 0, kar: 0, marj: 0 };
    (month.categories || []).forEach(category => {
      category.kar = safe(category.ciro) - safe(category.maliyet);
      category.marj = safe(category.ciro) ? category.kar / safe(category.ciro) : 0;
      total.adet += safe(category.adet);
      total.ciro += safe(category.ciro);
      total.maliyet += safe(category.maliyet);
      total.kar += safe(category.kar);
    });
    total.marj = total.ciro ? total.kar / total.ciro : 0;
    month.total = total;
  });

  const totals = (yearData.yonPlus || []).reduce((acc, month) => {
    acc.totalRevenue += safe(month.total?.ciro);
    acc.totalCost += safe(month.total?.maliyet);
    acc.grossProfit += safe(month.total?.kar);
    return acc;
  }, { totalRevenue: 0, totalCost: 0, grossProfit: 0 });
  const categoryNames = [...new Set((yearData.yonPlus || []).flatMap(month => (month.categories || []).map(category => canonicalCategoryName(category.name))))];
  const existingCategories = new Map((yearData.categories || []).map(category => [canonicalCategoryName(category.name), category]));
  yearData.categories = categoryNames.map(categoryName => {
    const category = existingCategories.get(categoryName) || { name: categoryName };
    const rows = (yearData.yonPlus || []).map(month => (month.categories || []).find(item => canonicalCategoryName(item.name) === categoryName)).filter(Boolean);
    const adet = rows.reduce((sum, row) => sum + safe(row.adet), 0);
    const ciro = rows.reduce((sum, row) => sum + safe(row.ciro), 0);
    const maliyet = rows.reduce((sum, row) => sum + safe(row.maliyet), 0);
    const kar = ciro - maliyet;
    return { ...category, adet, ciro, maliyet, kar, marj: ciro ? kar / ciro : 0 };
  });
  if (!yearData.overview) return;
  yearData.overview.totalRevenue = totals.totalRevenue;
  yearData.overview.totalCost = totals.totalCost;
  yearData.overview.grossProfit = totals.grossProfit;
  yearData.overview.grossMargin = totals.totalRevenue ? totals.grossProfit / totals.totalRevenue : 0;
  yearData.overview.profitBeforeTax = totals.grossProfit - safe(yearData.overview.totalExpense);
  yearData.overview.netProfit = safe(yearData.overview.profitBeforeTax) - safe(yearData.overview.corporateTax);
  yearData.overview.netMargin = totals.totalRevenue ? safe(yearData.overview.netProfit) / totals.totalRevenue : 0;
  yearData.yonRapor = yearData.yonRapor || {};
  yearData.yonRapor.summary = yearData.overview;
  yearData.yonRapor.categories = yearData.categories.map(category => ({
    name: category.name,
    adet: category.adet,
    ciro: category.ciro,
    share: totals.totalRevenue ? safe(category.ciro) / totals.totalRevenue : 0
  }));
}

function applyManualEditsToData(data, edits) {
  if (!data?.years || !edits || typeof edits !== "object") return;
  Object.entries(edits).forEach(([year, yearEdits]) => {
    const yearData = data.years[year];
    if (!yearData || !yearEdits || typeof yearEdits !== "object") return;
    yearData.yonPlus = yearData.yonPlus || [];
    ["sales", "qty", "cost"].forEach(kind => {
      Object.entries(yearEdits[kind] || {}).forEach(([categoryName, monthValues]) => {
        if (!Array.isArray(monthValues)) return;
        for (let idx = 0; idx < 12; idx += 1) {
          const value = monthValues[idx];
          if (value === null || value === undefined || value === "") continue;
          let month = yearData.yonPlus.find(entry => entry.month === idx + 1);
          if (!month) {
            const monthNamesTR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
            month = { month: idx + 1, label: `${monthNamesTR[idx] || ""} ${year}`.trim(), categories: [], total: { adet: 0, ciro: 0, maliyet: 0, kar: 0, marj: 0 } };
            yearData.yonPlus.push(month);
            yearData.yonPlus.sort((a, b) => a.month - b.month);
          }
          let category = (month.categories || []).find(entry => entry.name === categoryName);
          if (!category) {
            category = { name: categoryName, adet: 0, ciro: 0, maliyet: 0, kar: 0, marj: 0 };
            month.categories = month.categories || [];
            month.categories.push(category);
          }
          if (kind === "sales") category.ciro = safe(value);
          if (kind === "qty") category.adet = safe(value);
          if (kind === "cost") category.maliyet = safe(value);
        }
      });
    });
    recalcIncomeOverview(yearData);
    recalcExpenseOverview(yearData);
  });
}

function applyExpenseEditsToData(data, edits) {
  if (!data?.years || !edits || typeof edits !== "object") return;
  Object.entries(edits).forEach(([year, yearEdits]) => {
    const yearData = data.years[year];
    if (!yearData?.expenseRows || !yearEdits || typeof yearEdits !== "object") return;
    yearData.expenseRows.forEach(row => {
      const label = String(row?.[0] || "");
      const editedMonths = yearEdits[label];
      if (!Array.isArray(editedMonths)) return;
      for (let idx = 0; idx < 12; idx += 1) {
        row[idx + 1] = safe(editedMonths[idx]);
      }
      row[13] = Array.from({ length: 12 }, (_, idx) => safe(row[idx + 1])).reduce((sum, value) => sum + value, 0);
    });
    recalcExpenseOverview(yearData);
  });
}

function costMonthsField(year) {
  const yearKey = String(year);
  if (yearKey === "2025") return "months25";
  if (yearKey === "2026") return "months26";
  return null;
}

function masterTotalsField(year) {
  const yearKey = String(year);
  if (yearKey === "2025") return "totals25";
  if (yearKey === "2026") return "totals26";
  return null;
}

function costMonthsForYear(row, year = state.year) {
  const field = costMonthsField(year);
  return field ? row?.[field] : null;
}

function masterTotalsForYear(row, year = state.year) {
  const field = masterTotalsField(year);
  return field ? row?.[field] : null;
}

function costYearSupported(year = state.year) {
  return Boolean(costMonthsField(year));
}

function applyCostEditsToData(data, edits) {
  if (!data?.costRows || !edits || typeof edits !== "object") return;
  data.costRows.forEach(row => {
    const wkod = String(row?.WKOD ?? "");
    if (!wkod) return;
    ["2025", "2026"].forEach(year => {
      const editedMonths = edits?.[year]?.[wkod];
      if (!Array.isArray(editedMonths)) return;
      const target = costMonthsForYear(row, year);
      if (!Array.isArray(target)) return;
      for (let idx = 0; idx < 12; idx += 1) target[idx] = safe(editedMonths[idx]);
    });
  });
}

function costRowMap(rows = [], year = "2025") {
  const map = new Map();
  rows.forEach(row => {
    const code = String(row?.WKOD ?? "").trim();
    if (!code) return;
    map.set(code, costMonthsForYear(row, year));
  });
  return map;
}

function linkedRecipeCode(recipe, keys, availableMap) {
  for (const key of keys) {
    const code = String(recipe?.[key] ?? "").trim();
    if (code && code !== "0" && code !== "1000" && availableMap.has(code)) return code;
  }
  return "";
}

function costDependencyCoverage(year = state.year) {
  const monthKey = costMonthsField(year);
  if (!monthKey) return { activeProducts: 0, linkedActiveProducts: 0, rate: 0 };
  const availableCodes = new Set((DATA.costRows || []).map(row => String(row.WKOD ?? "")));
  let activeProducts = 0;
  let linkedActiveProducts = 0;
  (DATA.masterRows || []).forEach(row => {
    const active = (row[monthKey] || []).some(metric => safe(metric?.A) > 0);
    if (!active) return;
    activeProducts += 1;
    const linked = ["MKOD", "SKOD", "KAP1KOD", "KAP2KOD", "TUKOD"]
      .map(key => String(row.recipe?.[key] ?? ""))
      .some(code => code && code !== "0" && code !== "1000" && availableCodes.has(code));
    if (linked) linkedActiveProducts += 1;
  });
  return {
    activeProducts,
    linkedActiveProducts,
    rate: activeProducts ? linkedActiveProducts / activeProducts : 0
  };
}

function activeProductsUsingCost(wkod, year = state.year) {
  const code = String(wkod ?? "");
  const monthKey = costMonthsField(year);
  if (!monthKey) return 0;
  return (DATA.masterRows || []).filter(row => {
    const active = (row[monthKey] || []).some(metric => safe(metric?.A) > 0);
    if (!active) return false;
    return ["MKOD", "SKOD", "KAP1KOD", "KAP2KOD", "TUKOD"].some(key => String(row.recipe?.[key] ?? "") === code);
  }).length;
}

function applyCostDependenciesToData(data, baseline) {
  if (!data?.masterRows?.length || !baseline?.masterRows?.length) return;
  const baselineMaster = new Map(baseline.masterRows.map(row => [String(row.code ?? ""), row]));
  ["2025", "2026"].forEach(year => {
    const sourceCosts = costRowMap(baseline.costRows, year);
    const currentCosts = costRowMap(data.costRows, year);
    const monthKey = costMonthsField(year);
    const categoryDelta = new Map();

    data.masterRows.forEach(row => {
      const sourceRow = baselineMaster.get(String(row.code ?? ""));
      if (!sourceRow) return;
      const recipe = row.recipe || {};
      const componentLinks = [
        ["LG", ["MKOD", "SKOD"]],
        ["KAP1", ["KAP1KOD"]],
        ["KAP2", ["KAP2KOD"]],
        ["TUT", ["TUKOD"]]
      ];
      for (let idx = 0; idx < 12; idx += 1) {
        const metric = row[monthKey]?.[idx];
        const sourceMetric = sourceRow[monthKey]?.[idx];
        if (!metric || !sourceMetric) continue;
        componentLinks.forEach(([component, recipeKeys]) => {
          const code = linkedRecipeCode(recipe, recipeKeys, sourceCosts);
          if (!code) return;
          const sourceRaw = safe(sourceCosts.get(code)?.[idx]);
          const currentRaw = safe(currentCosts.get(code)?.[idx]);
          if (!sourceRaw || Math.abs(currentRaw - sourceRaw) < 0.000001) return;
          metric[component] = safe(sourceMetric[component]) * (currentRaw / sourceRaw);
        });
        metric.BM = safe(metric.LG) + safe(metric.KAP1) + safe(metric.KAP2) + safe(metric.TUT) + safe(metric.GG) + safe(metric.DG);
        metric.TM = safe(metric.A) * metric.BM;
        metric.KAR = safe(metric.C) - metric.TM;
        metric.MARJ = safe(metric.C) ? metric.KAR / safe(metric.C) : 0;
        const delta = metric.TM - safe(sourceMetric.TM);
        if (Math.abs(delta) < 0.000001) continue;
        const category = canonicalCategoryName(row.category);
        const key = `${idx + 1}|${category}`;
        categoryDelta.set(key, safe(categoryDelta.get(key)) + delta);
      }
    });

    const yearData = data.years?.[year];
    if (!yearData || !categoryDelta.size) return;
    categoryDelta.forEach((delta, key) => {
      const [monthText, categoryName] = key.split("|");
      const month = (yearData.yonPlus || []).find(entry => entry.month === Number(monthText));
      const category = month?.categories?.find(entry => canonicalCategoryName(entry.name) === categoryName);
      if (category) category.maliyet = safe(category.maliyet) + delta;
    });
    recalcIncomeOverview(yearData);
    recalcExpenseOverview(yearData);
  });
}

function refreshLinkedControls(data) {
  Object.entries(data?.years || {}).forEach(([year, yearData]) => {
    const monthlyRevenue = (yearData.yonPlus || []).reduce((sum, month) => sum + safe(month.total?.ciro), 0);
    const monthlyCost = (yearData.yonPlus || []).reduce((sum, month) => sum + safe(month.total?.maliyet), 0);
    const categoryRevenue = (yearData.categories || []).reduce((sum, category) => sum + safe(category.ciro), 0);
    const categoryCost = (yearData.categories || []).reduce((sum, category) => sum + safe(category.maliyet), 0);
    const expenseTotal = (yearData.expenseRows || []).reduce((sum, row) => sum + safe(row?.[13]), 0);
    data.controls[year] = [
      { label: "Aylık toplam ciro = Genel Bakış ciro", left: monthlyRevenue, right: safe(yearData.overview?.totalRevenue) },
      { label: "Kategori ciro = Genel Bakış ciro", left: categoryRevenue, right: safe(yearData.overview?.totalRevenue) },
      { label: "Aylık toplam maliyet = Genel Bakış maliyet", left: monthlyCost, right: safe(yearData.overview?.totalCost) },
      { label: "Kategori maliyet = Genel Bakış maliyet", left: categoryCost, right: safe(yearData.overview?.totalCost) },
      { label: "Gider satırları = Genel Bakış gider", left: expenseTotal, right: safe(yearData.overview?.totalExpense) },
      { label: "Net kâr = Brüt kâr - gider - vergi", left: safe(yearData.overview?.netProfit), right: safe(yearData.overview?.grossProfit) - expenseTotal - safe(yearData.overview?.corporateTax) }
    ];
  });
}

function persistCostRowEdit(year, wkod, monthValues, note = null) {
  const code = String(wkod || "");
  if (!code) return;
  const edits = loadCostEdits();
  const yearKey = String(year);
  edits[yearKey] = edits[yearKey] || {};
  const oldValue = edits[yearKey][code] || null;
  const newValue = Array.from({ length: 12 }, (_, idx) => safe(monthValues?.[idx]));
  edits[yearKey][code] = newValue;
  saveCostEdits(edits);
  logAudit({ action_type: "cost_edit", entity: `cost:${code}`, year: yearKey, old_value: oldValue, new_value: newValue, note });
}

function persistExpenseRowEdit(year, row, note = null) {
  const label = String(row?.[0] || "");
  if (!label) return;
  const edits = loadExpenseEdits();
  const yearKey = String(year);
  edits[yearKey] = edits[yearKey] || {};
  const oldValue = edits[yearKey][label] || null;
  const newValue = Array.from({ length: 12 }, (_, idx) => safe(row[idx + 1]));
  edits[yearKey][label] = newValue;
  saveExpenseEdits(edits);
  logAudit({ action_type: "expense_edit", entity: `expense:${label}`, year: yearKey, old_value: oldValue, new_value: newValue, note });
}

function persistManualIncomeEdit(year, kind, itemName, month, value) {
  if (!["sales", "qty", "cost"].includes(kind) || !itemName || !month) return;
  const edits = loadManualEdits();
  const yearKey = String(year);
  edits[yearKey] = edits[yearKey] || {};
  edits[yearKey][kind] = edits[yearKey][kind] || {};
  const currentSeries = incomeMetricSeries(DATA.years[yearKey], kind, itemName);
  const oldValue = currentSeries[month - 1];
  currentSeries[month - 1] = safe(value);
  edits[yearKey][kind][itemName] = currentSeries;
  saveManualEdits(edits);
  logAudit({ action_type: "manual_edit", entity: `manual:${kind}:${itemName}`, year: yearKey, month, old_value: oldValue, new_value: safe(value) });
}

function ensureEditPassword() {
  const password = window.prompt("Değişiklik şifresi");
  if (password === null) return false;
  if (password === EDIT_PASSWORD) return true;
  window.alert("Şifre hatalı. Hücre değiştirilmedi.");
  return false;
}

let lastAuditEntries = [];

async function fetchAuditLog(limit = 30) {
  try {
    const res = await fetch(`/api/audit?limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    return [];
  }
}

function parseAuditEntity(entity) {
  const parts = String(entity || "").split(":");
  return { kind: parts[0], a: parts[1], b: parts[2] };
}

async function revertAuditEntry(id) {
  const entry = lastAuditEntries.find(item => String(item.id) === String(id));
  if (!entry) return;
  if (!ensureEditPassword()) return;
  if (!window.confirm(`Bu işlemi geri almak istediğinize emin misiniz?\n${entry.action_type} — ${entry.entity}`)) return;
  const { kind, a, b } = parseAuditEntity(entry.entity);
  const yearKey = String(entry.year);
  if (kind === "cost" && entry.action_type === "cost_edit") {
    const edits = loadCostEdits();
    edits[yearKey] = edits[yearKey] || {};
    if (entry.old_value === null || entry.old_value === undefined) delete edits[yearKey][a];
    else edits[yearKey][a] = entry.old_value;
    saveCostEdits(edits);
  } else if (kind === "expense" && entry.action_type === "expense_edit") {
    const edits = loadExpenseEdits();
    edits[yearKey] = edits[yearKey] || {};
    if (entry.old_value === null || entry.old_value === undefined) delete edits[yearKey][a];
    else edits[yearKey][a] = entry.old_value;
    saveExpenseEdits(edits);
  } else if (kind === "manual" && entry.action_type === "manual_edit") {
    persistManualIncomeEdit(yearKey, a, b, entry.month, entry.old_value);
  } else {
    window.alert("Bu işlem türü için otomatik geri alma desteklenmiyor.");
    return;
  }
  logAudit({ action_type: "revert", entity: entry.entity, year: yearKey, month: entry.month, old_value: entry.new_value, new_value: entry.old_value, note: `Geri alindi: kayit #${entry.id}` });
  recomputeData();
  render();
  renderAuditLogPanel();
}

async function renderAuditLogPanel() {
  const panel = q("#auditLogPanel");
  if (!panel) return;
  panel.textContent = "Yükleniyor…";
  const entries = await fetchAuditLog(30);
  lastAuditEntries = entries;
  if (!entries.length) {
    panel.textContent = "Henüz işlem kaydı yok (ya da sunucu senkronu henüz aktif değil).";
    return;
  }
  panel.innerHTML = entries.map(entry => {
    const when = entry.ts ? new Date(entry.ts).toLocaleString("tr-TR") : "";
    const canRevert = ["cost_edit", "expense_edit", "manual_edit"].includes(entry.action_type);
    return `<div class="audit-log-row">
      <div><strong>${esc(entry.action_type)}</strong> — ${esc(entry.entity)} <span class="audit-log-when">${esc(when)}</span></div>
      <div class="audit-log-meta">Eski: ${esc(JSON.stringify(entry.old_value))} → Yeni: ${esc(JSON.stringify(entry.new_value))}${entry.note ? ` • ${esc(entry.note)}` : ""}</div>
      ${canRevert ? `<button type="button" class="audit-revert-btn" data-id="${esc(entry.id)}">Geri Al</button>` : ""}
    </div>`;
  }).join("");
}

function manualCellValue(kind, month, itemName) {
  if (kind === "expense") {
    const row = (currentYearData().expenseRows || []).find(entry => sameLabel(entry[0], itemName));
    return safe(row?.[month]);
  }
  return incomeMetricValue(currentYearData(), kind, month, itemName);
}

function saveManualIncomeCell(cell) {
  if (!cell || cell.dataset.editable !== "1") return false;
  const kind = cell.dataset.kind || "";
  const month = Number(cell.dataset.month);
  const itemName = cell.dataset.item || "";
  if (!["sales", "qty", "expense"].includes(kind) || !month || !itemName) return false;
  if (!ensureEditPassword()) return true;
  const currentValue = manualCellValue(kind, month, itemName);
  const nextRaw = window.prompt(`${monthLabels[month]} ${itemName} yeni değer`, num(currentValue, kind === "qty" ? 3 : 0));
  if (nextRaw === null) return true;
  const nextValue = nullableNumber(nextRaw);
  if (nextValue === null) {
    window.alert("Geçerli bir sayı girilmedi.");
    return true;
  }
  if (kind === "expense") {
    const row = (currentYearData().expenseRows || []).find(entry => sameLabel(entry[0], itemName));
    if (!row) return true;
    row[month] = nextValue;
    row[13] = Array.from({ length: 12 }, (_, idx) => safe(row[idx + 1])).reduce((sum, value) => sum + value, 0);
    persistExpenseRowEdit(state.year, row);
  } else {
    persistManualIncomeEdit(state.year, kind, itemName, month, nextValue);
  }
  recomputeData();
  render();
  return true;
}

function formatVersionStamp(meta = {}) {
  if (APP_VERSION_STAMP) return APP_VERSION_STAMP;
  const candidates = [meta.generatedAt, DETAIL_BASE?.meta?.generatedAt]
    .filter(Boolean)
    .map(value => {
      const text = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const [year, month, day] = text.split("-").map(Number);
        const now = new Date();
        return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), 0);
      }
      return new Date(text);
    })
    .filter(date => !Number.isNaN(date.getTime()));
  const source = candidates.length ? new Date(Math.max(...candidates.map(date => date.getTime()))) : new Date();
  const hh = String(source.getHours()).padStart(2, "0");
  const min = String(source.getMinutes()).padStart(2, "0");
  const yyyy = String(source.getFullYear());
  const dd = String(source.getDate()).padStart(2, "0");
  const mon = String(source.getMonth() + 1).padStart(2, "0");
  return `${hh}${min}${yyyy}${dd}${mon}`;
}

function formatDimension(value, category = "") {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value).trim();
  const normalized = raw.replace(',', '.');
  const numeric = Number(normalized);
  const upperCategory = String(category || '').toUpperCase();
  if (!Number.isNaN(numeric) && (upperCategory === 'MDF' || upperCategory === 'SUNTA') && numeric > 0 && numeric <= 100) {
    return `${num(numeric, 0)} mm`;
  }
  return raw;
}

function formatCostProduct(row) {
  const name = row['ÜRÜN'] ?? '—';
  const dim = formatDimension(row['KALINLIK_BOY'], row['KATEGORİ']);
  return dim ? `${name} • ${dim}` : name;
}

function currentYearData() { return DATA.years[state.year]; }
function availableMonths() {
  return currentYearData().yonPlus.map(m => ({ value: String(m.month), label: m.label }));
}
function selectedMonthData() {
  if (state.month === "all") return null;
  return currentYearData().yonPlus.find(m => String(m.month) === state.month) || null;
}

function formatDateLabel(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || "");
  const month = Number(match[2]);
  return `${match[3]} ${monthLabels[month]} ${match[1]}`;
}

function monthEndDay(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function todayInfo() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    label: `${now.getDate()} ${monthLabels[now.getMonth() + 1]} ${now.getFullYear()}`
  };
}

function monthRange(endMonth) {
  return Array.from({ length: Math.max(0, endMonth) }, (_, idx) => idx + 1);
}

function monthListText(months) {
  return months.length ? months.map(month => monthLabels[month]).join(", ") : "yok";
}

function monthSpanText(months) {
  const items = uniqueMonths(months);
  if (!items.length) return "yok";
  if (items.length === 12) return "tum yil";
  const shortLabels = items.map(month => String(monthLabels[month] || month).slice(0, 3));
  const contiguous = items.every((month, index) => index === 0 || month === items[index - 1] + 1);
  if (contiguous) return items.length === 1 ? shortLabels[0] : `${shortLabels[0]}-${shortLabels[shortLabels.length - 1]}`;
  return shortLabels.join(", ");
}

function uniqueMonths(values) {
  return [...new Set((values || []).map(value => Number(value)).filter(Boolean))].sort((left, right) => left - right);
}

function expenseCoverageMonths(expenseRows = []) {
  const covered = [];
  expenseRows.forEach(row => {
    for (let month = 1; month <= 12; month += 1) {
      if (safe(row?.[month])) covered.push(month);
    }
  });
  return uniqueMonths(covered);
}

function yearConfidenceSummary(year = state.year) {
  const yearKey = String(year);
  const numericYear = Number(yearKey);
  const yearData = DATA.years[yearKey] || { yonPlus: [], overview: {} };
  const imports = loadImports();
  const salesRows = detailStore().salesRows.filter(row => row.year === numericYear);
  const payrollRows = detailStore().payrollRows.filter(row => row.year === numericYear);
  const today = todayInfo();
  const loadedMonths = uniqueMonths((yearData.yonPlus || []).map(row => row.month));
  const detailMonthsLoaded = uniqueMonths(salesRows.map(row => row.month));
  const closedMonths = numericYear < today.year ? monthRange(12) : (numericYear === today.year ? monthRange(Math.max(0, today.month - 1)) : []);
  const activeMonth = numericYear === today.year ? today.month : null;
  const futureMonths = numericYear === today.year ? Array.from({ length: Math.max(0, 12 - today.month) }, (_, idx) => today.month + idx + 1) : [];
  const closedMissingMonths = closedMonths.filter(month => !loadedMonths.includes(month));
  const detailClosedMissingMonths = closedMonths.filter(month => loadedMonths.includes(month) && !detailMonthsLoaded.includes(month));
  const staticExpenseMonths = expenseCoverageMonths(yearData.expenseRows || DATA.expenseRows || []);
  const importedExpenseMonths = uniqueMonths(imports.expenseRows.filter(row => Number(row.year) === numericYear).map(row => row.month));
  const payrollMonths = uniqueMonths([
    ...payrollRows.map(row => row.month),
    ...imports.payrollRows.filter(row => Number(row.year) === numericYear).map(row => row.month)
  ]);
  const expenseMonthsLoaded = uniqueMonths([...staticExpenseMonths, ...importedExpenseMonths, ...payrollMonths]);
  const expenseClosedMissingMonths = closedMonths.filter(month => !expenseMonthsLoaded.includes(month));
  const lastSalesDate = salesRows.reduce((latest, row) => (!latest || String(row.date) > latest ? String(row.date) : latest), "");
  const expenseTotal = safe(yearData.overview?.totalExpense);
  const importedSales = imports.salesRows.filter(row => Number(row.yil ?? row.year) === numericYear).length;
  const importedExpenses = imports.expenseRows.filter(row => Number(row.year) === numericYear).length;
  const importedPayroll = imports.payrollRows.filter(row => Number(row.year) === numericYear).length;
  const expenseMissing = (expenseTotal === 0 && importedExpenses === 0 && payrollRows.length === 0 && importedPayroll === 0) || !!expenseClosedMissingMonths.length;
  const checks = DATA.controls[yearKey] || [];
  const controlPassCount = checks.filter(check => Math.abs(safe(check.left) - safe(check.right)) < 1).length;
  const invoiceCount = new Set(salesRows.map(row => hasMeaningfulIdentityValue(row.invoiceNo) ? row.invoiceNo : "").filter(Boolean)).size;
  const blankCustomerCount = salesRows.filter(row => !hasMeaningfulIdentityValue(row.customerName) && !hasMeaningfulIdentityValue(row.customerCode)).length;
  const blankInvoiceCount = salesRows.filter(row => !hasMeaningfulIdentityValue(row.invoiceNo)).length;
  const detailRevenue = salesRows.reduce((sum, row) => sum + safe(row.amount), 0);
  const revenueDiff = detailRevenue - safe(yearData.overview?.totalRevenue);
  const expenseDiff = (yearData.expenseRows || []).reduce((sum, row) => sum + safe(row?.[13]), 0) - expenseTotal;
  const completedItems = [];
  const missingItems = [];
  let status = "ready";
  let statusLabel = "Hazir";
  let statusReason = `${yearKey} verisi sunum için kullanılabilir durumda.`;

  if (loadedMonths.length) {
    completedItems.push(`Satış ayları ${monthSpanText(loadedMonths)}`);
  }
  if (detailMonthsLoaded.length) {
    completedItems.push(`Detay aylari ${monthSpanText(detailMonthsLoaded)}`);
  }
  if (salesRows.length) {
    completedItems.push(`Satış detay ${num(salesRows.length)} satır${invoiceCount ? ` | ${num(invoiceCount)} fatura` : ""}`);
  }
  if (expenseMonthsLoaded.length) {
    completedItems.push(`Gider kapsamı ${monthSpanText(expenseMonthsLoaded)}`);
  }
  if (expenseTotal > 0) {
    completedItems.push(`Toplam gider ${money(expenseTotal)}`);
  }
  if (payrollMonths.length) {
    completedItems.push(`Bordro ${monthSpanText(payrollMonths)}`);
  }
  if (checks.length && controlPassCount) {
    completedItems.push(`Kontrol ${controlPassCount}/${checks.length}`);
  }
  if (!completedItems.length) {
    completedItems.push("Veri bağlantısı yok");
  }

  if (closedMissingMonths.length) {
    missingItems.push(`Satış eksiği ${monthSpanText(closedMissingMonths)}`);
  }
  if (detailClosedMissingMonths.length) {
    missingItems.push(`Detay satir eksigi ${monthSpanText(detailClosedMissingMonths)}`);
  }
  if (expenseClosedMissingMonths.length) {
    missingItems.push(`Gider eksiği ${monthSpanText(expenseClosedMissingMonths)}`);
  }
  if (!payrollMonths.length && expenseMonthsLoaded.length) {
    missingItems.push("Bordro detayı yok");
  }
  if (checks.length && controlPassCount < checks.length) {
    missingItems.push(`Kontrol farkı ${checks.length - controlPassCount}`);
  }
  if (blankCustomerCount) {
    missingItems.push(`Boş müşteri ${num(blankCustomerCount)}`);
  }
  if (blankInvoiceCount) {
    missingItems.push(`Boş fatura ${num(blankInvoiceCount)}`);
  }
  if (Math.abs(revenueDiff) >= 1) {
    missingItems.push(`Detay ciro farkı ${money(revenueDiff)}`);
  }
  if (Math.abs(expenseDiff) >= 1) {
    missingItems.push(`Gider farkı ${money(expenseDiff)}`);
  }
  if (activeMonth) {
    missingItems.push(`Aktif ay ${monthLabels[activeMonth]} ${yearKey}`);
  }
  if (futureMonths.length) {
    missingItems.push(`Beklenen aylar ${monthSpanText(futureMonths)}`);
  }
  if (!missingItems.length) {
    missingItems.push("Eksik veri yok");
  }

  if (closedMissingMonths.length || detailClosedMissingMonths.length || expenseMissing || blankCustomerCount || blankInvoiceCount || Math.abs(revenueDiff) >= 1 || Math.abs(expenseDiff) >= 1) {
    status = "risk";
    statusLabel = "Eksik";
    statusReason = blankCustomerCount || blankInvoiceCount
      ? "Detay listesinde kimlik boşlukları var; sunum için kaynak verisi yeniden bağlanmalı."
      : Math.abs(revenueDiff) >= 1 || Math.abs(expenseDiff) >= 1
      ? "Detay veri ile özet toplamlar birebir eşleşmiyor."
      : expenseClosedMissingMonths.length
      ? "Kapanmış ayların gider kapsamı eksik; net kar resmi tamam değil."
      : expenseMissing
      ? "Gider ve bordro bagli olmadigi icin net kar resmi tamam degil."
      : "Kapanmış ayların tamamı raporda görünmüyor.";
  }

  if (status === "risk" && detailClosedMissingMonths.length && !blankCustomerCount && !blankInvoiceCount) {
    statusReason = `Ozet aylari dolu ama detay satis satirlari ${monthSpanText(detailClosedMissingMonths)} icin eksik.`;
  } else if (status !== "risk" && ((checks.length && controlPassCount < checks.length) || activeMonth)) {
    status = "warn";
    statusLabel = "Kontrol Et";
    statusReason = checks.length && controlPassCount < checks.length
      ? "Kontrol ekranında fark bulunan toplamlar var."
      : `${monthLabels[activeMonth]} ${yearKey} aktif ay; sunum YTD olarak okunmalı.`;
  }

  return {
    year: numericYear,
    yearKey,
    todayLabel: today.label,
    loadedMonths,
    detailMonthsLoaded,
    closedMonths,
    activeMonth,
    futureMonths,
    closedMissingMonths,
    closedCoveredCount: Math.max(0, closedMonths.length - closedMissingMonths.length),
    detailClosedMissingMonths,
    detailClosedCoveredCount: Math.max(0, loadedMonths.filter(month => closedMonths.includes(month)).length - detailClosedMissingMonths.length),
    expenseMonthsLoaded,
    expenseClosedMissingMonths,
    lastSalesDate,
    expenseTotal,
    expenseMissing,
    importedSales,
    importedExpenses,
    importedPayroll,
    salesRowCount: salesRows.length,
    payrollRowCount: payrollRows.length,
    invoiceCount,
    blankCustomerCount,
    blankInvoiceCount,
    detailRevenue,
    revenueDiff,
    expenseDiff,
    controlCount: checks.length,
    controlPassCount,
    sourceNote: DETAIL_BASE.meta?.sources?.[yearKey] || "",
    completedItems,
    missingItems,
    status,
    statusLabel,
    statusReason
  };
}

function renderYearNotice() {
  const notice = q("#yearNotice");
  if (!notice) return;
  notice.innerHTML = "";
  notice.classList.add("hidden");
}

function missingItemControlKey(item) {
  const text = normalizeText(item || "");
  if (text.includes("DETAY CIRO FARKI")) return "detailRevenue";
  if (text.includes("DETAY SATIR EKSIGI")) return "detailRevenue";
  if (text.includes("GIDER FARKI")) return "expenseRows";
  if (text.includes("BOS MUSTERI")) return "blankCustomer";
  if (text.includes("BOS FATURA")) return "blankInvoice";
  if (text.includes("KONTROL FARKI")) return "categoryRevenue";
  return "";
}

function professionalOverviewHeadline(summary) {
  if (summary.status === "risk") {
    if (summary.blankCustomerCount || summary.blankInvoiceCount) return "Detay veri kalitesinde iyileştirme gerekiyor.";
    if (Math.abs(summary.revenueDiff) >= 1 || Math.abs(summary.expenseDiff) >= 1) return "Özet ve detay toplamları arasında doğrulama farkı bulunuyor.";
    if (summary.expenseClosedMissingMonths.length) return "Kapanmış dönemlerde gider kapsamı eksik görünüyor.";
    if (summary.detailClosedMissingMonths.length) return "Satış detay kapsamı bazı kapanmış dönemlerde eksik.";
    if (summary.closedMissingMonths.length) return "Kapanmış dönemlerin veri kapsamı tamamlanmamış.";
    return "Veri seti tam doğrulama gerektiriyor.";
  }
  if (summary.status === "warn") {
    if (summary.controlCount && summary.controlPassCount < summary.controlCount) return "Bazı toplamlar için ek doğrulama önerilir.";
    if (summary.activeMonth) return `${monthLabels[summary.activeMonth]} ${summary.yearKey} dönemi henüz kapanmadı.`;
  }
  return `${summary.yearKey} verisi raporlama için hazır görünüyor.`;
}

function professionalOverviewMeta(summary, salesSpan, detailSpan) {
  return [
    summary.activeMonth ? `Aktif dönem: ${monthLabels[summary.activeMonth]} ${summary.yearKey}` : "",
    summary.loadedMonths.length ? `Satış kapsamı: ${salesSpan}` : "",
    summary.lastSalesDate ? `Son kayıt: ${formatDateLabel(summary.lastSalesDate)}` : "",
    summary.detailMonthsLoaded.length ? `Detay kapsamı: ${detailSpan}` : ""
  ].filter(Boolean);
}

function professionalMissingItemLabel(item) {
  const text = fixMojibakeText(String(item || ""));
  return text
    .replace("Satış eksiği", "Satış kapsamı eksik")
    .replace("Gider eksiği", "Gider kapsamı eksik")
    .replace("Detay satir eksigi", "Detay kapsamı eksik")
    .replace("Bordro detayı yok", "Bordro detayı bulunmuyor")
    .replace("Boş müşteri", "Müşteri bilgisi eksik")
    .replace("Boş fatura", "Fatura bilgisi eksik")
    .replace("Aktif ay", "Aktif dönem")
    .replace("Beklenen aylar", "Henüz kapanmayan dönem")
    .replace("Detay ciro farkı", "Detay ciro farkı")
    .replace("Gider farkı", "Gider farkı")
    .replace("Kontrol farkı", "Kontrol farkı");
}

function professionalStatusLabel(summary) {
  if (summary.status === "ready") return "Hazır";
  if (summary.status === "warn") return "İzle";
  return "Eksik";
}

function computeComparisons() {
  const yearData = currentYearData();
  const selected = selectedMonthData();
  if (selected) {
    const monthIndex = selected.month;
    const prevMonth = yearData.yonPlus.find(m => m.month === monthIndex - 1);
    const prevYear = DATA.years[String(Number(state.year) - 1)];
    const sameMonthPrevYear = prevYear ? prevYear.yonPlus.find(m => m.month === monthIndex) : null;
    return [
      compareCard("Geçen Aya Göre", selected.total.ciro, prevMonth ? prevMonth.total.ciro : null),
      compareCard("Geçen Yıl Aynı Aya Göre", selected.total.ciro, sameMonthPrevYear ? sameMonthPrevYear.total.ciro : null),
      compareCard("Geçen Yıl Aynı Dönem (YTD)", yearData.yonPlus.filter(m => m.month <= monthIndex).reduce((a,b)=>a+safe(b.total.ciro),0),
        prevYear ? prevYear.yonPlus.filter(m => m.month <= monthIndex).reduce((a,b)=>a+safe(b.total.ciro),0) : null),
    ];
  }
  if (state.year === "2026") {
    const current = yearData.overview.totalRevenue;
    const prevYear = DATA.years["2025"];
    const lastMonth = yearData.yonPlus.at(-1)?.month || 1;
    const lastCurrent = yearData.yonPlus.at(-1);
    const prevCurrent = yearData.yonPlus.at(-2);
    const prevSameMonth = prevYear.yonPlus.find(m => m.month === lastMonth);
    const ytdPrev = prevYear.yonPlus.filter(m => m.month <= lastMonth).reduce((a,b)=>a+safe(b.total.ciro),0);
    return [
      compareCard("Geçen Aya Göre", lastCurrent ? lastCurrent.total.ciro : null, prevCurrent ? prevCurrent.total.ciro : null),
      compareCard("Geçen Yıl Aynı Aya Göre", lastCurrent ? lastCurrent.total.ciro : null, prevSameMonth ? prevSameMonth.total.ciro : null),
      compareCard("Geçen Yıl Aynı Dönem (YTD)", current, ytdPrev),
    ];
  }
  return [
    compareCard("Geçen Aya Göre", null, null),
    compareCard("Geçen Yıl Aynı Aya Göre", null, null),
    compareCard("Geçen Yıl Aynı Dönem (YTD)", null, null),
  ];
}

function compareCard(title, current, previous) {
  let delta = null;
  let diff = null;
  if (current !== null && current !== undefined && previous !== null && previous !== undefined && previous !== 0) {
    diff = current - previous;
    delta = diff / previous;
  }
  const good = delta !== null && delta >= 0;
  return { title, current, previous, diff, delta, good };
}

function comparisonWindowMonths(year = state.year) {
  if (state.month !== "all") return [Number(state.month)].filter(Boolean);
  const yearData = DATA.years[String(year)] || { yonPlus: [] };
  const loadedMonths = uniqueMonths((yearData.yonPlus || []).map(row => row.month));
  return loadedMonths.length && loadedMonths.length < 12 ? loadedMonths : monthRange(12);
}

function comparisonWindowLabel(months, year = state.year) {
  if (!months.length) return `${year} veri yok`;
  if (state.month !== "all") return `${monthLabels[months[0]]} ${year}`;
  return months.length === 12 ? `${year} tüm yıl` : `${monthSpanText(months)} aynı dönem`;
}

function historicalComparisonRows() {
  const selectedYear = Number(state.year);
  const months = comparisonWindowMonths(selectedYear);
  const fullYearWindow = months.length === 12;
  return Object.keys(DATA.years || {})
    .map(Number)
    .filter(year => year <= selectedYear)
    .sort((left, right) => right - left)
    .map(year => {
      const yearKey = String(year);
      const yearData = DATA.years[yearKey] || { yonPlus: [], overview: {} };
      const summary = yearConfidenceSummary(yearKey);
      const scopedMonths = months.filter(month => uniqueMonths((yearData.yonPlus || []).map(row => row.month)).includes(month));
      const revenue = fullYearWindow ? safe(yearData.overview?.totalRevenue) : scopedMonths.reduce((sum, month) => sum + safe((yearData.yonPlus || []).find(row => row.month === month)?.total?.ciro), 0);
      const cost = fullYearWindow ? safe(yearData.overview?.totalCost) : scopedMonths.reduce((sum, month) => sum + safe((yearData.yonPlus || []).find(row => row.month === month)?.total?.maliyet), 0);
      const gross = fullYearWindow ? safe(yearData.overview?.grossProfit) : revenue - cost;
      const expense = fullYearWindow ? safe(yearData.overview?.totalExpense) : scopedMonths.reduce((sum, month) => sum + expenseMonthTotal(yearData, month), 0);
      const net = fullYearWindow ? safe(yearData.overview?.netProfit) : gross - expense;
      const missingOverviewMonths = months.filter(month => !scopedMonths.includes(month));
      const missingDetailMonths = months.filter(month => !summary.detailMonthsLoaded.includes(month));
      const tone = missingDetailMonths.length || missingOverviewMonths.length ? "warn" : "ready";
      return {
        year: yearKey,
        revenue,
        cost,
        gross,
        expense,
        net,
        tone,
        scopedLabel: scopedMonths.length ? monthSpanText(scopedMonths) : "yok",
        detailLabel: summary.detailMonthsLoaded.length ? monthSpanText(summary.detailMonthsLoaded) : "yok",
        missingOverviewMonths,
        missingDetailMonths,
        isSelected: year === selectedYear
      };
    });
}

function renderHistoricalComparisonPanel() {
  const months = comparisonWindowMonths(state.year);
  const label = comparisonWindowLabel(months, state.year);
  const rows = historicalComparisonRows();
  if (!rows.length) return "";
  return `
    <div class="history-compare">
      <div class="history-compare-head">
        <div class="history-compare-copy">
          <span class="history-compare-kicker">Geçmiş Yıllar Mukayesesi</span>
          <strong>${esc(label)}</strong>
          <p>Seçili görünümde tüm yıllar aynı dönem penceresinden hesaplanır; detay eksiği olan yıllar ayrıca işaretlenir.</p>
        </div>
      </div>
      <div class="history-compare-grid">
        ${rows.map(row => `
          <div class="history-compare-card ${row.tone} ${row.isSelected ? "active" : ""}">
            <div class="history-compare-year">
              <strong>${esc(row.year)}</strong>
              <span>${row.isSelected ? "Seçili yıl" : "Geçmiş yıl"}</span>
            </div>
            <div class="history-compare-badges">
              <span class="history-badge ${row.missingOverviewMonths.length ? "warn" : "ready"}">Özet ${esc(row.scopedLabel)}</span>
              <span class="history-badge ${row.missingDetailMonths.length ? "warn" : "ready"}">Detay ${esc(row.detailLabel)}</span>
            </div>
            <div class="history-compare-metrics">
              <div class="history-metric"><span>Satış</span><strong>${money(row.revenue)}</strong></div>
              <div class="history-metric"><span>Maliyet</span><strong>${money(row.cost)}</strong></div>
              <div class="history-metric"><span>Brüt Kar</span><strong>${money(row.gross)}</strong></div>
              <div class="history-metric"><span>Net Kar</span><strong>${money(row.net)}</strong></div>
            </div>
            ${(row.missingOverviewMonths.length || row.missingDetailMonths.length) ? `
              <div class="history-compare-note">
                ${row.missingOverviewMonths.length ? `Özet eksiği ${esc(monthSpanText(row.missingOverviewMonths))}` : ""}
                ${row.missingOverviewMonths.length && row.missingDetailMonths.length ? " • " : ""}
                ${row.missingDetailMonths.length ? `Detay eksiği ${esc(monthSpanText(row.missingDetailMonths))}` : ""}
              </div>
            ` : `<div class="history-compare-note ok">Aynı dönem için özet ve detay görünür.</div>`}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function sortIndicator(active, dir) {
  if (!active) return "↕";
  return dir === "asc" ? "▲" : "▼";
}

function renderSortButton(label, key, stateKey, dirKey, defaultDir = "asc") {
  const active = state[stateKey] === key;
  return `<button type="button" class="sort-header ${active ? "active" : ""}" data-sort="${key}" data-state-key="${stateKey}" data-state-dir="${dirKey}" data-default-dir="${defaultDir}">${label}<span class="sort-indicator">${sortIndicator(active, state[dirKey])}</span></button>`;
}

function compareSortValues(left, right, dir = "asc") {
  const factor = dir === "asc" ? 1 : -1;
  const leftEmpty = left === null || left === undefined || left === "";
  const rightEmpty = right === null || right === undefined || right === "";
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  if (typeof left === "string" || typeof right === "string") {
    return String(left).localeCompare(String(right), "tr", { numeric: true, sensitivity: "base" }) * factor;
  }
  return (safe(left) - safe(right)) * factor;
}

function latestMonthIndex(rows, getter) {
  for (let idx = 11; idx >= 0; idx -= 1) {
    if (rows.some(row => safe(getter(row, idx)) > 0)) return idx;
  }
  return 0;
}

function currentCostMonthIndex() {
  if (state.month !== "all") return Math.max(0, Number(state.month) - 1);
  return latestMonthIndex(DATA.costRows, (row, idx) => costMonthsForYear(row, state.year)?.[idx]);
}

function rawMaterialCost(metric = {}) {
  return safe(metric.LG) + safe(metric.KAP1) + safe(metric.KAP2) + safe(metric.TUT);
}

function currentEscalationMonthIndex() {
  if (state.month !== "all") return Math.max(0, Number(state.month) - 1);
  return latestMonthIndex(DATA.costRows, (row, idx) => costMonthsForYear(row, state.year)?.[idx]);
}

function toggleSortState(sortKeyName, sortDirName, nextKey, defaultDir = "asc") {
  if (state[sortKeyName] === nextKey) {
    state[sortDirName] = state[sortDirName] === "asc" ? "desc" : "asc";
    return;
  }
  state[sortKeyName] = nextKey;
  state[sortDirName] = defaultDir;
}

function expenseMonthTotal(yearData, month) {
  return (yearData.expenseRows || DATA.expenseRows || []).reduce((sum, row) => sum + safe(row[month]), 0);
}

function summaryCellValue(kind, month, itemName) {
  const yearData = currentYearData();
  const monthData = yearData.yonPlus.find(entry => entry.month === month) || { categories: [], total: {} };
  const category = monthData.categories.find(entry => sameLabel(entry.name, itemName));
  if (kind === "qty") return itemName ? safe(category?.adet) : safe(monthData.total?.adet);
  if (kind === "sales") return itemName ? safe(category?.ciro) : safe(monthData.total?.ciro);
  if (kind === "cost") return itemName ? safe(category?.maliyet) : safe(monthData.total?.maliyet);
  if (kind === "gross") return itemName ? safe(category?.kar) : safe(monthData.total?.kar);
  if (kind === "expense") return itemName ? expenseSummaryRows(yearData, month, itemName).reduce((sum, row) => sum + safe(row.amount), 0) : expenseMonthTotal(yearData, month);
  if (kind === "net") return safe(monthData.total?.kar) - expenseMonthTotal(yearData, month);
  return 0;
}

function sameLabel(left, right) {
  return normalizeText(left) === normalizeText(right);
}

function defaultUnitForCategory(category) {
  const key = normalizeText(category);
  if (key === "KAPLAMA" || key === "KENAR BANT") return "M2";
  if (key === "CARSAF") return "M";
  return "ADET";
}

function normalizeSalesDetailRow(row) {
  let productCode = String(row.productCode ?? row.kod ?? "").trim();
  const product = fixMojibakeText(String(row.product ?? row.urun ?? "").trim());
  const sourceFile = String(row.sourceFile || row.source || "İçe Aktarım").trim();
  let unit = String(row.unit ?? row.birim ?? "").trim();
  if (normalizeText(productCode).includes("STOK KARTI")) productCode = "";
  if (unit && (sameLabel(unit, product) || normalizeText(unit).includes("STOK KARTI"))) unit = "";
  const category = String(row.category ?? row.kategori ?? categoryFrom(productCode, product, unit)).trim();
  return {
    year: Number(row.year ?? row.yil ?? 0),
    month: Number(row.month ?? row.ay ?? 0),
    date: parseDateValue(row.date ?? row.tarih) || "",
    invoiceNo: String(row.invoiceNo ?? row.faturaNo ?? "").trim(),
    customerCode: String(row.customerCode ?? row.cariKodu ?? "").trim(),
    customerName: fixMojibakeText(String(row.customerName ?? row.unvan ?? "").trim()),
    productCode,
    product,
    unit: unit || defaultUnitForCategory(category),
    quantity: safe(row.quantity ?? row.miktar),
    amount: safe(row.amount ?? row.tutar),
    category,
    sourceFile
  };
}

function normalizePayrollDetailRow(row) {
  return {
    year: Number(row.year ?? 0),
    month: Number(row.month ?? 0),
    employee: fixMojibakeText(String(row.employee ?? row.name ?? "").trim()),
    gross: safe(row.gross ?? row.value),
    net: safe(row.net),
    base: safe(row.base),
    days: safe(row.days),
    company: String(row.company ?? "").trim(),
    sourceFile: String(row.sourceFile || row.source || "Bordro").trim()
  };
}

function applyManualEditsToSalesDetails(rows, edits) {
  const adjusted = rows.map(row => ({ ...row }));
  Object.entries(edits || {}).forEach(([year, yearEdits]) => {
    ["sales", "qty"].forEach(kind => {
      Object.entries(yearEdits?.[kind] || {}).forEach(([categoryName, targets]) => {
        if (!Array.isArray(targets)) return;
        for (let month = 1; month <= 12; month += 1) {
          const target = targets[month - 1];
          if (target === null || target === undefined || target === "") continue;
          const matches = adjusted.filter(row => row.year === Number(year) && row.month === month && sameLabel(row.category, categoryName));
          const field = kind === "sales" ? "amount" : "quantity";
          const current = matches.reduce((sum, row) => sum + safe(row[field]), 0);
          const delta = safe(target) - current;
          if (Math.abs(delta) >= 0.001) {
            adjusted.push({
              year: Number(year), month, date: "", invoiceNo: "MANUEL-DÜZELTME",
              customerCode: "MANUEL", customerName: "MANUEL DÜZELTME",
              productCode: "MANUEL", product: `${categoryName} manuel ${kind === "sales" ? "satış" : "miktar"} düzeltmesi`,
              unit: defaultUnitForCategory(categoryName), quantity: kind === "qty" ? delta : 0,
              amount: kind === "sales" ? delta : 0, category: categoryName,
              sourceFile: "Rapor Merkezi manuel düzeltme", manualAdjustment: true
            });
          }
        }
      });
    });
  });
  return adjusted;
}

function detailStore() {
  if (DETAIL_CACHE) return DETAIL_CACHE;
  const imports = loadImports();
  const salesRows = applyManualEditsToSalesDetails(
    [...(DETAIL_BASE.sales || []).map(normalizeSalesDetailRow), ...(imports.salesRows || []).map(normalizeSalesDetailRow)],
    loadManualEdits()
  )
    .filter(row => row.year && row.month && (row.amount || row.quantity) && row.product)
    .sort((a, b) =>
    a.year - b.year ||
    a.month - b.month ||
    String(a.date).localeCompare(String(b.date)) ||
    a.invoiceNo.localeCompare(b.invoiceNo, "tr") ||
    a.product.localeCompare(b.product, "tr")
  );
  const payrollRows = dedupeRows(
    [...(DETAIL_BASE.payroll || []).map(normalizePayrollDetailRow), ...(imports.payrollRows || []).map(normalizePayrollDetailRow)]
      .filter(row => row.year && row.month && row.employee && (row.gross || row.net || row.base)),
    row => `${row.year}|${row.month}|${row.employee}|${row.gross}|${row.net}|${row.sourceFile}`
  ).sort((a, b) => a.year - b.year || a.month - b.month || b.net - a.net || a.employee.localeCompare(b.employee, "tr"));
  DETAIL_CACHE = { salesRows, payrollRows };
  return DETAIL_CACHE;
}

function applyLinkedCustomerTotals(data) {
  if (!data?.years) return;
  const grouped = new Map();
  detailStore().salesRows.filter(row => !isRentIncomeRow(row)).forEach(row => {
    const customer = salesDisplayIdentityLabel(row);
    if (!customer || customer === "Kaynak detay satırı") return;
    const key = `${row.year}|${customer}`;
    grouped.set(key, safe(grouped.get(key)) + safe(row.amount));
  });
  Object.entries(data.years).forEach(([year, yearData]) => {
    const totalRevenue = safe(yearData.overview?.totalRevenue);
    const rows = [...grouped.entries()]
      .filter(([key]) => key.startsWith(`${year}|`))
      .map(([key, revenue]) => ({ name: key.slice(String(year).length + 1), revenue }))
      .sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name, "tr"));
    yearData.yonRapor = yearData.yonRapor || {};
    yearData.yonRapor.topCustomers = rows.map((row, index) => ({
      rank: index + 1,
      name: row.name,
      revenue: row.revenue,
      share: totalRevenue ? row.revenue / totalRevenue : 0
    }));
  });
}

function summarizeSalesRows(rows = []) {
  return {
    rowCount: rows.length,
    invoiceCount: new Set(rows.map(row => hasMeaningfulIdentityValue(row.invoiceNo) ? row.invoiceNo : "").filter(Boolean)).size,
    revenue: rows.reduce((sum, row) => sum + safe(row.amount), 0),
    blankCustomerCount: rows.filter(row => !hasMeaningfulIdentityValue(row.customerName) && !hasMeaningfulIdentityValue(row.customerCode)).length,
    blankInvoiceCount: rows.filter(row => !hasMeaningfulIdentityValue(row.invoiceNo)).length,
    orphanCount: rows.filter(row => !salesRowHasIdentity(row)).length
  };
}

function buildDetailLayerAudit(year = state.year) {
  const numericYear = Number(year);
  const staticRows = (DETAIL_BASE.sales || [])
    .map(normalizeSalesDetailRow)
    .filter(row => row.year === numericYear && row.month && (row.amount || row.quantity) && row.product);
  const importedRows = (loadImports().salesRows || [])
    .map(normalizeSalesDetailRow)
    .filter(row => row.year === numericYear && row.month && (row.amount || row.quantity) && row.product);
  const combinedRows = detailStore().salesRows.filter(row => row.year === numericYear);
  const problemRows = combinedRows.filter(row =>
    !hasMeaningfulIdentityValue(row.invoiceNo)
    || !hasMeaningfulIdentityValue(row.customerName)
    || !hasMeaningfulIdentityValue(row.customerCode)
  );
  const groupedProblems = new Map();
  problemRows.forEach(row => {
    const sourceFile = String(row.sourceFile || "Kaynak yok").trim();
    const current = groupedProblems.get(sourceFile) || {
      sourceFile,
      count: 0,
      blankCustomerCount: 0,
      blankInvoiceCount: 0,
      orphanCount: 0
    };
    current.count += 1;
    if (!hasMeaningfulIdentityValue(row.customerName) && !hasMeaningfulIdentityValue(row.customerCode)) current.blankCustomerCount += 1;
    if (!hasMeaningfulIdentityValue(row.invoiceNo)) current.blankInvoiceCount += 1;
    if (!salesRowHasIdentity(row)) current.orphanCount += 1;
    groupedProblems.set(sourceFile, current);
  });
  return {
    static: summarizeSalesRows(staticRows),
    imported: summarizeSalesRows(importedRows),
    combined: summarizeSalesRows(combinedRows),
    problemGroups: [...groupedProblems.values()].sort((left, right) =>
      right.count - left.count
      || right.blankCustomerCount - left.blankCustomerCount
      || right.blankInvoiceCount - left.blankInvoiceCount
      || left.sourceFile.localeCompare(right.sourceFile, "tr")
    ),
    problemRows
  };
}

function buildAuditProblemRows(year = state.year, limit = 12, precomputedAudit = null) {
  const audit = precomputedAudit || buildDetailLayerAudit(year);
  return audit.problemRows
    .sort((left, right) =>
      right.amount - left.amount
      || String(left.date).localeCompare(String(right.date))
      || left.product.localeCompare(right.product, "tr")
    )
    .slice(0, limit);
}

function valueText(kind, value, unit = "") {
  if (kind === "qty" || kind === "number") {
    const digits = unit === "M2" || unit === "M" ? 3 : 0;
    return `${num(value, digits)}${unit ? ` ${unit}` : ""}`;
  }
  return money(value);
}

function buildTopList(rows, labelFn, valueFn, limit = 6) {
  const totals = new Map();
  rows.forEach(row => {
    const label = String(labelFn(row) || "").trim() || genericRowLabel(row);
    if (!label) return;
    totals.set(label, safe(totals.get(label)) + safe(valueFn(row)));
  });
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function categoryCostRatio(yearData, month, category) {
  const monthData = yearData.yonPlus.find(entry => entry.month === month);
  if (!monthData) return 0;
  const cat = monthData.categories.find(entry => sameLabel(entry.name, category));
  return safe(cat?.ciro) ? safe(cat.maliyet) / safe(cat.ciro) : 0;
}

function salesMetricValue(row, kind, yearData) {
  if (kind === "qty") return safe(row.quantity);
  if (kind === "sales") return safe(row.amount);
  const ratio = categoryCostRatio(yearData, row.month, row.category);
  const cost = safe(row.amount) * ratio;
  if (kind === "cost") return cost;
  if (kind === "gross") return safe(row.amount) - cost;
  return safe(row.amount);
}

function buildSalesDetailPayload(kind, month, itemName) {
  const yearData = currentYearData();
  const store = detailStore();
  const yearRows = store.salesRows.filter(row => String(row.year) === state.year && !isRentIncomeRow(row));
  const categoryRows = itemName ? yearRows.filter(row => sameLabel(row.category, itemName)) : yearRows;
  const monthRows = categoryRows.filter(row => Number(row.month) === month);
  const displayKind = kind === "qty" ? "qty" : "money";
  const rows = monthRows.map(row => ({
    date: row.date || monthLabels[month],
    invoiceNo: row.invoiceNo || "—",
    customerCode: row.customerCode || "—",
    customerName: salesDisplayIdentityLabel(row),
    productCode: row.productCode || "—",
    product: row.product,
    unit: row.unit || defaultUnitForCategory(row.category),
    quantity: safe(row.quantity),
    amount: safe(row.amount),
    metricValue: salesMetricValue(row, kind, yearData),
    sourceFile: row.sourceFile
  })).sort((a, b) =>
    b.metricValue - a.metricValue ||
    a.customerName.localeCompare(b.customerName, "tr") ||
    a.invoiceNo.localeCompare(b.invoiceNo, "tr")
  );

  const detailTotal = rows.reduce((sum, row) => sum + safe(row.metricValue), 0);
  const cellTotal = summaryCellValue(kind, month, itemName);
  const monthRanking = buildTopList(categoryRows, row => monthLabels[row.month] || row.month, row => salesMetricValue(row, kind, yearData), 12);
  const customerRows = rows.filter(row =>
    row.customerName &&
    row.customerName !== "Kaynak detay satırı" &&
    !isRentIncomeCustomer(row.customerName)
  );
  const customerInsightRows = customerRows.length
    ? customerRows
    : rows.filter(row => !isRentIncomeCustomer(row.customerName));
  const stats = [
    { label: "Satır", value: num(rows.length) },
    { label: "Hücre Değeri", value: valueText(displayKind, cellTotal, itemName && kind === "qty" ? rows[0]?.unit || defaultUnitForCategory(itemName) : "") },
    { label: "Ham Liste", value: valueText(displayKind, detailTotal, itemName && kind === "qty" ? rows[0]?.unit || defaultUnitForCategory(itemName) : "") },
    { label: "Müşteri", value: num(new Set(customerRows.map(row => row.customerName)).size) },
    { label: "Ürün", value: num(new Set(rows.map(row => row.product).filter(Boolean)).size) }
  ];
  const insights = [
    { title: "En Çok Kime Satıldı", kind: displayKind, items: buildTopList(customerInsightRows, row => row.customerName, row => row.metricValue) },
    { title: "En Çok Hangi Ürün", kind: displayKind, items: buildTopList(rows, row => row.product, row => row.metricValue) },
    { title: "En Güçlü Aylar", kind: displayKind, items: monthRanking }
  ];
  const columns = [
    { key: "date", label: "Tarih" },
    { key: "invoiceNo", label: "Fatura" },
    { key: "customerCode", label: "Cari" },
    { key: "customerName", label: "Müşteri" },
    { key: "productCode", label: "Kod" },
    { key: "product", label: "Ürün" },
    { key: "unit", label: "Birim" },
    { key: "quantity", label: "Miktar", format: "qty", unitKey: "unit" },
    { key: "amount", label: "Satış Tutarı", format: "money" }
  ];
  if (kind === "cost") columns.push({ key: "metricValue", label: "Dağıtılan Maliyet", format: "money" });
  if (kind === "gross") columns.push({ key: "metricValue", label: "Brüt Kar", format: "money" });
  const noteParts = [];
  if (rows.length && Math.abs(detailTotal - cellTotal) > 1) {
    noteParts.push("Ham satır toplamı ile özet hücre arasında fark varsa rapor özet satırları veya eksik kaynak bağlantısı olabilir.");
  }
  const note = rows.length
    ? noteParts.join(" ")
    : "Bu hücre için ham satış satırı bulunamadı. Haftalık satış dosyası içe aktarıldığında detay otomatik zenginleşir.";
  return {
    columns,
    rows,
    stats,
    insights,
    note,
    emptyMessage: "Bu filtreye uygun satış satırı yok."
  };
}

function buildCustomerDetailPayload(customerName) {
  const target = String(customerName || "").trim();
  const rows = detailStore().salesRows
    .filter(row => String(row.year) === state.year && isReportableCustomerName(row.customerName) && sameLabel(row.customerName, target) && !isRentIncomeRow(row))
    .map(row => ({
      date: row.date || monthLabels[row.month],
      monthLabel: monthLabels[row.month] || row.month,
      invoiceNo: row.invoiceNo || "—",
      customerCode: row.customerCode || "—",
      customerName: row.customerName,
      productCode: row.productCode || "—",
      product: row.product,
      unit: row.unit || defaultUnitForCategory(row.category),
      quantity: safe(row.quantity),
      amount: safe(row.amount),
      category: row.category,
      sourceFile: row.sourceFile
    }))
    .sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      a.invoiceNo.localeCompare(b.invoiceNo, "tr") ||
      b.amount - a.amount
    );
  const total = rows.reduce((sum, row) => sum + safe(row.amount), 0);
  return {
    columns: [
      { key: "date", label: "Tarih" },
      { key: "monthLabel", label: "Ay" },
      { key: "invoiceNo", label: "Fatura" },
      { key: "customerCode", label: "Cari" },
      { key: "category", label: "Kategori" },
      { key: "productCode", label: "Kod" },
      { key: "product", label: "Ürün" },
      { key: "unit", label: "Birim" },
      { key: "quantity", label: "Miktar", format: "qty", unitKey: "unit" },
      { key: "amount", label: "Satış Tutarı", format: "money" }
    ],
    rows,
 …18976 tokens truncated…otalCost)}</span>
    </div>
    <div class="master-stats-note">
      ${masterMonth.modeLabel}. Aktif WERP kolonlari: ${activeColumns.join(", ")}.
      Recete aramalarinda MKOD, SKOD, KAP1KOD, KAP2KOD ve TUKOD da filtreye dahildir.
    </div>
  `;
  if (masterSourceWarning) q("#masterStats").insertAdjacentHTML("beforeend", masterSourceWarning);
  q("#masterBody").innerHTML = slice.map(r => {
    const totals = masterTotalsForYear(r, state.year) || {};
    const m = monthMetric(r);
    return `<tr>
      <td>${r.code}</td><td>${r.name}</td><td>${r.category}</td>
      <td>${num(totals.adet, 3)}</td><td>${money(totals.ciro)}</td><td>${money(totals.maliyet)}</td><td>${money(totals.kar)}</td><td>${pct(totals.marj)}</td>
      <td>${num(m.A, 3)}</td><td>${money(m.C)}</td><td>${money(m.TM)}</td><td>${money(m.KAR)}</td><td>${money(m.BM)}</td><td>${money(m.LG)}</td>
      <td>${money(m.KAP1)}</td><td>${money(m.KAP2)}</td><td>${money(m.TUT)}</td><td>${money(m.GG)}</td><td>${money(m.DG)}</td>
      <td>${r.recipe.MKOD ?? "—"}</td><td>${r.recipe.SKOD ?? "—"}</td><td>${r.recipe.KAP1KOD ?? "—"}</td><td>${r.recipe.KAP2KOD ?? "—"}</td><td>${r.recipe.TUKOD ?? "—"}</td>
    </tr>`;
  }).join("");
  q("#masterPageLabel").textContent = `Sayfa ${state.masterPage} / ${totalPages}`;
  q("#masterPageLabel").textContent = `Sayfa ${state.masterPage} / ${totalPages} • ${slice.length.toLocaleString("tr-TR")} kayıt`;
}

function filteredCostRowsLegacy() {
  return DATA.costRows.filter(r => {
    const txt = `${r.WKOD} ${r.ÜRÜN} ${r.KALINLIK_BOY ?? ""} ${r.KATEGORİ} ${r.Currency}`.toLowerCase();
    const sOk = !state.costSearch || txt.includes(state.costSearch.toLowerCase());
    const cOk = state.costCurrency === "Tümü" || (r.Currency || "—") === state.costCurrency;
    return sOk && cOk;
  });
}

function renderCostsLegacyOld() {
  const currencySel = q("#costCurrency");
  if (!currencySel.dataset.filled) {
    const vals = [...new Set(DATA.costRows.map(r => r.Currency).filter(Boolean))];
    currencySel.innerHTML = `<option>Tümü</option>${vals.map(v => `<option>${v}</option>`).join("")}`;
    currencySel.dataset.filled = "1";
  }
  currencySel.value = state.costCurrency;
  const index = state.month === "all" ? 0 : Number(state.month) - 1;
  q("#costBody").innerHTML = filteredCostRows().slice(0,300).map(r => {
    const monthVal = costMonthsForYear(r, state.year)?.[index];
    return `<tr>
      <td>${r.WKOD ?? "—"}</td><td>${formatCostProduct(r)}</td><td>${r.KATEGORİ ?? "—"}</td><td>${r.Currency ?? "—"}</td><td>${money(r.Base_Price)}</td><td>${money(monthVal)}</td>
    </tr>`;
  }).join("");
}

function filteredCostRows() {
  const monthIndex = currentCostMonthIndex();
  return DATA.costRows
    .map(row => {
      const months = costMonthsForYear(row, state.year);
      const basePrice = safe(row.Base_Price);
      const selectedCost = safe(months?.[monthIndex]);
      const currency = normalizeCurrency(row.Currency);
      const monthValues = Array.from({ length: 12 }, (_, idx) => safe(months?.[idx]));
      const activeValues = monthValues.filter(value => value > 0);
      const firstValue = activeValues[0] || 0;
      const lastValue = activeValues[activeValues.length - 1] || 0;
      return {
        wkod: String(row.WKOD ?? "—"),
        product: row["ÜRÜN"] ?? "—",
        formattedProduct: formatCostProduct(row),
        dimension: formatDimension(row["KALINLIK_BOY"], row["KATEGORİ"]) || "—",
        category: row.KATEGORİ ?? "—",
        currency,
        basePrice,
        selectedCost,
        monthValues,
        yearTotal: monthValues.reduce((sum, value) => sum + value, 0),
        yearAvg: activeValues.length ? monthValues.reduce((sum, value) => sum + value, 0) / activeValues.length : 0,
        firstValue,
        lastValue,
        deltaTl: lastValue - firstValue,
        deltaPct: firstValue ? (lastValue - firstValue) / firstValue : null,
        exchangeRate: impliedExchangeRate(basePrice, selectedCost, currency),
        searchText: `${row.WKOD ?? ""} ${formatCostProduct(row)} ${row.KALINLIK_BOY ?? ""} ${row.KATEGORİ ?? ""} ${currency}`.toLowerCase()
      };
    })
    .filter(row => {
      const searchOk = !state.costSearch || row.searchText.includes(state.costSearch.toLowerCase());
      const currencyOk = state.costCurrency === "Tümü" || row.currency === state.costCurrency;
      const categoryOk = state.costCategory === "Tümü" || row.category === state.costCategory;
      return searchOk && currencyOk && categoryOk;
    })
    .sort((left, right) => {
      const key = state.costSortKey;
      const leftValue = key.startsWith("m") ? left.monthValues[Number(key.slice(1)) - 1] : left[key];
      const rightValue = key.startsWith("m") ? right.monthValues[Number(key.slice(1)) - 1] : right[key];
      return compareSortValues(leftValue, rightValue, state.costSortDir);
    });
}

function impliedExchangeRate(basePrice, selectedCost, currency) {
  const pb = String(currency || "").trim().toUpperCase();
  if (!basePrice || !selectedCost) return null;
  if (pb === "TL" || pb === "TRY" || pb === "—") return 1;
  return selectedCost / basePrice;
}

function normalizeCurrency(value) {
  const text = String(value ?? "").trim().toUpperCase();
  return text || "TL";
}

function monthStartDatesForYear(year) {
  return Array.from({ length: 12 }, (_, idx) => `${year}-${String(idx + 1).padStart(2, "0")}-01`);
}

function hasMissingDerivedCostMonths(row, year) {
  const months = costMonthsForYear(row, year);
  if (!Array.isArray(months)) return false;
  const currency = normalizeCurrency(row?.Currency);
  const basePrice = safe(row?.Base_Price);
  if (!basePrice) return false;
  if (!["USD", "EUR", "TL", "TRY"].includes(currency)) return false;
  return months.some(value => value === null || value === undefined || value === "");
}

function monthRateFor(currency, year, monthIndex) {
  const yearMatrix = FX_MATRIX_CACHE[String(year)] || {};
  const currencyMatrix = yearMatrix[normalizeCurrency(currency)] || [];
  return safe(currencyMatrix[monthIndex]?.rate);
}

function derivedMonthlyCost(row, year, monthIndex) {
  const currency = normalizeCurrency(row?.Currency);
  const basePrice = safe(row?.Base_Price);
  if (!basePrice) return null;
  if (currency === "TL" || currency === "TRY") return basePrice;
  const rate = monthRateFor(currency, year, monthIndex);
  if (!rate) return null;
  return basePrice * rate;
}

function matchedKaplamaSourceRow(targetRow, data) {
  const product = String(targetRow?.["ÜRÜN"] ?? "").trim();
  const dimension = String(targetRow?.KALINLIK_BOY ?? "").trim();
  if (!product || !dimension) return null;
  return (data?.costRows || []).find(row =>
    canonicalCategoryName(String(row?.["KATEGORİ"] ?? row?.["KATEGORÄ°"] ?? "")) === "KAPLAMA"
    && String(row?.["ÜRÜN"] ?? "").trim() === product
    && String(row?.KALINLIK_BOY ?? "").trim() === dimension
  ) || null;
}

function kap1Kap2Ratio(targetRow, sourceRow) {
  const targetMonths = targetRow?.months25;
  const sourceMonths = sourceRow?.months25;
  if (!Array.isArray(targetMonths) || !Array.isArray(sourceMonths)) return null;
  for (let idx = 0; idx < 12; idx += 1) {
    const targetValue = safe(targetMonths[idx]);
    const sourceValue = safe(sourceMonths[idx]);
    if (targetValue && sourceValue) return targetValue / sourceValue;
  }
  return null;
}

function derivedKap1Kap2Cost(row, year, monthIndex, data) {
  const category = canonicalCategoryName(String(row?.["KATEGORİ"] ?? row?.["KATEGORÄ°"] ?? ""));
  if (category !== "KAP1KAP2") return null;
  const sourceRow = matchedKaplamaSourceRow(row, data);
  if (!sourceRow) return null;
  const sourceMonths = costMonthsForYear(sourceRow, year);
  const sourceValue = safe(sourceMonths?.[monthIndex]);
  if (!sourceValue) return null;
  const ratio = kap1Kap2Ratio(row, sourceRow);
  if (!ratio) return null;
  return sourceValue * ratio;
}

function applyDerivedCostMatrix(data) {
  (data?.costRows || []).forEach(row => {
    ["2025", "2026"].forEach(year => {
      const months = costMonthsForYear(row, year);
      if (!Array.isArray(months)) return;
      for (let idx = 0; idx < 12; idx += 1) {
        if (months[idx] !== null && months[idx] !== undefined && months[idx] !== "") continue;
        const derived = derivedMonthlyCost(row, year, idx);
        if (derived === null) continue;
        months[idx] = derived;
      }
    });
  });
  (data?.costRows || []).forEach(row => {
    ["2025", "2026"].forEach(year => {
      const months = costMonthsForYear(row, year);
      if (!Array.isArray(months)) return;
      for (let idx = 0; idx < 12; idx += 1) {
        if (months[idx] !== null && months[idx] !== undefined && months[idx] !== "") continue;
        const derived = derivedKap1Kap2Cost(row, year, idx, data);
        if (derived === null) continue;
        months[idx] = derived;
      }
    });
  });
}

async function ensureFxMatrixForYear(year = state.year) {
  const yearKey = String(year);
  if (FX_MATRIX_CACHE[yearKey]) return FX_MATRIX_CACHE[yearKey];
  if (!FX_MATRIX_PENDING) FX_MATRIX_PENDING = {};
  if (FX_MATRIX_PENDING[yearKey]) return FX_MATRIX_PENDING[yearKey];
  const candidateRows = referenceCostRows().filter(row => hasMissingDerivedCostMonths(row, yearKey));
  const currencies = [...new Set(candidateRows.map(row => normalizeCurrency(row.Currency)).filter(currency => currency && currency !== "TL" && currency !== "TRY"))];
  if (!currencies.length) {
    FX_MATRIX_CACHE[yearKey] = {};
    return FX_MATRIX_CACHE[yearKey];
  }
  FX_MATRIX_PENDING[yearKey] = fetch(`/api/fxmatrix?year=${encodeURIComponent(yearKey)}&currencies=${encodeURIComponent(currencies.join(","))}`)
    .then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Kur matrisi alınamadı");
      FX_MATRIX_CACHE[yearKey] = payload.matrix || {};
      return FX_MATRIX_CACHE[yearKey];
    })
    .catch(error => {
      if (typeof console !== "undefined") console.warn("FX matrix load failed:", error.message);
      FX_MATRIX_CACHE[yearKey] = FX_MATRIX_CACHE[yearKey] || {};
      return FX_MATRIX_CACHE[yearKey];
    })
    .finally(() => {
      delete FX_MATRIX_PENDING[yearKey];
    });
  return FX_MATRIX_PENDING[yearKey];
}

function currencyRateLabel(row) {
  const pb = String(row.currency || "").toUpperCase();
  if (row.exchangeRate === null) return "—";
  if (pb === "TL" || pb === "TRY" || row.exchangeRate === 1) return "1,0000";
  return num(row.exchangeRate, 4);
}

function costRowByCode(wkod) {
  return filteredCostRows().find(row => row.wkod === String(wkod));
}

let _sourceCostRowMap = null;
function sourceCostRow(wkod) {
  const code = String(wkod || "");
  if (!code) return null;
  if (!_sourceCostRowMap) {
    _sourceCostRowMap = new Map();
    referenceCostRows().forEach(row => _sourceCostRowMap.set(String(row?.WKOD ?? ""), row));
  }
  return _sourceCostRowMap.get(code) || null;
}

function sourceCostValue(wkod, monthIndex) {
  const row = sourceCostRow(wkod);
  if (!row) return null;
  const months = costMonthsForYear(row, state.year);
  if (!Array.isArray(months)) return null;
  return safe(months[monthIndex]);
}

function isCostCellEdited(wkod, monthIndex, value, yearEdits = null) {
  const edits = (yearEdits || loadCostEdits()?.[String(state.year)] || {})[String(wkod)] || null;
  if (!Array.isArray(edits)) return false;
  if (Math.abs(safe(edits[monthIndex]) - safe(value)) >= 0.001) return false;
  const sourceValue = sourceCostValue(wkod, monthIndex);
  return sourceValue === null || Math.abs(safe(value) - safe(sourceValue)) >= 0.001;
}

function setCostCellValue(wkod, monthIndex, nextValue, renderAfter = true) {
  const code = String(wkod || "");
  const linkedProductCount = activeProductsUsingCost(code, state.year);
  if (!linkedProductCount) {
    window.alert(`${state.year} için ${code} maliyetini kullanarak satış/üretim yapan aktif MASTER_ERP ürünü yok. Bağlantısız maliyet değişikliğine izin verilmedi.`);
    return false;
  }
  const sourceRow = DATA.costRows.find(row => String(row.WKOD ?? "") === code);
  if (!sourceRow) return false;
  const target = costMonthsForYear(sourceRow, state.year);
  if (!Array.isArray(target)) return false;
  const oldValue = safe(target[monthIndex]);
  target[monthIndex] = safe(nextValue);
  persistCostRowEdit(state.year, code, target);
  lastCostEdit = { year: state.year, wkod: code, monthIndex, oldValue, nextValue: safe(nextValue) };
  if (renderAfter) {
    recomputeData();
    render();
  }
  return true;
}

function restoreCostCell(wkod, monthIndex) {
  const row = DATA.costRows.find(entry => String(entry.WKOD ?? "") === String(wkod));
  if (!row) return;
  const sourceValue = sourceCostValue(wkod, monthIndex);
  if (sourceValue === null) {
    window.alert("Kaynak dosyada bu maliyet hucresi icin eski deger bulunamadi.");
    return;
  }
  if (!ensureEditPassword()) return;
  const product = formatCostProduct(row);
  const current = safe(costMonthsForYear(row, state.year)?.[monthIndex]);
  if (!window.confirm(`${monthLabels[monthIndex + 1]} ${product}\nMevcut: ${money(current)}\nKaynak deger: ${money(sourceValue)}\n\nKaynak degere donulsun mu?`)) return;
  setCostCellValue(wkod, monthIndex, sourceValue);
}

function undoLastCostEdit() {
  if (!lastCostEdit || lastCostEdit.year !== state.year) {
    window.alert("Bu oturumda geri alinacak maliyet degisikligi yok.");
    return;
  }
  if (!ensureEditPassword()) return;
  setCostCellValue(lastCostEdit.wkod, lastCostEdit.monthIndex, lastCostEdit.oldValue);
}

function editCostCell(wkod, monthIndex) {
  const row = DATA.costRows.find(entry => String(entry.WKOD ?? "") === String(wkod));
  if (!row) return;
  if (!ensureEditPassword()) return;
  const months = costMonthsForYear(row, state.year);
  const currentValue = safe(months?.[monthIndex]);
  const sourceValue = sourceCostValue(wkod, monthIndex);
  const product = formatCostProduct(row);
  const promptText = [
    `${monthLabels[monthIndex + 1]} ${product}`,
    `Mevcut deger: ${money(currentValue)}`,
    sourceValue === null ? "Kaynak deger: bulunamadi" : `Kaynak deger: ${money(sourceValue)}`,
    "",
    "Yeni degeri girin. Bos birakirsaniz degismez."
  ].join("\n");
  const nextRaw = window.prompt(promptText, money(currentValue));
  if (nextRaw === null || String(nextRaw).trim() === "") return;
  const nextValue = nullableNumber(nextRaw);
  if (nextValue === null) {
    window.alert("Gecerli bir sayi girilmedi. Hucre degistirilmedi.");
    return;
  }
  if (!window.confirm(`${product}\nEski: ${money(currentValue)}\nYeni: ${money(nextValue)}\n\nDegisiklik kaydedilsin mi?`)) return;
  setCostCellValue(wkod, monthIndex, nextValue);
}

function buildCostFormulaPayload(row, monthNo) {
  const monthIndex = Math.max(0, Number(monthNo) - 1);
  const value = safe(row.monthValues?.[monthIndex]);
  const basePrice = safe(row.basePrice);
  const currency = normalizeCurrency(row.currency);
  const rate = impliedExchangeRate(basePrice, value, currency);
  const points = (row.monthValues || []).map((cost, idx) => ({ month: idx + 1, label: monthLabels[idx + 1], cost: safe(cost) }));
  const first = points.find(point => point.cost > 0) || points[monthIndex] || { month: monthNo, label: monthLabels[monthNo], cost: 0 };
  const selected = points[monthIndex] || { month: monthNo, label: monthLabels[monthNo], cost: value };
  const delta = selected.cost - first.cost;
  const deltaPct = first.cost ? delta / first.cost : null;
  const formula = currency === "TL"
    ? `TL ürün: aylık maliyet doğrudan ${money(value)} olarak alınır.`
    : `${currency} baz fiyat ${num(basePrice, 4)} x kullanılan kur ${rate === null ? "—" : num(rate, 4)} = ${money(value)}`;
  const monthRows = points.map(point => ({
    month: `${point.label} ${String(state.year).slice(-2)}`,
    cost: point.cost,
    rate: impliedExchangeRate(basePrice, point.cost, currency),
    delta: point.cost - first.cost,
    deltaPct: first.cost ? (point.cost - first.cost) / first.cost : null
  }));
  return {
    stats: [
      { label: "WKOD", value: row.wkod },
      { label: "Ürün", value: row.formattedProduct || row.product },
      { label: "Seçili Ay Maliyeti", value: money(value) },
      { label: "Kullanılan Kur", value: rate === null ? "—" : num(rate, 4) },
      { label: "İlk Dolu Ay", value: `${first.label} ${money(first.cost)}` },
      { label: "Eskalasyon", value: `${money(delta)} / ${pct(deltaPct)}` }
    ],
    insights: [
      {
        title: "Hesap Formülü",
        kind: "text",
        items: [
          { label: "Base Price", value: `${num(basePrice, 4)} ${currency}` },
          { label: "Kur Mantığı", value: currency === "TL" ? "Kur 1,0000 kabul edilir" : "Kur = aylık TL maliyet / base price" },
          { label: "Formül", value: formula }
        ]
      },
      {
        title: "Eskalasyon",
        kind: "text",
        items: [
          { label: "Referans", value: `${first.label} ${money(first.cost)}` },
          { label: "Seçili Ay", value: `${selected.label} ${money(selected.cost)}` },
          { label: "Fark", value: `${money(delta)} (${pct(deltaPct)})` }
        ]
      }
    ],
    columns: [
      { key: "month", label: "Ay" },
      { key: "cost", label: "Maliyet", format: "money" },
      { key: "rate", label: "Kur", format: "rate" },
      { key: "delta", label: "İlk Aya Göre TL", format: "money" },
      { key: "deltaPct", label: "İlk Aya Göre %", format: "pct" }
    ],
    rows: monthRows,
    note: "Dövizli hammaddelerde kullanılan kur, rapordaki aylık TL maliyetinin base price değerine bölünmesiyle gösterilir. TL hammaddelerde kur 1 kabul edilir.",
    emptyMessage: "Bu hammadde için aylık maliyet satırı bulunamadı."
  };
}

function buildCostFormulaPayload(row, monthNo) {
  const monthIndex = Math.max(0, Number(monthNo) - 1);
  const value = safe(row.monthValues?.[monthIndex]);
  const basePrice = safe(row.basePrice);
  const currency = normalizeCurrency(row.currency);
  const rate = impliedExchangeRate(basePrice, value, currency);
  const sourceRow = DATA.costRows.find(item => String(item?.WKOD ?? "") === String(row.wkod));
  const sourceCategory = canonicalCategoryName(String(sourceRow?.["KATEGORİ"] ?? sourceRow?.["KATEGORÄ°"] ?? row.category ?? ""));
  const edited = isCostCellEdited(row.wkod, monthIndex, value);
  const originalValue = sourceCostValue(row.wkod, monthIndex);
  const kaplamaSource = sourceCategory === "KAP1KAP2" ? matchedKaplamaSourceRow(sourceRow, DATA) : null;
  const kaplamaRatio = kaplamaSource ? kap1Kap2Ratio(sourceRow, kaplamaSource) : null;
  const kaplamaMonths = kaplamaSource ? costMonthsForYear(kaplamaSource, state.year) : null;
  const kaplamaValue = kaplamaSource ? safe(kaplamaMonths?.[monthIndex]) : null;
  const matrixRate = monthRateFor(currency, state.year, monthIndex);
  const points = (row.monthValues || []).map((cost, idx) => ({ month: idx + 1, label: monthLabels[idx + 1], cost: safe(cost) }));
  const first = points.find(point => point.cost > 0) || points[monthIndex] || { month: monthNo, label: monthLabels[monthNo], cost: 0 };
  const selected = points[monthIndex] || { month: monthNo, label: monthLabels[monthNo], cost: value };
  const delta = selected.cost - first.cost;
  const deltaPct = first.cost ? delta / first.cost : null;
  const baseFormula = currency === "TL"
    ? `TL ürün: aylık maliyet doğrudan ${money(value)} olarak alınır.`
    : `${currency} baz fiyat ${num(basePrice, 4)} x kullanılan kur ${rate === null ? "—" : num(rate, 4)} = ${money(value)}`;
  let costingRule = "Kaynak dosyadaki aylık maliyet doğrudan kullanıldı.";
  let sourceLabel = "Kaynak aylık veri";
  let detailedFormula = baseFormula;
  if (edited) {
    costingRule = "Bu hücre manuel override edildi.";
    sourceLabel = "Manuel değişiklik";
    detailedFormula = `Mevcut değer ${money(value)} olarak elle kaydedildi. Kaynak değer ${originalValue === null ? "bulunamadı" : money(originalValue)}.`;
  } else if (sourceCategory === "KAP1KAP2" && kaplamaSource && kaplamaRatio) {
    costingRule = "KAP1KAP2 maliyeti, eşleşen KAPLAMA satırından sabit çarpanla türetilir.";
    sourceLabel = `KAPLAMA kaynağı: ${String(kaplamaSource?.WKOD ?? "—")} • ${formatCostProduct(kaplamaSource)}`;
    detailedFormula = `${String(kaplamaSource?.WKOD ?? "—")} kaynak maliyeti ${kaplamaValue === null ? "—" : money(kaplamaValue)} x sabit çarpan ${num(kaplamaRatio, 6)} = ${money(value)}`;
  } else if (basePrice && ["USD", "EUR"].includes(currency) && matrixRate) {
    costingRule = "Dövizli hammadde maliyeti aylık kur matrisiyle üretilir.";
    sourceLabel = "Base Price + aylık döviz kuru";
    detailedFormula = `${currency} baz fiyat ${num(basePrice, 4)} x ${selected.label} kuru ${num(matrixRate, 4)} = ${money(value)}`;
  } else if (basePrice && ["TL", "TRY"].includes(currency)) {
    costingRule = "TL hammadde maliyeti baz fiyatın doğrudan aya uygulanmasıdır.";
    sourceLabel = "Base Price doğrudan";
    detailedFormula = `TL baz fiyat ${money(basePrice)} = ${money(value)}`;
  }
  const monthRows = points.map(point => ({
    month: `${point.label} ${String(state.year).slice(-2)}`,
    cost: point.cost,
    rate: impliedExchangeRate(basePrice, point.cost, currency),
    delta: point.cost - first.cost,
    deltaPct: first.cost ? (point.cost - first.cost) / first.cost : null
  }));
  return {
    stats: [
      { label: "WKOD", value: row.wkod },
      { label: "Ürün", value: row.formattedProduct || row.product },
      { label: "Maliyetleme Kuralı", value: costingRule },
      { label: "Seçili Ay Maliyeti", value: money(value) },
      { label: "Kullanılan Kur", value: rate === null ? "—" : num(rate, 4) },
      { label: "İlk Dolu Ay", value: `${first.label} ${money(first.cost)}` },
      { label: "Eskalasyon", value: `${money(delta)} / ${pct(deltaPct)}` }
    ],
    insights: [
      {
        title: "Hesap Formülü",
        kind: "text",
        items: [
          { label: "Maliyetleme Yöntemi", value: costingRule },
          { label: "Kaynak", value: sourceLabel },
          { label: "Base Price", value: `${num(basePrice, 4)} ${currency}` },
          { label: "Kur Mantığı", value: currency === "TL" ? "Kur 1,0000 kabul edilir" : "Kur = aylık TL maliyet / base price" },
          { label: "Formül", value: detailedFormula }
        ]
      },
      {
        title: "Eskalasyon",
        kind: "text",
        items: [
          { label: "Referans", value: `${first.label} ${money(first.cost)}` },
          { label: "Seçili Ay", value: `${selected.label} ${money(selected.cost)}` },
          { label: "Fark", value: `${money(delta)} (${pct(deltaPct)})` }
        ]
      }
    ],
    columns: [
      { key: "month", label: "Ay" },
      { key: "cost", label: "Maliyet", format: "money" },
      { key: "rate", label: "Kur", format: "rate" },
      { key: "delta", label: "İlk Aya Göre TL", format: "money" },
      { key: "deltaPct", label: "İlk Aya Göre %", format: "pct" }
    ],
    rows: monthRows,
    note: "Bu kart, seçili maliyet hücresinin hangi kuralla oluştuğunu açıklar: manuel override, dövizli baz fiyat, TL baz fiyat veya KAP1KAP2 için KAPLAMA kaynak çarpanı.",
    emptyMessage: "Bu hammadde için aylık maliyet satırı bulunamadı."
  };
}

function updateCostCell(wkod, monthIndex, rawValue, rerender = false) {
  const nextValue = nullableNumber(rawValue);
  if (nextValue === null) return;
  setCostCellValue(wkod, monthIndex, nextValue, rerender);
}

function buildEscalationRows() {
  const selectedIndex = currentEscalationMonthIndex();
  const annualInputs = annualInputsForYear();
  const excludedCategories = new Set([
    annualInputs.MDF !== null ? "MDF" : null,
    annualInputs.SUNTA !== null ? "SUNTA" : null
  ].filter(Boolean));
  return DATA.costRows
    .map(row => {
      const months = costMonthsForYear(row, state.year);
      const points = Array.from({ length: 12 }, (_, idx) => {
        return {
          month: idx + 1,
          label: monthLabels[idx + 1],
          cost: safe(months?.[idx])
        };
      });
      const first = points.find(point => point.cost > 0);
      const latest = [...points].reverse().find(point => point.cost > 0);
      if (!first || !latest) return null;
      const selected = points[selectedIndex];
      const current = selected?.cost > 0 ? selected : latest;
      const basePrice = safe(row.Base_Price);
      const currency = normalizeCurrency(row.Currency);
      return {
        code: String(row.WKOD ?? "—"),
        product: formatCostProduct(row),
        category: row.KATEGORİ ?? "—",
        currency,
        basePrice,
        firstMonth: first.month,
        firstMonthLabel: first.label,
        currentMonth: current.month,
        currentMonthLabel: current.label,
        firstCost: first.cost,
        currentCost: current.cost,
        exchangeRate: impliedExchangeRate(basePrice, current.cost, currency),
        deltaTl: current.cost - first.cost,
        deltaPct: first.cost ? (current.cost - first.cost) / first.cost : null,
        searchText: `${row.WKOD ?? ""} ${formatCostProduct(row)} ${row.KATEGORİ ?? ""} ${currency}`.toLowerCase()
      };
    })
    .filter(Boolean)
    .filter(row => {
      const searchOk = !state.costSearch || row.searchText.includes(state.costSearch.toLowerCase());
      const currencyOk = state.costCurrency === "Tümü" || row.currency === state.costCurrency;
      const annualOk = !excludedCategories.has(row.category);
      return searchOk && currencyOk && annualOk;
    })
    .sort((left, right) => compareSortValues(left[state.escalationSortKey], right[state.escalationSortKey], state.escalationSortDir));
}

function buildProductCostRows() {
  const monthMeta = selectedMasterMonthMeta();
  const search = normalizeText(state.costSearch || "");
  return DATA.masterRows
    .map(row => {
      const metric = monthMetric(row);
      const raw = rawMaterialCost(metric);
      const qty = safe(metric.A);
      const revenue = safe(metric.C);
      const totalCost = safe(metric.TM);
      const profit = safe(metric.KAR);
      const unitCost = safe(metric.BM);
      const fixedShare = safe(metric.GG);
      const variableShare = safe(metric.DG);
      const recipe = row.recipe || {};
      return {
        code: String(row.code ?? "—"),
        product: row.name ?? "—",
        category: row.category ?? "—",
        qty,
        revenue,
        unitCost,
        raw,
        fixedShare,
        variableShare,
        totalCost,
        profit,
        margin: revenue ? profit / revenue : null,
        recipeText: [recipe.MKOD, recipe.SKOD, recipe.KAP1KOD, recipe.KAP2KOD, recipe.TUKOD].filter(Boolean).join(" / ") || "—",
        searchText: normalizeText([row.code, row.name, row.category, recipe.MKOD, recipe.SKOD, recipe.KAP1KOD, recipe.KAP2KOD, recipe.TUKOD].join(" "))
      };
    })
    .filter(row => {
      const hasActivity = row.qty || row.revenue || row.totalCost || row.unitCost || row.raw || row.fixedShare || row.variableShare;
      const searchOk = !search || row.searchText.includes(search);
      return hasActivity && searchOk;
    })
    .sort((left, right) => compareSortValues(left[state.productCostSortKey], right[state.productCostSortKey], state.productCostSortDir));
}

function buildCostInsights(costRows, productRows) {
  const currencyGroups = costRows.reduce((acc, row) => {
    const pb = row.currency || "—";
    if (!acc[pb]) acc[pb] = { count: 0, rateTotal: 0, rateCount: 0 };
    acc[pb].count += 1;
    if (row.exchangeRate && row.exchangeRate !== 1) {
      acc[pb].rateTotal += row.exchangeRate;
      acc[pb].rateCount += 1;
    }
    return acc;
  }, {});
  const currencyText = Object.entries(currencyGroups)
    .map(([pb, item]) => item.rateCount ? `${pb}: ${num(item.rateTotal / item.rateCount, 4)} ort. kur` : `${pb}: ${num(item.count)} kayıt`)
    .join(" • ");
  const annualRawTotal = costRows.reduce((sum, row) => sum + row.yearTotal, 0);
  const activeMonths = Array.from({ length: 12 }, (_, idx) => costRows.some(row => safe(row.monthValues?.[idx]))).filter(Boolean).length;
  const topRaw = [...costRows].sort((a, b) => b.yearTotal - a.yearTotal)[0];
  const topRawTrend = [...costRows].filter(row => row.deltaPct !== null).sort((a, b) => b.deltaPct - a.deltaPct)[0];
  const categories = [...new Set(costRows.map(row => row.category).filter(Boolean))].length;
  const totalCost = productRows.reduce((sum, row) => sum + row.totalCost, 0);
  const rawTotal = productRows.reduce((sum, row) => sum + row.raw, 0);
  const fixedTotal = productRows.reduce((sum, row) => sum + row.fixedShare, 0);
  const variableTotal = productRows.reduce((sum, row) => sum + row.variableShare, 0);
  const topFixed = [...productRows].sort((a, b) => b.fixedShare - a.fixedShare)[0];
  const topVariable = [...productRows].sort((a, b) => b.variableShare - a.variableShare)[0];
  const dependencyCoverage = costDependencyCoverage(state.year);
  return [
    ["Hammadde kartları", num(costRows.length), `${categories} kategori • ${activeMonths}/12 ay dolu`],
    ["Reçete bağlantısı", dependencyCoverage.activeProducts ? pct(dependencyCoverage.rate) : "Bağlantı yok", dependencyCoverage.activeProducts ? `${num(dependencyCoverage.linkedActiveProducts)}/${num(dependencyCoverage.activeProducts)} aktif ürün bağlı` : `${state.year} MASTER_ERP aylık üretim/adet verisi yok`],
    ["Yıllık ham maliyet", money(annualRawTotal), topRaw ? `En yüksek: ${esc(topRaw.formattedProduct || topRaw.product)}` : ""],
    ["En yüksek artış", topRawTrend ? esc(topRawTrend.formattedProduct || topRawTrend.product) : "—", topRawTrend ? pct(topRawTrend.deltaPct) : ""],
    ["Döviz kontrolü", currencyText || "Dövizli kayıt yok", "PB ve kullanılan/implied kur"],
    ["ERP toplam maliyet", money(totalCost), "Secili ay urun maliyet toplami"],
    ["Sabit / Degisken", `${money(fixedTotal)} / ${money(variableTotal)}`, "GG ve DG paylari"],
  ].concat([
    topFixed ? ["En yuksek sabit pay", esc(topFixed.product), money(topFixed.fixedShare)] : null,
    topVariable ? ["En yuksek degisken pay", esc(topVariable.product), money(topVariable.variableShare)] : null
  ].filter(Boolean));
}

function expenseRowsWithMetrics(rows) {
  return rows.map((row, rowIndex) => {
    const months = Array.from({ length: 12 }, (_, idx) => safe(row[idx + 1]));
    const total = months.reduce((sum, value) => sum + value, 0);
    const activeMonths = months.filter(value => value > 0);
    const avg = activeMonths.length ? total / activeMonths.length : 0;
    const maxValue = Math.max(...months);
    const minPositive = activeMonths.length ? Math.min(...activeMonths) : 0;
    const maxIndex = months.indexOf(maxValue);
    return {
      rowIndex,
      label: row[0] || "—",
      months,
      total,
      avg,
      maxValue,
      maxMonth: maxIndex >= 0 ? maxIndex + 1 : null,
      minPositive,
      zeroCount: months.filter(value => value === 0).length
    };
  });
}

function currentExpenseMonthIndex() {
  if (state.month !== "all") return Math.max(0, Number(state.month) - 1);
  const rows = currentYearData().expenseRows || DATA.expenseRows || [];
  return latestMonthIndex(rows, (row, idx) => safe(row?.[idx + 1]));
}

function expenseMonthlyTotals(rows) {
  return Array.from({ length: 12 }, (_, idx) => rows.reduce((sum, row) => sum + safe(row[idx + 1]), 0));
}

function renderAnalysisCards(selector, cards) {
  const el = q(selector);
  if (!el) return;
  el.innerHTML = cards.map(card => `
    <div class="analysis-card">
      <span>${card[0]}</span>
      <strong>${card[1]}</strong>
      <small>${card[2] || ""}</small>
    </div>
  `).join("");
}

function updateExpenseCell(rowIndex, monthIndex, rawValue, rerender = true) {
  const yearData = currentYearData();
  const rows = yearData.expenseRows || DATA.expenseRows || [];
  const row = rows[rowIndex];
  if (!row) return;
  row[monthIndex + 1] = nullableNumber(rawValue) ?? 0;
  row[13] = Array.from({ length: 12 }, (_, idx) => safe(row[idx + 1])).reduce((sum, value) => sum + value, 0);
  recalcExpenseOverview(yearData);
  persistExpenseRowEdit(state.year, row);
  if (rerender) renderExpenses();
}

function sourceExpenseValue(label, monthIndex, rowIndex = null) {
  const sourceRows = referenceExpenseRows(state.year);
  const sourceRow = rowIndex !== null && sourceRows[rowIndex]?.[0] === label
    ? sourceRows[rowIndex]
    : sourceRows.find(row => row?.[0] === label);
  return sourceRow ? safe(sourceRow[monthIndex + 1]) : null;
}

function isExpenseCellEdited(label, monthIndex, value, rowIndex = null) {
  const yearEdits = loadExpenseEdits()?.[String(state.year)] || {};
  const editedRow = yearEdits[label];
  if (!Array.isArray(editedRow)) return false;
  if (Math.abs(safe(editedRow[monthIndex]) - safe(value)) >= 0.001) return false;
  const sourceValue = sourceExpenseValue(label, monthIndex, rowIndex);
  return sourceValue === null || Math.abs(safe(value) - safe(sourceValue)) >= 0.001;
}

function setExpenseCellValue(rowIndex, monthIndex, nextValue, note = null) {
  const yearData = currentYearData();
  const rows = yearData.expenseRows || DATA.expenseRows || [];
  const row = rows[rowIndex];
  if (!row) return false;
  const oldValue = safe(row[monthIndex + 1]);
  row[monthIndex + 1] = safe(nextValue);
  row[13] = Array.from({ length: 12 }, (_, idx) => safe(row[idx + 1])).reduce((sum, value) => sum + value, 0);
  recalcExpenseOverview(yearData);
  persistExpenseRowEdit(state.year, row, note);
  lastExpenseEdit = {
    year: state.year,
    rowIndex,
    monthIndex,
    label: row[0],
    oldValue,
    nextValue: safe(nextValue)
  };
  recomputeData();
  render();
  return true;
}

function restoreExpenseCell(rowIndex, monthIndex) {
  const rows = currentYearData().expenseRows || DATA.expenseRows || [];
  const row = rows[rowIndex];
  if (!row) return;
  const label = row[0] || "";
  const sourceValue = sourceExpenseValue(label, monthIndex, rowIndex);
  if (sourceValue === null) {
    window.alert("Kaynak dosyada bu hucre icin eski deger bulunamadi.");
    return;
  }
  if (!ensureEditPassword()) return;
  if (!window.confirm(`${monthLabels[monthIndex + 1]} ${label}\nMevcut: ${money(row[monthIndex + 1])}\nKaynak deger: ${money(sourceValue)}\n\nKaynak degere donulsun mu?`)) return;
  setExpenseCellValue(rowIndex, monthIndex, sourceValue);
}

function undoLastExpenseEdit() {
  if (!lastExpenseEdit || lastExpenseEdit.year !== state.year) {
    window.alert("Bu oturumda geri alinacak gider degisikligi yok.");
    return;
  }
  if (!ensureEditPassword()) return;
  setExpenseCellValue(lastExpenseEdit.rowIndex, lastExpenseEdit.monthIndex, lastExpenseEdit.oldValue);
}

function editExpenseCell(rowIndex, monthIndex) {
  const rows = currentYearData().expenseRows || DATA.expenseRows || [];
  const row = rows[rowIndex];
  if (!row) return;
  if (!ensureEditPassword()) return;
  const label = row[0] || "";
  const currentValue = safe(row[monthIndex + 1]);
  const sourceValue = sourceExpenseValue(label, monthIndex, rowIndex);
  const promptText = [
    `${monthLabels[monthIndex + 1]} ${label}`,
    `Mevcut deger: ${money(currentValue)}`,
    sourceValue === null ? "Kaynak deger: bulunamadi" : `Kaynak deger: ${money(sourceValue)}`,
    "",
    "Yeni degeri girin. Bos birakirsaniz degismez."
  ].join("\n");
  const nextRaw = window.prompt(promptText, money(currentValue));
  if (nextRaw === null || String(nextRaw).trim() === "") return;
  const nextValue = nullableNumber(nextRaw);
  if (nextValue === null) {
    window.alert("Gecerli bir sayi girilmedi. Hucre degistirilmedi.");
    return;
  }
  if (!window.confirm(`${label}\nEski: ${money(currentValue)}\nYeni: ${money(nextValue)}\n\nDegisiklik kaydedilsin mi?`)) return;
  setExpenseCellValue(rowIndex, monthIndex, nextValue);
}

function renderAnnualInputCard() {
  const values = annualInputsForYear();
  if (q("#annualMdfInput")) q("#annualMdfInput").value = values.MDF !== null ? String(values.MDF) : "";
  if (q("#annualSuntaInput")) q("#annualSuntaInput").value = values.SUNTA !== null ? String(values.SUNTA) : "";
  const pills = [];
  if (values.MDF !== null) pills.push(`<span class="summary-pill">MDF yillik baz: ${money(values.MDF)}</span>`);
  if (values.SUNTA !== null) pills.push(`<span class="summary-pill">SUNTA yillik baz: ${money(values.SUNTA)}</span>`);
  q("#annualCostSummary").innerHTML = pills.join("") || `<span class="summary-pill">${state.year} icin manuel MDF / SUNTA kaydi yok</span>`;
  const locked = [
    values.MDF !== null ? "MDF" : "",
    values.SUNTA !== null ? "SUNTA" : ""
  ].filter(Boolean);
  q("#annualCostMeta").textContent = locked.length
    ? `${state.year} icin ${locked.join(" + ")} yillik baz olarak kaydedildi. Bu kategoriler otomatik eskalasyondan ayrilir.`
    : `${state.year} icin yillik MDF / SUNTA degeri bekleniyor.`;
}

function saveAnnualInputsFromForm() {
  const MDF = nullableNumber(q("#annualMdfInput")?.value);
  const SUNTA = nullableNumber(q("#annualSuntaInput")?.value);
  setAnnualInputsForYear(state.year, { MDF, SUNTA });
  renderCosts();
}

function clearAnnualInputsForYear() {
  setAnnualInputsForYear(state.year, { MDF: null, SUNTA: null });
  renderCosts();
}

function renderCosts() {
  const currencySel = q("#costCurrency");
  if (!currencySel.dataset.filled) {
    const vals = [...new Set(DATA.costRows.map(r => normalizeCurrency(r.Currency)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
    currencySel.innerHTML = `<option>Tümü</option>${vals.map(v => `<option>${v}</option>`).join("")}`;
    currencySel.dataset.filled = "1";
  }
  currencySel.value = state.costCurrency;
  const categorySel = q("#costCategory");
  if (categorySel && !categorySel.dataset.filled) {
    const vals = [...new Set(DATA.costRows.map(r => r.KATEGORİ).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
    categorySel.innerHTML = `<option>Tümü</option>${vals.map(v => `<option>${v}</option>`).join("")}`;
    categorySel.dataset.filled = "1";
  }
  if (categorySel) categorySel.value = state.costCategory;
  renderAnnualInputCard();
  if (!costYearSupported(state.year)) {
    q("#costBody").innerHTML = `<tr><td colspan="21">${state.year} için aylık hammadde maliyeti kaynağı bulunmuyor. Maliyet ekranı yalnızca 2025 ve 2026 verileriyle çalışır.</td></tr>`;
    q("#costMeta").textContent = `${state.year} için maliyet matrisi kaynağı bulunmuyor.`;
    q("#escalationBody").innerHTML = `<tr><td colspan="12">${state.year} için eskalasyon hesabı çalıştırılamıyor.</td></tr>`;
    q("#escalationSummary").innerHTML = "";
    q("#escalationMeta").textContent = `${state.year} için eskalasyon kaynağı bulunmuyor.`;
    q("#productCostBody").innerHTML = `<tr><td colspan="13">${state.year} için ürün maliyet kırılımı üretilemiyor.</td></tr>`;
    q("#productCostMeta").textContent = `${state.year} için ürün maliyet modeli bulunmuyor.`;
    return;
  }

  const costMonthIndex = currentCostMonthIndex();
  const costRows = filteredCostRows();
  const productRows = buildProductCostRows();
  renderAnalysisCards("#costInsightGrid", buildCostInsights(costRows, productRows).slice(0, 7));
  const costHead = q("#costHead");
  if (costHead) {
    costHead.innerHTML = `<tr>
      <th>${renderSortButton("WKOD", "wkod", "costSortKey", "costSortDir", "asc")}</th>
      <th>${renderSortButton("Ürün", "product", "costSortKey", "costSortDir", "asc")}</th>
      <th>${renderSortButton("Kalınlık/Boy", "dimension", "costSortKey", "costSortDir", "asc")}</th>
      <th>${renderSortButton("Kategori", "category", "costSortKey", "costSortDir", "asc")}</th>
      <th>${renderSortButton("Base Price", "basePrice", "costSortKey", "costSortDir", "desc")}</th>
      <th>${renderSortButton("PB", "currency", "costSortKey", "costSortDir", "asc")}</th>
      ${Array.from({ length: 12 }, (_, idx) => `<th>${renderSortButton(`${monthLabels[idx + 1]} ${String(state.year).slice(-2)}`, `m${idx + 1}`, "costSortKey", "costSortDir", "desc")}</th>`).join("")}
      <th>${renderSortButton("Ort.", "yearAvg", "costSortKey", "costSortDir", "desc")}</th>
      <th>${renderSortButton("Yıllık Toplam", "yearTotal", "costSortKey", "costSortDir", "desc")}</th>
      <th>${renderSortButton("Değişim", "deltaPct", "costSortKey", "costSortDir", "desc")}</th>
    </tr>`;
  }
  const yearCostEdits = loadCostEdits()[String(state.year)] || {};
  q("#costBody").innerHTML = costRows.map(row => `
    <tr>
      <td>${esc(row.wkod)}</td>
      <td>${esc(row.product)}</td>
      <td>${esc(row.dimension)}</td>
      <td>${esc(row.category)}</td>
      <td>${money(row.basePrice)}</td>
      <td>${esc(row.currency)}</td>
      ${row.monthValues.map((value, idx) => {
        const edited = isCostCellEdited(row.wkod, idx, value, yearCostEdits);
        return `
        <td class="cost-month-cell ${edited ? "edited" : ""}" data-wkod="${esc(row.wkod)}" data-month="${idx + 1}">
          <div class="cost-cell-control">
            <input class="cost-input cost-protected-input" data-wkod="${esc(row.wkod)}" data-month="${idx}" value="${money(value)}" inputmode="decimal" title="Cift tik / sag tik ile sifreli duzenle" readonly />
            ${edited ? `<button class="cost-undo" type="button" data-wkod="${esc(row.wkod)}" data-month="${idx}" title="Kaynak degere don">Geri</button>` : ""}
            <button class="cost-explain" type="button" data-wkod="${esc(row.wkod)}" data-month="${idx + 1}" title="Hesap ve eskalasyon aciklamasi">?</button>
          </div>
        </td>
      `;
      }).join("")}
      <td>${money(row.yearAvg)}</td>
      <td>${money(row.yearTotal)}</td>
      <td>${pct(row.deltaPct)}</td>
    </tr>
  `).join("") || `<tr><td colspan="21">Bu filtreye uygun maliyet kaydı yok.</td></tr>`;
  const activeMonthCount = Array.from({ length: 12 }, (_, idx) => costRows.some(row => safe(row.monthValues[idx]))).filter(Boolean).length;
  q("#costMeta").textContent = `${costRows.length.toLocaleString("tr-TR")} hammadde kaydı • ${state.year} yıllık görünüm • ${activeMonthCount}/12 ayda maliyet verisi var • Aylık kolonlardan sıralama yapılabilir`;

  const escalationMonthIndex = currentEscalationMonthIndex();
  const escalationRows = buildEscalationRows();
  const annualInputs = annualInputsForYear();
  q("#escalationHead").innerHTML = `<tr>
    <th>${renderSortButton("Kod", "code", "escalationSortKey", "escalationSortDir", "asc")}</th>
    <th>${renderSortButton("Ürün", "product", "escalationSortKey", "escalationSortDir", "asc")}</th>
    <th>${renderSortButton("Kategori", "category", "escalationSortKey", "escalationSortDir", "asc")}</th>
    <th>${renderSortButton("PB", "currency", "escalationSortKey", "escalationSortDir", "asc")}</th>
    <th>${renderSortButton("İlk Ay", "firstMonth", "escalationSortKey", "escalationSortDir", "asc")}</th>
    <th>${renderSortButton("Güncel Ay", "currentMonth", "escalationSortKey", "escalationSortDir", "desc")}</th>
    <th>${renderSortButton("İlk Maliyet", "firstCost", "escalationSortKey", "escalationSortDir", "desc")}</th>
    <th>${renderSortButton("Güncel Maliyet", "currentCost", "escalationSortKey", "escalationSortDir", "desc")}</th>
    <th>${renderSortButton("Kur", "exchangeRate", "escalationSortKey", "escalationSortDir", "desc")}</th>
    <th>${renderSortButton("Esk. TL", "deltaTl", "escalationSortKey", "escalationSortDir", "desc")}</th>
    <th>${renderSortButton("Esk. %", "deltaPct", "escalationSortKey", "escalationSortDir", "desc")}</th>
    <th>${renderSortButton("Base Price", "basePrice", "escalationSortKey", "escalationSortDir", "desc")}</th>
  </tr>`;
  q("#escalationBody").innerHTML = escalationRows.map(row => `
    <tr>
      <td>${esc(row.code)}</td>
      <td>${esc(row.product)}</td>
      <td>${esc(row.category)}</td>
      <td>${esc(row.currency)}</td>
      <td>${esc(row.firstMonthLabel)}</td>
      <td>${esc(row.currentMonthLabel)}</td>
      <td>${money(row.firstCost)}</td>
      <td>${money(row.currentCost)}</td>
      <td>${currencyRateLabel(row)}</td>
      <td>${money(row.deltaTl)}</td>
      <td>${pct(row.deltaPct)}</td>
      <td>${money(row.basePrice)}</td>
    </tr>
  `).join("") || `<tr><td colspan="12">Bu filtreye uygun eskalasyon kaydı yok.</td></tr>`;

  const topTl = [...escalationRows].sort((a, b) => b.deltaTl - a.deltaTl)[0];
  const topPct = [...escalationRows].filter(row => row.deltaPct !== null).sort((a, b) => b.deltaPct - a.deltaPct)[0];
  const lowPct = [...escalationRows].filter(row => row.deltaPct !== null).sort((a, b) => a.deltaPct - b.deltaPct)[0];
  const fallbackCount = state.month === "all" ? 0 : escalationRows.filter(row => row.currentMonth !== Number(state.month)).length;
  const annualPills = [
    annualInputs.MDF !== null ? `<span class="summary-pill">MDF yillik baz: ${money(annualInputs.MDF)}</span>` : "",
    annualInputs.SUNTA !== null ? `<span class="summary-pill">SUNTA yillik baz: ${money(annualInputs.SUNTA)}</span>` : ""
  ].filter(Boolean);
  q("#escalationSummary").innerHTML = [
    ...annualPills,
    `<span class="summary-pill">Referans: ilk dolu ay → ${monthLabels[escalationMonthIndex + 1]} ${String(state.year).slice(-2)}</span>`,
    topTl ? `<span class="summary-pill">En yüksek TL artış: ${esc(topTl.product)} ${money(topTl.deltaTl)}</span>` : "",
    topPct ? `<span class="summary-pill">En yüksek % artış: ${esc(topPct.product)} ${pct(topPct.deltaPct)}</span>` : "",
    lowPct ? `<span class="summary-pill">En düşük trend: ${esc(lowPct.product)} ${pct(lowPct.deltaPct)}</span>` : ""
  ].filter(Boolean).join("");
  const manualLocked = [
    annualInputs.MDF !== null ? "MDF" : "",
    annualInputs.SUNTA !== null ? "SUNTA" : ""
  ].filter(Boolean);
  q("#escalationMeta").textContent = `${escalationRows.length.toLocaleString("tr-TR")} kayıt • İlk dolu ay ile güncel ay maliyeti karşılaştırılıyor${manualLocked.length ? ` • ${manualLocked.join(" + ")} manuel yıllık baz ile ayrıldı` : ""}${fallbackCount ? ` • ${fallbackCount.toLocaleString("tr-TR")} satırda seçili ay boş olduğu için son dolu ay kullanıldı` : ""}`;

  q("#productCostHead").innerHTML = `<tr>
    <th>${renderSortButton("Kod", "code", "productCostSortKey", "productCostSortDir", "asc")}</th>
    <th>${renderSortButton("Ürün", "product", "productCostSortKey", "productCostSortDir", "asc")}</th>
    <th>${renderSortButton("Kategori", "category", "productCostSortKey", "productCostSortDir", "asc")}</th>
    <th>${renderSortButton("Adet", "qty", "productCostSortKey", "productCostSortDir", "desc")}</th>
    <th>${renderSortButton("Ciro", "revenue", "productCostSortKey", "productCostSortDir", "desc")}</th>
    <th>${renderSortButton("Birim Maliyet", "unitCost", "productCostSortKey", "productCostSortDir", "desc")}</th>
    <th>${renderSortButton("Hammadde", "raw", "productCostSortKey", "productCostSortDir", "desc")}</th>
    <th>${renderSortButton("Sabit Pay GG", "fixedShare", "productCostSortKey", "productCostSortDir", "desc")}</th>
    <th>${renderSortButton("Değişken Pay DG", "variableShare", "productCostSortKey", "productCostSortDir", "desc")}</th>
    <th>${renderSortButton("Toplam Maliyet", "totalCost", "productCostSortKey", "productCostSortDir", "desc")}</th>
    <th>${renderSortButton("Kar", "profit", "productCostSortKey", "productCostSortDir", "desc")}</th>
    <th>${renderSortButton("Marj", "margin", "productCostSortKey", "productCostSortDir", "desc")}</th>
    <th>Reçete Kodları</th>
  </tr>`;
  q("#productCostBody").innerHTML = productRows.slice(0, 500).map(row => `
    <tr>
      <td>${esc(row.code)}</td>
      <td>${esc(row.product)}</td>
      <td>${esc(row.category)}</td>
      <td>${num(row.qty, 3)}</td>
      <td>${money(row.revenue)}</td>
      <td>${money(row.unitCost)}</td>
      <td>${money(row.raw)}</td>
      <td>${money(row.fixedShare)}</td>
      <td>${money(row.variableShare)}</td>
      <td>${money(row.totalCost)}</td>
      <td>${money(row.profit)}</td>
      <td>${pct(row.margin)}</td>
      <td>${esc(row.recipeText)}</td>
    </tr>
  `).join("") || `<tr><td colspan="13">Secili ayda ERP maliyet hareketi bulunamadı.</td></tr>`;
  q("#productCostMeta").textContent = `${productRows.length.toLocaleString("tr-TR")} ürün • ${selectedMasterMonthMeta().label} • GG sabit/genel gider payı, DG değişken/diğer gider payı olarak gösterildi`;
}

function renderExpenses() {
  const rows = currentYearData().expenseRows || DATA.expenseRows || [];
  const monthIndex = currentExpenseMonthIndex();
  const monthNo = monthIndex + 1;
  const metrics = expenseRowsWithMetrics(rows).sort((left, right) => {
    const key = state.expenseSortKey;
    const leftValue = key.startsWith("m") ? left.months[Number(key.slice(1)) - 1] : left[key];
    const rightValue = key.startsWith("m") ? right.months[Number(key.slice(1)) - 1] : right[key];
    return compareSortValues(leftValue, rightValue, state.expenseSortDir);
  });
  const monthlyTotals = expenseMonthlyTotals(rows);
  const annualTotal = monthlyTotals.reduce((sum, value) => sum + value, 0);
  const activeTotals = monthlyTotals.filter(value => value > 0);
  const monthlyAvg = activeTotals.length ? annualTotal / activeTotals.length : 0;
  const highValue = Math.max(...monthlyTotals);
  const highMonth = monthlyTotals.indexOf(highValue) + 1;
  const selectedTotal = monthlyTotals[monthIndex] || 0;
  const selectedTop = [...metrics].sort((a, b) => b.months[monthIndex] - a.months[monthIndex])[0];
  const selectedMissing = metrics.filter(row => row.months[monthIndex] === 0).map(row => row.label);
  const highItems = metrics
    .filter(row => row.months[monthIndex] > 0 && row.avg > 0 && row.months[monthIndex] > row.avg * 1.35)
    .sort((a, b) => b.months[monthIndex] - a.months[monthIndex])
    .slice(0, 4);

  renderAnalysisCards("#expenseSummaryGrid", [
    [state.month === "all" ? "Yıllık gider toplamı" : `${monthLabels[monthNo]} gider toplamı`, money(state.month === "all" ? annualTotal : selectedTotal), `${state.year} gider kapsamı`],
    ["Aylık ortalama", money(monthlyAvg), `${activeTotals.length}/12 ayda gider var`],
    ["En yüksek ay", `${monthLabels[highMonth]} ${money(highValue)}`, highValue > monthlyAvg ? `${pct(monthlyAvg ? (highValue - monthlyAvg) / monthlyAvg : null)} ortalama üstü` : "Ortalama seviyede"],
    ["Seçili ay en büyük kalem", selectedTop ? `${esc(selectedTop.label)} ${money(selectedTop.months[monthIndex])}` : "—", `${monthLabels[monthNo]} kontrolü`]
  ]);

  q("#expenseInsightList").innerHTML = [
    `${monthLabels[highMonth]} ${state.year} en yüksek gider ayı: ${money(highValue)}.`,
    selectedTop ? `${monthLabels[monthNo]} ayında en büyük kalem ${esc(selectedTop.label)}: ${money(selectedTop.months[monthIndex])}.` : "",
    selectedMissing.length ? `${monthLabels[monthNo]} ayında tutarı olmayan ${selectedMissing.length} kalem var: ${selectedMissing.slice(0, 6).map(esc).join(", ")}${selectedMissing.length > 6 ? "..." : ""}.` : `${monthLabels[monthNo]} ayında gider kalemlerinde boş kayıt görünmüyor.`,
    highItems.length ? `Ortalamasına göre yüksek gelen kalemler: ${highItems.map(row => `${esc(row.label)} ${money(row.months[monthIndex])}`).join(" • ")}.` : `${monthLabels[monthNo]} ayında ortalamaya göre sert sapma görünmüyor.`
  ].filter(Boolean).map(text => `<li>${text}</li>`).join("");

  q("#expenseHead").innerHTML = `<tr>
    <th>${renderSortButton("Gider Kalemi", "label", "expenseSortKey", "expenseSortDir", "asc")}</th>
    ${Array.from({ length: 12 }, (_, idx) => `<th>${renderSortButton(monthLabels[idx + 1], `m${idx + 1}`, "expenseSortKey", "expenseSortDir", "desc")}</th>`).join("")}
    <th>${renderSortButton("Toplam", "total", "expenseSortKey", "expenseSortDir", "desc")}</th>
    <th>${renderSortButton("Ort.", "avg", "expenseSortKey", "expenseSortDir", "desc")}</th>
    <th>${renderSortButton("Boş Ay", "zeroCount", "expenseSortKey", "expenseSortDir", "asc")}</th>
  </tr>`;
  q("#expenseBody").innerHTML = metrics.map(row => `
    <tr>
      <td>${esc(row.label)}</td>
      ${row.months.map((value, idx) => `
        <td class="expense-cell ${isExpenseCellEdited(row.label, idx, value, row.rowIndex) ? "expense-cell-edited" : ""}" data-row="${row.rowIndex}" data-month="${idx}" title="Cift tik veya sag tik ile sifreli duzenle">
          <span class="expense-cell-value">${money(value)}</span>
          ${isExpenseCellEdited(row.label, idx, value, row.rowIndex) ? `<button class="expense-undo" type="button" data-row="${row.rowIndex}" data-month="${idx}" title="Kaynak degere don">Geri</button>` : ""}
        </td>
      `).join("")}
      <td><strong>${money(row.total)}</strong></td>
      <td>${money(row.avg)}</td>
      <td>${num(row.zeroCount)}</td>
    </tr>
  `).join("") || `<tr><td colspan="16">Gider kaydı yok.</td></tr>`;
  q("#expenseMeta").textContent = `${metrics.length.toLocaleString("tr-TR")} gider kalemi • Basliklardan siralanir • Ay hucreleri sadece cift tik/sag tik ile sifreli degistirilir • Manuel degisen hucrelerde Geri butonu gorunur`;
}

function renderControl() {
  const summary = yearConfidenceSummary(state.year);
  const audit = buildDetailLayerAudit(state.year);
  const checks = DATA.controls[state.year] || [];
  const sourceFiles = (loadImports().files || []).filter(file => (file.years || []).includes(String(state.year)));
  const systemChecks = [
    {
      key: "detailRevenue",
      label: "Detay ciro = Ozet toplam ciro",
      left: summary.detailRevenue,
      right: safe(currentYearData().overview?.totalRevenue)
    },
    {
      key: "expenseRows",
      label: "Gider satirlari = Ozet toplam gider",
      left: safe((currentYearData().expenseRows || DATA.expenseRows || []).reduce((sum, row) => sum + safe(row?.[13]), 0)),
      right: safe(currentYearData().overview?.totalExpense)
    },
    {
      label: "Boş müşteri satırı",
      key: "blankCustomer",
      left: summary.blankCustomerCount,
      right: 0
    },
    {
      label: "Boş fatura satırı",
      key: "blankInvoice",
      left: summary.blankInvoiceCount,
      right: 0
    },
    {
      label: "Tamamen kimliksiz satir",
      key: "orphan",
      left: audit.combined.orphanCount,
      right: 0
    }
  ];
  const renderedChecks = [...checks.map((check, index) => ({ ...check, key: check.key || `static-${index}` })), ...systemChecks];
  const problemRows = buildAuditProblemRows(state.year, 10, audit);
  const problemBlock = audit.problemGroups.length
    ? `
      <div class="control-trace">
        <div class="control-trace-head">
          <strong>Kimlik boşluğu izleme</strong>
          <span>${num(audit.problemGroups.length)} kaynakta iz var</span>
        </div>
        <div class="control-trace-list">
          ${audit.problemGroups.slice(0, 8).map(group => `
            <div class="control-trace-item">
              <strong>${esc(group.sourceFile)}</strong>
              <div class="control-trace-meta">
                <span>Satır ${num(group.count)}</span>
                <span>Boş müşteri ${num(group.blankCustomerCount)}</span>
                <span>Boş fatura ${num(group.blankInvoiceCount)}</span>
                <span>Yetim ${num(group.orphanCount)}</span>
              </div>
            </div>
          `).join("")}
        </div>
        ${problemRows.length ? `
          <div class="control-trace-samples">
            ${problemRows.map(row => `
              <div class="control-trace-sample">
                <strong>${esc(row.sourceFile || "Kaynak yok")}</strong>
                <span>${esc(row.date || "Tarih yok")} • ${esc(row.invoiceNo || "Fatura yok")} • ${esc(row.product || "Urun yok")} • ${money(row.amount)}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `
    : `
      <div class="control-trace ok">
        <div class="control-trace-head">
          <strong>Kimlik boşluğu izleme</strong>
          <span>Seçili yıl için kayıtsız satır izi bulunmadı.</span>
        </div>
      </div>
    `;
  const sourceBlock = `
    <div class="control-summary">
      <div class="control-summary-head ${summary.status}">
        <strong>${summary.statusLabel}</strong>
        <span>${summary.statusReason}</span>
      </div>
      <div class="control-summary-meta">
        <span>Detay satir: ${num(summary.salesRowCount)}</span>
        <span>Fatura: ${num(summary.invoiceCount)}</span>
        <span>Ozet ay: ${summary.loadedMonths.length ? monthSpanText(summary.loadedMonths) : "yok"}</span>
        <span>Detay ay: ${summary.detailMonthsLoaded.length ? monthSpanText(summary.detailMonthsLoaded) : "yok"}</span>
        <span>Statik detay: ${num(audit.static.rowCount)}</span>
        <span>Ice aktarilan: ${num(audit.imported.rowCount)}</span>
        <span>Birlesik ciro: ${money(audit.combined.revenue)}</span>
        <span>Kaynak: ${esc(summary.sourceNote || "Kaynak notu yok")}</span>
      </div>
    </div>
  `;
  const fileBlock = sourceFiles.length ? `
    <div class="control-trace">
      <div class="control-trace-head">
        <strong>Kaynak Excel Dosyaları</strong>
        <span>${num(sourceFiles.length)} dosya bu yıla bağlandı</span>
      </div>
      <div class="import-file-grid">
        ${sourceFiles.slice().reverse().map(file => `
          <div class="import-file-card ${file.status}">
            <div class="import-file-head">
              <strong>${esc(file.fileName)}</strong>
              <span>${file.type === "sales" ? "Satış" : "Gider"}</span>
            </div>
            <div class="import-file-metrics">
              <span>Ay: ${esc(file.months || "—")}</span>
              <span>Satır: ${num(file.rowCount)}</span>
              <span>Fatura: ${num(file.invoiceCount || 0)}</span>
              <span>Ciro: ${money(file.revenue)}</span>
              <span>Gider: ${money(safe(file.expense) + safe(file.payroll))}</span>
              <span>Durum: ${file.status === "ready" ? "Hazır" : "Takip"}</span>
            </div>
            ${(file.warnings || []).length ? `<div class="import-file-warnings">${file.warnings.map(esc).join(" • ")}</div>` : `<div class="import-file-ok">Kontrol için hazır</div>`}
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";
  q("#controlList").innerHTML = sourceBlock + fileBlock + problemBlock + renderedChecks.map(c => {
    const diff = safe(c.left) - safe(c.right);
    const pass = Math.abs(diff) < 1;
    return `<button class="control-item ${pass ? "pass" : "fail"}" type="button" data-check="${esc(c.key)}" data-label="${esc(c.label)}" title="Fark detayını aç">
      <strong>${c.label}</strong>
      <div class="control-values">
        <span>Sol: ${money(c.left)}</span>
        <span>Sağ: ${money(c.right)}</span>
        <span>Fark: ${money(diff)}</span>
      </div>
    </button>`;
  }).join("");
  renderAuditLogPanel();
}

async function workbookRows(file) {
  if (!window.XLSX) throw new Error("Excel okuyucu yüklenemedi. İnternet bağlantısını kontrol edin.");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheets = [];
  wb.SheetNames.forEach(name => {
    sheets.push({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false }) });
  });
  return sheets;
}

async function parseSalesFile(file) {
  const sheets = await workbookRows(file);
  const parsed = [];
  sheets.forEach(sheet => {
    const headerIndex = sheet.rows.findIndex(row => {
      const joined = row.map(normalizeText).join("|");
      return joined.includes("FATURA TAR") && joined.includes("MALIN/HIZMETIN CINSI");
    });
    if (headerIndex < 0) return;
    const headers = sheet.rows[headerIndex].map(normalizeText);
    const findIdx = (labels, preferredIndex = -1) => {
      if (preferredIndex >= 0) return preferredIndex;
      for (const label of labels) {
        const exact = headers.findIndex(h => h === label);
        if (exact >= 0) return exact;
      }
      return headers.findIndex(h => labels.some(label => h.includes(label)));
    };
    const salesIdx = chooseSalesColumnIndices(headers);
    const idx = {
      ...salesIdx,
      date: findIdx(["FATURA TAR"], salesIdx.date),
      no: findIdx(["FATURA NO"], salesIdx.no),
      cari: findIdx(["CARI KODU"], salesIdx.cari),
      unvan: findIdx(["UNVANI"], salesIdx.unvan),
      code: findIdx(["KOD"], salesIdx.code),
      unit: salesIdx.rightUnit,
      vat: findIdx(["KDV TUTARI"]),
      total: findIdx(["GENEL TOPLAM"])
    };
    const carry = { date: null, no: "", cari: "", unvan: "" };
    const sheetMonthHint = inferMonthFromText(sheet.name) || inferMonthFromText(file.name) || null;
    const inferredYear = Number(inferYear(`${file.name} ${sheet.name}`, state.year));
    sheet.rows.slice(headerIndex + 1).forEach(row => {
      const normalizedRow = normalizeText(row.join(" "));
      if (!normalizedRow || normalizedRow.startsWith("---")) return;
      if (normalizedRow.includes("FATURA TAR") && normalizedRow.includes("FATURA NO")) return;
      if (["GEN.TOPL", "LISTELENEN", "ARA TOPLAM", "SAYFA TOPLAMI", "GENEL TOPLAM", "TOPLAM"].some(token => normalizedRow.includes(token))) return;
      const monthHint = monthFromHeader(row[idx.ay]) || inferMonthFromText(row[idx.ay]) || sheetMonthHint;
      const nextDate = parseDateValueWithHint(row[idx.date], monthHint, Number.isFinite(inferredYear) ? inferredYear : null);
      if (nextDate) carry.date = nextDate;
      const nextNo = String(row[idx.no] ?? "").trim();
      const nextCari = String(row[idx.cari] ?? "").trim();
      const nextUnvan = String(row[idx.unvan] ?? "").trim();
      if (nextNo) carry.no = nextNo;
      if (nextCari) carry.cari = nextCari;
      if (nextUnvan) carry.unvan = nextUnvan;

      const code = String(row[idx.code] ?? "").trim();
      const leftProduct = String(row[idx.leftProduct] ?? "").trim();
      const rightProduct = String(row[idx.rightProduct] ?? "").trim();
      const product = leftProduct || rightProduct;
      const amountValue = nullableNumber(row[idx.leftAmount]);
      const fallbackAmountValue = nullableNumber(row[idx.rightAmount]);
      const qtyValue = nullableNumber(row[idx.leftQty]);
      const fallbackQtyValue = nullableNumber(row[idx.rightQty]);
      const priceValue = nullableNumber(row[idx.leftPrice]);
      const fallbackPriceValue = nullableNumber(row[idx.rightPrice]);
      const tutar = amountValue ?? fallbackAmountValue ?? 0;
      const miktar = qtyValue ?? fallbackQtyValue ?? 0;
      const fiyat = priceValue ?? fallbackPriceValue ?? 0;
      const birim = String(row[idx.unit] || row[idx.rightUnit] || "").trim();
      const hasIdentity = [row[idx.date], row[idx.no], row[idx.cari], row[idx.unvan]].some(value => String(value ?? "").trim());
      const hasLineContent = Boolean(product || code) || tutar !== 0 || miktar !== 0 || fiyat !== 0;
      if (!hasLineContent) return;
      if (!carry.date) return;
      if (!hasIdentity && !carry.no && !code) return;

      const date = new Date(`${carry.date}T00:00:00`);
      parsed.push({
        sourceFile: file.name,
        tarih: carry.date,
        yil: String(date.getFullYear()),
        ay: date.getMonth() + 1,
        faturaNo: carry.no,
        cariKodu: carry.cari,
        unvan: carry.unvan,
        kod: code,
        urun: product,
        kategori: categoryFrom(code, product, birim),
        miktar,
        birim,
        fiyat,
        tutar,
        kdv: toNumber(row[idx.vat]),
        genelToplam: toNumber(row[idx.total])
      });
    });
  });
  return parsed;
}

function parsePayrollSheets(sheets, fileName) {
  const payrollRows = [];
  const expenseRows = [];
  sheets.forEach(sheet => {
    const headerIndex = sheet.rows.findIndex(row => {
      const joined = row.map(normalizeText).join("|");
      return joined.includes("ADI SOYADI") && (joined.includes("N.ODENEN") || joined.includes("N ODENEN") || joined.includes("TOP.KAZANC"));
    });
    if (headerIndex < 0) return;
    const headers = sheet.rows[headerIndex].map(normalizeText);
    const findIdx = labels => headers.findIndex(h => labels.some(label => h.includes(label)));
    const idx = {
      name: findIdx(["ADI SOYADI"]),
      net: findIdx(["N.ODENEN", "N ODENEN"]),
      gross: findIdx(["TOP.KAZANC"]),
      days: findIdx(["T.GUN"]),
      base: findIdx(["AYLIK UCRET"])
    };
    const periodText = `${sheet.name} ${fileName}`;
    const year = Number(inferYear(periodText, state.year));
    const month = inferMonthFromText(periodText);
    const company = String(sheet.rows[0]?.[2] || "").trim();
    let monthGross = 0;
    sheet.rows.slice(headerIndex + 1).forEach(row => {
      const employee = String(row[idx.name] || "").trim();
      if (!employee) return;
      const net = toNumber(row[idx.net]);
      const gross = toNumber(row[idx.gross]);
      const base = toNumber(row[idx.base]);
      const days = toNumber(row[idx.days]);
      if (!gross && !net && !base) return;
      monthGross += gross || net;
      payrollRows.push({
        sourceFile: fileName,
        year,
        month,
        employee,
        gross,
        net,
        base,
        days,
        company
      });
    });
    if (year && month && monthGross) {
      expenseRows.push({
        sourceFile: fileName,
        year: String(year),
        month,
        kategori: "MAAŞ GİDERLERİ",
        tutar: monthGross
      });
    }
  });
  return { payrollRows, expenseRows };
}

async function parseExpenseFile(file) {
  const sheets = await workbookRows(file);
  const payrollParsed = parsePayrollSheets(sheets, file.name);
  if (payrollParsed.payrollRows.length) return payrollParsed;
  const expenseRows = [];
  const year = inferYear(file.name);
  sheets.forEach(sheet => {
    const headerIndex = sheet.rows.findIndex(row => row.map(monthFromHeader).filter(Boolean).length >= 3);
    if (headerIndex < 0) return;
    const monthCols = sheet.rows[headerIndex].map((cell, idx) => ({ idx, month: monthFromHeader(cell) })).filter(c => c.month);
    sheet.rows.slice(headerIndex + 1).forEach(row => {
      const category = String(row[0] || "").trim();
      const n = normalizeText(category);
      if (!category || n.includes("TOPLAM")) return;
      monthCols.forEach(col => {
        const amount = toNumber(row[col.idx]);
        if (!amount) return;
        expenseRows.push({ sourceFile: file.name, year, month: col.month, kategori: category, tutar: amount });
      });
    });
  });
  return { expenseRows, payrollRows: [] };
}

function dedupeRows(rows, keyFn) {
  const seen = new Set();
  return rows.filter(row => {
    const key = keyFn(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fileMonthsText(rows, yearKey = "year", monthKey = "month") {
  const months = uniqueMonths(rows.map(row => row[monthKey] ?? row.ay));
  return monthSpanText(months);
}

function buildImportFileRecord(file, type, result) {
  const salesRows = result.salesRows || result.rows || [];
  const expenseRows = result.expenseRows || [];
  const payrollRows = result.payrollRows || [];
  const allRows = [...salesRows, ...expenseRows, ...payrollRows];
  const years = [...new Set(allRows.map(row => String(row.yil ?? row.year ?? "")).filter(Boolean))].sort();
  const invoices = new Set(salesRows.map(row => row.faturaNo).filter(Boolean));
  const blankCustomers = salesRows.filter(row => !hasMeaningfulIdentityValue(row.unvan) && !hasMeaningfulIdentityValue(row.cariKodu)).length;
  const blankInvoices = salesRows.filter(row => !hasMeaningfulIdentityValue(row.faturaNo)).length;
  const revenue = salesRows.reduce((sum, row) => sum + safe(row.tutar), 0);
  const qty = salesRows.reduce((sum, row) => sum + safe(row.miktar), 0);
  const expense = expenseRows.reduce((sum, row) => sum + safe(row.tutar), 0);
  const payroll = payrollRows.reduce((sum, row) => sum + safe(row.gross || row.net), 0);
  const rowCount = salesRows.length + expenseRows.length + payrollRows.length;
  const warnings = [];
  if (!rowCount) warnings.push("Okunan satır yok");
  if (type === "sales" && blankCustomers) warnings.push(`${num(blankCustomers)} müşteri boş`);
  if (type === "sales" && blankInvoices) warnings.push(`${num(blankInvoices)} fatura boş`);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: file.name,
    type,
    importedAt: new Date().toISOString(),
    size: file.size || 0,
    years,
    months: fileMonthsText(allRows),
    rowCount,
    salesRows: salesRows.length,
    expenseRows: expenseRows.length,
    payrollRows: payrollRows.length,
    invoiceCount: invoices.size,
    qty,
    revenue,
    expense,
    payroll,
    blankCustomers,
    blankInvoices,
    status: warnings.length ? "warn" : "ready",
    warnings
  };
}

function dedupeFileRecords(records = []) {
  const seen = new Set();
  return records.filter(record => {
    const key = `${record.fileName}|${record.type}|${record.rowCount}|${Math.round(safe(record.revenue))}|${Math.round(safe(record.expense))}|${Math.round(safe(record.payroll))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function refreshDataFromImports(imports) {
  recomputeData({ imports });
  populateMonthSelect();
}

function renderImport() {
  const body = q("#importPreviewBody");
  if (!body) return;
  const imports = loadImports();
  const previewCard = body.closest(".card");
  let fileCards = q("#importFileCards");
  if (!fileCards && previewCard) {
    fileCards = document.createElement("div");
    fileCards.id = "importFileCards";
    fileCards.className = "import-file-grid";
    previewCard.insertBefore(fileCards, previewCard.querySelector(".table-wrap"));
  }
  const grouped = new Map();
  imports.salesRows.forEach(r => {
    const key = `${r.yil}|${r.ay}|${r.kategori}`;
    const item = grouped.get(key) || { year: r.yil, month: r.ay, category: r.kategori, count: 0, adet: 0, ciro: 0, gider: 0 };
    item.count += 1; item.adet += safe(r.miktar); item.ciro += safe(r.tutar);
    grouped.set(key, item);
  });
  imports.expenseRows.forEach(r => {
    const key = `${r.year}|${r.month}|GİDER`;
    const item = grouped.get(key) || { year: r.year, month: r.month, category: "GİDER", count: 0, adet: 0, ciro: 0, gider: 0 };
    item.gider += safe(r.tutar);
    grouped.set(key, item);
  });
  const rows = [...grouped.values()].sort((a, b) => String(a.year).localeCompare(String(b.year)) || a.month - b.month || a.category.localeCompare(b.category, "tr"));
  body.innerHTML = rows.map(r => `
    <tr><td>${r.year}</td><td>${monthLabels[r.month] || r.month}</td><td>${r.category}</td><td>${num(r.count)}</td><td>${num(r.adet, 3)}</td><td>${money(r.ciro)}</td><td>${money(r.gider)}</td></tr>
  `).join("") || `<tr><td colspan="7">Henüz içe aktarılan dosya yok.</td></tr>`;
  q("#importSummary").innerHTML = `
    <span class="summary-pill">${num(imports.salesRows.length)} satış satırı</span>
    <span class="summary-pill">${num(imports.expenseRows.length)} gider satırı</span>
    <span class="summary-pill">${num(imports.payrollRows.length)} bordro satırı</span>
    <span class="summary-pill">${num(new Set(imports.salesRows.map(r => r.faturaNo).filter(Boolean)).size)} fatura</span>
    <span class="summary-pill">${num((imports.files || []).length)} kaynak dosya</span>
  `;
  if (fileCards) {
    const records = (imports.files || []).slice().reverse();
    fileCards.innerHTML = records.map(file => `
      <div class="import-file-card ${file.status}">
        <div class="import-file-head">
          <strong>${esc(file.fileName)}</strong>
          <span>${file.type === "sales" ? "Satış" : "Gider"}</span>
        </div>
        <div class="import-file-metrics">
          <span>Yıl: ${esc((file.years || []).join(", ") || "—")}</span>
          <span>Ay: ${esc(file.months || "—")}</span>
          <span>Satır: ${num(file.rowCount)}</span>
          <span>Fatura: ${num(file.invoiceCount || 0)}</span>
          <span>Ciro: ${money(file.revenue)}</span>
          <span>Gider: ${money(safe(file.expense) + safe(file.payroll))}</span>
        </div>
        ${(file.warnings || []).length ? `<div class="import-file-warnings">${file.warnings.map(esc).join(" • ")}</div>` : `<div class="import-file-ok">Kontrol için hazır</div>`}
      </div>
    `).join("") || `<div class="import-file-empty">Henüz kaynak dosya işlenmedi.</div>`;
  }
  q("#importLog").innerHTML = state.importLog.map(item => `<div>${item}</div>`).join("") || "Hazır.";
}

async function processImports() {
  const salesFiles = [...(q("#salesFiles")?.files || [])];
  const expenseFiles = [...(q("#expenseFiles")?.files || [])];
  if (!salesFiles.length && !expenseFiles.length) {
    state.importLog.unshift("Dosya seçilmedi.");
    renderImport();
    return;
  }
  const imports = loadImports();
  let addedSales = 0;
  let addedExpenses = 0;
  let addedPayroll = 0;
  imports.files = Array.isArray(imports.files) ? imports.files : [];
  for (const file of salesFiles) {
    const rows = await parseSalesFile(file);
    imports.salesRows.push(...rows);
    imports.files.push(buildImportFileRecord(file, "sales", { salesRows: rows }));
    addedSales += rows.length;
    state.importLog.unshift(`${file.name}: ${num(rows.length)} satış satırı okundu.`);
  }
  for (const file of expenseFiles) {
    const parsed = await parseExpenseFile(file);
    imports.expenseRows.push(...parsed.expenseRows);
    imports.payrollRows.push(...parsed.payrollRows);
    imports.files.push(buildImportFileRecord(file, "expense", parsed));
    addedExpenses += parsed.expenseRows.length;
    addedPayroll += parsed.payrollRows.length;
    state.importLog.unshift(`${file.name}: ${num(parsed.expenseRows.length)} gider, ${num(parsed.payrollRows.length)} bordro satırı okundu.`);
  }
  imports.salesRows = dedupeRows(imports.salesRows, r => `${r.tarih}|${r.faturaNo}|${r.cariKodu}|${r.kod}|${r.urun}|${r.miktar}|${r.tutar}`);
  imports.expenseRows = dedupeRows(imports.expenseRows, r => `${r.year}|${r.month}|${r.kategori}|${r.tutar}|${r.sourceFile}`);
  imports.payrollRows = dedupeRows(imports.payrollRows, r => `${r.year}|${r.month}|${r.employee}|${r.gross}|${r.net}|${r.sourceFile}`);
  imports.files = dedupeFileRecords(imports.files);
  saveImports(imports);
  refreshDataFromImports(imports);
  const latestYear = [...new Set(imports.salesRows.map(r => r.yil).concat(imports.expenseRows.map(r => String(r.year))))].sort().pop();
  if (latestYear) state.year = latestYear;
  state.month = "all";
  populateMonthSelect();
  state.importLog.unshift(`Tamamlandı: ${num(addedSales)} satış, ${num(addedExpenses)} gider, ${num(addedPayroll)} bordro satırı işlendi.`);
  logAudit({
    action_type: "import",
    entity: `import:${salesFiles.map(f => f.name).concat(expenseFiles.map(f => f.name)).join(",")}`,
    year: state.year,
    new_value: { addedSales, addedExpenses, addedPayroll },
    note: `${salesFiles.length} satış + ${expenseFiles.length} gider dosyası`
  });
  render();
}

function exportImports() {
  const blob = new Blob([JSON.stringify(loadImports(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rapor-merkezi-iceri-aktarim-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function assertXlsxReady() {
  if (!window.XLSX) throw new Error("Excel okuyucu yuklenemedi.");
}

function addWorkbookSheet(wb, name, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

function exportEditWorkbook() {
  try {
    assertXlsxReady();
    const wb = XLSX.utils.book_new();
    addWorkbookSheet(wb, "Ayarlar", [
      ["FORMAT", EDIT_WORKBOOK_MARKER],
      ["GeneratedAt", new Date().toISOString()],
      ["PasswordRequired", "2909"],
      ["Note", "Bu dosya ham satis/gider yukleme dosyasi degildir; sadece manuel duzeltme katmanini gunceller."]
    ]);

    const expenseRows = [["MODULE", "YEAR", "KATEGORI", "AY_NO", "AY", "DEGER"]];
    Object.keys(DATA.years || {}).sort().forEach(year => {
      (DATA.years[year].expenseRows || []).forEach(row => {
        for (let idx = 0; idx < 12; idx += 1) {
          expenseRows.push(["GIDER", year, row[0], idx + 1, monthLabels[idx + 1], safe(row[idx + 1])]);
        }
      });
    });
    addWorkbookSheet(wb, "Giderler", expenseRows);

    const costRows = [["MODULE", "YEAR", "WKOD", "URUN", "KATEGORI", "PB", "BASE_PRICE", "AY_NO", "AY", "DEGER"]];
    (DATA.costRows || []).forEach(row => {
      ["2025", "2026"].forEach(year => {
        const months = costMonthsForYear(row, year);
        for (let idx = 0; idx < 12; idx += 1) {
          costRows.push(["MALIYET", year, row.WKOD, formatCostProduct(row), row.KATEGORİ || row["KATEGORİ"] || row["KATEGORÄ°"] || "", normalizeCurrency(row.Currency), safe(row.Base_Price), idx + 1, monthLabels[idx + 1], safe(months?.[idx])]);
        }
      });
    });
    addWorkbookSheet(wb, "Maliyetler", costRows);

    const incomeRows = [["YEAR", "BOLUM", "KALEM", "AY_NO", "AY", "DEGER"]];
    Object.keys(DATA.years || {}).sort().forEach(year => {
      const yearData = DATA.years[year];
      (yearData.yonPlus || []).forEach(monthData => {
        (monthData.categories || []).forEach(category => {
          incomeRows.push([year, "SATIS", category.name, monthData.month, monthData.label, safe(category.ciro)]);
          incomeRows.push([year, "MIKTAR", category.name, monthData.month, monthData.label, safe(category.adet)]);
          incomeRows.push([year, "SATIS_MALIYETI", category.name, monthData.month, monthData.label, safe(category.maliyet)]);
        });
        incomeRows.push([year, "TOPLAM_SATIS", "TOPLAM", monthData.month, monthData.label, safe(monthData.total?.ciro)]);
        incomeRows.push([year, "TOPLAM_MALIYET", "TOPLAM", monthData.month, monthData.label, safe(monthData.total?.maliyet)]);
        incomeRows.push([year, "BRUT_KAR", "TOPLAM", monthData.month, monthData.label, safe(monthData.total?.kar)]);
        incomeRows.push([year, "TOPLAM_GIDER", "TOPLAM", monthData.month, monthData.label, expenseMonthTotal(yearData, monthData.month)]);
        incomeRows.push([year, "NET_KAR", "TOPLAM", monthData.month, monthData.label, safe(monthData.total?.kar) - expenseMonthTotal(yearData, monthData.month)]);
      });
    });
    addWorkbookSheet(wb, "Gelir_Tablosu", incomeRows);

    const masterRows = [["YEAR", "URUN_KODU", "URUN", "KATEGORI", "TADET", "TCIRO", "TMALIYET", "TKAR", "MARJ"]];
    (DATA.masterRows || []).forEach(row => {
      [["2025", row.totals25], ["2026", row.totals26]].forEach(([year, totals]) => {
        masterRows.push([year, row.code, row.name, row.category, safe(totals?.adet), safe(totals?.ciro), safe(totals?.maliyet), safe(totals?.kar), safe(totals?.marj)]);
      });
    });
    addWorkbookSheet(wb, "Master_ERP", masterRows);

    const customerRows = [["YEAR", "SIRA", "MUSTERI", "CIRO", "PAY"]];
    Object.keys(DATA.years || {}).sort().forEach(year => {
      visibleSalesCustomers(DATA.years[year].customers || []).forEach(customer => {
        customerRows.push([year, customer.rank, customer.name, safe(customer.ciro), safe(customer.pay)]);
      });
    });
    addWorkbookSheet(wb, "Musteriler", customerRows);

    const controlRows = [["YEAR", "KONTROL", "SOL", "SAG", "FARK", "DURUM"]];
    buildControlChecks().forEach(check => {
      controlRows.push([state.year, check.label, safe(check.left), safe(check.right), safe(check.diff), check.pass ? "OK" : "FARK"]);
    });
    addWorkbookSheet(wb, "Kontrol", controlRows);

    XLSX.writeFile(wb, `rapor-merkezi-duzeltme-${state.year}.xlsx`);
    state.importLog.unshift(`Excel duzeltme dosyasi disari aktarildi: ${state.year}`);
    renderImport();
  } catch (error) {
    window.alert(error.message);
  }
}

function readSheetRows(wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
}

function headerMap(headerRow = []) {
  const map = new Map();
  headerRow.forEach((name, idx) => map.set(normalizeText(name), idx));
  return map;
}

function cellByHeader(row, headers, label) {
  const idx = headers.get(normalizeText(label));
  return idx === undefined ? "" : row[idx];
}

function workbookHasEditMarker(wb) {
  return readSheetRows(wb, "Ayarlar").some(row => String(row[0] || "").trim() === "FORMAT" && String(row[1] || "").trim() === EDIT_WORKBOOK_MARKER);
}

function applyEditWorkbookRows(wb) {
  let expenseCount = 0;
  let costCount = 0;
  const expenseRows = readSheetRows(wb, "Giderler");
  if (expenseRows.length > 1) {
    const headers = headerMap(expenseRows[0]);
    expenseRows.slice(1).forEach(row => {
      const year = String(cellByHeader(row, headers, "YEAR") || "").trim();
      const label = String(cellByHeader(row, headers, "KATEGORI") || "").trim();
      const monthIndex = Number(cellByHeader(row, headers, "AY_NO")) - 1;
      const value = nullableNumber(cellByHeader(row, headers, "DEGER"));
      const yearData = DATA.years?.[year];
      if (!yearData || !label || monthIndex < 0 || monthIndex > 11 || value === null) return;
      const targetRow = (yearData.expenseRows || []).find(entry => sameLabel(entry[0], label));
      if (!targetRow) return;
      targetRow[monthIndex + 1] = value;
      targetRow[13] = Array.from({ length: 12 }, (_, idx) => safe(targetRow[idx + 1])).reduce((sum, item) => sum + item, 0);
      persistExpenseRowEdit(year, targetRow);
      expenseCount += 1;
    });
  }
  const costRows = readSheetRows(wb, "Maliyetler");
  if (costRows.length > 1) {
    const headers = headerMap(costRows[0]);
    costRows.slice(1).forEach(row => {
      const year = String(cellByHeader(row, headers, "YEAR") || "").trim();
      const wkod = String(cellByHeader(row, headers, "WKOD") || "").trim();
      const monthIndex = Number(cellByHeader(row, headers, "AY_NO")) - 1;
      const value = nullableNumber(cellByHeader(row, headers, "DEGER"));
      const targetRow = (DATA.costRows || []).find(entry => String(entry.WKOD ?? "") === wkod);
      const months = costMonthsForYear(targetRow, year);
      if (!targetRow || !Array.isArray(months) || monthIndex < 0 || monthIndex > 11 || value === null) return;
      months[monthIndex] = value;
      persistCostRowEdit(year, wkod, months);
      costCount += 1;
    });
  }
  recomputeData();
  return { expenseCount, costCount };
}

async function importEditWorkbookFile(file) {
  try {
    assertXlsxReady();
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    if (!workbookHasEditMarker(wb)) {
      window.alert("Bu dosya rapor merkezi duzeltme dosyasi degil. Ham satis/gider dosyalari bu alandan yuklenmez.");
      return;
    }
    if (!ensureEditPassword()) return;
    const result = applyEditWorkbookRows(wb);
    state.importLog.unshift(`${file.name}: ${num(result.expenseCount)} gider, ${num(result.costCount)} maliyet duzeltmesi uygulandi.`);
    populateMonthSelect();
    render();
  } catch (error) {
    window.alert(`Excel duzeltme ice aktarimi basarisiz: ${error.message}`);
  }
}

function clearImports() {
  saveImports(defaultAppStateValue("imports"));
  recomputeData();
  state.importLog.unshift("Yerel içe aktarım verisi temizlendi.");
  populateMonthSelect();
  render();
}

function updateHeader() {
  const meta = {
    overview:["Genel Bakış","Yıl geçişli ve karşılaştırmalı özet"],
    yonplus:["YÖN_PLUS","Aylık bloklar ve kategori performansı"],
    yonrapor:["YÖN_RAPOR","Yıllık özet, kar zinciri ve üst müşteri listesi"],
    strategic:["Stratejik Analiz","Yıllık karşılaştırma, kar köprüsü, aylık trend ve müşteri yoğunlaşması"],
    categories:["Kategori Karlılığı","Kategori bazlı ciro, maliyet ve kâr"],
    customers:["Müşteri Analizi","Yıllık müşteri ciro kırılımı"],
    master:["MASTER_ERP","Tekil ürün maliyetleme ve reçete alanları"],
    costs:["Maliyetler","WKOD maliyetleri, urun eskalasyonu ve yillik MDF / SUNTA baz girisi"],
    expenses:["Giderler","2025 genel gider tablosu"],
    import:["İçe Aktar","Haftalık satış ve gider Excel dosyalarını rapora işle"],
    control:["Kontrol","Toplamlar arası doğrulama ekranı"]
  }[state.view];
  q("#pageTitle").textContent = meta[0];
  q("#pageSubtitle").textContent = state.view === "overview" ? "Gelir tablosu ve denetim özeti" : meta[1];
  q("#lastUpdate").textContent = `Son versiyon: ${formatVersionStamp(DATA.meta)}`;
}

function syncDebugState() {
  window.__RAPOR_DEBUG__ = {
    activeYear: state.year,
    generatedAt: DATA?.meta?.generatedAt || "",
    detailAudit: (year = state.year) => cloneData(buildDetailLayerAudit(year)),
    problemRows: (year = state.year, limit = 25) => cloneData(buildAuditProblemRows(year, limit)),
    yearConfidence: (year = state.year) => cloneData(yearConfidenceSummary(year)),
    importSnapshot: () => cloneData(loadImports()),
    clearLocalImports: () => clearImports()
  };
}

function render() {
  applyYearTheme();
  renderYearNotice();
  updateHeader();
  renderOverview();
  if (state.view === "yonplus") renderYONPlus();
  if (state.view === "yonrapor") renderYONRapor();
  if (state.view === "strategic") renderStrategic();
  if (state.view === "categories") renderCategoryProfit();
  if (state.view === "customers") renderCustomers();
  if (state.view === "master") renderMaster();
  if (state.view === "costs") renderCosts();
  if (state.view === "expenses") renderExpenses();
  if (state.view === "control") renderControl();
  if (state.view === "import") renderImport();
  qa(".view").forEach(v => v.classList.remove("active"));
  const activeViewEl = q(`#${state.view}View`);
  activeViewEl.classList.add("active");
  activeViewEl.querySelectorAll(".income-table-wrap, .table-wrap, .master-wrap, .cost-matrix-wrap, .product-cost-wrap").forEach(el => { el.scrollTop = 0; });
  qa(".menu-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === state.view));
  syncDebugState();
  repairRenderedText(q(".app-shell"));
}

function bind() {
  qa(".menu-item").forEach(btn => btn.addEventListener("click", () => { state.view = btn.dataset.view; render(); }));
  q("#incomeTable")?.addEventListener("click", async e => {
    const cell = e.target.closest(".income-value");
    if (!cell) return;
    if (e.ctrlKey && saveManualIncomeCell(cell)) return;
    if (!(await ensureDetailDataForInteraction())) return;
    const month = Number(cell.dataset.month);
    const item = cell.dataset.item || "";
    const kind = cell.dataset.kind || "sales";
    const labels = { sales: "Satış", qty: "Miktar", cost: "Maliyet", gross: "Brüt Kar", expense: "Gider", net: "Net Kar" };
    const payload = buildDetailPayload(kind, month, item);
    openCellDetail(`${labels[kind] || "Hücre"} Detayı`, `${state.year} • ${monthLabels[month]}${item ? " • " + item : ""}`, payload);
  });
  q("#incomeTable")?.addEventListener("contextmenu", e => {
    const cell = e.target.closest("td[data-editable]");
    if (!cell) return;
    e.preventDefault();
    if (cell.dataset.editable !== "1") {
      window.alert("Bu hücre hesaplanan / kilitli hücredir. Maliyet, eskalasyon ve sonuç rakamları manuel değiştirilemez.");
      return;
    }
    saveManualIncomeCell(cell);
  });
  q("#incomeTable")?.addEventListener("mouseover", e => {
    const cell = e.target.closest("td[data-tooltip]");
    if (cell) showIncomeHoverTip(cell, e);
  });
  q("#incomeTable")?.addEventListener("mousemove", e => {
    if (e.target.closest("td[data-tooltip]")) moveIncomeHoverTip(e);
  });
  q("#incomeTable")?.addEventListener("mouseout", e => {
    const cell = e.target.closest("td[data-tooltip]");
    if (cell && (!e.relatedTarget || !cell.contains(e.relatedTarget))) hideIncomeHoverTip();
  });
  q("#detailClose")?.addEventListener("click", () => {
    q("#cellDetailDrawer").classList.remove("open");
    q("#cellDetailDrawer").setAttribute("aria-hidden", "true");
  });
  q("#cellDetailDrawer")?.addEventListener("click", e => {
    if (e.target.id === "cellDetailDrawer") q("#detailClose").click();
  });
  q("#detailFilter")?.addEventListener("input", e => {
    state.detailFilter = e.target.value;
    renderCellDetails();
  });
  q("#detailBody")?.addEventListener("click", e => {
    const btn = e.target.closest(".detail-delete-btn");
    if (!btn) return;
    deleteExpenseDetailRow(btn.dataset.category, Number(btn.dataset.month));
  });
  q("#auditLogPanel")?.addEventListener("click", e => {
    const btn = e.target.closest(".audit-revert-btn");
    if (!btn) return;
    revertAuditEntry(btn.dataset.id);
  });
  q("#customerBody")?.addEventListener("click", async e => {
    const row = e.target.closest("[data-customer]");
    if (!row) return;
    if (!(await ensureDetailDataForInteraction())) return;
    const customer = row.dataset.customer || "";
    openCellDetail("Müşteri Satış Detayı", `${state.year} • ${customer}`, buildCustomerDetailPayload(customer));
  });
  q("#controlList")?.addEventListener("click", async e => {
    const item = e.target.closest("[data-check]");
    if (!item) return;
    if (!(await ensureDetailDataForInteraction())) return;
    openCellDetail("Kontrol Fark Detayı", item.dataset.label || "Kontrol", buildControlDetailPayload(item.dataset.check, item.dataset.label || "Kontrol"));
  });
  q("#overviewConfidence")?.addEventListener("click", async e => {
    const item = e.target.closest("[data-check]");
    if (!item) return;
    await ensureDetailDataLoaded();
    openCellDetail("Kontrol Fark Detayi", item.dataset.label || "Kontrol", buildControlDetailPayload(item.dataset.check, item.dataset.label || "Kontrol"));
  });
  const yearSelect = q("#yearSelect");
  yearSelect.innerHTML = Object.keys(DATA.years).map(y => `<option value="${y}">${y}</option>`).join("");
  yearSelect.value = state.year;
  yearSelect.addEventListener("change", e => {
    state.year = e.target.value;
    state.month = "all";
    state.masterPage = 1;
    state.expenseSortKey = "total";
    state.expenseSortDir = "desc";
    populateMonthSelect();
    render();
    ensureFxMatrixForYear(state.year).then(() => {
      recomputeData();
      render();
    });
  });

  q("#monthSelect").addEventListener("change", e => {
    state.month = e.target.value;
    state.masterPage = 1;
    state.expenseSortKey = state.month === "all" ? "total" : `m${state.month}`;
    state.expenseSortDir = "desc";
    render();
  });

  q("#masterSearch").addEventListener("input", e => { state.masterSearch = e.target.value; state.masterPage = 1; renderMaster(); });
  q("#masterCategory").addEventListener("change", e => { state.masterCategory = e.target.value; state.masterPage = 1; renderMaster(); });
  q("#masterMode")?.addEventListener("change", e => { state.masterMode = e.target.value; state.masterPage = 1; renderMaster(); });
  q("#masterPageSize").addEventListener("change", e => { state.masterPageSize = Number(e.target.value); state.masterPage = 1; renderMaster(); });
  q("#masterPrev").addEventListener("click", () => { state.masterPage = Math.max(1, state.masterPage - 1); renderMaster(); });
  q("#masterNext").addEventListener("click", () => { state.masterPage += 1; renderMaster(); });

  q("#costSearch").addEventListener("input", e => { state.costSearch = e.target.value; renderCosts(); });
  q("#costCurrency").addEventListener("change", e => { state.costCurrency = e.target.value; renderCosts(); });
  q("#costCategory")?.addEventListener("change", e => { state.costCategory = e.target.value; renderCosts(); });
  q("#annualCostSave")?.addEventListener("click", saveAnnualInputsFromForm);
  q("#annualCostClear")?.addEventListener("click", clearAnnualInputsForYear);
  q("#costBody")?.addEventListener("click", event => {
    const undoButton = event.target.closest(".cost-undo");
    if (undoButton) {
      event.stopPropagation();
      restoreCostCell(undoButton.dataset.wkod, Number(undoButton.dataset.month));
      return;
    }
    const explain = event.target.closest(".cost-explain");
    if (!explain) return;
    const row = costRowByCode(explain.dataset.wkod);
    if (!row) return;
    const month = Number(explain.dataset.month);
    openCellDetail(
      "Hammadde Maliyet Hesabı",
      `${state.year} • ${monthLabels[month]} • ${row.wkod} • ${row.formattedProduct || row.product}`,
      buildCostFormulaPayload(row, month)
    );
  });
  q("#costBody")?.addEventListener("dblclick", event => {
    const input = event.target.closest(".cost-input");
    if (!input) return;
    editCostCell(input.dataset.wkod, Number(input.dataset.month));
  });
  q("#costBody")?.addEventListener("contextmenu", event => {
    const input = event.target.closest(".cost-input");
    if (!input) return;
    event.preventDefault();
    editCostCell(input.dataset.wkod, Number(input.dataset.month));
  });
  q("#costBody")?.addEventListener("input", event => {
    const input = event.target.closest(".cost-input");
    if (!input) return;
    updateCostCell(input.dataset.wkod, Number(input.dataset.month), input.value, false);
  });
  q("#costBody")?.addEventListener("change", event => {
    const input = event.target.closest(".cost-input");
    if (!input) return;
    updateCostCell(input.dataset.wkod, Number(input.dataset.month), input.value, true);
  });
  q("#costBody")?.addEventListener("keydown", event => {
    const input = event.target.closest(".cost-input");
    if (!input || event.key !== "Enter") return;
    event.preventDefault();
    updateCostCell(input.dataset.wkod, Number(input.dataset.month), input.value, true);
    input.blur();
  });
  q("#costBody")?.addEventListener("keydown", event => {
    if (event.ctrlKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoLastCostEdit();
    }
  });
  const onSortClick = event => {
    const button = event.target.closest(".sort-header");
    if (!button) return;
    toggleSortState(button.dataset.stateKey, button.dataset.stateDir, button.dataset.sort, button.dataset.defaultDir || "asc");
    if (button.dataset.stateKey === "expenseSortKey") {
      renderExpenses();
      return;
    }
    renderCosts();
  };
  q("#costHead")?.addEventListener("click", onSortClick);
  q("#escalationHead")?.addEventListener("click", onSortClick);
  q("#productCostHead")?.addEventListener("click", onSortClick);
  q("#expenseHead")?.addEventListener("click", onSortClick);
  q("#expenseBody")?.addEventListener("click", event => {
    const undoButton = event.target.closest(".expense-undo");
    if (!undoButton) return;
    event.stopPropagation();
    restoreExpenseCell(Number(undoButton.dataset.row), Number(undoButton.dataset.month));
  });
  q("#expenseBody")?.addEventListener("dblclick", event => {
    const cell = event.target.closest(".expense-cell");
    if (!cell) return;
    editExpenseCell(Number(cell.dataset.row), Number(cell.dataset.month));
  });
  q("#expenseBody")?.addEventListener("contextmenu", event => {
    const cell = event.target.closest(".expense-cell");
    if (!cell) return;
    event.preventDefault();
    editExpenseCell(Number(cell.dataset.row), Number(cell.dataset.month));
  });
  q("#expenseBody")?.addEventListener("keydown", event => {
    if (event.ctrlKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoLastExpenseEdit();
    }
  });
  document.addEventListener("keydown", event => {
    if (state.view !== "expenses" || !event.ctrlKey || event.key.toLowerCase() !== "z") return;
    const target = event.target;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    event.preventDefault();
    undoLastExpenseEdit();
  });

  q("#importProcess")?.addEventListener("click", () => {
    processImports().catch(error => {
      state.importLog.unshift(`Hata: ${error.message}`);
      renderImport();
    });
  });
  q("#importExport")?.addEventListener("click", exportImports);
  q("#editWorkbookExport")?.addEventListener("click", exportEditWorkbook);
  q("#editWorkbookImport")?.addEventListener("click", () => q("#editWorkbookFile")?.click());
  q("#editWorkbookFile")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    importEditWorkbookFile(file);
  });
  q("#importClear")?.addEventListener("click", clearImports);
}

function applyYearTheme() {
  document.body.classList.remove("year-theme-2023", "year-theme-2024", "year-theme-2025", "year-theme-2026");
  document.body.classList.add(`year-theme-${state.year}`);
}

function populateMonthSelect() {
  const monthSelect = q("#monthSelect");
  monthSelect.innerHTML = `<option value="all">Tümü</option>` + availableMonths().map(m => `<option value="${m.value}">${m.label}</option>`).join("");
  monthSelect.value = state.month;
}

try {
  populateMonthSelect();
  bind();
  render();
  prefetchDetailDataSoon();
  bootstrapServerState().then(changed => {
    if (!changed) return;
    recomputeData();
    state.year = latestAvailableYear();
    populateMonthSelect();
    render();
  });
  ensureFxMatrixForYear(state.year).then(() => {
    recomputeData();
    populateMonthSelect();
    render();
  });
} catch (error) {
  if (typeof console !== "undefined") {
    console.warn("Dashboard bootstrap skipped (this page does not have the main dashboard DOM):", error.message);
  }
}

