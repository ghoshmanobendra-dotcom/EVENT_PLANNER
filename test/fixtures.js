export const TODAY = '2026-10-20';

export const validRequest = () => ({
  eventType: 'wedding',
  candidateName: 'Aarav & Priya',
  eventDate: '2027-02-14',
  location: 'Jaipur',
  guestCount: 150,
  budget: 1_500_000,
  currency: 'INR',
  vibe: 'Royal Rajasthani, marigold and pastel',
  priorities: 'Vegetarian food, wheelchair access for grandparents',
  language: 'English',
});

export const validPlan = () => ({
  summary: 'A pastel Rajasthani celebration.',
  budget: [
    { category: 'Venue', weight: 40, tip: 'Book off-season.' },
    { category: 'Catering', weight: 35, tip: 'Limit live counters.' },
    { category: 'Decor', weight: 18, tip: 'Reuse ceremony florals.' },
    { category: 'Contingency', weight: 7, tip: 'Keep it untouched.' },
  ],
  timeline: [
    { task: 'Send invitations', details: 'Digital and printed.', weeksBefore: 8 },
    { task: 'Book venue', details: 'Visit three options.', weeksBefore: 20 },
    { task: 'Final headcount', details: 'Share with caterer.', weeksBefore: 1 },
    { task: 'Pack emergency kit', details: 'Pins, meds, chargers.', weeksBefore: 0 },
  ],
  vendors: [
    { category: 'Caterer', lookFor: 'Pure-veg kitchen.', questions: ['Tasting?', 'Staff count?'], weeksBefore: 16 },
    { category: 'Photographer', lookFor: 'Candid style.', questions: ['Raw files?', 'Delivery time?'], weeksBefore: 14 },
    { category: 'Decorator', lookFor: 'Marigold work.', questions: ['Setup time?', 'Ramp access?'], weeksBefore: 10 },
  ],
  ideas: [
    { area: 'theme', title: 'Pastel royalty', description: 'Soft palette.', whyItFits: 'Matches your style.' },
    { area: 'decor', title: 'Marigold canopy', description: 'Floral roof.', whyItFits: 'Local flowers.' },
    { area: 'food', title: 'Thali station', description: 'Regional dishes.', whyItFits: 'Vegetarian.' },
    { area: 'guest-experience', title: 'Ramped stage', description: 'Step-free.', whyItFits: 'Grandparents.' },
  ],
});
