/**
 * @jest-environment node
 */

const fs = require('fs');
const path = require('path');

describe('PWA appearance metadata', () => {
    test('uses the slate app-shell color for Android browser chrome', () => {
        const indexHtml = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'index.html'),
            'utf8'
        );
        const manifest = JSON.parse(
            fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.webmanifest'), 'utf8')
        );

        expect(indexHtml).toContain('<meta name="theme-color" content="#1e293b" />');
        expect(manifest.theme_color).toBe('#1e293b');
        expect(manifest.background_color).toBe('#0f172a');
    });
});
