// ─────────────────────────────────────────────────────────────
//  NORTHLINE PRICE BOOK — the single source of truth.
//  The owner edits these on the admin Prices page; the quote
//  builder uses them to price concrete work by the square foot.
// ─────────────────────────────────────────────────────────────

// The public website's services (residential concrete). `request` is the project type saved on estimate requests.
const SERVICES = [
  { key: 'patios', name: 'Concrete Patios', short: 'Concrete Patios', href: '/concrete-services#patios', icon: 'patio', request: 'Concrete Patio',
    blurb: 'New patios, sized and laid out to fit your space and how you want to use it.' },
  { key: 'extensions', name: 'Patio Extensions', short: 'Patio Extensions', href: '/concrete-services#extensions', icon: 'expand', request: 'Patio Extension',
    blurb: 'Add room to an existing patio for gatherings, outdoor dining or the grill.' },
  { key: 'walkways', name: 'Concrete Walkways', short: 'Walkways', href: '/concrete-services#walkways', icon: 'walkway', request: 'Concrete Walkway',
    blurb: 'Walkways and paths that connect the different areas around your home.' },
  { key: 'pads', name: 'Concrete Pads & Small Slabs', short: 'Pads & Small Slabs', href: '/concrete-services#pads', icon: 'slab', request: 'Concrete Pad / Small Slab',
    blurb: 'Small pads for sheds and other uses, subject to each project’s requirements.' },
];

// Installed price per square foot for a standard 4" broom-finish job, one per service above.
// Starting rates: 5% below the Raleigh–Durham market midpoint (Angi, NCDOT-based and local cost guides, Oct 2026).
const CONCRETE_RATES = [
  { key: 'patios',     name: 'Concrete Patio',            rate: 8.55, market: '$6–12 / sq ft' },
  { key: 'extensions', name: 'Patio Extension',           rate: 8.55, market: '$6–12 / sq ft' },
  { key: 'walkways',   name: 'Concrete Walkway',          rate: 8.55, market: '$5.56–11.92 / sq ft' },
  { key: 'pads',       name: 'Concrete Pad / Small Slab', rate: 8.08, market: '$6–12 / sq ft' },
];

// Extra work priced per square foot, added on top of the concrete
const CONCRETE_EXTRAS = [
  { key: 'removal', name: 'Remove existing concrete', desc: 'Break up, haul away and dispose of the old slab', rate: 4.04, market: '$2–6 / sq ft' },
  { key: 'grading', name: 'Grading / excavation',     desc: 'Dig out, level and compact the base',             rate: null, market: 'No reliable local figure' },
  { key: 'finish',  name: 'Decorative finish upgrade', desc: 'Stamped or colored, over the broom-finish price', rate: 3.80, market: '+$2–6 / sq ft' },
];

// Smallest job worth taking; the quote builder warns when a quote is below it
const MINIMUM_JOB = { amount: 617.5, market: '$500–800' };

const SERVICE_AREAS = ['Durham', 'Raleigh', 'Cary', 'Chapel Hill', 'Surrounding Areas'];

const POLICY = {
  general: 'Prices shown are starting prices. Final pricing depends on project size, ground conditions, preparation requirements, access and the finish you choose.',
  // Only shown on older painting quotes that were saved with this note
  paint: 'Paint is not included in listed prices. Materials are billed separately unless otherwise specified in the estimate.',
};

const money = (n) => (n == null || n === '' ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }));
const range = ([lo, hi]) => (lo === hi ? money(lo) : `${money(lo)}–${Number(hi).toLocaleString('en-US')}`);

module.exports = { SERVICES, CONCRETE_RATES, CONCRETE_EXTRAS, MINIMUM_JOB, SERVICE_AREAS, POLICY, money, range };
