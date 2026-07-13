import { updateSyncStatusUI } from '../public/js/room-renderer.js';

describe('offline sync status', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button id="sync-status-indicator">
                <i id="sync-status-icon"></i><span id="sync-status-text"></span>
            </button>`;
    });

    test('renders a distinct Offline state, not Error', () => {
        updateSyncStatusUI('offline');
        expect(document.getElementById('sync-status-text').textContent).toBe('Offline');
        expect(document.getElementById('sync-status-icon').className).toContain('fa-link-slash');
        expect(document.getElementById('sync-status-icon').className).not.toContain('text-red');
    });
});
