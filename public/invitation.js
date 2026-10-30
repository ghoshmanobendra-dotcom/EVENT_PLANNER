import { buildInvitationMarkup, copyInvitationText, INVITATION_THEMES } from './render.js';

const STORAGE_KEY = 'event-planner:plan';
const slot = document.getElementById('invitation-slot');
const noInvitation = document.getElementById('no-invitation');
const invitationContainer = document.getElementById('invitation-container');
const printBtn = document.getElementById('print-invitation-btn');
const copyBtn = document.getElementById('copy-text-btn');
const themeSelector = document.getElementById('theme-selector');

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

const state = loadState();

if (!state?.input) {
  if (invitationContainer) invitationContainer.hidden = true;
  if (noInvitation) noInvitation.hidden = false;
  if (printBtn) printBtn.disabled = true;
  if (copyBtn) copyBtn.disabled = true;
} else {
  const cardElement = buildInvitationMarkup(state);
  if (slot) slot.replaceChildren(cardElement);

  if (themeSelector) {
    for (let i = 0; i < INVITATION_THEMES.length; i += 1) {
      const { id, label } = INVITATION_THEMES[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chip ${i === 0 ? 'active' : ''}`;
      btn.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      btn.textContent = label;
      btn.dataset.theme = id;
      btn.addEventListener('click', () => {
        for (const sibling of themeSelector.querySelectorAll('button')) {
          sibling.classList.remove('active');
          sibling.setAttribute('aria-pressed', 'false');
        }
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        cardElement.className = `invitation-card ${id}`;
      });
      themeSelector.append(btn);
    }
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      copyInvitationText(state.input);
    });
  }
}
