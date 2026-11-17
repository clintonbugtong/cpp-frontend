// Puts validation errors on the field they belong to.
//
//   <div use:fieldErrors={{ errors, key: currentStep }}> … <input data-field="email"> …
//
// `errors` is a map like Laravel's 422 response ({ "persons.0.first_name": ["…"] }).
// Every element inside the node whose data-field matches a key gets a red border,
// aria-invalid, and the message written right under it. The first field with an
// error is scrolled into view and focused. Typing in a field clears its mark.
// Errors with no matching field are listed in an alert at the top of the node
// (or inside a [data-field-rest] element if the form has one) — pass rest: false
// when the form's own banner already lists every error.
//
// `key` is optional: change it (e.g. the wizard step) to re-apply the marks after
// the fields re-render.
//
// Forms that already render their own inline messages (class:input-error) also
// benefit: the action scrolls to and focuses the first marked field.

const MESSAGE_PATTERNS = /** @type {[RegExp, string][]} */ ([
  [/^The .+ (?:must|may) not be greater than (\d+) characters\.?$/i, 'Must be $1 characters or fewer.'],
  [/^The .+ must be at least (\d+) characters\.?$/i, 'Must be at least $1 characters.'],
  [/^The .+ field is required(\s+when\s+.+)?\.?$/i, 'This field is required.'],
  [/^The .+ (?:field )?must be a valid date\.?$/i, 'Enter a valid date.'],
  [/^The .+ (?:field )?must be a valid email address\.?$/i, 'Enter a valid email address.'],
  [/^The .+ has already been taken\.?$/i, 'This is already in use.'],
  [/^The .+ (?:field )?must be a string\.?$/i, 'Enter valid text.'],
  [/^The selected .+ is invalid\.?$/i, 'Please choose a valid option.'],
  [/^The .+ (?:field )?must be an integer\.?$/i, 'Enter a whole number.'],
  [/^The .+ (?:field )?must be an? (boolean|number)\.?$/i, 'Enter a valid value.'],
  [/^The .+ (?:field )?confirmation does not match\.?$/i, 'The two entries do not match.']
]);

/** Laravel's default English ("The persons.0.first_name field is required.") → plain words. */
/** @param {string} msg */
export function humanizeMessage(msg) {
  if (!msg) return msg;
  for (const [pattern, replacement] of MESSAGE_PATTERNS) {
    if (pattern.test(msg)) return msg.replace(pattern, replacement);
  }
  return msg;
}

/** @param {string|string[]|undefined} m */
const text = (m) => (Array.isArray(m) ? m : m ? [m] : []).map(humanizeMessage).join(' ');

const INVALID = '[aria-invalid="true"], .input-error, .select-error, .textarea-error';

/** @param {Element} el */
function errorClass(el) {
  if (el.matches('select')) return 'select-error';
  if (el.matches('textarea')) return 'textarea-error';
  if (el.matches('input[type="checkbox"]')) return 'checkbox-error';
  if (el.matches('input[type="radio"]')) return 'radio-error';
  return 'input-error';
}

/** Scroll to and focus the field for `name` inside `root` (e.g. from an error list). */
/** @param {ParentNode} root @param {string} name */
export function focusField(root, name) {
  requestAnimationFrame(() => {
    const el = root.querySelector(`[data-field="${CSS.escape(name)}"]`);
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!el.matches('[disabled]')) el.focus({ preventScroll: true });
  });
}

/**
 * @param {HTMLElement} node
 * @param {{ errors?: Record<string, string|string[]>, key?: any, focus?: boolean, rest?: boolean }} params
 */
export function fieldErrors(node, params) {
  /** @type {Set<Element>} */
  let marked = new Set();
  /** @type {Element[]} */
  let messages = [];
  let frame = 0;

  function clear() {
    for (const el of marked) {
      el.classList.remove(errorClass(el));
      el.removeAttribute('aria-invalid');
    }
    for (const m of messages) m.remove();
    marked = new Set();
    messages = [];
  }

  /** @param {Event} e */
  function onInput(e) {
    const target = /** @type {Element} */ (e.target);
    const field = target.closest?.('[data-field]');
    if (!field || !marked.has(field)) return;
    const name = field.getAttribute('data-field');
    // Radio groups share one data-field: clear every element and the one message.
    for (const el of [...marked]) {
      if (el.getAttribute('data-field') !== name) continue;
      el.classList.remove(errorClass(el));
      el.removeAttribute('aria-invalid');
      marked.delete(el);
    }
    messages = messages.filter((m) => (m.getAttribute('data-for') === name ? (m.remove(), false) : true));
  }

  /** @param {typeof params} p */
  function apply(p) {
    cancelAnimationFrame(frame);
    // Wait a frame so fields inside a just-opened step/dialog exist.
    frame = requestAnimationFrame(() => {
      clear();
      const errors = p?.errors || {};
      /** @type {string[]} */
      const unplaced = [];
      for (const [name, msg] of Object.entries(errors)) {
        const els = [...node.querySelectorAll(`[data-field="${CSS.escape(name)}"]`)];
        if (!els.length) { if (text(msg)) unplaced.push(text(msg)); continue; }
        for (const el of els) {
          el.classList.add(errorClass(el));
          el.setAttribute('aria-invalid', 'true');
          marked.add(el);
        }
        const message = text(msg);
        if (!message) continue;
        // Write it at the end of the field's wrapper, after the input (or after
        // the last radio of a group).
        const last = els[els.length - 1];
        const wrap = last.closest('[data-field-wrap], .form-control') || last.parentElement;
        if (!wrap) continue;
        const pEl = document.createElement('p');
        pEl.className = 'text-xs text-error mt-1 basis-full';
        pEl.setAttribute('data-for', name);
        pEl.setAttribute('role', 'alert');
        pEl.textContent = message;
        wrap.appendChild(pEl);
        messages.push(pEl);
      }
      if (unplaced.length && p?.rest !== false) {
        const box = document.createElement('div');
        box.className = 'alert alert-error text-sm py-2 mb-3';
        box.setAttribute('role', 'alert');
        box.textContent = unplaced.join(' ');
        const target = node.querySelector('[data-field-rest]');
        if (target) target.appendChild(box); else node.prepend(box);
        messages.push(box);
      }
      if (p?.focus === false || !Object.keys(errors).length) return;
      const first = node.querySelector(INVALID);
      if (first instanceof HTMLElement) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (!first.matches('[disabled]')) first.focus({ preventScroll: true });
      }
    });
  }

  node.addEventListener('input', onInput);
  node.addEventListener('change', onInput);
  apply(params);

  return {
    /** @param {typeof params} p */
    update(p) { apply(p); },
    destroy() {
      cancelAnimationFrame(frame);
      node.removeEventListener('input', onInput);
      node.removeEventListener('change', onInput);
      clear();
    }
  };
}
