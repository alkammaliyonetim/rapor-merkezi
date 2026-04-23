const money=v=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:0}).format(Number(v||0));
const num=v=>new Intl.NumberFormat("tr-TR",{maximumFractionDigits:1}).format(Number(v||0));
const percent=v=>`%${Number(v||0).toFixed(1)}`;
const months=["all","01","02","03","04","05","06","07","08","09","10","11","12"];
const monthLabels={all:"Tümü","01":"Ocak","02":"Şubat","03":"Mart","04":"Nisan","05":"Mayıs","06":"Haziran","07":"Temmuz","08":"Ağustos","09":"Eylül","10":"Ekim","11":"Kasım","12":"Aralık"};
const pageMap={
  overview:{title:"Genel Bakış",subtitle:"Yıl geçişli ve karşılaştırmalı özet",viewId:"overviewView"},
  yonplus:{title:"YÖN_PLUS",subtitle:"Aylık bloklar ve kategori performansı",viewId:"yonplusView"},
  yonrapor:{title:"YÖN_RAPOR",subtitle:"Yıllık özet ve karşılaştırmalı yönetim raporu",viewId:"yonraporView"},
  categories:{title:"Kategori Karlılığı",subtitle:"Kategori bazlı performans görünümü",viewId:"categoriesView"},
  customers:{title:"Müşteri Analizi",subtitle:"En çok ciro üreten müşteriler",viewId:"customersView"},
  master:{title:"MASTER_ERP",subtitle:"Tekil işlem bazlı detay veri",viewId:"masterView"},
  costs:{title:"Maliyetler",subtitle:"Ay bazlı ürün maliyetleri",viewId:"costsView"},
  expenses:{title:"Giderler",subtitle:"Toplam gider ve net kar zinciri",viewId:"expensesView"}
};

const state={year:"2026",month:"all",view:"overview"};
const dataRoot=window.MONTHLY_DATA;

