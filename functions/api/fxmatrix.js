function extractRate(xml, currencyCode) {
  const blockMatch = xml.match(new RegExp(`<Currency[^>]*CurrencyCode="${currencyCode}"[\\s\\S]*?</Currency>`));
  if (!blockMatch) return null;
  const block = blockMatch[0];
  const buying = block.match(/<ForexBuying>([\d.]+)<\/ForexBuying>/);
  const selling = block.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/);
  if (!buying && !selling) return null;
  return {
    buying: buying ? Number(buying[1]) : null,
    selling: selling ? Number(selling[1]) : null
  };
}

async function fetchTcmbRate(dateStr, currencyCode) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  for (let i = 0; i < 8; i += 1) {
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    const url = `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`;
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
    d.setUTCDate(d.getUTCDate() - 1);
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
