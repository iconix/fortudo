const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

import { createGuidedRecovery, getRecoveryRoute } from '../public/js/guided-recovery.js';
import { buildDocumentContractDesignDoc } from '../public/js/document-contract.js';
import { initStorage, loadTasks, getDb, destroyStorage } from '../public/js/storage.js';
import { renderUnscheduledTasks } from '../public/js/tasks/unscheduled-renderer.js';

const digest = async (value) => require('crypto').createHash('sha256').update(value).digest('hex');
let serial = 0;

describe('legacy repaired tasks through real storage hydration and rendering', () => {
    let names;
    beforeEach(() => {
        names = new Set();
        window.PouchDB = PouchDB;
        localStorage.clear();
        document.body.innerHTML = '<div id="unscheduled-task-list"></div>';
    });
    afterEach(async () => {
        await destroyStorage();
        await Promise.all(
            [...names].map((name) => new PouchDB(name, { adapter: 'memory' }).destroy())
        );
        delete window.PouchDB;
    });

    test.each([undefined, null, 'high'])(
        'renders priority %s after activation without rewriting a cloud revision',
        async (priority) => {
            const makeDatabase = (name) => {
                names.add(name);
                return new PouchDB(name, { adapter: 'memory' });
            };
            const room = `hydrate-${serial++}-${Date.now()}`;
            const logicalName = `fortudo-${room}`;
            const source = makeDatabase(logicalName);
            const remote = makeDatabase(`${logicalName}-cloud`);
            const archive = makeDatabase(`${logicalName}-archive`);
            await remote.put(buildDocumentContractDesignDoc());
            await remote.put({
                _id: 'unsched-legacy',
                type: 'unscheduled',
                description: 'Legacy work',
                status: 'incomplete',
                estDuration: 15,
                ...(priority === undefined ? {} : { priority })
            });
            const original = await remote.get('unsched-legacy');
            const activate = jest.fn();
            const service = createGuidedRecovery({
                source,
                remote,
                archive,
                logicalName,
                makeDatabase,
                digest,
                onActivate: activate
            });
            const saved = await service.preserve();
            await service.rebuild(saved._id);
            names.add(getRecoveryRoute(logicalName).databaseName);
            expect(activate).toHaveBeenCalledTimes(1);
            await initStorage(room, { adapter: 'memory' });
            const sequence = (await getDb().info()).update_seq;
            const tasks = await loadTasks();
            expect(() => renderUnscheduledTasks(tasks)).not.toThrow();
            const expected = priority ?? 'medium';
            expect(tasks[0].priority).toBe(expected);
            expect(document.querySelector('.priority-badge').textContent).toContain(
                `${expected === 'high' ? 'High' : 'Medium'} Priority`
            );
            expect(
                document.querySelector(`input[name="inline-edit-priority"][value="${expected}"]`)
                    .checked
            ).toBe(true);
            expect((await getDb().info()).update_seq).toBe(sequence);
            expect(await getDb().get(original._id)).toEqual(original);
            expect(await remote.get(original._id)).toEqual(original);
        }
    );
});
