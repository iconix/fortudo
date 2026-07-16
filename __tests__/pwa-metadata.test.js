/**
 * @jest-environment node
 */

const fs = require('fs');
const path = require('path');

describe('PWA appearance metadata', () => {
    test('uses the app background color for Android browser chrome', () => {
        const indexHtml = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'index.html'),
            'utf8'
        );
        const manifest = JSON.parse(
            fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.webmanifest'), 'utf8')
        );

        expect(indexHtml).toContain('<meta name="theme-color" content="#0f172a" />');
        expect(manifest.theme_color).toBe('#0f172a');
        expect(manifest.theme_color).toBe(manifest.background_color);
    });
});
