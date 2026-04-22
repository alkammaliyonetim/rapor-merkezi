const money = (value) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

const percent = (value) => `%${Number(value || 0).toFixed(1)}`;

const sampleData = {
  meta: {
    lastUpdate: "2026-04-24"
  },
  summary: {
    totalRevenue: 12500000,
    totalCost: 9100000,
    grossProfit: 3400000,
    grossMargin: 27.2,
    totalExpense: 1450000,
    profitBeforeTax: 1950000,
    netProfit: 1560000,
    netMargin: 12.5
  },
  monthly: [
    { label: "Ocak 2026", totalQuantity: 1200, revenue: 950000, cost: 710000, grossProfit: 240000, netProfit: 140000, netMargin: 14.7 },
    { label: "Şubat 2026", totalQuantity: 1320, revenue: 1100000, cost: 800000, grossProfit: 300000, netProfit: 175000, netMargin: 15.9 },
    { label: "Mart 2026", totalQuantity: 1280, revenue: 980000, cost: 735000, grossProfit: 245000, netProfit: 150000, netMargin: 15.3 }
  ],
  categories: [
    { name: "MDF", quantity: 450, revenue: 3200000, cost: 2450000, profit: 750000, margin: 23.4 },
    { name: "FASON MDF", quantity: 180, revenue: 860000, cost: 610000, profit: 250000, margin: 29.1 },
    { name: "SUNTA", quantity: 390, revenue: 2850000, cost: 2190000, profit: 660000, margin: 23.2 },
    { name: "FASON SUNTA", quantity: 140, revenue: 640000, cost: 470000, profit: 170000, margin: 26.6 },
    { name: "KAPLAMA", quantity: 120, revenue: 940000, cost: 700000, profit: 240000, margin: 25.5 },
    { name: "KENAR BANT", quantity: 80, revenue: 320000, cost: 235000, profit: 85000, margin: 26.6 },
    { name: "ÇARŞAF", quantity: 60, revenue: 210000, cost: 155000, profit: 55000, margin: 26.2 },
    { name: "İŞÇİLİK", quantity: 200, revenue: 1800000, cost: 1180000, profit: 620000, margin: 34.4 },
    { name: "DİĞER", quantity: 90, revenue: 680000, cost: 510000, profit: 170000, margin: 25.0 }
  ],
  customers: [
    { rank: 1, name: "Örnek Müşteri A", revenue: 1650000, share: 13.2 },
    { rank: 2, name: "Örnek Müşteri B", revenue: 1380000, share: 11.0 },
    { rank: 3, name: "Örnek Müşteri C", revenue: 1190000, share: 9.5 },
    { rank: 4, name: "Örnek Müşteri D", revenue: 950000, share: 7.6 }
  ]
};

const data = sampleData;

