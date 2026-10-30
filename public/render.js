import { daysBetween, formatDate, formatMoney, formatMonth, groupByMonth, localIsoDate } from './format.js';

const IDEA_LABELS = {
  theme: 'Theme',
  decor: 'Decor',
  food: 'Food & drink',
  activities: 'Activities',
  'guest-experience': 'Guest experience',
};

/** Milliseconds to wait for afterprint before forcibly removing the invitation-only class. */
const PRINT_CLEANUP_TIMEOUT_MS = 2500;

/**
 * Minimal element builder. Text is always assigned through text nodes, so
 * model output can never be interpreted as HTML.
 * @param {string} tag
 * @param {Record<string, unknown>} [props] `class`, `text`, `on<Event>` handlers, or attributes.
 * @param {(Node | string | null | false)[]} [children]
 */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  node.append(...children.filter((child) => child !== null && child !== false));
  return node;
}

/** Section ids are prefixed so they never collide with form field ids such as `budget`. */
const sectionId = (name) => `section-${name}`;

const card = (name, title, children) =>
  el('section', { class: 'card', id: sectionId(name), 'aria-labelledby': `${sectionId(name)}-title` }, [
    el('h3', { id: `${sectionId(name)}-title`, text: title }),
    ...children,
  ]);

function overview({ input, plan }, { onStartOver }) {
  const daysLeft = daysBetween(localIsoDate(), input.eventDate);
  const stats = [
    daysLeft > 0 ? `${daysLeft} days to go` : 'Event day is here',
    `${formatMoney(Math.round(input.budget / input.guestCount), input.currency)} per guest`,
    `${input.guestCount} guests`,
  ];
  return el('header', { class: 'plan-header' }, [
    el('p', { class: 'eyebrow', text: `${input.location} · ${formatDate(input.eventDate)}` }),
    el('h2', { tabindex: '-1', text: 'Your event plan' }),
    el('p', { class: 'summary', text: plan.summary }),
    el('ul', { class: 'stats', 'aria-label': 'Key numbers' }, stats.map((text) => el('li', { text }))),
    el('div', { class: 'actions no-print' }, [
      el('button', { type: 'button', class: 'button primary', text: '🖨️ Print invitation card', onClick: printInvitationOnly }),
      el('button', { type: 'button', class: 'button secondary', text: 'Print full plan (PDF)', onClick: () => window.print() }),
      el('button', { type: 'button', class: 'button ghost', text: 'Start over', onClick: onStartOver }),
    ]),
    el('nav', { class: 'section-nav no-print', 'aria-label': 'Plan sections' }, [
      ['invitation', 'Invitation card'], ['budget', 'Budget'], ['timeline', 'Timeline'], ['vendors', 'Vendors'], ['ideas', 'Ideas'],
    ].map(([name, label]) => el('a', { href: `#${sectionId(name)}`, text: label }))),
  ]);
}

function budgetCard({ input, plan }) {
  const money = (amount) => formatMoney(amount, input.currency);
  const rows = plan.budget.map((item) =>
    el('tr', {}, [
      el('th', { scope: 'row', text: item.category }),
      el('td', { class: 'share' }, [
        el('meter', { class: 'bar', min: 0, max: 100, value: item.percent, 'aria-hidden': 'true' }),
        el('span', { text: `${item.percent}%` }),
      ]),
      el('td', { class: 'amount', text: money(item.amount) }),
      el('td', { class: 'tip', text: item.tip }),
    ]),
  );
  return card('budget', 'Budget', [
    el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Budget table' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Category', 'Share', 'Amount', 'Money-saving tip'].map((text) => el('th', { scope: 'col', text })))]),
        el('tbody', {}, rows),
        el('tfoot', {}, [
          el('tr', {}, [el('th', { scope: 'row', text: 'Total' }), el('td', { text: '100%' }), el('td', { class: 'amount', text: money(input.budget) }), el('td')]),
        ]),
      ]),
    ]),
  ]);
}

const doNowBadge = (item) => item.compressed && el('span', { class: 'badge', text: 'Do now' });

function timelineCard({ plan }) {
  return card('timeline', 'Timeline', groupByMonth(plan.timeline).map(([month, tasks]) =>
    el('div', { class: 'month' }, [
      el('h4', { text: formatMonth(`${month}-01`) }),
      el('ol', { class: 'timeline' }, tasks.map((task) =>
        el('li', {}, [
          el('time', { datetime: task.dueDate, text: formatDate(task.dueDate, { day: 'numeric', month: 'short' }) }),
          el('div', {}, [
            el('p', { class: 'task' }, [task.task, ' ', doNowBadge(task)]),
            el('p', { class: 'muted', text: task.details }),
          ]),
        ]),
      )),
    ]),
  ));
}

