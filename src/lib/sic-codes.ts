/** Common UK SIC 2007 codes for incorporation typeahead (not exhaustive). */

export type SicCode = {
  code: string;
  description: string;
  keywords: string[];
};

export const SIC_CODES: SicCode[] = [
  { code: "01110", description: "Growing of cereals (except rice), leguminous crops and oil seeds", keywords: ["farm", "agriculture", "crops", "cereal"] },
  { code: "10110", description: "Processing and preserving of meat", keywords: ["meat", "food", "processing"] },
  { code: "10710", description: "Manufacture of bread; manufacture of fresh pastry goods and cakes", keywords: ["bakery", "bread", "cake", "pastry"] },
  { code: "14131", description: "Manufacture of other men's outerwear", keywords: ["clothing", "fashion", "apparel"] },
  { code: "18129", description: "Printing n.e.c.", keywords: ["print", "printing"] },
  { code: "35110", description: "Production of electricity", keywords: ["energy", "electricity", "power"] },
  { code: "41100", description: "Development of building projects", keywords: ["property", "development", "construction", "building"] },
  { code: "41201", description: "Construction of commercial buildings", keywords: ["construction", "commercial", "building"] },
  { code: "41202", description: "Construction of domestic buildings", keywords: ["construction", "housing", "building"] },
  { code: "43210", description: "Electrical installation", keywords: ["electrician", "electrical", "wiring"] },
  { code: "43220", description: "Plumbing, heat and air-conditioning installation", keywords: ["plumbing", "heating", "hvac"] },
  { code: "43341", description: "Painting", keywords: ["painter", "decorating"] },
  { code: "45111", description: "Sale of new cars and light motor vehicles", keywords: ["cars", "motors", "vehicle", "dealership"] },
  { code: "47110", description: "Retail sale in non-specialised stores with food, beverages or tobacco predominating", keywords: ["shop", "retail", "grocery", "convenience"] },
  { code: "47190", description: "Other retail sale in non-specialised stores", keywords: ["shop", "retail", "store"] },
  { code: "47910", description: "Retail sale via mail order houses or via Internet", keywords: ["ecommerce", "online", "shop", "retail", "internet"] },
  { code: "49320", description: "Taxi operation", keywords: ["taxi", "minicab", "private hire"] },
  { code: "49410", description: "Freight transport by road", keywords: ["haulage", "logistics", "transport", "delivery"] },
  { code: "55100", description: "Hotels and similar accommodation", keywords: ["hotel", "accommodation", "hospitality"] },
  { code: "56101", description: "Licensed restaurants", keywords: ["restaurant", "dining", "food", "hospitality"] },
  { code: "56102", description: "Unlicensed restaurants and cafes", keywords: ["cafe", "coffee", "restaurant"] },
  { code: "56103", description: "Take-away food shops and mobile food stands", keywords: ["takeaway", "food", "catering"] },
  { code: "56210", description: "Event catering activities", keywords: ["catering", "events", "food"] },
  { code: "56302", description: "Public houses and bars", keywords: ["pub", "bar", "hospitality"] },
  { code: "62011", description: "Ready-made interactive leisure and entertainment software development", keywords: ["games", "software", "apps", "tech"] },
  { code: "62012", description: "Business and domestic software development", keywords: ["software", "saas", "apps", "tech", "it", "development"] },
  { code: "62020", description: "Information technology consultancy activities", keywords: ["it", "tech", "consultancy", "software", "digital"] },
  { code: "62090", description: "Other information technology and computer service activities", keywords: ["it", "tech", "computer", "support"] },
  { code: "63110", description: "Data processing, hosting and related activities", keywords: ["hosting", "cloud", "data", "saas"] },
  { code: "63120", description: "Web portals", keywords: ["web", "portal", "internet"] },
  { code: "64191", description: "Banks", keywords: ["bank", "finance"] },
  { code: "64999", description: "Other financial service activities, except insurance and pension funding, n.e.c.", keywords: ["finance", "financial", "fintech"] },
  { code: "66190", description: "Activities auxiliary to financial services, except insurance and pension funding", keywords: ["finance", "broker", "advisory"] },
  { code: "68201", description: "Renting and operating of Housing Association real estate", keywords: ["property", "lettings", "estate"] },
  { code: "68209", description: "Other letting and operating of own or leased real estate", keywords: ["property", "lettings", "landlord", "estate"] },
  { code: "68310", description: "Real estate agencies", keywords: ["estate agent", "property", "lettings"] },
  { code: "69101", description: "Barristers at law", keywords: ["law", "legal", "barrister"] },
  { code: "69102", description: "Solicitors", keywords: ["law", "legal", "solicitor"] },
  { code: "69109", description: "Activities of patent and copyright agents; other legal activities n.e.c.", keywords: ["legal", "law"] },
  { code: "69201", description: "Accounting and auditing activities", keywords: ["accountant", "accounting", "audit", "bookkeeping", "tax"] },
  { code: "69202", description: "Bookkeeping activities", keywords: ["bookkeeping", "accounts", "payroll"] },
  { code: "69203", description: "Tax consultancy", keywords: ["tax", "consultancy", "accountant"] },
  { code: "70100", description: "Activities of head offices", keywords: ["holding", "head office"] },
  { code: "70221", description: "Financial management", keywords: ["finance", "management", "cfo"] },
  { code: "70229", description: "Management consultancy activities other than financial management", keywords: ["consultancy", "consulting", "management", "advisory"] },
  { code: "71111", description: "Architectural activities", keywords: ["architect", "architecture"] },
  { code: "71121", description: "Engineering design activities for industrial process and production", keywords: ["engineering", "design"] },
  { code: "71122", description: "Engineering related scientific and technical consulting activities", keywords: ["engineering", "consulting"] },
  { code: "73110", description: "Advertising agencies", keywords: ["advertising", "marketing", "agency"] },
  { code: "73120", description: "Media representation", keywords: ["media", "marketing"] },
  { code: "73200", description: "Market research and public opinion polling", keywords: ["research", "market"] },
  { code: "74100", description: "specialised design activities", keywords: ["design", "graphic", "brand"] },
  { code: "74201", description: "Portrait photographic activities", keywords: ["photography", "photo"] },
  { code: "74202", description: "Other specialist photography", keywords: ["photography", "photo"] },
  { code: "75000", description: "Veterinary activities", keywords: ["vet", "veterinary", "animal"] },
  { code: "81210", description: "General cleaning of buildings", keywords: ["cleaning", "cleaner"] },
  { code: "81221", description: "Window cleaning services", keywords: ["cleaning", "windows"] },
  { code: "82990", description: "Other business support service activities n.e.c.", keywords: ["business", "support", "admin", "services"] },
  { code: "85590", description: "Other education n.e.c.", keywords: ["education", "training", "tuition", "coaching"] },
  { code: "86210", description: "General medical practice activities", keywords: ["gp", "medical", "clinic", "health"] },
  { code: "86230", description: "Dental practice activities", keywords: ["dentist", "dental"] },
  { code: "86900", description: "Other human health activities", keywords: ["health", "wellbeing", "clinic"] },
  { code: "88100", description: "Social work activities without accommodation for the elderly and disabled", keywords: ["care", "social", "support"] },
  { code: "93110", description: "Operation of sports facilities", keywords: ["sport", "gym", "fitness"] },
  { code: "93130", description: "Fitness facilities", keywords: ["gym", "fitness", "personal trainer"] },
  { code: "96020", description: "Hairdressing and other beauty treatment", keywords: ["hair", "salon", "beauty", "barber"] },
  { code: "96090", description: "Other personal service activities n.e.c.", keywords: ["personal", "services"] },
];

export function searchSicCodes(query: string, limit = 8): SicCode[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const scored = SIC_CODES.map((row) => {
    const hay = `${row.code} ${row.description} ${row.keywords.join(" ")}`.toLowerCase();
    let score = 0;
    if (row.code.startsWith(q)) score += 100;
    if (row.description.toLowerCase().includes(q)) score += 50;
    for (const word of q.split(/\s+/)) {
      if (word.length < 2) continue;
      if (row.keywords.some((k) => k.includes(word) || word.includes(k))) score += 30;
      if (hay.includes(word)) score += 10;
    }
    return { row, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.row);
}
