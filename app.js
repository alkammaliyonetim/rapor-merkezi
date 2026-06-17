
const IMPORT_STORAGE_KEY = "raporMerkeziImportsV1";
const ANNUAL_INPUT_STORAGE_KEY = "raporMerkeziAnnualInputsV1";
const BASE_DATA = window.REPORT_DATA;
const DETAIL_BASE = window.REPORT_DETAIL_DATA || { sales: [], payroll: [], payrollExpenseRows: [] };
let DATA = hydrateData(BASE_DATA);
let DETAIL_CACHE = null;
const state = { year: "2025", month: "all", view: "overview", masterPage: 1, masterPageSize: 50, masterSearch: "", masterCategory: "Tümü", costSearch: "", costCurrency: "Tümü", costSortKey: "selectedCost", costSortDir: "desc", escalationSortKey: "deltaPct", escalationSortDir: "desc", importLog: [], detailPayload: null, detailFilter: "" };

const monthLabels = {
  1:"Ocak",2:"Şubat",3:"Mart",4:"Nisan",5:"Mayıs",6:"Haziran",
  7:"Temmuz",8:"Ağustos",9:"Eylül",10:"Ekim",11:"Kasım",12:"Aralık"
};

const colorClasses = ["blue","green","orange","purple","teal","gold","red","cyan","olive","navy","pink","brown"];

const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];

function money(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(v));
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
      payrollRows: Array.isArray(parsed.payrollRows) ? parsed.payrollRows : []
    };
  } catch (error) {
    return { salesRows: [], expenseRows: [], payrollRows: [] };
  }
}

function saveImports(imports) {
  localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(imports));
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

