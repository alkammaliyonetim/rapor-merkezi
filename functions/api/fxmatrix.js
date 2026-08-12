function parseRateValue(rawValue) {
  const text = String(rawValue ?? "").trim();
  if (!text) return null;
  const normalized = text
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function extractCurrencyField(xml, currencyCode, fieldName) {
  const pattern = new RegExp(
    `<Currency\\b[^>]*CurrencyCode=(?:"${currencyCode}"|'${currencyCode}'|${currencyCode})[\\s\\S]*?<${fieldName}>([^<]+)<\\/${fieldName}>[\\s\\S]*?<\\/Currency>`,
    "i"
  );
  const match = xml.match(pattern);
  return parseRateValue(match?.[1]);
}

function extractRate(xml, currencyCode) {
  const buying = extractCurrencyField(xml, currencyCode, "ForexBuying");
  const selling = extractCurrencyField(xml, currencyCode, "ForexSelling");
  if (buying === null && selling === null) return null;
  return {
    buying,
    selling
  };
}

function isFutureMonth(date) {
  const today = new Date();
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth();
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return year > todayYear || (year === todayYear && month > todayMonth);
}

function tcmbUrlForDate(date) {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return {
    dd,
    mm,
    yyyy,
    url: `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`
  };
}

async function fetchTcmbRate(dateStr, currencyCode) {
  const requestedDate = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(requestedDate.getTime()) || isFutureMonth(requestedDate)) return null;
  const year = requestedDate.getUTCFullYear();
  const month = requestedDate.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = new Date();
  const isCurrentMonth = year === today.getUTCFullYear() && month === today.getUTCMonth();
  const maxDay = isCurrentMonth ? Math.min(today.getUTCDate(), lastDayOfMonth) : lastDayOfMonth;
  const startDay = requestedDate.getUTCDate();
  const finalDay = Math.min(maxDay, startDay + 10);

  for (let day = startDay; day <= finalDay; day += 1) {
    const probeDate = new Date(Date.UTC(year, month, day));
    const { dd, mm, yyyy, url } = tcmbUrlForDate(probeDate);
    const res = await fetch(url);
    if (res.ok) {
      const xml = await res.text();
      const rate = extractRate(xml, currencyCode);
      if (rate?.selling) {
        return {
          requestedDate: dateStr,
          resolvedDate: `${yyyy}-${mm}-${dd}`,
          buying: rate.buying,
          selling: rate.selling,
          rate: rate.selling
        };
      }
    }
  }
  return null;
}

function monthDates(year) {
  return Array.from({ length: 12 }, (_, idx) => `${year}-${String(idx + 1).padStart(2, "0")}-01`);
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year") || "");
  const currencies = String(url.searchParams.get("currencies") || "USD,EUR")
    .split(",")
    .map(item => item.trim().toUpperCase())
    .filter(Boolean);

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return new Response(JSON.stringify({ error: "year parametresi gecerli bir yil olmali" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const dates = monthDates(year);
    const matrix = {};
    for (const currency of currencies) {
      if (currency === "TL" || currency === "TRY") {
        matrix[currency] = dates.map(date => ({
          requestedDate: date,
          resolvedDate: date,
          rate: 1,
          source: "TRY"
        }));
        continue;
      }
      matrix[currency] = [];
      for (const date of dates) {
        const rate = await fetchTcmbRate(date, currency);
        matrix[currency].push(rate ? { ...rate, source: "TCMB" } : {
          requestedDate: date,
          resolvedDate: null,
          rate: null,
          source: "TCMB"
        });
      }
    }
    return new Response(JSON.stringify({ year, dates, matrix }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error) }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
}
