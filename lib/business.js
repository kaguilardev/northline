// Content for the commercial and careers pages.

const COMMERCIAL_SERVICES = [
  { name: 'Grounds Maintenance', icon: 'leaf', blurb: 'Recurring mowing, trimming, edging, blowing and seasonal cleanups for a sharp first impression.' },
  { name: 'Pressure Washing', icon: 'spray', blurb: 'Storefronts, sidewalks, entryways, parking areas, drive-thrus and dumpster pads.' },
  { name: 'Commercial Painting', icon: 'roller', blurb: 'Interior and exterior painting for offices, retail and common areas.' },
  { name: 'Make-Ready & Turnovers', icon: 'hammer', blurb: 'Patching, touch-ups and paint between tenants so units are ready to lease.' },
];

const PROPERTY_TYPES = ['Office', 'Retail / Restaurant', 'HOA / Community', 'Apartments / Multi-family', 'Rental homes', 'Church / School', 'Other'];

const FREQUENCIES = ['Not sure yet', 'One-time', 'Weekly', 'Every other week', 'Monthly', 'Seasonal'];

const OPENINGS = [
  { title: 'Concrete Crew Member', icon: 'slab', type: 'Full-time / Part-time', blurb: 'Site prep, forming, pouring and cleanup. We’ll train the right person.' },
  { title: 'Concrete Finisher', icon: 'patio', type: 'Full-time', blurb: 'Finishing patios, walkways and slabs. Experience preferred.' },
  { title: 'Crew Lead', icon: 'users', type: 'Full-time', blurb: 'Run a small crew, keep jobs on schedule and talk with customers.' },
];

// ── Concrete estimate form (public website) ──
const CURRENT_SURFACES = ['Grass', 'Dirt', 'Existing concrete', 'Not sure / mixed'];
// Only list finishes Northline actually installs — edit this list to match
const FINISHES = ['Broom finish', 'Smooth finish', 'I need guidance'];

const APPLICANT_STATUSES = [
  { key: 'new', label: 'New' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'interview', label: 'Interview' },
  { key: 'hired', label: 'Hired' },
  { key: 'declined', label: 'Not a fit' },
];

module.exports = { COMMERCIAL_SERVICES, PROPERTY_TYPES, FREQUENCIES, OPENINGS, APPLICANT_STATUSES, CURRENT_SURFACES, FINISHES };
