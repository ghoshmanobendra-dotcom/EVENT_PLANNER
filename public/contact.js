/** @type {HTMLFormElement} */
const form    = /** @type {HTMLFormElement}  */ (document.getElementById('contact-form'));
const statusEl = /** @type {HTMLParagraphElement} */ (document.getElementById('status'));
const submit  = /** @type {HTMLButtonElement}  */ (form.querySelector('[data-submit]'));

/** @type {Record<string, string>} */
const FIELD_IDS = { name: 'name', email: 'email', subject: 'subject', message: 'message' };

/** @param {string} id @param {string} text */
function setError(id, text) {
  const el = document.getElementById(`${id}-error`);
  const field = document.getElementById(id);
  if (!el || !field) return;
  el.textContent = text;
  if (text) {
    field.setAttribute('aria-invalid', 'true');
  } else {
    field.removeAttribute('aria-invalid');
  }
}

function clearErrors() {
  for (const id of Object.values(FIELD_IDS)) setError(id, '');
  statusEl.textContent = '';
}

/**
 * Moves focus to the first field that has an error, so keyboard and screen-
 * reader users land directly on the problem without hunting through the form.
 * @param {Record<string, string>} fieldErrors
 */
function focusFirstInvalid(fieldErrors) {
  for (const id of Object.values(FIELD_IDS)) {
    if (fieldErrors[id]) {
      const el = document.getElementById(id);
      el?.focus();
      return;
    }
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  submit.disabled = true;
  const original = submit.textContent;
  submit.textContent = 'Sending…';

  const data = Object.fromEntries(new FormData(form));

  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });

    const body = await response.json();

    if (response.ok) {
      form.reset();
      statusEl.textContent = 'Message sent! We’ll be in touch soon.';
      return;
    }

    const { error } = body;
    if (error?.fieldErrors && typeof error.fieldErrors === 'object') {
      for (const [id, msg] of Object.entries(error.fieldErrors)) setError(id, msg);
      focusFirstInvalid(error.fieldErrors);
    } else if (error?.code === 'RATE_LIMITED') {
      statusEl.textContent = 'Too many messages in a short time. Please wait a moment and try again.';
    } else {
      statusEl.textContent = error?.message ?? 'Something went wrong. Please try again.';
    }
  } catch {
    statusEl.textContent = 'Could not reach the server. Check your connection and try again.';
  } finally {
    submit.disabled = false;
    submit.textContent = original;
  }
});
