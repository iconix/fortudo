import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
const pages = fs
    .readdirSync(publicDir, { recursive: true })
    .filter((file) => file.endsWith('.html'));

test.each(pages)(
    '%s keeps executable scripts in external files allowed by the hosting CSP',
    (file) => {
        const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
        const page = new DOMParser().parseFromString(html, 'text/html');
        const inlineScripts = Array.from(page.scripts).filter(
            (script) =>
                !script.src &&
                script.textContent.trim() &&
                !['application/json', 'application/ld+json'].includes(script.type.toLowerCase())
        );

        expect(inlineScripts.map((script) => script.type || 'classic')).toEqual([]);
    }
);
