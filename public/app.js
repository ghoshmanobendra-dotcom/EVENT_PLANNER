import { localIsoDate } from './format.js';
import { renderPlan } from './render.js';

const STORAGE_KEY = 'event-planner:plan';
const NUMBER_FIELDS = ['guestCount', 'budget'];
const STATUS_CLEAR_MS = 6000;

const form = /** @type {HTMLFormElement} */ (document.getElementById('plan-form'));
const status = /** @type {HTMLElement} */ (document.getElementById('status'));
const emptyState = /** @type {HTMLElement} */ (document.getElementById('empty-state'));
const results = /** @type {HTMLElement} */ (document.getElementById('results'));
const planView = /** @type {HTMLElement} */ (document.getElementById('plan'));
const refineForm = /** @type {HTMLFormElement} */ (document.getElementById('refine-form'));

/** @type {{ input: object, plan: object, checked: number[] } | null} */
let state = null;

/** localStorage can be unavailable (private mode, blocked storage); the app still works without it. */
const storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw !== null ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  /** @param {any} value */
  save(value) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Persistence is a convenience; losing it must not break planning.
    }
  },
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored means nothing to clear.
    }
  },
};

const candidateLabel = document.getElementById('candidateName-label');
const candidateInput = /** @type {HTMLInputElement | null} */ (document.getElementById('candidateName'));
const candidateHint = document.getElementById('candidateName-hint');

/** @type {Record<string, {label: string, placeholder: string, hint: string, required: boolean}>} */
const CANDIDATE_CONFIGS = {
  wedding: {
    label: "Couple's names (candidates)",
    placeholder: 'e.g. Aarav & Priya',
    hint: "Enter both candidate names to personalize your plan and invitation card.",
    required: true,
  },
  birthday: {
    label: "Birthday person's name (candidate)",
    placeholder: 'e.g. Rohan or Maya (turning 30)',
    hint: "Enter the candidate's name to personalize your plan and invitation card.",
    required: true,
  },
  community: {
    label: "Host / Community name (candidate/organizer)",
    placeholder: 'e.g. Green Valley Residents Club',
    hint: "Optional: name of the organizing group, community, or honoree.",
    required: false,
  },
};

/**
 * Updates the candidate field UI based on the selected event type.
 * @param {string} eventType - The type of event (e.g. 'wedding', 'birthday', 'corporate').
 */
function updateCandidateField(eventType) {
  const config = CANDIDATE_CONFIGS[eventType] || CANDIDATE_CONFIGS.wedding;
  if (candidateLabel) {
    candidateLabel.innerHTML = config.required
      ? config.label
      : `${config.label} <span class="optional">(optional)</span>`;
  }
  if (candidateInput) {
    candidateInput.placeholder = config.placeholder;
    candidateInput.required = config.required;
  }
  if (candidateHint) {
    candidateHint.textContent = config.hint;
  }
}

/**
 * @returns {Record<string, any>}
 */
function readForm() {
  if (!form) return {};
  /** @type {Record<string, any>} */
  const input = Object.fromEntries(new FormData(form));
  for (const field of NUMBER_FIELDS) input[field] = Number(input[field]);
  return input;
}

/**
 * @param {Record<string, any>} input
 */
function fillForm(input) {
  for (const [name, value] of Object.entries(input)) {
    const field = form.elements.namedItem(name);
    if (field instanceof RadioNodeList) field.value = value;
    else if (field && 'value' in field) field.value = String(value);
  }
  if (input.eventType) updateCandidateField(input.eventType);
}

