// ─────────────────────────────────────────────────────────────
//  NORTHLINE PRICE BOOK — the single source of truth.
//  Change a number here and it updates the public website
//  AND the admin quote builder at the same time.
// ─────────────────────────────────────────────────────────────

const LAWN_SIZES = [
  { key: 'small',  label: 'Small',  range: 'Up to 5,000 ft²' },
  { key: 'medium', label: 'Medium', range: '5,001–10,000 ft²' },
  { key: 'large',  label: 'Large',  range: '10,001–15,000 ft²' },
  { key: 'xl',     label: 'XL',     range: '15,001–20,000 ft²' },
];

// prices: [low, high] per lawn size
const LAWN_PACKAGES = [
  {
    key: 'basic', name: 'Basic Lawn Care', from: 49, tagline: 'Our regular maintenance service.',
    includes: ['Mowing', 'Trimming', 'Edging', 'Blowing'],
    detail: 'We mow, trim around trees, fences and spots the mower can’t reach, define clean edges, and blow off the driveway, sidewalks and work areas.',
    prices: { small: [49, 49], medium: [59, 69], large: [79, 89], xl: [99, 119] },
  },
  {
    key: 'clean', name: 'Northline Clean', from: 79, tagline: 'Basic Lawn Care plus a light tidy-up.',
    includes: ['Basic Lawn Care', 'Light leaf cleanup', 'Small branches & debris', 'Green waste removal'],
    prices: { small: [79, 99], medium: [99, 129], large: [129, 169], xl: [169, 219] },
  },
  {
    key: 'curb', name: 'Curb Appeal', from: 129, tagline: 'Everything people notice from the street.',
    includes: ['Basic Lawn Care', 'Pressure washing', 'Front entry & walkway', 'Sidewalk & a section of driveway'],
    prices: { small: [129, 149], medium: [149, 179], large: [179, 219], xl: [219, 279] },
  },
  {
    key: 'refresh', name: 'Full Refresh', from: 179, tagline: 'Our complete exterior package.', featured: true,
    includes: ['Lawn care', 'Yard cleanup', 'Pressure washing'],
    prices: { small: [179, 219], medium: [219, 269], large: [269, 329], xl: [329, 399] },
  },
];

const OUTDOOR_ADDONS = [
  { key: 'leaf',      name: 'Leaf Cleanup',               from: 75 },
  { key: 'yard',      name: 'Yard Cleanup',               from: 100 },
  { key: 'driveway',  name: 'Driveway Pressure Washing',  from: 85 },
  { key: 'walkways',  name: 'Walkways / Sidewalks',       from: 40 },
  { key: 'patio',     name: 'Patio Cleaning',             from: 65 },
  { key: 'deck',      name: 'Deck Cleaning',              from: 85 },
  { key: 'bins',      name: 'Trash Bin Cleaning',         from: 25 },
  { key: 'furniture', name: 'Outdoor Furniture Cleaning', from: 40 },
];

// Conditions that raise a lawn quote. low/high = range shown; levels = the price choices in the quote builder
const LAWN_ADJUSTMENTS = [
  { key: 'overgrown', name: 'Overgrown grass',       low: 15, high: 60, plus: true, levels: [15, 30, 60],
    levelNotes: ['A little long', 'Ankle-high', 'Knee-high+'] },
  { key: 'slope',     name: 'Steep slope',           low: 10, high: 25 },
  { key: 'obstacles', name: 'Many obstacles',        low: 10, high: 20 },
  { key: 'leaves',    name: 'Heavy leaves',          low: 25, high: 75, plus: true },
  { key: 'haul',      name: 'Debris haul-away',      low: 20, high: 50, plus: true },
  { key: 'access',    name: 'Difficult access',      low: 10, high: 20 },
];

