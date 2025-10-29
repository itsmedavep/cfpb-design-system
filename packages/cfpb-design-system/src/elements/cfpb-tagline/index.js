import { html, LitElement, css, unsafeCSS } from 'lit';
import styles from './cfpb-tagline.component.scss';
import { I18nService } from '../cfpb-utilities/i18n-service.js';

/**
 * @element cfpb-tagline
 * @slot - fallback slot for custom content (optional)
 */
export class CfpbTagline extends LitElement {
  static styles = css`
    ${unsafeCSS(styles)}
  `;

  static get properties() {
    return {
      imgSrc: { type: String },
      text: { type: String },
    };
  }

  constructor() {
    super();
    // Default image from the Figma export; consumers can override via attribute.
    this.imgSrc = 'http://localhost:3845/assets/2b19e6d60d3f6a40665048c19334f438fa966a88.png';
    this.text = 'An official website of the United States government';
  }

  connectedCallback() {
    // Let Lit setup renderRoot first
    if (super.connectedCallback) super.connectedCallback();

    // Listen for i18n-change events bubbling from an <i18n-service> placed
    // in the light DOM. When language changes, update the text accordingly.
    this._onI18nChange = (e) => {
      const svc = e.target;
      if (svc && typeof svc.translate === 'function') {
        const translated = svc.translate('tagline');
        if (translated) {
          this.text = translated;
        }
      }
    };

    this.addEventListener('i18n-change', this._onI18nChange);

    // Ensure the i18n service custom element is defined so consumers can
    // provide a <i18n-service> in the light DOM that will be functional.
    if (I18nService && typeof I18nService.init === 'function') {
      I18nService.init();
    }

    // If an i18n-service already exists as a child, initialize text from it.
    const existing = this.querySelector('i18n-service');
    if (existing && typeof existing.translate === 'function') {
      const translated = existing.translate('tagline');
      if (translated) this.text = translated;
    }
  }

  disconnectedCallback() {
    if (super.disconnectedCallback) super.disconnectedCallback();
    if (this._onI18nChange) this.removeEventListener('i18n-change', this._onI18nChange);
  }

  render() {
    return html`
      <div class="a-tagline content-stretch">
        <div class="a-tagline__flag" aria-hidden="true">
          <img src="${this.imgSrc}" alt="" />
        </div>
        <p class="a-tagline__text">${this.text}</p>
        <slot></slot>
      </div>
    `;
  }

  static init() {
    window.customElements.get('cfpb-tagline') ||
      window.customElements.define('cfpb-tagline', CfpbTagline);
  }
}
