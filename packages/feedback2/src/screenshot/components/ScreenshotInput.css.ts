import { DOCUMENT } from '../../constants';

/**
 * Creates <style> element for widget dialog
 */
export function createScreenshotInputStyles(): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');

  const surface200 = '#FAF9FB';
  const gray100 = '#F0ECF3';

  style.textContent = `
.dialog__content:has(.editor) {
  top: var(--bottom);
  left: var(--right);
}

.editor {
  display: flex;
  flex: 1 0 auto;

  background-color: ${surface200};
  background-image: repeating-linear-gradient(
      -145deg,
      transparent,
      transparent 8px,
      ${surface200} 8px,
      ${surface200} 11px
    ),
    repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 15px,
      ${gray100} 15px,
      ${gray100} 16px
    );
}

.canvasContainer {
  flex: 1 0 auto;
  display: contents;
}

.canvasContainer canvas {
  flex: 1 0 auto;
  width: 0; /* reasons... */
  align-self: center;
}

.crop-btn-group {
  padding: 8px;
  gap: 8px;
  border-radius: var(--form-content-border-radius);
  background-color: var(--background);
  width: 175px;
}
`;

  return style;
}