const PAINT_PACKAGES = [
  {
    key: 'room', name: 'Room Refresh', from: 400, price: '$400+', icon: 'roller',
    tagline: 'A fresh new look for a single room.',
    includes: ['Walls', 'Basic prep (patching, sanding, caulking)', 'Two coats of paint', 'Clean, professional finish'],
  },
  {
    key: 'interior', name: 'Interior Refresh', from: 1500, price: '$1,500+', icon: 'sofa',
    tagline: 'Multiple rooms or larger interior spaces.',
    includes: ['Multiple rooms', 'Walls, ceilings & trim (optional)', 'Basic prep (patching, sanding, caulking)', 'Two coats of paint'],
  },
  {
    key: 'exterior', name: 'Exterior Refresh', from: 3000, price: '$3,000+', icon: 'house',
    tagline: 'Boost curb appeal and protect your home.',
    includes: ['Siding, trim & exterior doors', 'Cleaning, scraping & sanding', 'Primer as needed', 'Long-lasting professional finish'],
  },
  {
    key: 'full', name: 'Full Home Paint', from: null, price: 'Custom Quote', icon: 'brush',
    tagline: 'The complete solution for your home.',
    includes: ['Interior + exterior', 'Walls, ceilings, trim, doors & exterior surfaces', 'Complete prep work', 'Tailored to your home'],
  },
];

const PAINT_ADDONS = [
  { key: 'accent',   name: 'Accent Wall',            desc: 'A modern touch for any room',             from: 175 },
  { key: 'ceiling',  name: 'Ceiling Painting',       desc: 'A fresh, clean look for your ceilings',   from: 200 },
  { key: 'trim',     name: 'Trim & Baseboards',      desc: 'Doors, windows, baseboards and trim',     from: 200 },
  { key: 'door',     name: 'Interior Door Painting', desc: 'Per door, both sides',                    from: 125, unit: 'each' },
  { key: 'cabinets', name: 'Cabinet Painting',       desc: 'Kitchen or bathroom cabinets, prep + paint', from: 1800 },
  { key: 'stain',    name: 'Deck / Fence Staining',  desc: 'Clean, prep and premium stain',           from: 500 },
  { key: 'drywall',  name: 'Drywall Patching & Prep',desc: 'Repair holes, cracks and imperfections',  from: 100 },
  { key: 'touchup',  name: 'Touch-Ups',              desc: 'Small areas, scuffs and marks',           from: 150 },
];

const PRESSURE_SURFACES = ['Driveways', 'Sidewalks', 'Walkways', 'Patios', 'Decks', 'Outdoor furniture', 'Trash bins', 'Light exterior cleaning'];

const SERVICES = [
  { key: 'landscaping', name: 'Landscaping & Lawn Care', short: 'Landscaping', href: '/lawn-care', icon: 'leaf',
    blurb: 'Recurring mowing, trimming, edging and seasonal cleanups that keep your yard sharp all year.' },
  { key: 'painting', name: 'Painting', short: 'Painting', href: '/painting', icon: 'roller',
    blurb: 'Interior and exterior painting, trim, doors and cabinets with careful prep and a clean finish.' },
  { key: 'pressure', name: 'Pressure Washing', short: 'Pressure Washing', href: '/pressure-washing', icon: 'spray',
    blurb: 'Driveways, walkways, patios, decks and more — instant curb appeal.' },
  { key: 'remodeling', name: 'Remodeling', short: 'Remodeling', href: '/services#remodeling', icon: 'hammer',
    blurb: 'Updates and improvements inside and out. Tell us about your project for a custom quote.' },
  { key: 'decks', name: 'Decks & Fences', short: 'Decks & Fences', href: '/services#decks', icon: 'fence',
    blurb: 'Cleaning, staining, repairs and upgrades for decks and fences.' },
];

const SERVICE_AREAS = ['Durham', 'Raleigh', 'Cary', 'Chapel Hill', 'Surrounding Areas'];

const POLICY = {
  general: 'Prices shown are starting prices. Final pricing depends on property size, surface condition, preparation requirements, project complexity and scope of work. Custom quotes are available for larger projects.',
  paint: 'Paint is not included in listed prices. Materials are billed separately unless otherwise specified in the estimate.',
  lawn: 'Lawn sizes refer to mowable lawn area, not total lot size. Properties over 20,000 ft² or heavily overgrown yards receive a custom quote.',
};

const money = (n) => (n == null || n === '' ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }));
const range = ([lo, hi]) => (lo === hi ? money(lo) : `${money(lo)}–${Number(hi).toLocaleString('en-US')}`);

module.exports = {
  LAWN_SIZES, LAWN_PACKAGES, OUTDOOR_ADDONS, LAWN_ADJUSTMENTS, PAINT_PACKAGES, PAINT_ADDONS,
  PRESSURE_SURFACES, SERVICES, SERVICE_AREAS, POLICY, money, range,
};
