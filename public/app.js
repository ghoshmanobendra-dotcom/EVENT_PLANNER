import { localIsoDate } from './format.js';
import { renderPlan } from './render.js';

const STORAGE_KEY = 'event-planner:plan';
const NUMBER_FIELDS = ['guestCount', 'budget'];
const STATUS_CLEAR_MS = 6000;

const form = document.getElementById('plan-form');
const status = document.getElementById('status');
const emptyState = document.getElementById('empty-state');
const results = document.getElementById('results');
const planView = document.getElementById('plan');
const refineForm = document.getElementById('refine-form');

/** @type {{ input: object, plan: object, checked: number[] } | null} */
let state = null;

/** localStorage can be unavailable (private mode, blocked storage); the app still works without it. */
const storage = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  },
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
const candidateInput = document.getElementById('candidateName');
const candidateHint = document.getElementById('candidateName-hint');

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

function readForm() {
  const input = Object.fromEntries(new FormData(form));
  for (const field of NUMBER_FIELDS) input[field] = Number(input[field]);
  return input;
}

function fillForm(input) {
  for (const [name, value] of Object.entries(input)) {
    const field = form.elements.namedItem(name);
    if (field instanceof RadioNodeList) field.value = value;
    else if (field) field.value = String(value);
  }
  if (input.eventType) updateCandidateField(input.eventType);
}

function clearFieldErrors() {
  for (const node of document.querySelectorAll('.field-error')) node.textContent = '';
  for (const field of document.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
}

/** Error slots are named `<field>-error`; `form` covers errors that belong to no single field. */
function showFieldErrors(fieldErrors) {
  for (const [name, message] of Object.entries(fieldErrors)) {
    const slot = document.getElementById(`${name}-error`) ?? document.getElementById('form-error');
    slot.textContent = message;
    document.querySelector(`[name="${CSS.escape(name)}"]`)?.setAttribute('aria-invalid', 'true');
  }
  document.querySelector('[aria-invalid="true"]')?.focus();
}

let statusTimer;
function setBusy(busy, message = '', { autoClear = false } = {}) {
  for (const button of document.querySelectorAll('[data-submit]')) button.disabled = busy;
  results.setAttribute('aria-busy', String(busy));
  clearTimeout(statusTimer);
  status.textContent = message;
  if (autoClear) statusTimer = setTimeout(() => (status.textContent = ''), STATUS_CLEAR_MS);
}

function show(nextState, { focus = false } = {}) {
  state = nextState;
  storage.save(state);
  renderPlan(planView, state, { onToggleVendor: toggleVendor, onStartOver: startOver });
  results.hidden = false;
  emptyState.hidden = true;
  if (focus) planView.querySelector('h2')?.focus();
}

function toggleVendor(index, checked) {
  const done = new Set(state.checked);
  if (checked) done.add(index);
  else done.delete(index);
  state = { ...state, checked: [...done] };
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
  form.querySelector('input')?.focus();
}

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
  } catch (error) {
    setBusy(false, error.message);
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
  if (!state || !feedback) return;
  const refined = await generate(state.input, 'Updating your plan…', { feedback, previousPlan: state.plan });
  if (refined) refineForm.reset();
});

for (const chip of document.querySelectorAll('[data-suggestion]')) {
  chip.addEventListener('click', () => {
    refineForm.elements.namedItem('feedback').value = chip.dataset.suggestion;
    refineForm.elements.namedItem('feedback').focus();
  });
}

document.getElementById('eventDate').min = localIsoDate();

const eventTypeRadios = form.elements.namedItem('eventType');
if (eventTypeRadios instanceof RadioNodeList) {
  for (const radio of eventTypeRadios) {
    radio.addEventListener('change', () => updateCandidateField(radio.value));
  }
}

// Landing-page cards link here with ?type=; an unknown value matches no radio and changes nothing.
const requestedType = new URLSearchParams(location.search).get('type');
if (requestedType) {
  form.elements.namedItem('eventType').value = requestedType;
  updateCandidateField(requestedType);
} else {
  updateCandidateField(form.elements.namedItem('eventType')?.value || 'wedding');
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
