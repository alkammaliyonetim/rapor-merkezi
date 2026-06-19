
const IMPORT_STORAGE_KEY = "raporMerkeziImportsV1";
const ANNUAL_INPUT_STORAGE_KEY = "raporMerkeziAnnualInputsV1";
const EXPENSE_EDIT_STORAGE_KEY = "raporMerkeziExpenseEditsV1";
const COST_EDIT_STORAGE_KEY = "raporMerkeziCostEditsV1";
const MANUAL_EDIT_STORAGE_KEY = "raporMerkeziManualEditsV1";
const EDIT_PASSWORD = "1906";
const BASE_DATA = window.REPORT_DATA;
const DETAIL_BASE = window.REPORT_DETAIL_DATA || { sales: [], payroll: [], payrollExpenseRows: [] };
let DATA = hydrateData(BASE_DATA);
let DETAIL_CACHE = null;
const state = { year: "2025", month: "all", view: "overview", masterPage: 1, masterPageSize: 50, masterSearch: "", masterCategory: "Tümü", masterMode: "summary", costSearch: "", costCurrency: "Tümü", costCategory: "Tümü", costSortKey: "yearTotal", costSortDir: "desc", escalationSortKey: "deltaPct", escalationSortDir: "desc", productCostSortKey: "totalCost", productCostSortDir: "desc", expenseSortKey: "total", expenseSortDir: "desc", importLog: [], detailPayload: null, detailFilter: "" };

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
  try {
    return decodeURIComponent(escape(text));
  } catch (error) {
    return text
      .replaceAll("Ãœ", "Ü").replaceAll("Ã¼", "ü")
      .replaceAll("Ã‡", "Ç").replaceAll("Ã§", "ç")
      .replaceAll("Ã–", "Ö").replaceAll("Ã¶", "ö")
      .replaceAll("Ä°", "İ").replaceAll("Ä±", "ı")
      .replaceAll("Åž", "Ş").replaceAll("ÅŸ", "ş")
      .replaceAll("Äž", "Ğ").replaceAll("ÄŸ", "ğ")
      .replaceAll("â€”", "—").replaceAll("â€¢", "•");
  }
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

function loadImports() {
  try {
    const raw = localStorage.getItem(IMPORT_STORAGE_KEY);
    if (!raw) return { salesRows: [], expenseRows: [], payrollRows: [] };
    const parsed = JSON.parse(raw);
    return {
      salesRows: Array.isArray(parsed.salesRows) ? parsed.salesRows : [],
      expenseRows: Array.isArray(parsed.expenseRows) ? parsed.expenseRows : [],
      payrollRows: Array.isArray(parsed.payrollRows) ? parsed.payrollRows : [],
      files: Array.isArray(parsed.files) ? parsed.files : []
    };
  } catch (error) {
    return { salesRows: [], expenseRows: [], payrollRows: [], files: [] };
  }
}

function saveImports(imports) {
  localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(imports));
}

