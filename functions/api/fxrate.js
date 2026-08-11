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
  const d = new Date(dateStr + "T00:00:00Z");
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
      if (rate && rate.selling) {
        return { resolvedDate: `${yyyy}-${mm}-${dd}`, ...rate };
      }
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return null;
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const currency = (url.searchParams.get("currency") || "USD").toUpperCase();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(JSON.stringify({ error: "date parametresi YYYY-MM-DD formatinda gerekli" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (currency === "TRY") {
    return new Response(JSON.stringify({ requestedDate: date, resolvedDate: date, currency, buying: 1, selling: 1, rate: 1, source: "TRY" }), { headers: { "Content-Type": "application/json" } });
  }
  try {
    const result = await fetchTcmbRate(date, currency);
    if (!result) {
      return new Response(JSON.stringify({ error: `${currency} icin ${date} civarinda (son 8 gun) TCMB kuru bulunamadi` }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      requestedDate: date,
      resolvedDate: result.resolvedDate,
      currency,
      buying: result.buying,
      selling: result.selling,
      rate: result.selling,
      source: "TCMB"
    }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error) }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
