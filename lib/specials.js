// Generates marketing special ideas from the season and your services.
// No external AI service needed — edit the templates below to match your voice.
const SEASONS = {
  spring: {
    label: 'Spring',
    ideas: [
      { title: 'Spring Cleanup Kickoff', discount: '15% off', body: 'Shake off winter! Book a full spring cleanup — leaf and debris removal, bed edging, and a fresh layer of mulch — and save {discount}.' },
      { title: 'Fresh Mulch Refresh', discount: '$50 off', body: 'Give your beds a crisp, finished look. Get {discount} professional mulch installation when you book before {end}.' },
      { title: 'Lawn Aeration + Overseed', discount: '20% off', body: 'Thicker, greener grass starts now. Core aeration with overseeding is {discount} for a limited time.' },
    ],
  },
  summer: {
    label: 'Summer',
    ideas: [
      { title: 'Summer Mowing Plan', discount: 'First mow free', body: 'Sign up for weekly mowing this summer and your {discount}. Reliable crews, sharp edges, every week.' },
      { title: 'Irrigation Tune-Up', discount: '$40 off', body: 'Beat the heat with a sprinkler system check — we adjust heads, fix leaks and set smart schedules. {discount} through {end}.' },
      { title: 'Patio & Outdoor Living Consult', discount: 'Free design consult', body: 'Dreaming of a new patio or fire pit? Book a {discount} with our design team this month.' },
    ],
  },
  fall: {
    label: 'Fall',
    ideas: [
      { title: 'Fall Leaf Removal', discount: '10% off', body: 'Leave the leaves to us. Book seasonal leaf removal before {end} and save {discount}.' },
      { title: 'Fall Aeration & Fertilize', discount: '15% off', body: 'Fall is the best time to set up next year\'s lawn. Aeration plus fertilization, {discount} this season.' },
      { title: 'Plant Now, Bloom Next Spring', discount: 'Free bulbs with install', body: 'Book a fall planting and get {discount} — tulips and daffodils that pop next spring.' },
    ],
  },
  winter: {
    label: 'Winter',
    ideas: [
      { title: 'Snow Removal Contracts', discount: 'locked-in rates', body: 'Don\'t get caught digging out. Sign a seasonal snow removal contract by {end} and get {discount} for the whole season.' },
      { title: 'Book Spring Early', discount: '10% early-bird', body: 'Reserve your spring cleanup now and get a {discount} discount plus first pick of dates.' },
      { title: 'Holiday Lighting Install', discount: '$75 off', body: 'We hang it, maintain it and take it down. {discount} professional holiday lighting through {end}.' },
    ],
  },
};

function seasonFor(date = new Date()) {
  const m = date.getMonth(); // 0-11
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'fall';
  return 'winter';
}

function generate({ season, service, endDate } = {}) {
  const key = SEASONS[season] ? season : seasonFor();
  const end = endDate ? new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'the end of the month';
  return SEASONS[key].ideas.map((idea) => {
    let body = idea.body.replace(/\{discount\}/g, idea.discount).replace(/\{end\}/g, end);
    if (service) body += ` Ask about adding ${service} to your visit.`;
    return { title: idea.title, discount: idea.discount, body, season: SEASONS[key].label };
  });
}

module.exports = { generate, seasonFor, SEASONS };