function formatVersionStamp(meta = {}) {
  const source = meta.generatedAt ? new Date(meta.generatedAt) : new Date();
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const dd = String(source.getDate()).padStart(2, "0");
  const mon = String(source.getMonth() + 1).padStart(2, "0");
  const yy = String(source.getFullYear()).slice(-2);
  return `${hh}${mm}${dd}${mon}${yy}`;
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
  const invoiceCount = new Set(salesRows.map(row => row.invoiceNo).filter(Boolean)).size;
  const completedItems = [];
  const missingItems = [];
  let status = "ready";
  let statusLabel = "Hazir";
  let statusReason = `${yearKey} verisi sunum icin kullanilabilir durumda.`;

  if (loadedMonths.length) {
    completedItems.push(`Satis aylari ${monthSpanText(loadedMonths)}`);
  }
  if (salesRows.length) {
    completedItems.push(`Satis detay ${num(salesRows.length)} satir${invoiceCount ? ` | ${num(invoiceCount)} fatura` : ""}`);
  }
  if (expenseMonthsLoaded.length) {
    completedItems.push(`Gider kapsami ${monthSpanText(expenseMonthsLoaded)}`);
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
    completedItems.push("Veri baglantisi yok");
  }

  if (closedMissingMonths.length) {
    missingItems.push(`Satis eksigi ${monthSpanText(closedMissingMonths)}`);
  }
  if (expenseClosedMissingMonths.length) {
    missingItems.push(`Gider eksigi ${monthSpanText(expenseClosedMissingMonths)}`);
  }
  if (!payrollMonths.length && expenseMonthsLoaded.length) {
    missingItems.push("Bordro detayi yok");
  }
  if (checks.length && controlPassCount < checks.length) {
    missingItems.push(`Kontrol farki ${checks.length - controlPassCount}`);
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

  if (closedMissingMonths.length || expenseMissing) {
    status = "risk";
    statusLabel = "Eksik";
    statusReason = expenseClosedMissingMonths.length
      ? "Kapanmis aylarin gider kapsami eksik; net kar resmi tamam degil."
      : expenseMissing
      ? "Gider ve bordro bagli olmadigi icin net kar resmi tamam degil."
      : "Kapanmis aylarin tamami raporda gorunmuyor.";
  } else if ((checks.length && controlPassCount < checks.length) || activeMonth) {
    status = "warn";
    statusLabel = "Kontrol Et";
    statusReason = checks.length && controlPassCount < checks.length
      ? "Kontrol ekraninda fark bulunan toplamlar var."
      : `${monthLabels[activeMonth]} ${yearKey} aktif ay; sunum YTD olarak okunmali.`;
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
  const summary = yearConfidenceSummary();
  if (summary.status === "ready") {
    notice.classList.add("hidden");
    return;
  }

  const messages = [
    `${summary.todayLabel} itibariyla kapanmis ay kapsami: ${summary.closedCoveredCount}/${summary.closedMonths.length || summary.loadedMonths.length}.`,
    `Kayitli satis aylari: ${monthListText(summary.loadedMonths)}.`
  ];
  if (summary.lastSalesDate) messages.push(`Son kayit tarihi: ${formatDateLabel(summary.lastSalesDate)}.`);
  if (summary.closedMissingMonths.length) {
    messages.push(`Kapanmis ama raporda olmayan aylar: ${monthListText(summary.closedMissingMonths)}.`);
  }
  if (summary.expenseClosedMissingMonths.length) {
    messages.push(`Gideri eksik kapanmis aylar: ${monthListText(summary.expenseClosedMissingMonths)}.`);
  }
  if (summary.activeMonth) {
    messages.push(`${monthLabels[summary.activeMonth]} ${summary.yearKey} aktif ay; kapanis sonrasi son kontrol yapilacak.`);
  }
  if (summary.expenseMissing) {
    messages.push("Gider ve bordro bagli olmadigi icin net kar su an tamamlanmis finans resmi vermiyor.");
  }
  if (summary.sourceNote) {
    messages.push(`Kaynak: ${summary.sourceNote}.`);
  }

  notice.innerHTML = messages.map(message => `<div class="notice-line">${esc(message)}</div>`).join("");
  notice.classList.remove("hidden");
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
  const salesRows = dedupeRows(
    [...(DETAIL_BASE.sales || []).map(normalizeSalesDetailRow), ...(imports.salesRows || []).map(normalizeSalesDetailRow)]
      .filter(row => row.year && row.month && (row.amount || row.quantity) && row.product),
    row => `${row.year}|${row.month}|${row.date}|${row.invoiceNo}|${row.customerCode}|${row.productCode}|${row.product}|${row.quantity}|${row.amount}|${row.sourceFile}`
  ).sort((a, b) =>
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
    const label = String(labelFn(row) || "").trim() || "Kayıtsız";
    totals.set(label, safe(totals.get(label)) + safe(valueFn(row)));
  });
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
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
    customerName: row.customerName || row.customerCode || "Kayıtsız",
    productCode: row.productCode || "—",
    product: row.product,
    unit: row.unit || defaultUnitForCategory(row.category),
    quantity: safe(row.quantity),
    amount: safe(row.amount),
    metricValue: salesMetricValue(row, kind, yearData),
    sourceFile: row.sourceFile
  })).sort((a, b) => b.metricValue - a.metricValue || a.customerName.localeCompare(b.customerName, "tr"));

  const detailTotal = rows.reduce((sum, row) => sum + safe(row.metricValue), 0);
  const cellTotal = summaryCellValue(kind, month, itemName);
  const monthRanking = buildTopList(categoryRows, row => monthLabels[row.month] || row.month, row => salesMetricValue(row, kind, yearData), 12);
  const stats = [
    { label: "Satır", value: num(rows.length) },
    { label: "Hücre Değeri", value: valueText(displayKind, cellTotal, itemName && kind === "qty" ? rows[0]?.unit || defaultUnitForCategory(itemName) : "") },
    { label: "Ham Liste", value: valueText(displayKind, detailTotal, itemName && kind === "qty" ? rows[0]?.unit || defaultUnitForCategory(itemName) : "") },
    { label: "Müşteri", value: num(new Set(rows.map(row => row.customerName).filter(Boolean)).size) },
    { label: "Ürün", value: num(new Set(rows.map(row => row.product).filter(Boolean)).size) }
  ];
  const insights = [
    { title: "En Çok Kime Satıldı", kind: displayKind, items: buildTopList(rows, row => row.customerName, row => row.metricValue) },
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
  const note = rows.length
    ? (Math.abs(detailTotal - cellTotal) > 1
      ? "Ham satır toplamı ile özet hücre farklıysa, kaynak dosyada eksik cari/fatura alanları veya özet bloklardan gelen satırlar bulunuyor olabilir."
      : "")
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
          <li><span>${esc(item.label)}</span><span>${esc(valueText(block.kind || "money", item.value))}</span></li>
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
}

function incomeCell(value, kind, month, itemName = "", className = "") {
  const isFilled = value !== null && value !== undefined && value !== "" && safe(value) !== 0;
  const attrs = isFilled ? ` class="income-value ${className}" data-kind="${kind}" data-month="${month}" data-item="${esc(itemName)}"` : ` class="${className}"`;
  return `<td${attrs}>${isFilled ? money(value) : "0"}</td>`;
}