const pageMap = {
  overview: {
    title: "Genel Bakış",
    subtitle: "Finansal performansın hızlı özeti",
    viewId: "overviewView"
  },
  monthly: {
    title: "Aylık Performans",
    subtitle: "Ay bazlı finansal sonuçlar",
    viewId: "monthlyView"
  },
  customers: {
    title: "Müşteri Analizi",
    subtitle: "Ciro üreten müşteri dağılımı",
    viewId: "customersView"
  },
  categories: {
    title: "Kategori Karlılığı",
    subtitle: "Kategori bazlı karlılık görünümü",
    viewId: "categoriesView"
  },
  report: {
    title: "Yönetim Raporu",
    subtitle: "Yönetici özeti ve kar zinciri",
    viewId: "reportView"
  }
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderSummary() {
  setText("lastUpdate", `Son güncelleme: ${data.meta.lastUpdate}`);
  setText("totalRevenue", money(data.summary.totalRevenue));
  setText("totalCost", money(data.summary.totalCost));
  setText("grossProfit", money(data.summary.grossProfit));
  setText("grossMargin", percent(data.summary.grossMargin));
  setText("totalExpense", money(data.summary.totalExpense));
  setText("profitBeforeTax", money(data.summary.profitBeforeTax));
  setText("netProfit", money(data.summary.netProfit));
  setText("netMargin", percent(data.summary.netMargin));
}

function renderMonthlySummaryTable() {
  const body = document.getElementById("monthlySummaryTable");
  body.innerHTML = data.monthly.map(item => `
    <tr>
      <td>${item.label}</td>
      <td>${money(item.revenue)}</td>
      <td>${money(item.cost)}</td>
      <td>${money(item.grossProfit)}</td>
      <td>${money(item.netProfit)}</td>
    </tr>
  `).join("");
}

function renderCategorySummaryTable() {
  const body = document.getElementById("categorySummaryTable");
  body.innerHTML = data.categories.map(item => `
    <tr>
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>${money(item.revenue)}</td>
      <td>${money(item.profit)}</td>
      <td>${percent(item.margin)}</td>
    </tr>
  `).join("");
}

function renderMonthlyPerformanceTable() {
  const body = document.getElementById("monthlyPerformanceTable");
  body.innerHTML = data.monthly.map(item => `
    <tr>
      <td>${item.label}</td>
      <td>${item.totalQuantity}</td>
      <td>${money(item.revenue)}</td>
      <td>${money(item.cost)}</td>
      <td>${money(item.grossProfit)}</td>
      <td>${money(item.netProfit)}</td>
      <td>${percent(item.netMargin)}</td>
    </tr>
  `).join("");
}

function renderCustomersTable() {
  const body = document.getElementById("customersTable");
  body.innerHTML = data.customers.map(item => `
    <tr>
      <td>${item.rank}</td>
      <td>${item.name}</td>
      <td>${money(item.revenue)}</td>
      <td>${percent(item.share)}</td>
    </tr>
  `).join("");
}

function renderCategoriesTable() {
  const body = document.getElementById("categoriesTable");
  body.innerHTML = data.categories.map(item => `
    <tr>
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>${money(item.revenue)}</td>
      <td>${money(item.cost)}</td>
      <td>${money(item.profit)}</td>
      <td>${percent(item.margin)}</td>
    </tr>
  `).join("");
}

function renderReport() {
  const summary = document.getElementById("reportSummary");
  const bridge = document.getElementById("profitBridge");

  const bestMonth = [...data.monthly].sort((a, b) => b.netProfit - a.netProfit)[0];
  const bestCategory = [...data.categories].sort((a, b) => b.profit - a.profit)[0];
  const topCustomer = [...data.customers].sort((a, b) => b.revenue - a.revenue)[0];

  summary.innerHTML = `
    <div class="report-item">
      <span>En Güçlü Ay</span>
      <strong>${bestMonth?.label || "-"}</strong>
    </div>
    <div class="report-item">
      <span>En Karlı Kategori</span>
      <strong>${bestCategory?.name || "-"}</strong>
    </div>
    <div class="report-item">
      <span>En Büyük Müşteri</span>
      <strong>${topCustomer?.name || "-"}</strong>
    </div>
  `;

  bridge.innerHTML = `
    <div class="report-item">
      <span>Toplam Ciro</span>
      <strong>${money(data.summary.totalRevenue)}</strong>
    </div>
    <div class="report-item">
      <span>Brüt Kar</span>
      <strong>${money(data.summary.grossProfit)}</strong>
    </div>
    <div class="report-item">
      <span>Toplam Gider</span>
      <strong>${money(data.summary.totalExpense)}</strong>
    </div>
    <div class="report-item">
      <span>Net Kar</span>
      <strong>${money(data.summary.netProfit)}</strong>
    </div>
  `;
}

function switchView(viewKey) {
  const meta = pageMap[viewKey];
  if (!meta) return;

  document.querySelectorAll(".menu-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewKey);
  });

  document.querySelectorAll(".view").forEach(view => {
    view.classList.remove("active");
  });

  const target = document.getElementById(meta.viewId);
  if (target) target.classList.add("active");

  setText("pageTitle", meta.title);
  setText("pageSubtitle", meta.subtitle);
}

function bindMenu() {
  document.querySelectorAll(".menu-item").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

function init() {
  renderSummary();
  renderMonthlySummaryTable();
  renderCategorySummaryTable();
  renderMonthlyPerformanceTable();
  renderCustomersTable();
  renderCategoriesTable();
  renderReport();
  bindMenu();
}

init();
