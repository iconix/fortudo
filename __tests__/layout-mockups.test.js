/**
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

describe('layout mockups page', () => {
    test('comparison grid gives each mockup enough width to render cleanly', () => {
        const html = fs.readFileSync(
            path.join(process.cwd(), 'public', 'layout-mockups.html'),
            'utf8'
        );

        expect(html).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
        expect(html).toContain('.option.featured-row {');
        expect(html).toContain('grid-column: 1 / -1;');
    });
});
