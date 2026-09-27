/*
* Picker component for FTUI version 3
*
* An iOS style wheel picker. Values are chosen by scrolling the wheels
* up and down. Supports time (hh:mm), date (day/month/year), plain
* numbers and custom lists. Scales with the FTUI "size-x" classes.
*
* Copyright (c) 2026 chrisse1
* Under MIT License (http://www.opensource.org/licenses/mit-license.php)
*
* https://github.com/chrisse1/fhem-ftui-components-picker
*/

import { FtuiElement } from '../element.component.js';

// number of copies of the item list that are rendered for endless wheels
const BLOCKS = 5;
// ms without a scroll event until a wheel is treated as "settled"
const SETTLE_TIME = 140;
// rotation per row for the 3D effect
const ROW_ANGLE = 18;
// perspective for the 3D effect, in em of the picker font size
const PERSPECTIVE = 10;

const DEFAULT_FORMAT = {
  time: 'hh:mm',
  date: 'dd.mm.yyyy',
};

const TOKEN_MATCHER = {
  time: /hh|mm|ss/gi,
  date: /yyyy|yy|mm|dd/gi,
};

const ARIA_LABEL = {
  hh: 'hours', mm: 'minutes', ss: 'seconds',
  dd: 'day', mo: 'month', yyyy: 'year', yy: 'year',
  num: 'value', list: 'value',
};

function pad(value, length) {
  return String(value).padStart(length, '0');
}

