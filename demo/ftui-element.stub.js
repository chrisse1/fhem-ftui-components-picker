/*
* Minimal stand-in for FTUI's components/element.component.js
*
* It is ONLY used by demo/index.html so that the picker can be tried out
* without a running FHEM/FTUI installation. It implements the parts of
* FtuiElement the picker relies on (property/attribute mapping, shadow
* root creation, submitChange, change events).
*
* In a real FTUI installation the original FtuiElement is used instead.
*/

function toKebabCase(text) {
  return text.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export class FtuiElement extends HTMLElement {

  constructor(properties) {
    super();
    this.properties = Object.assign(FtuiElement.properties, properties);
    this.initProperties(this.properties);
    if (typeof this.template === 'function') {
      const elemTemplate = document.createElement('template');
      elemTemplate.innerHTML = this.template();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(elemTemplate.content.cloneNode(true));
    }
    this.isActiveChange = {};
  }

  static get properties() {
    return { hidden: false, disabled: false, readonly: false, margin: '', padding: '' };
  }

  static get observedAttributes() {
    return [...Object.keys(FtuiElement.properties)];
  }

  static convertToAttributes(properties) {
    return Object.keys(properties).map(property => toKebabCase(property));
  }

  connectedCallback() {
    this.updateProperties();
    if (typeof this.onConnected === 'function') {
      this.onConnected();
    }
  }

  disconnectedCallback() {
    if (typeof this.onDisconnected === 'function') {
      this.onDisconnected();
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (typeof this.onAttributeChanged === 'function') {
      this.onAttributeChanged(name, newValue, oldValue);
    }
    const hasValue = newValue !== null && newValue !== false;
    if (name === 'hidden') {
      this.style.display = hasValue ? 'none' : '';
    }
    if (name === 'disabled' || name === 'readonly') {
      this.style.pointerEvents = hasValue ? 'none' : '';
    }
  }

  submitChange(property, value) {
    this.isActiveChange[property] = true;
    this[property] = value;
    this.emitChangeEvent(property, value);
  }

  emitChangeEvent(attribute, value) {
    this.emitEvent(attribute + 'Change', value);
  }

  emitEvent(name, value) {
    this.dispatchEvent(new CustomEvent(name, { detail: value }));
  }

  initProperties(properties) {
    Object.entries(properties).forEach(([name, defaultValue]) => {
      const attr = toKebabCase(name);
      if (typeof properties[name] === 'boolean') {
        Object.defineProperty(this, name, {
          get() { return this.hasAttribute(attr) && this.getAttribute(attr) !== 'false'; },
          set(value) { value ? this.setAttribute(attr, '') : this.removeAttribute(attr); },
        });
        if (!this.hasAttribute(attr) && defaultValue) {
          this.setAttribute(attr, '');
        }
      } else {
        if (typeof properties[name] === 'number') {
          Object.defineProperty(this, name, {
            get() { return Number(this.getAttribute(attr)); },
            set(value) { this.setAttribute(attr, value); },
          });
        } else {
          Object.defineProperty(this, name, {
            get() { return this.getAttribute(attr); },
            set(value) { this.setAttribute(attr, value); },
          });
        }
        if (!this.hasAttribute(attr)) {
          this.setAttribute(attr, defaultValue);
        }
      }
    });
  }

  updateProperties() {
    Object.entries(this.properties).forEach(([name, defaultValue]) => {
      const attr = toKebabCase(name);
      if (this.getAttribute(attr) === String(defaultValue)) {
        this.attributeChangedCallback(attr, null, defaultValue);
      }
    });
  }
}