function incomeQtyCell(value, month, itemName, unit) {
  const isFilled = value !== null && value !== undefined && value !== "" && safe(value) !== 0;
  return `<td class="${isFilled ? "income-value" : ""}" ${isFilled ? `data-kind="qty" data-month="${month}" data-item="${esc(itemName)}"` : ""}>${isFilled ? num(value, unit === "M2" || unit === "M" ? 3 : 0) : "0"}</td>`;
}

function renderOverviewConfidence() {
  const summary = yearConfidenceSummary();
  const toneValue = { ready: "Yuksek", warn: "Orta", risk: "Dusuk" }[summary.status] || "Orta";
  const closedTarget = summary.closedMonths.length || summary.loadedMonths.length;
  const closedValue = closedTarget ? `${summary.closedCoveredCount}/${closedTarget}` : "0/0";
  const closedSub = summary.closedMissingMonths.length
    ? `Eksik kapanmis aylar: ${monthListText(summary.closedMissingMonths)}`
    : (summary.closedMonths.length ? "Kapanmis aylar raporda gorunuyor." : `${summary.yearKey} icin kapanmis ay beklenmiyor.`);
  const netValue = summary.expenseMissing ? "Eksik" : "Hazir";
  const netSub = summary.expenseMissing
    ? `Gider kapsami: ${summary.expenseMonthsLoaded.length ? monthSpanText(summary.expenseMonthsLoaded) : "yok"}`
    : `Toplam gider: ${money(summary.expenseTotal)}`;
  const sourceMeta = [
    `${summary.salesRowCount.toLocaleString("tr-TR")} satis satiri`,
    summary.invoiceCount ? `${summary.invoiceCount.toLocaleString("tr-TR")} fatura` : "",
    summary.controlCount ? `${summary.controlPassCount}/${summary.controlCount} kontrol` : "kontrol bekliyor"
  ].filter(Boolean).join(" • ");
  const sourceSub = [
    sourceMeta,
    summary.lastSalesDate ? `Son kayit ${formatDateLabel(summary.lastSalesDate)}` : ""
  ].filter(Boolean).join(" • ");

  const noMissingItems = summary.missingItems.length === 1 && summary.missingItems[0] === "Eksik veri yok";
  const pendingTone = noMissingItems ? "ready" : (summary.status === "warn" ? "warn" : "risk");
  const pendingLabel = noMissingItems ? "Temiz" : "Eksik / Bekleyen";

  q("#overviewConfidence").innerHTML = `
    <div class="card trust-card ${summary.status}">
      <div class="trust-head">
        <span class="trust-label">Sunum Durumu</span>
        <span class="trust-chip ${summary.status}">${summary.statusLabel}</span>
      </div>
      <div class="trust-value">${toneValue}</div>
      <div class="trust-sub">${esc(summary.statusReason)}</div>
    </div>
    <div class="card trust-card ${summary.closedMissingMonths.length ? "warn" : "ready"}">
      <div class="trust-head">
        <span class="trust-label">Kapanmis Aylar</span>
        <span class="trust-chip ${summary.closedMissingMonths.length ? "warn" : "ready"}">${closedValue}</span>
      </div>
      <div class="trust-value">${closedValue}</div>
      <div class="trust-sub">${esc(closedSub)}</div>
    </div>
    <div class="card trust-card ${summary.expenseMissing ? "risk" : "ready"}">
      <div class="trust-head">
        <span class="trust-label">Net Kar Guveni</span>
        <span class="trust-chip ${summary.expenseMissing ? "risk" : "ready"}">${netValue}</span>
      </div>
      <div class="trust-value">${netValue}</div>
      <div class="trust-sub">${esc(netSub)}</div>
    </div>
    <div class="card trust-card ${summary.controlCount && summary.controlPassCount === summary.controlCount ? "ready" : "warn"}">
      <div class="trust-head">
        <span class="trust-label">Kaynak ve Kontrol</span>
        <span class="trust-chip ${summary.controlCount && summary.controlPassCount === summary.controlCount ? "ready" : "warn"}">${summary.controlPassCount}/${summary.controlCount || 0}</span>
      </div>
      <div class="trust-value">${summary.salesRowCount.toLocaleString("tr-TR")}</div>
      <div class="trust-sub">${esc(sourceSub || "Kaynak ozeti bekleniyor.")}</div>
    </div>
    <div class="card trust-status-card">
      <div class="trust-status-headline">
        <div class="trust-status-copy">
          <span class="trust-label">Veri Durumu</span>
          <strong>${esc(summary.statusReason)}</strong>
        </div>
        <div class="trust-status-meta">
          <span class="trust-chip ${summary.status}">${summary.statusLabel}</span>
          <span class="trust-mini-stat ready">${summary.completedItems.length} tamam</span>
          <span class="trust-mini-stat ${pendingTone}">${noMissingItems ? "eksik yok" : `${summary.missingItems.length} takip`}</span>
        </div>
      </div>
      <div class="trust-status-grid">
        <div class="trust-status-panel ready compact">
          <div class="trust-status-title">Tamam Olanlar</div>
          <div class="trust-status-badges">
            ${summary.completedItems.map(item => `<span class="trust-status-badge ready">${esc(item)}</span>`).join("")}
          </div>
        </div>
        <div class="trust-status-panel ${pendingTone} compact">
          <div class="trust-status-title">${pendingLabel}</div>
          <div class="trust-status-badges">
            ${summary.missingItems.map(item => `<span class="trust-status-badge ${pendingTone}">${esc(item)}</span>`).join("")}
          </div>
        </div>
      </div>
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
  const row = (label, section, cells, cls = "", total = null, digits = 0, totalFormat = "money") => {
    const totalText = total === null ? "" : (totalFormat === "number" ? num(total, digits) : money(total));
    rows.push(`<tr class="${cls}"><th>${label}</th><td class="trend">${section}</td>${cells}<td class="year-total">${totalText}</td></tr>`);
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
  renderOverviewConfidence();
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
  q("#masterPageLabel").textContent = `Sayfa ${state.masterPage} / ${totalPages} • ${slice.length.toLocaleString("tr-TR")} kayit`;
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
      return {
        wkod: String(row.WKOD ?? "—"),
        product: formatCostProduct(row),
        category: row.KATEGORİ ?? "—",
        currency: row.Currency ?? "—",
        basePrice: safe(row.Base_Price),
        selectedCost: safe(months?.[monthIndex]),
        searchText: `${row.WKOD ?? ""} ${formatCostProduct(row)} ${row.KALINLIK_BOY ?? ""} ${row.KATEGORİ ?? ""} ${row.Currency ?? ""}`.toLowerCase()
      };
    })
    .filter(row => {
      const searchOk = !state.costSearch || row.searchText.includes(state.costSearch.toLowerCase());
      const currencyOk = state.costCurrency === "Tümü" || row.currency === state.costCurrency;
      return searchOk && currencyOk;
    })
    .sort((left, right) => compareSortValues(left[state.costSortKey], right[state.costSortKey], state.costSortDir));
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
      return {
        code: String(row.WKOD ?? "—"),
        product: formatCostProduct(row),
        category: row.KATEGORİ ?? "—",
        currency: row.Currency ?? "—",
        basePrice: safe(row.Base_Price),
        firstMonth: first.month,
        firstMonthLabel: first.label,
        currentMonth: current.month,
        currentMonthLabel: current.label,
        firstCost: first.cost,
        currentCost: current.cost,
        deltaTl: current.cost - first.cost,
        deltaPct: first.cost ? (current.cost - first.cost) / first.cost : null,
        searchText: `${row.WKOD ?? ""} ${formatCostProduct(row)} ${row.KATEGORİ ?? ""} ${row.Currency ?? ""}`.toLowerCase()
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
    const vals = [...new Set(DATA.costRows.map(r => r.Currency).filter(Boolean))];
    currencySel.innerHTML = `<option>Tümü</option>${vals.map(v => `<option>${v}</option>`).join("")}`;
    currencySel.dataset.filled = "1";
  }
  currencySel.value = state.costCurrency;
  renderAnnualInputCard();

  const costMonthIndex = currentCostMonthIndex();
  const costRows = filteredCostRows();
  const costHead = q("#costsView .card:first-child thead");
  if (costHead) {
    costHead.innerHTML = `<tr>
      <th>${renderSortButton("WKOD", "wkod", "costSortKey", "costSortDir", "asc")}</th>
      <th>${renderSortButton("Ürün", "product", "costSortKey", "costSortDir", "asc")}</th>
      <th>${renderSortButton("Kategori", "category", "costSortKey", "costSortDir", "asc")}</th>
      <th>${renderSortButton("PB", "currency", "costSortKey", "costSortDir", "asc")}</th>
      <th>${renderSortButton("Base Price", "basePrice", "costSortKey", "costSortDir", "desc")}</th>
      <th>${renderSortButton("Seçili Ay Maliyeti", "selectedCost", "costSortKey", "costSortDir", "desc")}</th>
    </tr>`;
  }
  q("#costBody").innerHTML = costRows.map(row => `
    <tr>
      <td>${esc(row.wkod)}</td>
      <td>${esc(row.product)}</td>
      <td>${esc(row.category)}</td>
      <td>${esc(row.currency)}</td>
      <td>${money(row.basePrice)}</td>
      <td>${money(row.selectedCost)}</td>
    </tr>
  `).join("") || `<tr><td colspan="6">Bu filtreye uygun maliyet kaydı yok.</td></tr>`;
  q("#costMeta").textContent = `${costRows.length.toLocaleString("tr-TR")} kayıt • ${state.year} • ${monthLabels[costMonthIndex + 1]} baz alındı`;

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
      <td>${money(row.deltaTl)}</td>
      <td>${pct(row.deltaPct)}</td>
      <td>${money(row.basePrice)}</td>
    </tr>
  `).join("") || `<tr><td colspan="11">Bu filtreye uygun eskalasyon kaydı yok.</td></tr>`;

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
  q("#escalationMeta").textContent = `${escalationRows.length.toLocaleString("tr-TR")} kayıt • İlk dolu ay ile güncel ay maliyeti karşılaştırılıyor${manualLocked.length ? ` • ${manualLocked.join(" + ")} manuel yillik baz ile ayrildi` : ""}${fallbackCount ? ` • ${fallbackCount.toLocaleString("tr-TR")} satırda seçili ay boş olduğu için son dolu ay kullanıldı` : ""}`;
}