function limit(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

/**
 * Splits a format string like "dd.mm.yyyy" into tokens and separators.
 * @returns {Array} e.g. [{token:'dd'},{sep:'.'},{token:'mm'}, ...]
 */
function tokenize(format, matcher) {
  const parts = [];
  let last = 0;
  format.replace(matcher, (match, offset) => {
    if (offset > last) {
      parts.push({ sep: format.slice(last, offset) });
    }
    parts.push({ token: match.toLowerCase() });
    last = offset + match.length;
    return match;
  });
  if (last < format.length) {
    parts.push({ sep: format.slice(last) });
  }
  return parts;
}

/**
 * A single scrollable wheel of a picker.
 * Not a custom element - it is created and owned by FtuiPicker.
 */
class FtuiPickerWheel {

  constructor(picker, key, options = {}) {
    this.picker = picker;
    this.key = key;
    this.cyclic = options.cyclic || false;
    this.items = [];
    this.nodes = [];
    this.index = 0;
    this.settleTimer = null;
    this.userScroll = false;
    this.restores = 0;
    this.tiltWindow = 4;
    this.renderedWindow = null;

    this.element = document.createElement('div');
    this.element.className = 'wheel';
    this.element.setAttribute('data-key', key);
    this.element.setAttribute('tabindex', '0');
    this.element.setAttribute('role', 'spinbutton');
    this.element.setAttribute('aria-label', ARIA_LABEL[key] || key);

    this.element.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.element.addEventListener('click', (event) => this.onClick(event));
    this.element.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.element.addEventListener('pointerdown', () => this.picker.onPointerDown(), { passive: true });
    this.element.addEventListener('touchstart', () => this.picker.onPointerDown(), { passive: true });
    this.element.addEventListener('pointerup', () => this.picker.onPointerUp(), { passive: true });
    this.element.addEventListener('pointercancel', () => this.picker.onPointerUp(), { passive: true });
    this.element.addEventListener('touchend', () => this.picker.onPointerUp(), { passive: true });
    this.element.addEventListener('touchcancel', () => this.picker.onPointerUp(), { passive: true });
    this.element.addEventListener('wheel', () => this.picker.markBusy(), { passive: true });
  }

  get count() {
    return this.items.length;
  }

  get blocks() {
    return this.cyclic && this.count > 2 ? BLOCKS : 1;
  }

  get value() {
    const item = this.items[this.index];
    return item ? item.value : '';
  }

  /**
   * Replaces the item list. The previously selected value is kept
   * if it is still part of the new list.
   * @param {Array} items [{value:'01', label:'01'}, ...]
   */
  setItems(items) {
    const previous = this.value;
    this.items = items;
    this.nodes = [];
    this.renderedWindow = null;
    const fragment = document.createDocumentFragment();
    for (let block = 0; block < this.blocks; block++) {
      items.forEach((item, i) => {
        const node = document.createElement('div');
        node.className = 'item';
        node.textContent = item.label;
        node.setAttribute('data-index', String(i));
        fragment.appendChild(node);
        this.nodes.push(node);
      });
    }
    this.element.textContent = '';
    this.element.appendChild(fragment);
    this.index = limit(this.index, 0, Math.max(0, this.count - 1));
    if (previous !== '') {
      const found = items.findIndex(item => item.value === previous);
      if (found > -1) {
        this.index = found;
      }
    }
    this.updateAria();
  }

  /** index of a logical item in the middle block of the rendered list */
  centerIndex(logical) {
    return logical + Math.floor(this.blocks / 2) * this.count;
  }

  /** rendered index of a logical item closest to the current scroll position */
  nearestIndex(logical) {
    if (this.blocks === 1) {
      return logical;
    }
    const current = this.picker.itemPx ? Math.round(this.element.scrollTop / this.picker.itemPx) : 0;
    let best = logical;
    let bestDistance = Infinity;
    for (let block = 0; block < this.blocks; block++) {
      const candidate = logical + block * this.count;
      const distance = Math.abs(candidate - current);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  /** moves the wheel to a logical index without emitting a change */
  setIndex(logical, smooth = false) {
    if (this.count === 0) {
      return;
    }
    this.index = this.cyclic
      ? ((logical % this.count) + this.count) % this.count
      : limit(logical, 0, this.count - 1);
    // endless wheels are always parked in the middle block, so there is
    // always room to scroll in both directions. All blocks look the same,
    // therefore this is invisible to the user.
    this.scrollToRendered(this.centerIndex(this.index), smooth);
    this.updateAria();
  }

  /** user driven move - the change is reported once the wheel settles */
  goTo(logical) {
    if (this.count === 0) {
      return;
    }
    const target = this.cyclic
      ? ((logical % this.count) + this.count) % this.count
      : limit(logical, 0, this.count - 1);
    this.picker.markBusy();
    this.scrollToRendered(this.nearestIndex(target), true);
  }

  scrollToRendered(rendered, smooth) {
    const itemPx = this.picker.itemPx;
    if (!itemPx) {
      return;
    }
    const top = rendered * itemPx;
    if (Math.abs(this.element.scrollTop - top) < 0.5) {
      this.picker.requestRender();
      return;
    }
    if (smooth && typeof this.element.scrollTo === 'function') {
      this.element.scrollTo({ top, behavior: 'smooth' });
    } else {
      this.element.scrollTop = top;
    }
    this.picker.requestRender();
  }

  selectValue(value) {
    const found = this.items.findIndex(item => item.value === value);
    if (found > -1) {
      this.setIndex(found);
      return true;
    }
    return false;
  }

  /** selects the item which is numerically closest to the given number */
  selectNumber(number) {
    if (this.count === 0 || !Number.isFinite(number)) {
      return false;
    }
    let best = 0;
    let bestDistance = Infinity;
    this.items.forEach((item, i) => {
      const distance = Math.abs(Number(item.value) - number);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    this.setIndex(best);
    return true;
  }

  onScroll() {
    if (this.picker.isUserInput) {
      // a drag or a fling keeps this flag until the wheel settles, even
      // when the finger has left the screen long before
      this.userScroll = true;
    }
    this.picker.requestRender();
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.onSettled(), SETTLE_TIME);
  }

  onSettled() {
    this.settleTimer = null;
    const itemPx = this.picker.itemPx;
    if (!itemPx || this.count === 0) {
      return;
    }
    const byUser = this.userScroll;
    this.userScroll = false;
    let rendered = Math.round(this.element.scrollTop / itemPx);
    rendered = limit(rendered, 0, this.nodes.length - 1);
    const logical = ((rendered % this.count) + this.count) % this.count;
    const changed = logical !== this.index;

    if (changed && !byUser) {
      // nobody scrolled this wheel - the browser did (re-layout, a hidden
      // tab that resets scrollTop, ...). Move it back instead of reporting
      // a change that would be written to FHEM.
      if (this.restores < 3) {
        this.restores++;
        this.setIndex(this.index);
        return;
      }
      // the position cannot be restored (e.g. a measurement went wrong) -
      // take it as it is, but never report it as a change
      this.restores = 0;
      this.index = logical;
      this.updateAria();
      this.picker.requestRender();
      return;
    }

    this.restores = 0;
    this.index = logical;
    this.updateAria();

    // correct a position the browser did not snap exactly
    if (Math.abs(this.element.scrollTop - rendered * itemPx) > 0.5) {
      this.element.scrollTop = rendered * itemPx;
    }
    // keep endless wheels in the middle block
    if (this.blocks > 1 && (rendered < this.count || rendered >= this.count * (this.blocks - 1))) {
      this.element.scrollTop = (logical + Math.floor(this.blocks / 2) * this.count) * itemPx;
    }
    this.picker.requestRender();
    if (changed) {
      this.picker.onWheelChanged(this);
    } else {
      this.picker.maybeApplyDeferred();
    }
  }

  onClick(event) {
    const node = event.target.closest('.item');
    if (!node || !this.picker.itemPx) {
      return;
    }
    const rendered = this.nodes.indexOf(node);
    if (rendered < 0) {
      return;
    }
    const current = Math.round(this.element.scrollTop / this.picker.itemPx);
    if (rendered === current) {
      return;
    }
    this.picker.markBusy();
    this.scrollToRendered(rendered, true);
  }

  onKeyDown(event) {
    const keys = {
      ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5,
    };
    if (event.key in keys) {
      this.goTo(this.index + keys[event.key]);
    } else if (event.key === 'Home') {
      this.goTo(0);
    } else if (event.key === 'End') {
      this.goTo(this.count - 1);
    } else {
      return;
    }
    event.preventDefault();
  }

  updateAria() {
    const item = this.items[this.index];
    this.element.setAttribute('aria-valuenow', item ? item.value : '');
    this.element.setAttribute('aria-valuetext', item ? item.label : '');
  }

  /** applies the 3D transforms of all items near the center */
  render(itemPx, flat) {
    if (!itemPx || this.nodes.length === 0) {
      return;
    }
    const center = this.element.scrollTop / itemPx;
    const first = Math.max(0, Math.floor(center) - this.tiltWindow);
    const last = Math.min(this.nodes.length - 1, Math.ceil(center) + this.tiltWindow);
    if (this.renderedWindow) {
      for (let i = this.renderedWindow[0]; i <= this.renderedWindow[1]; i++) {
        if ((i < first || i > last) && this.nodes[i]) {
          this.nodes[i].style.transform = '';
          this.nodes[i].style.opacity = '';
          this.nodes[i].classList.remove('selected');
        }
      }
    }
    for (let i = first; i <= last; i++) {
      const node = this.nodes[i];
      const distance = i - center;
      const absolute = Math.abs(distance);
      if (flat) {
        node.style.transform = '';
        node.style.opacity = absolute > 0.5 ? String(Math.max(0.25, 1 - absolute * 0.2)) : '1';
      } else {
        const angle = -distance * ROW_ANGLE;
        const scale = Math.max(0.5, 1 - absolute * 0.05);
        node.style.transform = `perspective(${PERSPECTIVE}em) rotateX(${angle.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        node.style.opacity = Math.max(0, 1 - absolute * 0.25).toFixed(3);
      }
      node.classList.toggle('selected', absolute < 0.5);
    }
    this.renderedWindow = [first, last];
  }
}

export class FtuiPicker extends FtuiElement {

  constructor(properties) {
    super(Object.assign(FtuiPicker.properties, properties));

    this.container = this.shadowRoot.querySelector('.picker');
    this.wheelsElement = this.shadowRoot.querySelector('.wheels');
    this.probe = this.shadowRoot.querySelector('.probe');
    this.pendingBar = this.shadowRoot.querySelector('.pending-bar');

    this.wheels = [];
    this.itemPx = 0;
    this.renderHandle = null;
    this.rebuildScheduled = false;
    this.submitTimer = null;
    this.pendingValue = null;
    this.deferredValue = null;
    this.deferTimer = null;
    this.pointerActive = false;
    this.pointerDeadline = 0;
    this.fittedRows = 0;
    this.fitShrinks = 0;
    this.busyUntil = 0;
    this.isInitialized = true;

    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.onWindowPointerUp = () => this.onPointerUp();

    this.rebuild();
  }

  template() {
    return `
      <style>
        :host {
          display: inline-block;
          vertical-align: middle;
          color: var(--picker-color, var(--text-color, currentColor));
          -webkit-tap-highlight-color: transparent;
        }
        .picker {
          --picker-rows: 5;
          --picker-item-height: 1.6em;
          --rows-half: calc((var(--picker-rows) - 1) / 2);
          /* the fade is measured from the centre in item heights, not in
             percent, so the selected row stays fully visible no matter how
             many rows there are - down to two or even one */
          --fade: linear-gradient(to bottom,
            transparent 0,
            rgba(0, 0, 0, 0.45) calc(50% - var(--picker-item-height)),
            #000 calc(50% - var(--picker-item-height) / 2),
            #000 calc(50% + var(--picker-item-height) / 2),
            rgba(0, 0, 0, 0.45) calc(50% + var(--picker-item-height)),
            transparent 100%);
          position: relative;
          display: flex;
          flex-direction: row;
          align-items: stretch;
          justify-content: center;
          height: calc(var(--picker-rows) * var(--picker-item-height));
          user-select: none;
          -webkit-user-select: none;
        }
        .highlight {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: var(--picker-item-height);
          transform: translateY(-50%);
          border-radius: var(--picker-highlight-radius, 0.4em);
          background: var(--picker-highlight-color, rgba(128, 128, 128, 0.2));
          border-top: var(--picker-highlight-border, none);
          border-bottom: var(--picker-highlight-border, none);
          pointer-events: none;
          z-index: 0;
        }
        .wheels {
          position: relative;
          display: flex;
          flex-direction: row;
          align-items: stretch;
          justify-content: center;
          z-index: 1;
        }
        .wheel {
          box-sizing: border-box;
          height: calc(var(--picker-rows) * var(--picker-item-height));
          padding: calc(var(--rows-half) * var(--picker-item-height)) 0;
          min-width: var(--picker-wheel-width, 1.8em);
          overflow-x: hidden;
          overflow-y: scroll;
          scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          -ms-overflow-style: none;
          outline: none;
          cursor: grab;
          -webkit-mask-image: var(--picker-mask, var(--fade));
          mask-image: var(--picker-mask, var(--fade));
        }
        .wheel::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
        .wheel:focus-visible {
          box-shadow: inset 0 0 0 2px var(--picker-focus-color, var(--color-base, #39f));
          border-radius: 0.3em;
        }
        .item {
          box-sizing: border-box;
          height: var(--picker-item-height);
          line-height: var(--picker-item-height);
          padding: 0 var(--picker-item-padding, 0.25em);
          scroll-snap-align: center;
          scroll-snap-stop: normal;
          text-align: center;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          font-weight: var(--picker-font-weight, inherit);
          will-change: transform, opacity;
          backface-visibility: hidden;
        }
        .item.selected {
          color: var(--picker-selected-color, inherit);
          font-weight: var(--picker-selected-font-weight, var(--picker-font-weight, inherit));
        }
        .separator, .unit {
          align-self: center;
          padding: 0 var(--picker-separator-padding, 0.05em);
          line-height: var(--picker-item-height);
          white-space: pre;
          pointer-events: none;
        }
        .unit {
          padding-left: 0.25em;
          color: var(--picker-unit-color, inherit);
          font-size: var(--picker-unit-size, 0.7em);
        }
        .pending {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 0.12em;
          overflow: hidden;
          opacity: 0;
          transition: opacity 150ms linear;
          pointer-events: none;
        }
        .pending.active {
          opacity: 1;
        }
        .pending-bar {
          width: 0;
          height: 100%;
          background: var(--picker-pending-color, var(--color-base, #39f));
        }
        .probe {
          position: absolute;
          visibility: hidden;
          pointer-events: none;
          top: 0;
          left: 0;
        }
        :host([disabled]) .picker,
        :host([readonly]) .picker {
          cursor: default;
        }
      </style>
      <div class="picker">
        <div class="highlight"></div>
        <div class="wheels"></div>
        <div class="item probe">0</div>
        <div class="pending"><div class="pending-bar"></div></div>
      </div>
      <slot></slot>
      `;
  }

  static get properties() {
    return {
      value: '',
      mode: 'time',
      format: '',
      rows: 5,
      maxRows: 5,
      min: 0,
      max: 100,
      step: 1,
      decimals: -1,
      minuteStep: 1,
      secondStep: 1,
      hourStep: 1,
      minYear: 0,
      maxYear: 0,
      monthFormat: 'number',
      monthNames: '',
      locale: '',
      list: '',
      vallist: '',
      delimiter: ',',
      unit: '',
      pad: 0,
      cyclic: true,
      flat: false,
      noIndicator: false,
      debounce: 500,
      delay: -1,
      width: '',
      height: '',
      color: '',
    };
  }

  static get observedAttributes() {
    return [...this.convertToAttributes(FtuiPicker.properties), ...super.observedAttributes];
  }

  onConnected() {
    if (this.width) {
      this.style.width = this.width;
    }
    if (this.height) {
      this.style.height = this.height;
    }
    if (this.color) {
      this.style.color = this.color;
    }
    this.resizeObserver.observe(this);
    if (this.parentElement) {
      this.resizeObserver.observe(this.parentElement);
    }
    window.addEventListener('pointerup', this.onWindowPointerUp, { passive: true });
    this.measure();
    requestAnimationFrame(() => this.measure());
  }

  onDisconnected() {
    clearTimeout(this.submitTimer);
    clearTimeout(this.deferTimer);
    this.resizeObserver.disconnect();
    window.removeEventListener('pointerup', this.onWindowPointerUp);
  }

  onAttributeChanged(name, value) {
    if (!this.isInitialized) {
      return;
    }
    switch (name) {
      case 'value':
        this.applyValue(value);
        break;
      case 'rows':
      case 'max-rows':
        this.fittedRows = 0;
        this.fitShrinks = 0;
        this.applyRows();
        this.measure();
        break;
      case 'width':
        this.style.width = value || '';
        break;
      case 'height':
        this.style.height = value || '';
        break;
      case 'color':
        this.style.color = value || '';
        break;
      case 'flat':
        this.requestRender();
        break;
      // handled by the base class or used on demand - no rebuild needed
      case 'debounce':
      case 'delay':
      case 'no-indicator':
      case 'hidden':
      case 'disabled':
      case 'readonly':
      case 'margin':
      case 'padding':
        break;
      default:
        this.scheduleRebuild();
        break;
    }
  }

  /* ------------------------------------------------------------------ *
   *  configuration helpers
   * ------------------------------------------------------------------ */

  get effectiveMode() {
    const mode = (this.mode || 'time').toLowerCase();
    return ['time', 'date', 'number', 'list'].includes(mode) ? mode : 'time';
  }

  get effectiveFormat() {
    return this.format || DEFAULT_FORMAT[this.effectiveMode] || '';
  }

  /** true for rows="auto" - the picker then fits into the space it gets */
  get isAutoRows() {
    const raw = this.getAttribute('rows');
    return raw !== null && /^\s*(auto|fit)\s*$/i.test(raw);
  }

  get maxEffectiveRows() {
    const rows = Number(this.getAttribute('max-rows'));
    return Number.isFinite(rows) && rows > 0 ? limit(rows, 1, 15) : 5;
  }

  /**
   * Visible rows. Fractional values are allowed and useful: with 2 rows the
   * selected row sits in the middle and half a row peeks in above and below,
   * which is what fits into a tight tile.
   */
  get effectiveRows() {
    if (this.isAutoRows) {
      return this.fittedRows || this.maxEffectiveRows;
    }
    const rows = Number(this.getAttribute('rows'));
    return Number.isFinite(rows) && rows > 0 ? limit(rows, 1, 15) : 5;
  }

  /**
   * For rows="auto": takes the height the surrounding element offers and
   * derives the number of rows from it, never more than max-rows.
   */
  fitRows() {
    if (!this.isAutoRows || !this.itemPx) {
      return false;
    }
    const max = this.maxEffectiveRows;
    let rows = max;
    const parent = this.parentElement;
    if (parent) {
      const style = window.getComputedStyle(parent);
      const own = window.getComputedStyle(this);
      const available = parent.clientHeight
        - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0)
        - parseFloat(own.marginTop || 0) - parseFloat(own.marginBottom || 0);
      if (available > 0) {
        rows = limit(Math.floor((available / this.itemPx) * 100) / 100, 1, max);
      }
    }
    const previous = this.fittedRows || 0;
    if (Math.abs(rows - previous) < 0.02) {
      return false;
    }
    if (rows < previous) {
      // do not chase a container that shrinks together with the picker
      if (this.fitShrinks >= 3) {
        return false;
      }
      this.fitShrinks++;
    } else {
      this.fitShrinks = 0;
    }
    this.fittedRows = rows;
    return true;
  }

  /** hands the current row count over to CSS and re-centres the wheels */
  applyRows() {
    const rows = this.effectiveRows;
    this.container.style.setProperty('--picker-rows', String(rows));
    this.wheels.forEach(wheel => {
      wheel.tiltWindow = Math.ceil(rows / 2) + 1;
      wheel.setIndex(wheel.index);
    });
    this.requestRender();
  }

  /** submit delay in ms - "delay" is an alias of "debounce" */
  get effectiveDelay() {
    const delay = this.delay;
    return Math.max(0, delay >= 0 ? delay : this.debounce);
  }

  get effectiveDecimals() {
    if (this.decimals >= 0) {
      return this.decimals;
    }
    const step = String(this.step);
    const dot = step.indexOf('.');
    return dot < 0 ? 0 : step.length - dot - 1;
  }

  get yearRange() {
    const current = new Date().getFullYear();
    const from = this.minYear > 0 ? this.minYear : current - 10;
    const to = this.maxYear > 0 ? this.maxYear : current + 10;
    return to >= from ? [from, to] : [to, from];
  }

  /* ------------------------------------------------------------------ *
   *  building the wheels
   * ------------------------------------------------------------------ */

  scheduleRebuild() {
    if (this.rebuildScheduled) {
      return;
    }
    this.rebuildScheduled = true;
    Promise.resolve().then(() => {
      this.rebuildScheduled = false;
      this.rebuild();
    });
  }

  rebuild() {
    this.wheels = [];
    this.tokens = [];
    this.wheelsElement.textContent = '';

    const mode = this.effectiveMode;
    if (mode === 'number' || mode === 'list') {
      const wheel = this.createWheel(mode === 'number' ? 'num' : 'list', { cyclic: false });
      wheel.setItems(mode === 'number' ? this.numberItems() : this.listItems());
      this.wheelsElement.appendChild(wheel.element);
      this.wheels.push(wheel);
      this.tokens.push({ token: mode === 'number' ? 'num' : 'list' });
    } else {
      tokenize(this.effectiveFormat, TOKEN_MATCHER[mode]).forEach(part => {
        if (part.sep !== undefined) {
          const separator = document.createElement('div');
          separator.className = 'separator';
          separator.textContent = part.sep;
          this.wheelsElement.appendChild(separator);
          this.tokens.push(part);
          return;
        }
        const key = mode === 'date' && part.token === 'mm' ? 'mo' : part.token;
        const wheel = this.createWheel(key, { cyclic: this.cyclic && key !== 'yyyy' && key !== 'yy' });
        wheel.setItems(this.itemsForToken(key));
        this.wheelsElement.appendChild(wheel.element);
        this.wheels.push(wheel);
        this.tokens.push({ token: key, wheel });
      });
    }

    if (this.unit) {
      const unit = document.createElement('div');
      unit.className = 'unit';
      unit.textContent = this.unit;
      this.wheelsElement.appendChild(unit);
    }

    this.container.style.setProperty('--picker-rows', String(this.effectiveRows));
    this.measure();
    this.applyValue(this.value);
    // park every wheel at its position - without a value nothing was
    // scrolled yet and endless wheels would start in the first block
    this.wheels.forEach(wheel => wheel.setIndex(wheel.index));
  }

  createWheel(key, options) {
    const wheel = new FtuiPickerWheel(this, key, options);
    wheel.tiltWindow = Math.ceil(this.effectiveRows / 2) + 1;
    return wheel;
  }

  itemsForToken(key) {
    switch (key) {
      case 'hh':
        return this.rangeItems(0, 23, Math.max(1, this.hourStep), 2);
      case 'mm':
        return this.rangeItems(0, 59, Math.max(1, this.minuteStep), 2);
      case 'ss':
        return this.rangeItems(0, 59, Math.max(1, this.secondStep), 2);
      case 'dd':
        return this.rangeItems(1, this.currentDaysInMonth(), 1, 2);
      case 'mo':
        return this.monthItems();
      case 'yyyy': {
        const [from, to] = this.yearRange;
        return this.rangeItems(from, to, 1, 4);
      }
      case 'yy': {
        const [from, to] = this.yearRange;
        return this.rangeItems(from, to, 1, 4)
          .map(item => ({ value: item.value.slice(-2), label: item.value.slice(-2) }));
      }
      default:
        return [];
    }
  }

  rangeItems(from, to, step, digits) {
    const items = [];
    for (let i = from; i <= to; i += step) {
      const value = pad(i, digits);
      items.push({ value, label: value });
    }
    return items;
  }

  monthItems() {
    const names = this.monthLabels();
    return names.map((label, i) => ({ value: pad(i + 1, 2), label }));
  }

  monthLabels() {
    if (this.monthNames) {
      const custom = this.monthNames.split(this.delimiter || ',').map(name => name.trim());
      if (custom.length === 12) {
        return custom;
      }
    }
    const format = (this.monthFormat || 'number').toLowerCase();
    if (format === 'short' || format === 'long' || format === 'narrow') {
      const locale = this.locale || undefined;
      try {
        return Array.from({ length: 12 },
          (unused, i) => new Date(2021, i, 1).toLocaleDateString(locale, { month: format }));
      } catch (error) {
        // fall through to numbers
      }
    }
    return Array.from({ length: 12 }, (unused, i) => pad(i + 1, 2));
  }

  numberItems() {
    const decimals = this.effectiveDecimals;
    const step = Math.abs(this.step) || 1;
    const from = Math.min(this.min, this.max);
    const to = Math.max(this.min, this.max);
    const digits = Math.max(0, Math.round(this.pad));
    const items = [];
    const count = Math.floor((to - from) / step + 1e-9) + 1;
    // "pad" fills up with leading zeros - the padded text is used as value
    // as well, so that a picker with pad="2" really delivers "03" and not "3"
    const width = digits > 0 ? digits + (decimals > 0 ? decimals + 1 : 0) : 0;
    for (let i = 0; i < count && i < 10000; i++) {
      const number = from + i * step;
      const plain = number.toFixed(decimals);
      const text = width > 0
        ? (number < 0 ? '-' : '') + Math.abs(number).toFixed(decimals).padStart(width, '0')
        : plain;
      items.push({ value: text, label: text });
    }
    return items;
  }

  listItems() {
    const delimiter = this.delimiter || ',';
    const labels = (this.list || '').split(delimiter).map(entry => entry.trim());
    const values = this.vallist
      ? this.vallist.split(delimiter).map(entry => entry.trim())
      : labels;
    return labels.map((label, i) => ({ value: values[i] !== undefined ? values[i] : label, label }));
  }

  currentDaysInMonth() {
    const month = this.wheelValue('mo');
    const year = this.wheelValue('yyyy') || this.wheelValue('yy');
    const monthNumber = month ? Number(month) : 1;
    let yearNumber = year ? Number(year) : new Date().getFullYear();
    if (String(year).length === 2) {
      yearNumber += 2000;
    }
    return daysInMonth(monthNumber || 1, yearNumber);
  }

  wheel(key) {
    return this.wheels.find(item => item.key === key);
  }

  wheelValue(key) {
    const wheel = this.wheel(key);
    return wheel ? wheel.value : '';
  }

  /* ------------------------------------------------------------------ *
   *  measuring
   * ------------------------------------------------------------------ */

  measure() {
    const height = this.probe.getBoundingClientRect().height;
    if (!height) {
      return;
    }
    const changed = Math.abs(height - this.itemPx) > 0.5;
    this.itemPx = height;
    if (changed) {
      this.fitShrinks = 0;
      this.wheels.forEach(wheel => wheel.setIndex(wheel.index));
    }
    if (this.fitRows()) {
      this.applyRows();
    }
    this.requestRender();
  }

  requestRender() {
    if (this.renderHandle) {
      return;
    }
    this.renderHandle = requestAnimationFrame(() => {
      this.renderHandle = null;
      this.wheels.forEach(wheel => wheel.render(this.itemPx, this.flat));
    });
  }

  /* ------------------------------------------------------------------ *
   *  value handling
   * ------------------------------------------------------------------ */

  /** takes a value from outside (FHEM) and moves the wheels accordingly */
  applyValue(value) {
    if (!this.isInitialized || this.wheels.length === 0) {
      return;
    }
    if (this.isBusy) {
      // the user is busy right now - remember the update and retry later
      this.deferredValue = value;
      clearTimeout(this.deferTimer);
      this.deferTimer = setTimeout(() => this.maybeApplyDeferred(), 250);
      return;
    }
    clearTimeout(this.deferTimer);
    this.deferredValue = null;
    const text = value === null || value === undefined ? '' : String(value).trim();
    if (text === '') {
      return;
    }
    const mode = this.effectiveMode;
    if (mode === 'number') {
      this.wheels[0].selectNumber(Number(text.replace(',', '.').replace(/[^\d.eE+-]/g, '')));
    } else if (mode === 'list') {
      if (!this.wheels[0].selectValue(text)) {
        const index = this.wheels[0].items.findIndex(item => item.label === text);
        if (index > -1) {
          this.wheels[0].setIndex(index);
        }
      }
    } else {
      const numbers = text.match(/\d+/g);
      if (!numbers) {
        return;
      }
      const wheels = this.wheels;
      wheels.forEach((wheel, i) => {
        if (numbers[i] === undefined) {
          return;
        }
        let number = Number(numbers[i]);
        if (wheel.key === 'yy' && numbers[i].length === 4) {
          number = Number(numbers[i].slice(-2));
        }
        if (wheel.key === 'yyyy' && numbers[i].length === 2) {
          number += 2000;
        }
        wheel.selectNumber(number);
      });
      this.updateDayWheel();
    }
  }

  /** keeps the day wheel in sync with month and year */
  updateDayWheel() {
    const dayWheel = this.wheel('dd');
    if (!dayWheel) {
      return;
    }
    const days = this.currentDaysInMonth();
    if (dayWheel.count === days) {
      return;
    }
    const previousIndex = dayWheel.index;
    dayWheel.setItems(this.rangeItems(1, days, 1, 2));
    dayWheel.setIndex(Math.min(previousIndex, days - 1));
  }

  composeValue() {
    const mode = this.effectiveMode;
    if (mode === 'number' || mode === 'list') {
      return this.wheels.length ? this.wheels[0].value : '';
    }
    return this.tokens
      .map(part => (part.sep !== undefined ? part.sep : this.wheelValue(part.token)))
      .join('');
  }

  /**
   * True while the user is working with the picker or while a selected
   * value is waiting to be written. Updates from FHEM are held back then,
   * otherwise a wheel would jump away under the user's finger.
   */
  get isBusy() {
    return this.isUserInput
      || this.pendingValue !== null
      || this.wheels.some(wheel => wheel.settleTimer !== null);
  }

  /**
   * True right after a touch, a mouse wheel, a click or a key press.
   * Only scrolling that starts while this is true counts as a change made
   * by the user - everything else is the browser moving the wheels around.
   */
  get isUserInput() {
    // the pointer deadline is a safety net: should a pointerup ever get
    // lost, the picker must not ignore FHEM updates forever
    return (this.pointerActive && Date.now() < this.pointerDeadline)
      || Date.now() < this.busyUntil;
  }

  /** marks the picker as busy for a short while (mouse wheel, click, keys) */
  markBusy(duration = 500) {
    this.busyUntil = Date.now() + duration;
  }

  onPointerDown() {
    this.pointerActive = true;
    this.pointerDeadline = Date.now() + 15000;
    this.markBusy();
  }

  onPointerUp() {
    this.pointerActive = false;
    this.maybeApplyDeferred();
  }

  /** applies an update from FHEM that arrived while the user was busy */
  maybeApplyDeferred() {
    if (this.deferredValue === null) {
      return;
    }
    if (this.isBusy) {
      clearTimeout(this.deferTimer);
      this.deferTimer = setTimeout(() => this.maybeApplyDeferred(), 250);
      return;
    }
    const value = this.deferredValue;
    this.deferredValue = null;
    this.applyValue(value);
  }

  onWheelChanged(wheel) {
    if (!this.isInitialized) {
      return;
    }
    if (wheel.key === 'mo' || wheel.key === 'yyyy' || wheel.key === 'yy') {
      this.updateDayWheel();
    }
    this.startSubmit(this.composeValue());
  }

  startSubmit(value) {
    clearTimeout(this.submitTimer);
    this.pendingValue = value;
    const delay = this.effectiveDelay;
    this.emitEvent('select', value);
    if (delay <= 0) {
      this.commit();
      return;
    }
    this.showPending(delay);
    this.submitTimer = setTimeout(() => this.commit(), delay);
  }

  /** writes the selected value to the value attribute (and to FHEM) */
  commit() {
    clearTimeout(this.submitTimer);
    this.submitTimer = null;
    this.hidePending();
    const value = this.pendingValue;
    this.pendingValue = null;
    if (value === null) {
      return;
    }
    this.submitChange('value', value);
    this.maybeApplyDeferred();
  }

  /** public: write the current selection immediately, skipping the delay */
  submitNow() {
    if (this.pendingValue === null) {
      this.pendingValue = this.composeValue();
    }
    this.commit();
  }

  /** public: drop a pending change without writing it */
  cancelPending() {
    clearTimeout(this.submitTimer);
    this.submitTimer = null;
    this.pendingValue = null;
    this.hidePending();
  }

  showPending(delay) {
    if (this.noIndicator || delay < 250) {
      return;
    }
    const pending = this.pendingBar.parentElement;
    pending.classList.add('active');
    this.pendingBar.style.transition = 'none';
    this.pendingBar.style.width = '0%';
    void this.pendingBar.offsetWidth;
    this.pendingBar.style.transition = `width ${delay}ms linear`;
    this.pendingBar.style.width = '100%';
  }

  hidePending() {
    const pending = this.pendingBar.parentElement;
    pending.classList.remove('active');
    this.pendingBar.style.transition = 'none';
    this.pendingBar.style.width = '0%';
  }
}

window.customElements.define('ftui-picker', FtuiPicker);