function vendorsCard({ plan, checked }, { onToggleVendor }) {
  const done = new Set(checked);
  return card('vendors', 'Vendor checklist', [
    el('ul', { class: 'vendors' }, plan.vendors.map((vendor, index) => {
      const id = `vendor-${index}`;
      return el('li', {}, [
        el('div', { class: 'vendor-head' }, [
          el('input', { type: 'checkbox', id, checked: done.has(index), onChange: (event) => onToggleVendor(index, event.target.checked) }),
          el('label', { for: id, text: vendor.category }),
          el('span', { class: 'book-by' }, [`Book by ${formatDate(vendor.dueDate)}`, ' ', doNowBadge(vendor)]),
        ]),
        el('p', {}, [el('strong', { text: 'Look for: ' }), vendor.lookFor]),
        el('p', { class: 'ask', text: 'Ask them:' }),
        el('ul', { class: 'questions' }, vendor.questions.map((text) => el('li', { text }))),
      ]);
    })),
  ]);
}

function ideasCard({ plan }) {
  return card('ideas', 'Personalised ideas', [
    el('ul', { class: 'ideas' }, plan.ideas.map((idea) =>
      el('li', { class: 'idea' }, [
        el('span', { class: 'tag', text: IDEA_LABELS[idea.area] }),
        el('h4', { text: idea.title }),
        el('p', { text: idea.description }),
        el('p', { class: 'why' }, [el('strong', { text: 'Why it fits you: ' }), idea.whyItFits]),
      ]),
    )),
  ]);
}

/**
 * Triggers printing of the invitation card only.
 */
export function printInvitationOnly() {
  document.body.classList.add('printing-invitation');
  const cleanup = () => {
    document.body.classList.remove('printing-invitation');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, PRINT_CLEANUP_TIMEOUT_MS);
  window.print();
}

/**
 * Copies formatted invitation text for WhatsApp, SMS, or email.
 * @param {object} input
 */
export function copyInvitationText(input) {
  const isWedding = input.eventType === 'wedding';
  const isBirthday = input.eventType === 'birthday';
  const candidate = input.candidateName?.trim() || (isWedding ? 'The Couple' : (isBirthday ? 'The Birthday Star' : 'Community Event'));
  const title = isWedding
    ? `💍 Wedding Invitation: ${candidate}`
    : (isBirthday ? `🎂 Birthday Celebration: ${candidate}` : `🎉 Community Celebration: ${candidate}`);
  const fullDate = formatDate(input.eventDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const text = `${title}

You are warmly invited to celebrate with us!

📅 Date: ${fullDate}
📍 Location: ${input.location}
${input.vibe ? `✨ Style / Vibe: ${input.vibe}\n` : ''}
We would love to have you celebrate this special milestone with us!`;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      const statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = 'Invitation text copied to clipboard!';
        setTimeout(() => {
          if (statusEl.textContent === 'Invitation text copied to clipboard!') statusEl.textContent = '';
        }, 4000);
      }
    });
  }
}

/**
 * Constructs the core visual invitation card.
 * @param {{ input: object, plan?: object }} state
 */
