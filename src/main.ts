import './styles/starlight.css';
import { StarlightApp } from './app/StarlightApp';

const app = new StarlightApp();

void app.boot().catch((err: unknown) => {
  const root = document.getElementById('ui-layer');
  if (root) {
    const message = err instanceof Error ? err.message : String(err);
    root.innerHTML = `<div class="sl-glass" style="margin:24px;padding:18px;color:#fff;">Starlight v2 failed to initialize: ${message}</div>`;
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });
}