function loadExpenseEdits() {
  try {
    const raw = localStorage.getItem(EXPENSE_EDIT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveExpenseEdits(edits) {
  localStorage.setItem(EXPENSE_EDIT_STORAGE_KEY, JSON.stringify(edits));
}

function loadCostEdits() {
  try {
    const raw = localStorage.getItem(COST_EDIT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveCostEdits(edits) {
  localStorage.setItem(COST_EDIT_STORAGE_KEY, JSON.stringify(edits));
}

function loadManualEdits() {
  try {
    const raw = localStorage.getItem(MANUAL_EDIT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveManualEdits(edits) {
  localStorage.setItem(MANUAL_EDIT_STORAGE_KEY, JSON.stringify(edits));
}

function loadAnnualInputs() {
  try {
    const raw = localStorage.getItem(ANNUAL_INPUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveAnnualInputs(values) {
  localStorage.setItem(ANNUAL_INPUT_STORAGE_KEY, JSON.stringify(values));
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

function hydrateData(base) {
  const data = cloneData(base);
  applyImportsToData(data, loadImports());
  applyExpenseEditsToData(data, loadExpenseEdits());
  applyManualEditsToData(data, loadManualEdits());
  applyCostEditsToData(data, loadCostEdits());
  return data;
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
      customers.set(r.unvan || "Tanımsız", safe(customers.get(r.unvan || "Tanımsız")) + safe(r.tutar));
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
  yearData.categories = (yearData.categories || []).map(category => {
    const rows = (yearData.yonPlus || []).map(month => (month.categories || []).find(item => item.name === category.name)).filter(Boolean);
    const ciro = rows.reduce((sum, row) => sum + safe(row.ciro), 0);
    const maliyet = rows.reduce((sum, row) => sum + safe(row.maliyet), 0);
    const kar = ciro - maliyet;
    return { ...category, ciro, maliyet, kar, marj: ciro ? kar / ciro : 0 };
  });
  if (!yearData.overview) return;
  yearData.overview.totalRevenue = totals.totalRevenue;
  yearData.overview.totalCost = totals.totalCost;
  yearData.overview.grossProfit = totals.grossProfit;
  yearData.overview.grossMargin = totals.totalRevenue ? totals.grossProfit / totals.totalRevenue : 0;
  yearData.overview.profitBeforeTax = totals.grossProfit - safe(yearData.overview.totalExpense);
  yearData.overview.netProfit = safe(yearData.overview.profitBeforeTax) - safe(yearData.overview.corporateTax);
  yearData.overview.netMargin = totals.totalRevenue ? safe(yearData.overview.netProfit) / totals.totalRevenue : 0;
}

function applyManualEditsToData(data, edits) {
  if (!data?.years || !edits || typeof edits !== "object") return;
  Object.entries(edits).forEach(([year, yearEdits]) => {
    const yearData = data.years[year];
    if (!yearData?.yonPlus || !yearEdits || typeof yearEdits !== "object") return;
    ["sales", "qty"].forEach(kind => {
      Object.entries(yearEdits[kind] || {}).forEach(([categoryName, monthValues]) => {
        if (!Array.isArray(monthValues)) return;
        for (let idx = 0; idx < 12; idx += 1) {
          const month = (yearData.yonPlus || []).find(entry => entry.month === idx + 1);
          const category = (month?.categories || []).find(entry => entry.name === categoryName);
          if (!category) continue;
          if (kind === "sales") category.ciro = safe(monthValues[idx]);
          if (kind === "qty") category.adet = safe(monthValues[idx]);
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

function applyCostEditsToData(data, edits) {
  if (!data?.costRows || !edits || typeof edits !== "object") return;
  data.costRows.forEach(row => {
    const wkod = String(row?.WKOD ?? "");
    if (!wkod) return;
    ["2025", "2026"].forEach(year => {
      const editedMonths = edits?.[year]?.[wkod];
      if (!Array.isArray(editedMonths)) return;
      const target = year === "2025" ? row.months25 : row.months26;
      if (!Array.isArray(target)) return;
      for (let idx = 0; idx < 12; idx += 1) target[idx] = safe(editedMonths[idx]);
    });
  });
}

function persistCostRowEdit(year, wkod, monthValues) {
  const code = String(wkod || "");
  if (!code) return;
  const edits = loadCostEdits();
  const yearKey = String(year);
  edits[yearKey] = edits[yearKey] || {};
  edits[yearKey][code] = Array.from({ length: 12 }, (_, idx) => safe(monthValues?.[idx]));
  saveCostEdits(edits);
}

function persistExpenseRowEdit(year, row) {
  const label = String(row?.[0] || "");
  if (!label) return;
  const edits = loadExpenseEdits();
  const yearKey = String(year);
  edits[yearKey] = edits[yearKey] || {};
  edits[yearKey][label] = Array.from({ length: 12 }, (_, idx) => safe(row[idx + 1]));
  saveExpenseEdits(edits);
}

function persistManualIncomeEdit(year, kind, itemName, month, value) {
  if (!["sales", "qty"].includes(kind) || !itemName || !month) return;
  const edits = loadManualEdits();
  const yearKey = String(year);
  edits[yearKey] = edits[yearKey] || {};
  edits[yearKey][kind] = edits[yearKey][kind] || {};
  const currentSeries = incomeMetricSeries(DATA.years[yearKey], kind, itemName);
  currentSeries[month - 1] = safe(value);
  edits[yearKey][kind][itemName] = currentSeries;
  saveManualEdits(edits);
}

function ensureEditPassword() {
  const password = window.prompt("Değişiklik şifresi");
  if (password === null) return false;
  if (password === EDIT_PASSWORD) return true;
  window.alert("Şifre hatalı. Hücre değiştirilmedi.");
  return false;
}

function manualCellValue(kind, month, itemName) {
  if (kind === "expense") {
    const row = (currentYearData().expenseRows || []).find(entry => entry[0] === itemName);
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
    const row = (currentYearData().expenseRows || []).find(entry => entry[0] === itemName);
    if (!row) return true;
    row[month] = nextValue;
    row[13] = Array.from({ length: 12 }, (_, idx) => safe(row[idx + 1])).reduce((sum, value) => sum + value, 0);
    persistExpenseRowEdit(state.year, row);
    recalcExpenseOverview(currentYearData());
  } else {
    persistManualIncomeEdit(state.year, kind, itemName, month, nextValue);
    DATA = hydrateData(BASE_DATA);
  }
  render();
  return true;
}

function formatVersionStamp(meta = {}) {
  const candidates = [meta.generatedAt, DETAIL_BASE?.meta?.generatedAt]
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()));
  const source = candidates.length ? new Date(Math.max(...candidates.map(date => date.getTime()))) : new Date();
  const dd = String(source.getDate()).padStart(2, "0");
  const mon = String(source.getMonth() + 1).padStart(2, "0");
  const yyyy = String(source.getFullYear());
  return `${dd}.${mon}.${yyyy}`;
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
  const closedMonths = numericYear < today.year ? monthRange(12) : (numericYear === today.year ? monthRange(Math.max(0, today.month - 1)) : []);
  const activeMonth = numericYear === today.year ? today.month : null;
  const futureMonths = numericYear === today.year ? Array.from({ length: Math.max(0, 12 - today.month) }, (_, idx) => today.month + idx + 1) : [];
  const closedMissingMonths = closedMonths.filter(month => !loadedMonths.includes(month));
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

  if (closedMissingMonths.length || expenseMissing || blankCustomerCount || blankInvoiceCount || Math.abs(revenueDiff) >= 1 || Math.abs(expenseDiff) >= 1) {
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
  } else if ((checks.length && controlPassCount < checks.length) || activeMonth) {
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
    closedMonths,
    activeMonth,
    futureMonths,
    closedMissingMonths,
    closedCoveredCount: Math.max(0, closedMonths.length - closedMissingMonths.length),
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
  return latestMonthIndex(DATA.costRows, (row, idx) => (state.year === "2025" ? row.months25 : row.months26)?.[idx]);
}

function rawMaterialCost(metric = {}) {
  return safe(metric.LG) + safe(metric.KAP1) + safe(metric.KAP2) + safe(metric.TUT);
}

function currentEscalationMonthIndex() {
  if (state.month !== "all") return Math.max(0, Number(state.month) - 1);
  return latestMonthIndex(DATA.costRows, (row, idx) => (state.year === "2025" ? row.months25 : row.months26)?.[idx]);
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
  const product = String(row.product ?? row.urun ?? "").trim();
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
    customerName: String(row.customerName ?? row.unvan ?? "").trim(),
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
    employee: String(row.employee ?? row.name ?? "").trim(),
    gross: safe(row.gross ?? row.value),
    net: safe(row.net),
    base: safe(row.base),
    days: safe(row.days),
    company: String(row.company ?? "").trim(),
    sourceFile: String(row.sourceFile || row.source || "Bordro").trim()
  };
}

function detailStore() {
  if (DETAIL_CACHE) return DETAIL_CACHE;
  const imports = loadImports();
  const salesRows = [...(DETAIL_BASE.sales || []).map(normalizeSalesDetailRow), ...(imports.salesRows || []).map(normalizeSalesDetailRow)]
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

function buildAuditProblemRows(year = state.year, limit = 12) {
  return buildDetailLayerAudit(year).problemRows
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
  const yearRows = store.salesRows.filter(row => String(row.year) === state.year);
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
  const customerRows = rows.filter(row => row.customerName && row.customerName !== "Kaynak detay satırı");
  const stats = [
    { label: "Satır", value: num(rows.length) },
    { label: "Hücre Değeri", value: valueText(displayKind, cellTotal, itemName && kind === "qty" ? rows[0]?.unit || defaultUnitForCategory(itemName) : "") },
    { label: "Ham Liste", value: valueText(displayKind, detailTotal, itemName && kind === "qty" ? rows[0]?.unit || defaultUnitForCategory(itemName) : "") },
    { label: "Müşteri", value: num(new Set(customerRows.map(row => row.customerName)).size) },
    { label: "Ürün", value: num(new Set(rows.map(row => row.product).filter(Boolean)).size) }
  ];
  const insights = [
    { title: "En Çok Kime Satıldı", kind: displayKind, items: buildTopList(customerRows.length ? customerRows : rows, row => row.customerName, row => row.metricValue) },
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

function expenseSummaryRows(yearData, month, itemName) {
  return (yearData.expenseRows || DATA.expenseRows || [])
    .filter(row => !itemName || sameLabel(row[0], itemName))
    .map(row => ({
      category: row[0],
      amount: safe(row[month]),
      sourceFile: yearData.meta?.source || "report-data.js"
    }))
    .filter(row => row.amount);
}

function buildExpenseDetailPayload(month, itemName) {
  const yearData = currentYearData();
  const payrollRows = detailStore().payrollRows.filter(row => String(row.year) === state.year && Number(row.month) === month);
  if (itemName && sameLabel(itemName, "MAAŞ GİDERLERİ") && payrollRows.length) {
    const yearPayroll = detailStore().payrollRows.filter(row => String(row.year) === state.year);
    return {
      columns: [
        { key: "employee", label: "Personel" },
        { key: "days", label: "Gün", format: "number" },
        { key: "base", label: "Aylık Ücret", format: "money" },
        { key: "gross", label: "Brüt", format: "money" },
        { key: "net", label: "Net", format: "money" },
        { key: "company", label: "Şirket" },
        { key: "sourceFile", label: "Kaynak" }
      ],
      rows: payrollRows.sort((a, b) => b.net - a.net || b.gross - a.gross || a.employee.localeCompare(b.employee, "tr")),
      stats: [
        { label: "Personel", value: num(payrollRows.length) },
        { label: "Toplam Brüt", value: money(payrollRows.reduce((sum, row) => sum + safe(row.gross), 0)) },
        { label: "Toplam Net", value: money(payrollRows.reduce((sum, row) => sum + safe(row.net), 0)) },
        { label: "Ortalama Net", value: money(payrollRows.reduce((sum, row) => sum + safe(row.net), 0) / Math.max(payrollRows.length, 1)) }
      ],
      insights: [
        { title: "En Yüksek Net Ücret", kind: "money", items: buildTopList(payrollRows, row => row.employee, row => row.net) },
        { title: "En Yüksek Brüt Ücret", kind: "money", items: buildTopList(payrollRows, row => row.employee, row => row.gross) },
        { title: "Ay Bazlı Sıralama", kind: "money", items: buildTopList(yearPayroll, row => monthLabels[row.month] || row.month, row => row.gross, 12) }
      ],
      note: "Personel bazlı bordro detayı içe aktarılan bordro dosyalarından okunur.",
      emptyMessage: "Bu ay için bordro satırı bulunamadı."
    };
  }

  const rows = itemName
    ? expenseSummaryRows(yearData, month, itemName)
    : expenseSummaryRows(yearData, month, "").sort((a, b) => b.amount - a.amount);
  const monthSeries = Array.from({ length: 12 }, (_, idx) => idx + 1).map(entryMonth => ({
    month: entryMonth,
    total: itemName
      ? expenseSummaryRows(yearData, entryMonth, itemName).reduce((sum, row) => sum + safe(row.amount), 0)
      : expenseMonthTotal(yearData, entryMonth)
  })).filter(row => row.total);
  return {
    columns: [
      { key: "category", label: "Kalem" },
      { key: "amount", label: "Tutar", format: "money" },
      { key: "sourceFile", label: "Kaynak" }
    ],
    rows,
    stats: [
      { label: "Kalem", value: num(rows.length) },
      { label: "Ay Toplamı", value: money(rows.reduce((sum, row) => sum + safe(row.amount), 0)) },
      { label: "En Büyük Kalem", value: rows[0] ? rows[0].category : "—" },
      { label: "Yıl", value: state.year }
    ],
    insights: [
      { title: "Bu Ay En Büyük Giderler", kind: "money", items: buildTopList(rows, row => row.category, row => row.amount) },
      { title: "Ay Bazlı Sıralama", kind: "money", items: monthSeries.map(row => ({ label: monthLabels[row.month], value: row.total })).sort((a, b) => b.value - a.value).slice(0, 12) }
    ],
    note: itemName && sameLabel(itemName, "MAAŞ GİDERLERİ") ? "Personel bazlı maaş listesi için bordro dosyası içe aktarılmalı." : "",
    emptyMessage: "Bu gider hücresi için kayıt bulunamadı."
  };
}

function buildNetDetailPayload(month) {
  const yearData = currentYearData();
  const gross = safe(yearData.yonPlus.find(entry => entry.month === month)?.total?.kar);
  const expense = expenseMonthTotal(yearData, month);
  const net = gross - expense;
  const rows = [
    { section: "Brüt Kar", value: gross },
    { section: "Toplam Gider", value: -expense },
    { section: "Net Kar", value: net }
  ];
  const yearSeries = Array.from({ length: 12 }, (_, idx) => idx + 1).map(entryMonth => ({
    month: entryMonth,
    value: safe(yearData.yonPlus.find(entry => entry.month === entryMonth)?.total?.kar) - expenseMonthTotal(yearData, entryMonth)
  })).filter(row => row.value);
  return {
    columns: [
      { key: "section", label: "Bölüm" },
      { key: "value", label: "Tutar", format: "money" }
    ],
    rows,
    stats: [
      { label: "Brüt Kar", value: money(gross) },
      { label: "Gider", value: money(expense) },
      { label: "Net Kar", value: money(net) },
      { label: "Ay", value: monthLabels[month] }
    ],
    insights: [
      { title: "Net Kar Ay Sıralaması", kind: "money", items: yearSeries.map(row => ({ label: monthLabels[row.month], value: row.value })).sort((a, b) => b.value - a.value).slice(0, 12) }
    ],
    note: "Net kar satırı brüt kar ile giderlerin aylık toplamından hesaplanır.",
    emptyMessage: "Bu net kar hücresi için kayıt bulunamadı."
  };
}

function buildDetailPayload(kind, month, itemName) {
  if (["sales", "qty", "cost", "gross"].includes(kind)) return buildSalesDetailPayload(kind, month, itemName);
  if (kind === "expense") return buildExpenseDetailPayload(month, itemName);
  if (kind === "net") return buildNetDetailPayload(month);
  return buildSalesDetailPayload("sales", month, itemName);
}

function openCellDetail(title, subtitle, payload) {
  state.detailPayload = payload;
  state.detailFilter = "";
  q("#detailTitle").textContent = title;
  q("#detailSubtitle").textContent = subtitle;
  q("#detailFilter").value = "";
  renderCellDetails();
  q("#cellDetailDrawer").classList.add("open");
  q("#cellDetailDrawer").setAttribute("aria-hidden", "false");
}

function renderInsightBlock(block) {
  if (!block?.items?.length) return "";
  return `
    <div class="detail-insight">
      <h4>${esc(block.title)}</h4>
      <ul>
        ${block.items.map(item => `
          <li><span>${esc(item.label)}</span><span>${esc(block.kind === "text" ? item.value : valueText(block.kind || "money", item.value))}</span></li>
        `).join("")}
      </ul>
    </div>
  `;
}

function formatDetailCell(row, column) {
  const value = row[column.key];
  if (column.format === "money") return money(value);
  if (column.format === "qty") return valueText("qty", value, row[column.unitKey || "unit"] || "");
  if (column.format === "number") return num(value, 0);
  if (column.format === "rate") return value === null || value === undefined || Number.isNaN(Number(value)) ? "—" : num(value, 4);
  if (column.format === "pct") return pct(value);
  return esc(value || "—");
}

function renderCellDetails() {
  const payload = state.detailPayload || { columns: [], rows: [], stats: [], insights: [], note: "" };
  const filter = normalizeText(state.detailFilter);
  const rows = (payload.rows || []).filter(row => !filter || normalizeText(Object.values(row).join(" ")).includes(filter));
  q("#detailOverview").innerHTML = `
    ${(payload.stats || []).map(item => `
      <div class="detail-stat"><strong>${esc(item.value)}</strong><span>${esc(item.label)}</span></div>
    `).join("")}
    ${payload.note ? `<div class="detail-note"><strong>Not</strong><span>${esc(payload.note)}</span></div>` : ""}
  `;
  q("#detailInsights").innerHTML = (payload.insights || []).map(renderInsightBlock).join("");
  q("#detailInsights").style.display = q("#detailInsights").innerHTML ? "grid" : "none";
  q("#detailHead").innerHTML = `<tr>${(payload.columns || []).map(column => `<th>${esc(column.label)}</th>`).join("")}</tr>`;
  q("#detailBody").innerHTML = rows.map(row => `
    <tr>${(payload.columns || []).map(column => `<td>${formatDetailCell(row, column)}</td>`).join("")}</tr>
  `).join("") || `<tr><td colspan="${Math.max((payload.columns || []).length, 1)}">${esc(payload.emptyMessage || "Bu filtreye uygun kayıt yok.")}</td></tr>`;
  repairRenderedText(q("#cellDetailDrawer"));
}

function incomeCell(value, kind, month, itemName = "", className = "") {
  const isFilled = value !== null && value !== undefined && value !== "" && safe(value) !== 0;
  const tooltip = buildIncomeHoverTooltip(kind, month, itemName, value, "money");
  const editable = ["sales", "expense"].includes(kind) && Boolean(itemName);
  const lockClass = editable ? "manual-editable" : "manual-locked";
  const editAttrs = editable ? ` data-editable="1" title="Ctrl + tık veya sağ tık ile şifreli değiştir"` : ` data-editable="0" title="Hesaplanan / kilitli hücre"`;
  const attrs = isFilled ? ` class="income-value ${lockClass} ${className}" data-kind="${kind}" data-month="${month}" data-item="${esc(itemName)}" data-tooltip="${esc(tooltip)}"${editAttrs}` : ` class="${lockClass} ${className}" data-tooltip="${esc(tooltip)}"${editAttrs}`;
  return `<td${attrs}>${isFilled ? money(value) : "0"}</td>`;
}

function incomeQtyCell(value, month, itemName, unit) {
  const isFilled = value !== null && value !== undefined && value !== "" && safe(value) !== 0;
  const tooltip = buildIncomeHoverTooltip("qty", month, itemName, value, "qty", unit);
  return `<td class="${isFilled ? "income-value " : ""}manual-editable" data-tooltip="${esc(tooltip)}" data-editable="1" title="Ctrl + tık veya sağ tık ile şifreli değiştir" ${isFilled ? `data-kind="qty" data-month="${month}" data-item="${esc(itemName)}"` : `data-kind="qty" data-month="${month}" data-item="${esc(itemName)}"`}>${isFilled ? num(value, unit === "M2" || unit === "M" ? 3 : 0) : "0"}</td>`;
}

function incomeMetricValue(yearData, kind, month, itemName = "") {
  if (!yearData) return 0;
  const monthRow = (yearData.yonPlus || []).find(entry => entry.month === month) || { categories: [], total: {} };
  const category = itemName ? (monthRow.categories || []).find(entry => entry.name === itemName) || {} : monthRow.total || {};
  if (kind === "sales") return safe(itemName ? category.ciro : monthRow.total?.ciro);
  if (kind === "qty") return safe(itemName ? category.adet : monthRow.total?.adet);
  if (kind === "cost") return safe(itemName ? category.maliyet : monthRow.total?.maliyet);
  if (kind === "gross") return safe(monthRow.total?.kar);
  if (kind === "expense") {
    if (itemName) {
      const expenseRow = (yearData.expenseRows || DATA.expenseRows || []).find(row => row[0] === itemName);
      return safe(expenseRow?.[month]);
    }
    return expenseMonthTotal(yearData, month);
  }
  if (kind === "net") return safe(monthRow.total?.kar) - expenseMonthTotal(yearData, month);
  return 0;
}

function incomeMetricSeries(yearData, kind, itemName = "") {
  return Array.from({ length: 12 }, (_, idx) => incomeMetricValue(yearData, kind, idx + 1, itemName));
}

function averageFilled(values) {
  const filled = values.filter(value => value !== null && value !== undefined && value !== "" && safe(value) !== 0);
  if (!filled.length) return 0;
  return filled.reduce((sum, value) => sum + safe(value), 0) / filled.length;
}

function formatIncomeHoverValue(value, format = "money", unit = "") {
  if (format === "qty") return `${num(value, unit === "M2" || unit === "M" ? 3 : 0)}${unit ? ` ${unit}` : ""}`;
  return money(value);
}

function buildIncomeHoverTooltip(kind, month, itemName, monthValue, format = "money", unit = "") {
  const yearData = currentYearData();
  const previousYear = String(Number(state.year) - 1);
  const previousYearData = DATA.years?.[previousYear];
  const currentSeries = incomeMetricSeries(yearData, kind, itemName);
  const previousSeries = incomeMetricSeries(previousYearData, kind, itemName);
  const currentTotal = currentSeries.reduce((sum, value) => sum + safe(value), 0);
  const currentAverage = averageFilled(currentSeries);
  const previousAverage = averageFilled(previousSeries);
  const subject = itemName || ({
    sales: "Toplam satış",
    qty: "Toplam miktar",
    cost: "Toplam maliyet",
    gross: "Brüt kar",
    expense: "Toplam gider",
    net: "Net kar"
  }[kind] || "Hücre");

  return [
    `${subject} - ${monthLabels[month]} ${state.year}`,
    `Bu ay: ${formatIncomeHoverValue(monthValue, format, unit)}`,
    `Bu yıl toplam: ${formatIncomeHoverValue(currentTotal, format, unit)}`,
    `Bu yıl ortalama: ${formatIncomeHoverValue(currentAverage, format, unit)}`,
    `Geçen yıl ortalama: ${previousYearData ? formatIncomeHoverValue(previousAverage, format, unit) : "veri yok"}`
  ].join("\n");
}

function incomeHoverTip() {
  let tip = q("#incomeHoverTip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "incomeHoverTip";
    tip.className = "income-hover-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }
  return tip;
}

function showIncomeHoverTip(cell, event) {
  const text = cell?.dataset?.tooltip || "";
  if (!text) return;
  const tip = incomeHoverTip();
  tip.textContent = text;
  tip.classList.add("open");
  moveIncomeHoverTip(event);
}

function moveIncomeHoverTip(event) {
  const tip = q("#incomeHoverTip");
  if (!tip?.classList.contains("open")) return;
  const gap = 14;
  const width = tip.offsetWidth || 260;
  const height = tip.offsetHeight || 120;
  const x = Math.min(window.innerWidth - width - 12, Math.max(12, event.clientX + gap));
  const y = Math.min(window.innerHeight - height - 12, Math.max(12, event.clientY + gap));
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function hideIncomeHoverTip() {
  q("#incomeHoverTip")?.classList.remove("open");
}

function renderOverviewConfidence() {
  const summary = yearConfidenceSummary();
  const closedTarget = summary.closedMonths.length || summary.loadedMonths.length;
  const closedValue = closedTarget ? `${summary.closedCoveredCount}/${closedTarget}` : "0/0";
  const overview = q("#overviewConfidence");
  const salesSpan = summary.loadedMonths.length ? monthSpanText(summary.loadedMonths) : "veri yok";
  const expenseSpan = summary.expenseMonthsLoaded.length ? monthSpanText(summary.expenseMonthsLoaded) : "bekleniyor";
  const followUps = summary.missingItems.filter(item => item && item !== "Eksik veri yok").slice(0, 4);
  const headline = summary.statusReason || (summary.expenseMissing ? "Sunum YTD okunmalı." : "Sunum kullanıma hazır.");
  const subline = [
    `${summary.yearKey} kapanmış ay kapsamı ${closedValue}.`,
    summary.activeMonth ? `${monthLabels[summary.activeMonth]} aktif ay.` : "",
    summary.lastSalesDate ? `Son kayıt ${formatDateLabel(summary.lastSalesDate)}.` : "",
    summary.expenseMissing ? `Gider kapsamı ${expenseSpan}.` : `Toplam gider ${money(summary.expenseTotal)}.`
  ].filter(Boolean).join(" ");
  const pills = [
    { tone: summary.closedMissingMonths.length ? "warn" : "ready", label: `Satış ayları ${salesSpan}` },
    { tone: "ready", label: `Satış detay ${num(summary.salesRowCount)} satır` },
    { tone: summary.invoiceCount ? "ready" : "warn", label: `${num(summary.invoiceCount)} fatura` },
    { tone: summary.expenseMissing ? "warn" : "ready", label: `Gider ${expenseSpan}` },
    { tone: summary.controlCount && summary.controlPassCount === summary.controlCount ? "ready" : "warn", label: `Kontrol ${summary.controlPassCount}/${summary.controlCount || 0}` }
  ];
  const followTone = summary.status === "risk" ? "risk" : "warn";

  overview.innerHTML = `
    <div class="card overview-strip ${summary.status}">
      <div class="overview-strip-top">
        <div class="overview-strip-copy">
          <span class="overview-strip-kicker">Veri Durumu</span>
          <strong>${esc(headline)}</strong>
          <p>${esc(subline)}</p>
        </div>
        <div class="overview-strip-meta">
          <span class="overview-pill ${summary.status}">${esc(summary.statusLabel)}</span>
          ${pills.map(item => `<span class="overview-pill ${item.tone}">${esc(item.label)}</span>`).join("")}
        </div>
      </div>
      ${followUps.length ? `
        <div class="overview-strip-foot">
          <span class="overview-foot-label">Takip</span>
          <div class="overview-foot-pills">
            ${followUps.map(item => `<span class="overview-foot-pill ${followTone}">${esc(item)}</span>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderOverviewSummaryBar() {
  const summary = yearConfidenceSummary();
  const closedTarget = summary.closedMonths.length || summary.loadedMonths.length;
  const closedValue = closedTarget ? `${summary.closedCoveredCount}/${closedTarget}` : "0/0";
  const overview = q("#overviewConfidence");
  const salesSpan = summary.loadedMonths.length ? monthSpanText(summary.loadedMonths) : "veri yok";
  const expenseSpan = summary.expenseMonthsLoaded.length ? monthSpanText(summary.expenseMonthsLoaded) : "bekleniyor";
  const followUps = summary.missingItems.filter(item => item && item !== "Eksik veri yok").slice(0, 3);
  const headline = summary.statusReason || (summary.expenseMissing ? "Sunum YTD okunmalı." : "Sunum kullanıma hazır.");
  const metaItems = [
    summary.activeMonth ? `${monthLabels[summary.activeMonth]} aktif ay` : "",
    summary.loadedMonths.length ? `Satış ${salesSpan}` : "",
    summary.lastSalesDate ? `Son kayıt ${formatDateLabel(summary.lastSalesDate)}` : ""
  ].filter(Boolean);
  const pills = [
    { tone: summary.status, label: summary.statusLabel },
    { tone: summary.closedMissingMonths.length ? "warn" : "ready", label: `Ay ${closedValue}` },
    { tone: "ready", label: `Satır ${num(summary.salesRowCount)}` },
    { tone: summary.invoiceCount ? "ready" : "warn", label: `Fatura ${num(summary.invoiceCount)}` },
    { tone: summary.expenseMissing ? "warn" : "ready", label: summary.expenseMissing ? `Gider ${expenseSpan}` : `Gider ${money(summary.expenseTotal)}` },
    { tone: summary.controlCount && summary.controlPassCount === summary.controlCount ? "ready" : "warn", label: `Kontrol ${summary.controlPassCount}/${summary.controlCount || 0}` }
  ];
  const followTone = summary.status === "risk" ? "risk" : "warn";

  overview.innerHTML = `
    <div class="overview-bar ${summary.status}">
      <div class="overview-bar-row">
        <div class="overview-bar-title">
          <strong>${state.year}</strong>
          <span>${esc(headline)}</span>
        </div>
        <div class="overview-bar-pills">
          ${pills.map(item => `<span class="overview-pill ${item.tone}">${esc(item.label)}</span>`).join("")}
        </div>
      </div>
      ${(metaItems.length || followUps.length) ? `
        <div class="overview-bar-row overview-bar-sub">
          <div class="overview-bar-meta">
            ${metaItems.map(item => `<span>${esc(item)}</span>`).join("")}
          </div>
          <div class="overview-bar-alerts">
            ${followUps.map(item => `<span class="overview-foot-pill ${followTone}">${esc(item)}</span>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderOverview() {
  const yearData = currentYearData();
  const months = Array.from({ length: 12 }, (_, idx) => idx + 1);
  const cats = ["MDF", "SUNTA", "KAPLAMA", "KENAR BANT", "ÇARŞAF", "İŞÇİLİK", "DİĞER"];
  const units = { "MDF":"ADET", "SUNTA":"ADET", "KAPLAMA":"M2", "KENAR BANT":"M2", "ÇARŞAF":"M", "İŞÇİLİK":"ADET", "DİĞER":"ADET" };
  const monthData = month => yearData.yonPlus.find(m => m.month === month) || { categories: [], total: {} };
  const catData = (month, name) => monthData(month).categories.find(c => c.name === name) || {};
  const totalExpenseByMonth = month => expenseMonthTotal(yearData, month);
  const rows = [];
  const rankMonths = state.month === "all" ? months : [Number(state.month)].filter(Boolean);
  const metricTotal = (name, key) => rankMonths.reduce((sum, month) => sum + safe(catData(month, name)[key]), 0);
  const expenseTotal = exp => rankMonths.reduce((sum, month) => sum + safe(exp[month]), 0);
  const makeRankMap = entries => {
    const positive = entries.filter(entry => safe(entry.value) > 0);
    const total = positive.reduce((sum, entry) => sum + safe(entry.value), 0);
    return new Map(positive
      .sort((a, b) => safe(b.value) - safe(a.value) || String(a.label).localeCompare(String(b.label), "tr"))
      .map((entry, idx) => [entry.label, {
        rank: idx + 1,
        share: total ? (safe(entry.value) / total) * 100 : 0
      }]));
  };
  const renderRankedLabel = (label, rankMap) => {
    const meta = rankMap.get(label);
    if (!meta) return esc(label);
    const shareText = meta.share > 0 && meta.share < 1 ? "%<1" : `%${num(Math.round(meta.share))}`;
    const title = meta.share > 0 && meta.share < 1 ? "Pay var ama yüzde 1'in altında" : `Pay ${shareText}`;
    return `<span class="ranked-label" title="${esc(title)}"><span class="rank-name">${esc(label)}</span><span class="rank-no">${num(meta.rank)}</span><span class="rank-share">${shareText}</span></span>`;
  };
  const salesRank = makeRankMap(cats.map(label => ({ label, value: metricTotal(label, "ciro") })));
  const qtyRank = makeRankMap(cats.map(label => ({ label, value: metricTotal(label, "adet") })));
  const costRank = makeRankMap(cats.map(label => ({ label, value: metricTotal(label, "maliyet") })));
  const expenseRank = makeRankMap((yearData.expenseRows || DATA.expenseRows || []).map(exp => ({ label: exp[0], value: expenseTotal(exp) })));
  const row = (label, section, cells, cls = "", total = null, digits = 0, totalFormat = "money") => {
    const totalText = total === null ? "" : (totalFormat === "number" ? num(total, digits) : money(total));
    const labelText = String(label);
    let labelHtml = labelText;
    if (cls.includes("expense-line")) {
      labelHtml = renderRankedLabel(labelText, expenseRank);
    } else if (cls.includes("cat-") && cls.includes("cost")) {
      labelHtml = renderRankedLabel(labelText, costRank);
    } else if (cls.includes("cat-") && totalFormat === "number") {
      labelHtml = renderRankedLabel(labelText, qtyRank);
    } else if (cls.includes("cat-")) {
      labelHtml = renderRankedLabel(labelText, salesRank);
    }
    rows.push(`<tr class="${cls}"><th>${labelHtml}</th><td class="trend">${section}</td>${cells}<td class="year-total">${totalText}</td></tr>`);
  };

  rows.push(`<tr class="section-row sales-section"><th>Satışlar</th><td></td>${months.map(() => "<td></td>").join("")}<td></td></tr>`);
  cats.forEach(name => row(name, "↗", months.map(month => incomeCell(safe(catData(month, name).ciro), "sales", month, name)).join(""), `cat-${normalizeText(name).replace(/\s/g, "-")}`, months.reduce((a, month) => a + safe(catData(month, name).ciro), 0)));
  row("TOPLAM SATIŞLAR TL", "", months.map(month => incomeCell(safe(monthData(month).total.ciro), "sales", month, "")).join(""), "total-line", yearData.overview.totalRevenue);

  rows.push(`<tr class="section-row qty-section"><th></th><td></td>${months.map(() => "<td></td>").join("")}<td></td></tr>`);
  cats.forEach(name => row(name, units[name], months.map(month => incomeQtyCell(safe(catData(month, name).adet), month, name, units[name])).join(""), `cat-${normalizeText(name).replace(/\s/g, "-")}`, months.reduce((a, month) => a + safe(catData(month, name).adet), 0), units[name] === "M2" || units[name] === "M" ? 3 : 0, "number"));

  rows.push(`<tr class="section-row cost-section"><th>SATIŞLARIN MALİYETİ</th><td>EĞİLİM</td>${months.map(() => "<td></td>").join("")}<td></td></tr>`);
  cats.forEach(name => row(name, "↗", months.map(month => incomeCell(safe(catData(month, name).maliyet), "cost", month, name)).join(""), `cost cat-${normalizeText(name).replace(/\s/g, "-")}`, months.reduce((a, month) => a + safe(catData(month, name).maliyet), 0)));
  row("SATIŞLARIN TOPLAM MALİYETİ", "", months.map(month => incomeCell(safe(monthData(month).total.maliyet), "cost", month, "")).join(""), "total-line", yearData.overview.totalCost);
  row("Brüt Kar", "", months.map(month => incomeCell(safe(monthData(month).total.kar), "gross", month, "")).join(""), "gross-line", yearData.overview.grossProfit);
  row("TOPLAM GİDERLER", "", months.map(month => incomeCell(totalExpenseByMonth(month), "expense", month, "")).join(""), "total-line expense-total", yearData.overview.totalExpense);
  row("Net Kar", "", months.map(month => incomeCell(safe(monthData(month).total.kar) - totalExpenseByMonth(month), "net", month, "")).join(""), "net-line", yearData.overview.netProfit);

  rows.push(`<tr class="section-row expense-section"><th>Giderler</th><td>EĞİLİM</td>${months.map(() => "<td></td>").join("")}<td></td></tr>`);
  (yearData.expenseRows || DATA.expenseRows || []).forEach(exp => {
    row(exp[0], "⌁", months.map(month => incomeCell(safe(exp[month]), "expense", month, exp[0])).join(""), "expense-line", safe(exp[13]));
  });

  q("#incomeTable").innerHTML = `
    <thead>
      <tr>
        <th class="year-head">${state.year}</th>
        <th></th>
        ${months.map(month => `<th class="month-head-col ${month % 2 ? "odd" : "even"}">${monthLabels[month]} ${String(state.year).slice(-2)}</th>`).join("")}
        <th class="year-head">YILLIK</th>
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  `;
  q("#incomeQuickTotals").innerHTML = `
    <span>Satış ${money(yearData.overview.totalRevenue)}</span>
    <span>Brüt Kar ${money(yearData.overview.grossProfit)}</span>
    <span>Net Kar ${money(yearData.overview.netProfit)}</span>
  `;
  renderOverviewSummaryBar();
}

function renderYONPlus() {
  const y = currentYearData();
  const months = y.yonPlus.filter(m => state.month === "all" || String(m.month) === state.month);
  q("#yonPlusGrid").innerHTML = months.map((m,idx) => {
    const cats = m.categories.length ? m.categories : [{name:"TOPLAM", ...m.total}];
    return `
    <div class="month-card">
      <div class="month-head ${colorClasses[idx % colorClasses.length]}">${m.label}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Satışlar</th><th>S.Adet</th><th>S.Ciro</th><th>Maliyet</th><th>Kar</th><th>%</th></tr></thead>
          <tbody>
            ${cats.map(c => `
              <tr>
                <td>${c.name}</td>
                <td>${num(c.adet, c.name==="KAPLAMA"||c.name==="ÇARŞAF"||c.name==="DİĞER" ? 3 : 0)}</td>
                <td>${money(c.ciro)}</td>
                <td>${money(c.maliyet)}</td>
                <td>${money(c.kar)}</td>
                <td>${pct(c.marj)}</td>
              </tr>`).join("")}
            <tr>
              <td><strong>TOPLAM</strong></td>
              <td><strong>${num(m.total.adet, 3)}</strong></td>
              <td><strong>${money(m.total.ciro)}</strong></td>
              <td><strong>${money(m.total.maliyet)}</strong></td>
              <td><strong>${money(m.total.kar)}</strong></td>
              <td><strong>${pct(m.total.marj)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
  }).join("");
}

function renderYONRapor() {
  const r = currentYearData().yonRapor;
  const sum = r.summary;
  q("#profitChain").innerHTML = [
    ["Toplam Satış Cirosu", money(sum.totalRevenue), "Tüm kategoriler"],
    ["Toplam Maliyet", money(sum.totalCost), "Hammadde + işçilik + GG + DG"],
    ["Brüt Kar", money(sum.grossProfit), "Satış − maliyet"],
    ["Brüt Kar Marjı", pct(sum.grossMargin), "Brüt kar / ciro"],
    ["Toplam Giderler", money(sum.totalExpense), "Maaş + kira + SGK + enerji"],
    ["Vergi Öncesi Kar", money(sum.profitBeforeTax), "Brüt kar − giderler"],
    ["Net Kar", money(sum.netProfit), "Vergi sonrası kar"],
    ["Net Kar Marjı", pct(sum.netMargin), "Net kar / ciro"]
  ].map(item => `<div class="metric-row"><div><strong>${item[0]}</strong><small>${item[2]}</small></div><div><strong>${item[1]}</strong></div></div>`).join("");

  q("#yonRaporCategoryBody").innerHTML = r.categories.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${num(c.adet, 3)}</td>
      <td>${money(c.ciro)}</td>
      <td>${pct(c.share)}</td>
    </tr>`).join("");

  q("#yonRaporCustomerBody").innerHTML = r.topCustomers.map(c => `
    <tr><td>${c.rank}</td><td>${c.name}</td><td>${money(c.revenue)}</td><td>${pct(c.share)}</td></tr>
  `).join("");
}

function renderCategoryProfit() {
  q("#categoryProfitBody").innerHTML = currentYearData().categories.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${num(c.adet, 3)}</td>
      <td>${money(c.ciro)}</td>
      <td>${c.maliyet === null ? "—" : money(c.maliyet)}</td>
      <td>${c.kar === null ? "—" : money(c.kar)}</td>
      <td>${c.marj === null ? "—" : pct(c.marj)}</td>
    </tr>`).join("");
}

function renderCustomers() {
  q("#customerBody").innerHTML = currentYearData().yonRapor.topCustomers.map(c => `
    <tr><td>${c.rank}</td><td>${c.name}</td><td>${money(c.revenue)}</td><td>${pct(c.share)}</td></tr>
  `).join("");
}

function currentMasterMonthIndex() {
  if (state.month !== "all") return Math.max(0, Number(state.month) - 1);
  return latestMonthIndex(DATA.masterRows, (row, idx) => {
    const months = state.year === "2025" ? row.months25 : row.months26;
    const metric = months?.[idx] || {};
    return safe(metric.A) + safe(metric.C) + safe(metric.TM);
  });
}

function selectedMasterMonthMeta() {
  const index = currentMasterMonthIndex();
  const monthNo = index + 1;
  return {
    index,
    monthNo,
    shortYear: String(state.year).slice(-2),
    label: `${monthLabels[monthNo]} ${String(state.year).slice(-2)}`,
    modeLabel: state.month === "all" ? "Son dolu ay gorunumu" : "Secili ay gorunumu"
  };
}

function monthMetric(row) {
  const months = state.year === "2025" ? row.months25 : row.months26;
  const idx = currentMasterMonthIndex();
  return months[idx] || {};
}

const masterMonthMetricColumns = [
  ["A", "number"], ["BM", "money"], ["LG", "money"], ["KAP1", "money"],
  ["KAP2", "money"], ["TUT", "money"], ["GG", "money"], ["DG", "money"],
  ["C", "money"], ["TM", "money"], ["KAR", "money"], ["MARJ", "pct"]
];

function masterFullColumns() {
  const columns = [
    { label: "ÜRÜN KODU", value: row => row.code },
    { label: "ÜRÜN", value: row => row.name },
    { label: "KATEGORİ", value: row => row.category },
    { label: "TADET25", format: "number", value: row => row.totals25?.adet },
    { label: "TCİRO25", format: "money", value: row => row.totals25?.ciro },
    { label: "TMALİYET25", format: "money", value: row => row.totals25?.maliyet },
    { label: "TKAR25", format: "money", value: row => row.totals25?.kar },
    { label: "T%25", format: "pct", value: row => row.totals25?.marj },
    { label: "TADET26", format: "number", value: row => row.totals26?.adet },
    { label: "TCİRO26", format: "money", value: row => row.totals26?.ciro },
    { label: "TMALİYET26", format: "money", value: row => row.totals26?.maliyet },
    { label: "TKAR26", format: "money", value: row => row.totals26?.kar },
    { label: "T%26", format: "pct", value: row => row.totals26?.marj },
    { label: "MDK", format: "raw", value: row => row.recipe?.MDK },
    { label: "MDA", format: "raw", value: row => row.recipe?.MDA },
    { label: "MKOD", format: "raw", value: row => row.recipe?.MKOD },
    { label: "SUK", format: "raw", value: row => row.recipe?.SUK },
    { label: "SUA", format: "raw", value: row => row.recipe?.SUA },
    { label: "SKOD", format: "raw", value: row => row.recipe?.SKOD },
    { label: "KAP1KOD", format: "raw", value: row => row.recipe?.KAP1KOD },
    { label: "KAP2KOD", format: "raw", value: row => row.recipe?.KAP2KOD },
    { label: "TUKOD", format: "raw", value: row => row.recipe?.TUKOD }
  ];
  const monthRowsKey = state.year === "2025" ? "months25" : "months26";
  for (let monthNo = 1; monthNo <= 12; monthNo += 1) {
    masterMonthMetricColumns.forEach(([metric, format]) => {
      const label = metric === "MARJ" ? `${monthNo}%${monthNo}` : `${monthNo}${metric}`;
      columns.push({
        label,
        format,
        value: row => row[monthRowsKey]?.[monthNo - 1]?.[metric]
      });
    });
  }
  return columns;
}

function formatMasterFullValue(value, format) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "money") return money(value);
  if (format === "number") return num(value, 3);
  if (format === "pct") return typeof value === "number" ? pct(value) : esc(value || "—");
  return esc(value);
}

function filteredMasterRows() {
  const yearKey = state.year === "2025" ? "totals25" : "totals26";
  return DATA.masterRows.filter(r => {
    const txt = normalizeText([
      r.code,
      r.name,
      r.category,
      r.recipe?.MKOD,
      r.recipe?.SKOD,
      r.recipe?.KAP1KOD,
      r.recipe?.KAP2KOD,
      r.recipe?.TUKOD
    ].join(" "));
    const searchOk = !state.masterSearch || txt.includes(normalizeText(state.masterSearch));
    const catOk = state.masterCategory === "Tümü" || r.category === state.masterCategory;
    return searchOk && catOk;
  }).sort((a,b) => safe(b[yearKey].ciro) - safe(a[yearKey].ciro));
}

function renderMaster() {
  q("#glossaryBody").innerHTML = DATA.headerGlossary.map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
  const cats = [...new Set(DATA.masterRows.map(r => r.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
  const catSel = q("#masterCategory");
  if (!catSel.dataset.filled) {
    catSel.innerHTML = `<option>Tümü</option>${cats.map(c => `<option>${c}</option>`).join("")}`;
    catSel.dataset.filled = "1";
  }
  catSel.value = state.masterCategory;
  if (q("#masterMode")) q("#masterMode").value = state.masterMode;

  const rows = filteredMasterRows();
  const pageSize = Number(state.masterPageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  state.masterPage = Math.max(1, Math.min(state.masterPage, totalPages));
  const slice = rows.slice((state.masterPage - 1) * pageSize, state.masterPage * pageSize);
  const masterMonth = selectedMasterMonthMeta();
  const monthPrefix = `${masterMonth.monthNo}`;
  const activeColumns = [
    `${monthPrefix}A`,
    `${monthPrefix}C`,
    `${monthPrefix}TM`,
    `${monthPrefix}KAR`,
    `${monthPrefix}BM`,
    `${monthPrefix}LG`,
    `${monthPrefix}KAP1`,
    `${monthPrefix}KAP2`,
    `${monthPrefix}TUT`,
    `${monthPrefix}GG`,
    `${monthPrefix}DG`
  ];
  const activeCount = rows.filter(row => {
    const metric = monthMetric(row);
    return safe(metric.A) || safe(metric.C) || safe(metric.TM);
  }).length;
  const yearKey = state.year === "2025" ? "totals25" : "totals26";
  const totalRevenue = rows.reduce((sum, row) => sum + safe(row[yearKey]?.ciro), 0);
  const totalCost = rows.reduce((sum, row) => sum + safe(monthMetric(row).TM), 0);

  if (state.masterMode === "full") {
    const columns = masterFullColumns();
    q("#masterHead").innerHTML = `
      <tr class="master-sub-head master-full-head">
        ${columns.map(column => `<th><span class="master-col-code">${esc(column.label)}</span></th>`).join("")}
      </tr>
    `;
    q("#masterStats").innerHTML = `
      <div class="master-stats-row">
        <span class="summary-pill">${rows.length.toLocaleString("tr-TR")} ürün</span>
        <span class="summary-pill">${state.year} tüm başlıklar</span>
        <span class="summary-pill">${columns.length.toLocaleString("tr-TR")} kolon</span>
        <span class="summary-pill">${activeCount.toLocaleString("tr-TR")} aktif ürün</span>
        <span class="summary-pill">Toplam ciro: ${money(totalRevenue)}</span>
      </div>
      <div class="master-stats-note">
        Excel başlık düzeni: ürün kartı, 2025/2026 yıl toplamları, reçete kodları ve seçili yılın 12 aylık WERP maliyet alanları birlikte gösterilir.
      </div>
    `;
    q("#masterBody").innerHTML = slice.map(row => `
      <tr>${columns.map(column => `<td>${formatMasterFullValue(column.value(row), column.format)}</td>`).join("")}</tr>
    `).join("");
    q("#masterPageLabel").textContent = `Sayfa ${state.masterPage} / ${totalPages} • ${slice.length.toLocaleString("tr-TR")} kayıt`;
    return;
  }

  q("#masterHead").innerHTML = `
    <tr class="master-group-head">
      <th colspan="3">Urun Karti</th>
      <th colspan="5">${state.year} Toplam</th>
      <th colspan="11">${masterMonth.label} WERP Alanlari</th>
      <th colspan="5">Recete Kodlari</th>
    </tr>
    <tr class="master-sub-head">
      <th>Urun Kodu</th>
      <th>Urun</th>
      <th>Kategori</th>
      <th><span class="master-col-code">TADET</span><small>Toplam adet</small></th>
      <th><span class="master-col-code">TCIRO</span><small>Toplam ciro</small></th>
      <th><span class="master-col-code">TMALIYET</span><small>Toplam maliyet</small></th>
      <th><span class="master-col-code">TKAR</span><small>Toplam kar</small></th>
      <th><span class="master-col-code">T%</span><small>Toplam marj</small></th>
      <th><span class="master-col-code">${monthPrefix}A</span><small>Adet</small></th>
      <th><span class="master-col-code">${monthPrefix}C</span><small>Ciro</small></th>
      <th><span class="master-col-code">${monthPrefix}TM</span><small>Top. maliyet</small></th>
      <th><span class="master-col-code">${monthPrefix}KAR</span><small>Kar</small></th>
      <th><span class="master-col-code">${monthPrefix}BM</span><small>Birim maliyet</small></th>
      <th><span class="master-col-code">${monthPrefix}LG</span><small>Levha gideri</small></th>
      <th><span class="master-col-code">${monthPrefix}KAP1</span><small>1. yuz kaplama</small></th>
      <th><span class="master-col-code">${monthPrefix}KAP2</span><small>2. yuz kaplama</small></th>
      <th><span class="master-col-code">${monthPrefix}TUT</span><small>Tutkal</small></th>
      <th><span class="master-col-code">${monthPrefix}GG</span><small>Genel gider</small></th>
      <th><span class="master-col-code">${monthPrefix}DG</span><small>Diger gider</small></th>
      <th><span class="master-col-code">MKOD</span><small>MDF kodu</small></th>
      <th><span class="master-col-code">SKOD</span><small>Sunta kodu</small></th>
      <th><span class="master-col-code">KAP1KOD</span><small>1. yuz</small></th>
      <th><span class="master-col-code">KAP2KOD</span><small>2. yuz</small></th>
      <th><span class="master-col-code">TUKOD</span><small>Tutkal</small></th>
    </tr>
  `;

  q("#masterStats").textContent = `${rows.length.toLocaleString("tr-TR")} ürün • ${state.year} • ${state.month === "all" ? "Ocak görünümü" : monthLabels[Number(state.month)]}`;
  q("#masterStats").innerHTML = `
    <div class="master-stats-row">
      <span class="summary-pill">${rows.length.toLocaleString("tr-TR")} urun</span>
      <span class="summary-pill">${masterMonth.label}</span>
      <span class="summary-pill">${activeCount.toLocaleString("tr-TR")} aktif urun</span>
      <span class="summary-pill">Toplam ciro: ${money(totalRevenue)}</span>
      <span class="summary-pill">Secili ay maliyeti: ${money(totalCost)}</span>
    </div>
    <div class="master-stats-note">
      ${masterMonth.modeLabel}. Aktif WERP kolonlari: ${activeColumns.join(", ")}.
      Recete aramalarinda MKOD, SKOD, KAP1KOD, KAP2KOD ve TUKOD da filtreye dahildir.
    </div>
  `;
  q("#masterBody").innerHTML = slice.map(r => {
    const totals = state.year === "2025" ? r.totals25 : r.totals26;
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
    const monthVal = state.year === "2025" ? r.months25[index] : r.months26[index];
    return `<tr>
      <td>${r.WKOD ?? "—"}</td><td>${formatCostProduct(r)}</td><td>${r.KATEGORİ ?? "—"}</td><td>${r.Currency ?? "—"}</td><td>${money(r.Base_Price)}</td><td>${money(monthVal)}</td>
    </tr>`;
  }).join("");
}

function filteredCostRows() {
  const monthIndex = currentCostMonthIndex();
  return DATA.costRows
    .map(row => {
      const months = state.year === "2025" ? row.months25 : row.months26;
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

function currencyRateLabel(row) {
  const pb = String(row.currency || "").toUpperCase();
  if (row.exchangeRate === null) return "—";
  if (pb === "TL" || pb === "TRY" || row.exchangeRate === 1) return "1,0000";
  return num(row.exchangeRate, 4);
}

function costRowByCode(wkod) {
  return filteredCostRows().find(row => row.wkod === String(wkod));
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

function updateCostCell(wkod, monthIndex, rawValue, rerender = false) {
  window.alert("Maliyet ve eskalasyon hücreleri kilitlidir. Bu alanlar manuel değiştirilemez.");
  if (rerender) renderCosts();
  return;
  const sourceRow = DATA.costRows.find(row => String(row.WKOD ?? "") === String(wkod));
  if (!sourceRow) return;
  const target = state.year === "2025" ? sourceRow.months25 : sourceRow.months26;
  if (!Array.isArray(target)) return;
  target[monthIndex] = nullableNumber(rawValue) ?? 0;
  persistCostRowEdit(state.year, wkod, target);
  if (rerender) renderCosts();
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
      const months = state.year === "2025" ? row.months25 : row.months26;
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
  return [
    ["Hammadde kartları", num(costRows.length), `${categories} kategori • ${activeMonths}/12 ay dolu`],
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

  const costMonthIndex = currentCostMonthIndex();
  const costRows = filteredCostRows();
  const productRows = buildProductCostRows();
  renderAnalysisCards("#costInsightGrid", buildCostInsights(costRows, productRows).slice(0, 6));
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
  q("#costBody").innerHTML = costRows.map(row => `
    <tr>
      <td>${esc(row.wkod)}</td>
      <td>${esc(row.product)}</td>
      <td>${esc(row.dimension)}</td>
      <td>${esc(row.category)}</td>
      <td>${money(row.basePrice)}</td>
      <td>${esc(row.currency)}</td>
      ${row.monthValues.map((value, idx) => `
        <td class="cost-month-cell" data-wkod="${esc(row.wkod)}" data-month="${idx + 1}">
          <div class="cost-cell-control">
            <input class="cost-input cost-locked-input" data-wkod="${esc(row.wkod)}" data-month="${idx}" value="${money(value)}" inputmode="decimal" title="Hammadde maliyeti kilitli / hesap alanı" readonly />
            <button class="cost-explain" type="button" data-wkod="${esc(row.wkod)}" data-month="${idx + 1}" title="Hesap ve eskalasyon açıklaması">?</button>
          </div>
        </td>
      `).join("")}
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
        <td><input class="expense-input" data-row="${row.rowIndex}" data-month="${idx}" value="${money(value)}" inputmode="decimal" title="Bu hücre değiştirilebilir" /></td>
      `).join("")}
      <td><strong>${money(row.total)}</strong></td>
      <td>${money(row.avg)}</td>
      <td>${num(row.zeroCount)}</td>
    </tr>
  `).join("") || `<tr><td colspan="16">Gider kaydı yok.</td></tr>`;
  q("#expenseMeta").textContent = `${metrics.length.toLocaleString("tr-TR")} gider kalemi • Tablo başlıklarından büyükten küçüğe / küçükten büyüğe sıralanır • Ay hücreleri düzenlenebilir ve tarayıcıda kalıcı kaydedilir`;
}

function renderControl() {
  const summary = yearConfidenceSummary(state.year);
  const audit = buildDetailLayerAudit(state.year);
  const checks = DATA.controls[state.year] || [];
  const sourceFiles = (loadImports().files || []).filter(file => (file.years || []).includes(String(state.year)));
  const systemChecks = [
    {
      label: "Detay ciro = Ozet toplam ciro",
      left: summary.detailRevenue,
      right: safe(currentYearData().overview?.totalRevenue)
    },
    {
      label: "Gider satirlari = Ozet toplam gider",
      left: safe(currentYearData().expenseRows?.reduce((sum, row) => sum + safe(row?.[13]), 0)),
      right: safe(currentYearData().overview?.totalExpense)
    },
    {
      label: "Boş müşteri satırı",
      left: summary.blankCustomerCount,
      right: 0
    },
    {
      label: "Boş fatura satırı",
      left: summary.blankInvoiceCount,
      right: 0
    },
    {
      label: "Tamamen kimliksiz satir",
      left: audit.combined.orphanCount,
      right: 0
    }
  ];
  const renderedChecks = [...checks, ...systemChecks];
  const problemRows = buildAuditProblemRows(state.year, 10);
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
    return `<div class="control-item ${pass ? "pass" : "fail"}">
      <strong>${c.label}</strong>
      <div class="control-values">
        <span>Sol: ${money(c.left)}</span>
        <span>Sağ: ${money(c.right)}</span>
        <span>Fark: ${money(diff)}</span>
      </div>
    </div>`;
  }).join("");
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
  DATA = cloneData(BASE_DATA);
  applyImportsToData(DATA, imports);
  applyExpenseEditsToData(DATA, loadExpenseEdits());
  applyManualEditsToData(DATA, loadManualEdits());
  applyCostEditsToData(DATA, loadCostEdits());
  DETAIL_CACHE = null;
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

function clearImports() {
  localStorage.removeItem(IMPORT_STORAGE_KEY);
  DATA = cloneData(BASE_DATA);
  DETAIL_CACHE = null;
  state.importLog.unshift("Yerel içe aktarım verisi temizlendi.");
  populateMonthSelect();
  render();
}

function updateHeader() {
  const meta = {
    overview:["Genel Bakış","Yıl geçişli ve karşılaştırmalı özet"],
    yonplus:["YÖN_PLUS","Aylık bloklar ve kategori performansı"],
    yonrapor:["YÖN_RAPOR","Yıllık özet, kar zinciri ve üst müşteri listesi"],
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
  renderYearNotice();
  updateHeader();
  renderOverview();
  if (state.view === "yonplus") renderYONPlus();
  if (state.view === "yonrapor") renderYONRapor();
  if (state.view === "categories") renderCategoryProfit();
  if (state.view === "customers") renderCustomers();
  if (state.view === "master") renderMaster();
  if (state.view === "costs") renderCosts();
  if (state.view === "expenses") renderExpenses();
  if (state.view === "control") renderControl();
  if (state.view === "import") renderImport();
  qa(".view").forEach(v => v.classList.remove("active"));
  q(`#${state.view}View`).classList.add("active");
  qa(".menu-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === state.view));
  syncDebugState();
  repairRenderedText(q(".app-shell"));
}

function bind() {
  qa(".menu-item").forEach(btn => btn.addEventListener("click", () => { state.view = btn.dataset.view; render(); }));
  q("#incomeTable")?.addEventListener("click", e => {
    const cell = e.target.closest(".income-value");
    if (!cell) return;
    if (e.ctrlKey && saveManualIncomeCell(cell)) return;
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
  const yearSelect = q("#yearSelect");
  yearSelect.innerHTML = Object.keys(DATA.years).map(y => `<option value="${y}">${y}</option>`).join("");
  yearSelect.value = state.year;
  yearSelect.addEventListener("change", e => { state.year = e.target.value; state.month = "all"; state.masterPage = 1; populateMonthSelect(); render(); });

  q("#monthSelect").addEventListener("change", e => { state.month = e.target.value; state.masterPage = 1; render(); });

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
  q("#expenseBody")?.addEventListener("focusout", event => {
    const input = event.target.closest(".expense-input");
    if (!input) return;
    updateExpenseCell(Number(input.dataset.row), Number(input.dataset.month), input.value, true);
  });
  q("#expenseBody")?.addEventListener("input", event => {
    const input = event.target.closest(".expense-input");
    if (!input) return;
    updateExpenseCell(Number(input.dataset.row), Number(input.dataset.month), input.value, false);
  });
  q("#expenseBody")?.addEventListener("change", event => {
    const input = event.target.closest(".expense-input");
    if (!input) return;
    updateExpenseCell(Number(input.dataset.row), Number(input.dataset.month), input.value, true);
  });
  q("#expenseBody")?.addEventListener("keydown", event => {
    const input = event.target.closest(".expense-input");
    if (!input || event.key !== "Enter") return;
    event.preventDefault();
    updateExpenseCell(Number(input.dataset.row), Number(input.dataset.month), input.value, true);
    input.blur();
  });

  q("#importProcess")?.addEventListener("click", () => {
    processImports().catch(error => {
      state.importLog.unshift(`Hata: ${error.message}`);
      renderImport();
    });
  });
  q("#importExport")?.addEventListener("click", exportImports);
  q("#importClear")?.addEventListener("click", clearImports);
}

function populateMonthSelect() {
  const monthSelect = q("#monthSelect");
  monthSelect.innerHTML = `<option value="all">Tümü</option>` + availableMonths().map(m => `<option value="${m.value}">${m.label}</option>`).join("");
  monthSelect.value = state.month;
}

populateMonthSelect();
bind();
render();