export function buildInvitationMarkup({ input }) {
  const isWedding = input.eventType === 'wedding';
  const isBirthday = input.eventType === 'birthday';
  const candidate = input.candidateName?.trim() || (isWedding ? 'The Happy Couple' : (isBirthday ? 'Birthday Celebration' : 'Community Celebration'));
  const fullDate = formatDate(input.eventDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // RSVP date: 3 weeks before event
  const eventTime = Date.parse(input.eventDate);
  const rsvpIso = new Date(eventTime - 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rsvpDate = formatDate(rsvpIso, { month: 'short', day: 'numeric', year: 'numeric' });

  const eyebrowText = isWedding
    ? 'Together with their families'
    : (isBirthday ? 'Join us to celebrate the birthday of' : 'You are cordially invited to celebrate');

  const subtitleText = isWedding
    ? 'Request the honour of your presence at the celebration of their marriage'
    : (isBirthday ? 'For an unforgettable day of joy, laughter and great memories' : 'An inspiring day of unity, celebration and togetherness');

  const messageText = isWedding
    ? 'Ceremony followed by dinner, music and dancing.'
    : (isBirthday ? 'Cake cutting, fun activities and refreshments to follow.' : 'Performances, refreshments and community activities.');

  return el('div', { class: 'invitation-card theme-emerald', id: 'invitation-preview' }, [
    el('div', { class: 'invitation-card-border' }, [
      el('div', { class: 'invitation-card-inner' }, [
        el('div', { class: 'invitation-ornament-top', text: isWedding ? '❦ ❖ ❦' : (isBirthday ? '✦ ★ ✦' : '✧ ❖ ✧') }),
        el('p', { class: 'invitation-eyebrow', text: eyebrowText }),
        el('h2', { class: 'invitation-candidate-name', text: candidate }),
        el('div', { class: 'invitation-divider' }),
        el('p', { class: 'invitation-subtitle', text: subtitleText }),
        el('div', { class: 'invitation-details' }, [
          el('div', { class: 'invitation-detail-item' }, [
            el('span', { class: 'invitation-detail-label', text: 'DATE & TIME' }),
            el('strong', { class: 'invitation-detail-value', text: fullDate }),
          ]),
          el('div', { class: 'invitation-detail-item' }, [
            el('span', { class: 'invitation-detail-label', text: 'LOCATION' }),
            el('strong', { class: 'invitation-detail-value', text: input.location }),
          ]),
          input.vibe ? el('div', { class: 'invitation-detail-item' }, [
            el('span', { class: 'invitation-detail-label', text: 'DRESS CODE & STYLE' }),
            el('strong', { class: 'invitation-detail-value', text: input.vibe }),
          ]) : null,
        ]),
        el('p', { class: 'invitation-message', text: messageText }),
        el('div', { class: 'invitation-footer' }, [
          el('p', { class: 'invitation-rsvp', text: `Kindly RSVP by ${rsvpDate}` }),
          el('div', { class: 'invitation-ornament-bottom', text: '❦' }),
        ]),
      ]),
    ]),
  ]);
}

/** Shared theme options used by both the inline plan view and the standalone invitation page. */
export const INVITATION_THEMES = [
  { id: 'theme-emerald', label: '🌿 Emerald Royale' },
  { id: 'theme-gold', label: '✨ Golden Sunset' },
  { id: 'theme-rose', label: '🌸 Rose Romance' },
  { id: 'theme-midnight', label: '🌌 Midnight Star' },
];

function invitationCard({ input, plan }) {
  const cardElement = buildInvitationMarkup({ input, plan });

  const themes = INVITATION_THEMES;

  const themeSelector = el('div', { class: 'invitation-theme-picker no-print', role: 'group', 'aria-label': 'Card theme' },
    themes.map(({ id, label }, index) =>
      el('button', {
        type: 'button',
        class: `chip ${index === 0 ? 'active' : ''}`,
        'aria-pressed': index === 0 ? 'true' : 'false',
        'data-theme': id,
        text: label,
        onClick: (event) => {
          const picker = event.currentTarget.closest('[role="group"]');
          for (const btn of picker.querySelectorAll('button')) {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
          }
          event.currentTarget.classList.add('active');
          event.currentTarget.setAttribute('aria-pressed', 'true');
          cardElement.className = `invitation-card ${id}`;
        },
      })
    )
  );

  const toolbar = el('div', { class: 'invitation-toolbar no-print' }, [
    el('div', { class: 'invitation-actions' }, [
      el('button', {
        type: 'button',
        class: 'button primary',
        text: '🖨️ Print invitation card',
        onClick: printInvitationOnly,
      }),
      el('a', {
        href: '/invitation',
        target: '_blank',
        rel: 'noopener',
        class: 'button secondary',
        text: '↗️ Open standalone card',
      }),
      el('button', {
        type: 'button',
        class: 'button ghost',
        text: '📋 Copy invitation text',
        onClick: () => copyInvitationText(input),
      }),
    ]),
    themeSelector,
  ]);

  return card('invitation', 'Invitation card', [
    el('p', { class: 'muted card-description no-print', text: 'Personalised with candidate names and details. Easily print or share with guests.' }),
    toolbar,
    el('div', { class: 'invitation-card-container' }, [cardElement]),
  ]);
}

/**
 * Replaces the container's content with the full plan.
 * @param {HTMLElement} container
 * @param {{ input: object, plan: object, checked: number[] }} state
 * @param {{ onToggleVendor: (index: number, checked: boolean) => void, onStartOver: () => void }} handlers
 */
export function renderPlan(container, state, handlers) {
  container.replaceChildren(
    overview(state, handlers),
    invitationCard(state),
    budgetCard(state),
    timelineCard(state),
    vendorsCard(state, handlers),
    ideasCard(state),
  );
}
