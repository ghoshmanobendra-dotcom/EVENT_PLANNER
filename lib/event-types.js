/**
 * Planning knowledge per supported event type. The prompt uses it to ground
 * the model, so every plan covers the essentials for its kind of event.
 */
export const EVENT_TYPES = {
  wedding: {
    label: 'Wedding',
    budgetCategories: [
      'Venue', 'Catering', 'Attire & beauty', 'Photography & video', 'Decor & flowers',
      'Music & entertainment', 'Invitations & stationery', 'Guest logistics', 'Contingency',
    ],
    milestones: [
      'Fix guest list and budget', 'Book venue', 'Book caterer and photographer',
      'Send save-the-dates', 'Finalise attire', 'Send invitations', 'Confirm vendor schedule',
      'Final headcount to caterer',
    ],
  },
  birthday: {
    label: 'Birthday',
    budgetCategories: [
      'Venue', 'Food & cake', 'Decorations', 'Entertainment & activities',
      'Invitations', 'Return gifts', 'Contingency',
    ],
    milestones: [
      'Pick theme and guest list', 'Book venue or plan home setup', 'Send invitations',
      'Order cake', 'Arrange entertainment', 'Buy decorations and return gifts', 'Confirm RSVPs',
    ],
  },
  community: {
    label: 'Community event',
    budgetCategories: [
      'Venue & permits', 'Safety & first aid', 'Sound & stage', 'Food & refreshments',
      'Promotion & signage', 'Volunteer support', 'Accessibility', 'Contingency',
    ],
    milestones: [
      'Define goals and audience', 'Secure venue and permits', 'Recruit volunteers',
      'Approach sponsors', 'Start promotion', 'Plan safety and accessibility',
      'Volunteer briefing', 'Post-event clean-up and thank-yous',
    ],
  },
};
