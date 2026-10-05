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
  { title: 'Lawn Care Crew Member', icon: 'leaf', type: 'Full-time / Part-time', blurb: 'Mowing, trimming, edging and cleanups. We’ll train the right person.' },
  { title: 'Painter', icon: 'roller', type: 'Full-time', blurb: 'Interior and exterior painting with careful prep. Experience preferred.' },
  { title: 'Pressure Washing Technician', icon: 'spray', type: 'Part-time / Seasonal', blurb: 'Driveways, patios, decks and storefronts.' },
  { title: 'Crew Lead', icon: 'users', type: 'Full-time', blurb: 'Run a small crew, keep jobs on schedule and talk with customers.' },
];

const APPLICANT_STATUSES = [
  { key: 'new', label: 'New' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'interview', label: 'Interview' },
  { key: 'hired', label: 'Hired' },
  { key: 'declined', label: 'Not a fit' },
];

module.exports = { COMMERCIAL_SERVICES, PROPERTY_TYPES, FREQUENCIES, OPENINGS, APPLICANT_STATUSES };
