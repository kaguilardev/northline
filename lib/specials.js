// Generates marketing special ideas from the season and your services.
// No external AI service needed — edit the templates below to match your voice.
const SEASONS = {
  spring: {
    label: 'Spring',
    ideas: [
      { title: 'Patio Season Starts Now', discount: '5% off', body: 'Get your new concrete patio poured before summer cookouts start. Request a free estimate by {end} and save {discount}.' },
      { title: 'Walkway Refresh', discount: '$100 off', body: 'Replace a cracked or muddy path with a clean concrete walkway. {discount} walkway projects booked before {end}.' },
      { title: 'Shed Pad Special', discount: '$75 off', body: 'Putting up a shed this year? Start with a solid concrete pad. {discount} pads and small slabs through {end}.' },
    ],
  },
  summer: {
    label: 'Summer',
    ideas: [
      { title: 'Make Room to Gather', discount: '5% off', body: 'Extend your patio for outdoor dining or the grill. {discount} patio extensions booked by {end}.' },
      { title: 'Patio + Walkway Bundle', discount: '$150 off', body: 'Connect your new patio to the house or driveway with a matching walkway and save {discount} on the pair.' },
      { title: 'Free Estimate Week', discount: 'Free estimate', body: 'Send us photos of your space this week for a {discount} and a written proposal for your new patio.' },
    ],
  },
  fall: {
    label: 'Fall',
    ideas: [
      { title: 'Fall Patio Pour', discount: '5% off', body: 'Cooler weather is a great time to pour. Book your patio before {end} and save {discount}.' },
      { title: 'Fix That Walkway Before Winter', discount: '$100 off', body: 'Replace an uneven or cracked walkway before wet weather sets in. {discount} through {end}.' },
      { title: 'Old Concrete Out, New Patio In', discount: 'Free removal up to 100 sq ft', body: 'Replacing a worn slab? Get {discount} of old concrete when you book a new patio by {end}.' },
    ],
  },
  winter: {
    label: 'Winter',
    ideas: [
      { title: 'Book Spring Early', discount: '5% early-bird', body: 'Reserve a spring patio pour now and get a {discount} discount plus first pick of dates.' },
      { title: 'Plan Your Patio', discount: 'Free estimate', body: 'Winter is the time to plan. Send us photos of your yard for a {discount} and a written proposal, ready for spring.' },
      { title: 'Gift a Better Backyard', discount: '$100 off', body: 'Treat your home to a new patio or walkway in spring. {discount} when you book before {end}.' },
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
    if (service) body += ` Ask about adding ${service} to your project.`;
    return { title: idea.title, discount: idea.discount, body, season: SEASONS[key].label };
  });
}

module.exports = { generate, seasonFor, SEASONS };