function setText(id,val){const el=document.getElementById(id); if(el) el.textContent=val;}
function safe(n){return Number(n||0);}
function yearData(year){return dataRoot.years[year];}
function filteredMonths(year,month){
  const arr=[...(yearData(year)?.monthly||[])];
  if(month==="all") return arr;
  return arr.filter(m=>m.month.endsWith(`-${month}`));
}
function aggregateMonthly(months){
  return months.reduce((a,m)=>({
    revenue:a.revenue+safe(m.revenue),cost:a.cost+safe(m.cost),grossProfit:a.grossProfit+safe(m.grossProfit),
    totalQuantity:a.totalQuantity+safe(m.totalQuantity)
  }),{revenue:0,cost:0,grossProfit:0,totalQuantity:0});
}
function getCurrentSummary(){
  const y=yearData(state.year);
  const monthsArr=filteredMonths(state.year,state.month);
  const agg=aggregateMonthly(monthsArr);
  if(state.month==="all" && y.summary) return {...y.summary,totalQuantity:agg.totalQuantity};
  return {
    totalRevenue:agg.revenue,totalCost:agg.cost,grossProfit:agg.grossProfit,
    grossMargin:agg.revenue?agg.grossProfit/agg.revenue*100:0,
    totalExpense:0,profitBeforeTax:0,netProfit:0,netMargin:0,totalQuantity:agg.totalQuantity
  };
}
function comparisonValue(curr,prev){
  if(!prev) return {cls:"flat",text:"-",detail:"Karşılaştırma verisi yok"};
  const diff=safe(curr)-safe(prev);
  const pct=prev? (diff/prev*100):0;
  const cls=diff>0?"pos":diff<0?"neg":"flat";
  const sign=diff>0?"+":"";
  return {cls,text:`${sign}${pct.toFixed(1)}%`,detail:`${sign}${money(diff)}`};
}
function currentMonthIndex(){
  return state.month==="all" ? filteredMonths(state.year,"all").length : Number(state.month);
}
function computeComparisons(){
  const current = getCurrentSummary().totalRevenue;
  let prevMonth = 0, yoy = 0, ytd = 0;

  if(state.month==="all"){
    const y=yearData(state.year), prevY=yearData(String(Number(state.year)-1));
    const thisMonths=filteredMonths(state.year,"all").length;
    if(prevY){
      ytd=aggregateMonthly(prevY.monthly.slice(0,thisMonths)).revenue;
    }
    const m = y.monthly[y.monthly.length-1];
    const prev = y.monthly[y.monthly.length-2];
    prevMonth = prev?.revenue || 0;
    const sameMonthPrevY = prevY?.monthly[thisMonths-1]?.revenue || 0;
    yoy = sameMonthPrevY;
  } else {
    const y=yearData(state.year), prevY=yearData(String(Number(state.year)-1));
    const idx=Number(state.month)-1;
    prevMonth = y.monthly[idx-1]?.revenue || 0;
    yoy = prevY?.monthly[idx]?.revenue || 0;
    ytd = aggregateMonthly(prevY?.monthly?.slice(0,idx+1)||[]).revenue;
  }
  return {
    prevMonth: comparisonValue(current, prevMonth),
    yoy: comparisonValue(current, yoy),
    ytd: comparisonValue(current, ytd)
  };
}
function renderSelectors(){
  const ySel=document.getElementById("yearSelect"), mSel=document.getElementById("monthSelect");
  ySel.innerHTML = Object.keys(dataRoot.years).sort().map(y=>`<option value="${y}">${y}</option>`).join("");
  ySel.value=state.year;
  mSel.innerHTML = months.map(m=>`<option value="${m}">${monthLabels[m]}</option>`).join("");
  mSel.value=state.month;
  ySel.onchange=e=>{state.year=e.target.value; renderAll();};
  mSel.onchange=e=>{state.month=e.target.value; renderAll();};
}
function renderSummary(){
  const y=yearData(state.year), s=getCurrentSummary();
  setText("lastUpdate",`Son güncelleme: ${dataRoot.meta.lastUpdate}`);
  setText("totalRevenue",money(s.totalRevenue)); setText("totalCost",money(s.totalCost));
  setText("grossProfit",money(s.grossProfit)); setText("grossMargin",percent(s.grossMargin));
  setText("totalExpense",money(s.totalExpense)); setText("profitBeforeTax",money(s.profitBeforeTax));
  setText("netProfit",money(s.netProfit)); setText("netMargin",percent(s.netMargin));

  const c=computeComparisons();
  ["PrevMonth","YoY","Ytd"].forEach((key,i)=>{
    const obj=[c.prevMonth,c.yoy,c.ytd][i];
    const id = key==="YoY" ? "compareYoY" : key==="Ytd" ? "compareYtd" : "comparePrevMonth";
    const detailId = key==="YoY" ? "compareYoYDetail" : key==="Ytd" ? "compareYtdDetail" : "comparePrevMonthDetail";
    const el=document.getElementById(id); el.textContent=obj.text; el.className=obj.cls;
    const d=document.getElementById(detailId); d.textContent=obj.detail; d.className=obj.cls;
  });
}
function renderMonthlySummaryTable(){
  const body=document.getElementById("monthlySummaryTable");
  body.innerHTML=(yearData(state.year).monthly||[]).map(m=>`
    <tr>
      <td>${m.label}</td>
      <td>${money(m.revenue)}</td>
      <td>${money(m.cost)}</td>
      <td>${money(m.grossProfit)}</td>
      <td>${percent(m.grossMargin)}</td>
    </tr>`).join("");
}
function renderCategoryTables(){
  const cats=yearData(state.year).categories||[];
  const totalRevenue=cats.reduce((s,c)=>s+safe(c.revenue),0);
  const html=cats.map(c=>`
    <tr>
      <td>${c.name}</td>
      <td>${num(c.quantity)}</td>
      <td>${money(c.revenue)}</td>
      <td>${money(c.profit)}</td>
      <td>${percent(c.margin)}</td>
    </tr>`).join("");
  document.getElementById("categorySummaryTable").innerHTML=html;
  document.getElementById("categoriesTable").innerHTML=cats.map(c=>`
    <tr>
      <td>${c.name}</td>
      <td>${num(c.quantity)}</td>
      <td>${money(c.revenue)}</td>
      <td>${money(c.cost)}</td>
      <td>${money(c.profit)}</td>
      <td>${percent(c.margin)}</td>
    </tr>`).join("");
  document.getElementById("yonRaporCategories").innerHTML=cats.map(c=>`
    <tr>
      <td>${c.name}</td>
      <td>${num(c.quantity)}</td>
      <td>${money(c.revenue)}</td>
      <td>${percent(totalRevenue? c.revenue/totalRevenue*100:0)}</td>
    </tr>`).join("");
}
function renderCustomers(){
  const customers=yearData(state.year).customers||[];
  const html=customers.map(c=>`
    <tr><td>${c.rank}</td><td>${c.name}</td><td>${money(c.revenue)}</td><td>${percent(c.share)}</td></tr>
  `).join("");
  document.getElementById("customersTable").innerHTML=html;
  document.getElementById("yonRaporCustomers").innerHTML=html;
}
function renderYONPlus(){
  const blocks=yearData(state.year).monthlyBlocks||[];
  const colors=["blue","green","orange","purple","teal","gold"];
  document.getElementById("yonPlusGrid").innerHTML = blocks.map((b,idx)=>`
    <div class="month-block">
      <div class="month-head ${colors[idx%colors.length]}">${b.title}</div>
      <table class="month-table">
        <thead><tr><th>Satışlar</th><th>S.Adet</th><th>S.Ciro</th><th>Maliyet</th><th>Kar</th><th>%</th></tr></thead>
        <tbody>
          ${b.rows.map(r=>`<tr class="${r.total?'total':''}">
            <td>${r.name}</td><td>${num(r.qty)}</td><td>${money(r.revenue)}</td><td>${money(r.cost)}</td><td>${money(r.profit)}</td><td>${percent(r.margin)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  `).join("");
}
function renderYonRapor(){
  const y=yearData(state.year), sum=getCurrentSummary();
  const report = y.report || {
    totalRevenue: sum.totalRevenue, totalCost: sum.totalCost, grossProfit: sum.grossProfit, grossMargin: sum.grossMargin,
    totalExpense: sum.totalExpense, profitBeforeTax: sum.profitBeforeTax, tax: 0, netProfit: sum.netProfit, netMargin: sum.netMargin
  };
  document.getElementById("karZinciri").innerHTML = `
    <div class="report-item"><span>Toplam Satış Cirosu</span><strong>${money(report.totalRevenue)}</strong></div>
    <div class="report-item"><span>Toplam Maliyet</span><strong>${money(report.totalCost)}</strong></div>
    <div class="report-item"><span>Brüt Kar</span><strong>${money(report.grossProfit)}</strong></div>
    <div class="report-item"><span>Brüt Kar Marjı</span><strong>${percent(report.grossMargin)}</strong></div>
    <div class="report-item"><span>Toplam Gider</span><strong>${money(report.totalExpense)}</strong></div>
    <div class="report-item"><span>Vergi Öncesi Kar</span><strong>${money(report.profitBeforeTax)}</strong></div>
    <div class="report-item"><span>Net Kar</span><strong>${money(report.netProfit)}</strong></div>
    <div class="report-item"><span>Net Kar Marjı</span><strong>${percent(report.netMargin)}</strong></div>
  `;
}
function switchView(viewKey){
  state.view=viewKey;
  const meta=pageMap[viewKey];
  document.querySelectorAll(".menu-item").forEach(btn=>btn.classList.toggle("active",btn.dataset.view===viewKey));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById(meta.viewId).classList.add("active");
  setText("pageTitle",meta.title); setText("pageSubtitle",meta.subtitle);
}
function bindMenu(){document.querySelectorAll(".menu-item").forEach(btn=>btn.onclick=()=>switchView(btn.dataset.view))}
function renderAll(){
  renderSelectors();
  renderSummary();
  renderMonthlySummaryTable();
  renderCategoryTables();
  renderCustomers();
  renderYONPlus();
  renderYonRapor();
  switchView(state.view);
}
bindMenu(); renderAll();