function renderExpenses() {
  const rows = currentYearData().expenseRows || DATA.expenseRows || [];
  q("#expenseBody").innerHTML = rows.map(r => `<tr>${r.map((v,idx)=>`<td>${idx===0 ? (v ?? "—") : money(v)}</td>`).join("")}</tr>`).join("");
}

function renderControl() {
  const checks = DATA.controls[state.year] || [];
  q("#controlList").innerHTML = checks.map(c => {
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
    const findIdx = labels => headers.findIndex(h => labels.some(label => h.includes(label)));
    const idx = {
      date: findIdx(["FATURA TAR"]),
      no: findIdx(["FATURA NO"]),
      cari: findIdx(["CARI KODU"]),
      unvan: findIdx(["UNVANI"]),
      code: findIdx(["KOD"]),
      product: findIdx(["MALIN/HIZMETIN CINSI"]),
      qty: findIdx(["MIKTAR"]),
      unit: findIdx(["MALIN"]),
      price: findIdx(["FIYAT"]),
      amount: findIdx(["TUTAR"]),
      vat: findIdx(["KDV TUTARI"]),
      total: findIdx(["GENEL TOPLAM"])
    };
    const carry = { date: null, no: "", cari: "", unvan: "" };
    sheet.rows.slice(headerIndex + 1).forEach(row => {
      const product = row[idx.product] || "";
      const code = row[idx.code] || "";
      const normalizedRow = normalizeText(row.join(" "));
      if (!product && !code) return;
      if (normalizedRow.startsWith("---") || normalizedRow.includes("TOPLAM")) return;
      const nextDate = parseDateValue(row[idx.date]);
      if (nextDate) carry.date = nextDate;
      if (row[idx.no]) carry.no = String(row[idx.no]).trim();
      if (row[idx.cari]) carry.cari = String(row[idx.cari]).trim();
      if (row[idx.unvan]) carry.unvan = String(row[idx.unvan]).trim();
      const tutar = toNumber(row[idx.amount]);
      const miktar = toNumber(row[idx.qty]);
      if (!carry.date || (!tutar && !miktar)) return;
      const date = new Date(`${carry.date}T00:00:00`);
      parsed.push({
        sourceFile: file.name,
        tarih: carry.date,
        yil: String(date.getFullYear()),
        ay: date.getMonth() + 1,
        faturaNo: carry.no,
        cariKodu: carry.cari,
        unvan: carry.unvan,
        kod: String(code || "").trim(),
        urun: String(product || "").trim(),
        kategori: categoryFrom(code, product, row[idx.unit]),
        miktar,
        birim: String(row[idx.unit] || "").trim(),
        fiyat: toNumber(row[idx.price]),
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

function refreshDataFromImports(imports) {
  DATA = cloneData(BASE_DATA);
  applyImportsToData(DATA, imports);
  DETAIL_CACHE = null;
  populateMonthSelect();
}

function renderImport() {
  const body = q("#importPreviewBody");
  if (!body) return;
  const imports = loadImports();
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
  `;
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
  for (const file of salesFiles) {
    const rows = await parseSalesFile(file);
    imports.salesRows.push(...rows);
    addedSales += rows.length;
    state.importLog.unshift(`${file.name}: ${num(rows.length)} satış satırı okundu.`);
  }
  for (const file of expenseFiles) {
    const parsed = await parseExpenseFile(file);
    imports.expenseRows.push(...parsed.expenseRows);
    imports.payrollRows.push(...parsed.payrollRows);
    addedExpenses += parsed.expenseRows.length;
    addedPayroll += parsed.payrollRows.length;
    state.importLog.unshift(`${file.name}: ${num(parsed.expenseRows.length)} gider, ${num(parsed.payrollRows.length)} bordro satırı okundu.`);
  }
  imports.salesRows = dedupeRows(imports.salesRows, r => `${r.tarih}|${r.faturaNo}|${r.cariKodu}|${r.kod}|${r.urun}|${r.miktar}|${r.tutar}`);
  imports.expenseRows = dedupeRows(imports.expenseRows, r => `${r.year}|${r.month}|${r.kategori}|${r.tutar}|${r.sourceFile}`);
  imports.payrollRows = dedupeRows(imports.payrollRows, r => `${r.year}|${r.month}|${r.employee}|${r.gross}|${r.net}|${r.sourceFile}`);
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
  q("#pageSubtitle").textContent = meta[1];
  q("#lastUpdate").textContent = `Son versiyon: ${formatVersionStamp(DATA.meta)}`;
}

function render() {
  renderYearNotice();
  updateHeader();
  renderOverview();
  renderYONPlus();
  renderYONRapor();
  renderCategoryProfit();
  renderCustomers();
  renderMaster();
  renderCosts();
  renderExpenses();
  renderControl();
  renderImport();
  qa(".view").forEach(v => v.classList.remove("active"));
  q(`#${state.view}View`).classList.add("active");
  qa(".menu-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === state.view));
}

function bind() {
  qa(".menu-item").forEach(btn => btn.addEventListener("click", () => { state.view = btn.dataset.view; render(); }));
  q("#incomeTable")?.addEventListener("click", e => {
    const cell = e.target.closest(".income-value");
    if (!cell) return;
    const month = Number(cell.dataset.month);
    const item = cell.dataset.item || "";
    const kind = cell.dataset.kind || "sales";
    const labels = { sales: "Satış", qty: "Miktar", cost: "Maliyet", gross: "Brüt Kar", expense: "Gider", net: "Net Kar" };
    const payload = buildDetailPayload(kind, month, item);
    openCellDetail(`${labels[kind] || "Hücre"} Detayı`, `${state.year} • ${monthLabels[month]}${item ? " • " + item : ""}`, payload);
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
  q("#masterPageSize").addEventListener("change", e => { state.masterPageSize = Number(e.target.value); state.masterPage = 1; renderMaster(); });
  q("#masterPrev").addEventListener("click", () => { state.masterPage = Math.max(1, state.masterPage - 1); renderMaster(); });
  q("#masterNext").addEventListener("click", () => { state.masterPage += 1; renderMaster(); });

  q("#costSearch").addEventListener("input", e => { state.costSearch = e.target.value; renderCosts(); });
  q("#costCurrency").addEventListener("change", e => { state.costCurrency = e.target.value; renderCosts(); });
  q("#annualCostSave")?.addEventListener("click", saveAnnualInputsFromForm);
  q("#annualCostClear")?.addEventListener("click", clearAnnualInputsForYear);
  const onSortClick = event => {
    const button = event.target.closest(".sort-header");
    if (!button) return;
    toggleSortState(button.dataset.stateKey, button.dataset.stateDir, button.dataset.sort, button.dataset.defaultDir || "asc");
    renderCosts();
  };
  q("#costsView .card:first-child thead")?.addEventListener("click", onSortClick);
  q("#escalationHead")?.addEventListener("click", onSortClick);

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