/** Clear all inline field validation messages and aria-invalid attributes. */
function clearFieldErrors() {
  for (const node of document.querySelectorAll('.field-error')) node.textContent = '';
  for (const field of document.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
}

/**
 * Error slots are named `<field>-error`; `form` covers errors that belong to no single field.
 * @param {Record<string, string>} fieldErrors
 */
function showFieldErrors(fieldErrors) {
  for (const [name, message] of Object.entries(fieldErrors)) {
    const slot = document.getElementById(`${name}-error`) ?? document.getElementById('form-error');
    if (slot) slot.textContent = message;
    document.querySelector(`[name="${CSS.escape(name)}"]`)?.setAttribute('aria-invalid', 'true');
  }
  const firstInvalid = document.querySelector('[aria-invalid="true"]');
  if (firstInvalid instanceof HTMLElement) firstInvalid.focus();
}

/** @type {ReturnType<typeof setTimeout> | undefined} Timer used to auto-clear the status message. */
let statusTimer;

/**
 * Sets the busy/idle state of the submit buttons and status message.
 * @param {boolean} busy
 * @param {string} [message]
 * @param {{ autoClear?: boolean }} [options]
 */
function setBusy(busy, message = '', { autoClear = false } = {}) {
  for (const button of document.querySelectorAll('[data-submit]')) {
    if (button instanceof HTMLButtonElement || button instanceof HTMLInputElement) button.disabled = busy;
  }
  results?.setAttribute('aria-busy', String(busy));
  clearTimeout(statusTimer);
  if (status) status.textContent = message;
  if (autoClear) statusTimer = setTimeout(() => { if (status) status.textContent = ''; }, STATUS_CLEAR_MS);
}

/**
 * @param {{ input: object, plan: object, checked: number[] }} nextState
 * @param {{ focus?: boolean }} [options]
 */
function show(nextState, { focus = false } = {}) {
  state = nextState;
  storage.save(state);
  renderPlan(planView, state, { onToggleVendor: toggleVendor, onStartOver: startOver });
  results.hidden = false;
  emptyState.hidden = true;
  if (focus) {
    const heading = planView.querySelector('h2');
    if (heading instanceof HTMLElement) heading.focus();
  }
}

/**
 * @param {number} index
 * @param {boolean} checked
 */
function toggleVendor(index, checked) {
  if (!state) return;
  const done = new Set(state.checked);
  if (checked) done.add(index);
  else done.delete(index);
  state = { input: state.input, plan: state.plan, checked: [...done] };
  storage.save(state);
}

function startOver() {
  storage.clear();
  state = null;
  form.reset();
  updateCandidateField('wedding');
  results.hidden = true;
  emptyState.hidden = false;
  planView.replaceChildren();
  const firstInput = form.querySelector('input');
  if (firstInput instanceof HTMLElement) firstInput.focus();
}

/**
 * @param {object} body
 */
async function requestPlan(body) {
  const response = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw data.error ?? { message: 'Something went wrong. Please try again.' };
  return data.plan;
}

/**
 * @param {object} input Event details from the form.
 * @param {string} busyMessage
 * @param {{ feedback?: string, previousPlan?: object }} [refinement]
 */
async function generate(input, busyMessage, refinement = {}) {
  clearFieldErrors();
  setBusy(true, busyMessage);
  try {
    const plan = await requestPlan({ ...input, ...refinement });
    setBusy(false, 'Your plan is ready.', { autoClear: true });
    show({ input, plan, checked: [] }, { focus: true });
    return true;
  } catch (err) {
    const error = /** @type {{ message?: string, fieldErrors?: Record<string, string> }} */ (err ?? {});
    setBusy(false, error.message || 'Something went wrong. Please try again.');
    if (error.fieldErrors) showFieldErrors(error.fieldErrors);
    return false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = readForm();
  if ((input.eventType === 'wedding' || input.eventType === 'birthday') && !input.candidateName?.trim()) {
    showFieldErrors({ candidateName: 'Please enter the candidate or candidates’ name.' });
    return;
  }
  generate(input, 'Creating your plan. This usually takes a few seconds…');
});

refineForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const feedback = new FormData(refineForm).get('feedback');
  if (!state || typeof feedback !== 'string' || !feedback.trim()) return;
  const refined = await generate(state.input, 'Updating your plan…', { feedback, previousPlan: state.plan });
  if (refined) refineForm.reset();
});

for (const chip of document.querySelectorAll('[data-suggestion]')) {
  if (!(chip instanceof HTMLElement)) continue;
  chip.addEventListener('click', () => {
    const feedbackField = refineForm.elements.namedItem('feedback');
    if (feedbackField instanceof HTMLTextAreaElement || feedbackField instanceof HTMLInputElement) {
      feedbackField.value = chip.dataset.suggestion ?? '';
      feedbackField.focus();
    }
  });
}

const eventDateInput = document.getElementById('eventDate');
if (eventDateInput instanceof HTMLInputElement) {
  eventDateInput.min = localIsoDate();
}

const eventTypeRadios = form.elements.namedItem('eventType');
if (eventTypeRadios instanceof RadioNodeList) {
  for (const radio of eventTypeRadios) {
    radio.addEventListener('change', () => {
      if (radio instanceof HTMLInputElement) updateCandidateField(radio.value);
    });
  }
}

// Landing-page cards link here with ?type=; an unknown value matches no radio and changes nothing.
const requestedType = new URLSearchParams(location.search).get('type');
if (requestedType) {
  const eventTypeField = form.elements.namedItem('eventType');
  if (eventTypeField instanceof RadioNodeList) eventTypeField.value = requestedType;
  updateCandidateField(requestedType);
} else {
  const eventTypeField = form.elements.namedItem('eventType');
  const currentType = eventTypeField instanceof RadioNodeList ? eventTypeField.value : 'wedding';
  updateCandidateField(currentType || 'wedding');
}

const saved = storage.load();
if (saved?.input && saved?.plan) {
  try {
    fillForm(saved.input);
    show({ checked: [], ...saved });
  } catch {
    // A plan saved by an older version may not match the current shape; start fresh instead of breaking.
    startOver();
  }
}
