/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/storage.js', () => ({
    putConfig: jest.fn(() => Promise.resolve()),
    loadConfig: jest.fn(() => Promise.resolve(null)),
    deleteConfig: jest.fn(() => Promise.resolve())
}));

import {
    loadRunningActivityConfig,
    saveRunningActivityConfig,
    deleteRunningActivityConfig
} from '../public/js/activities/running-activity-repository.js';
import { putConfig, loadConfig, deleteConfig } from '../public/js/storage.js';

describe('running activity repository', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('loads normalized running activity state from config storage', async () => {
        loadConfig.mockResolvedValueOnce({
            id: 'config-running-activity',
            description: 'Focus',
            category: 'work/deep',
            startDateTime: '2026-04-09T10:00:00.000Z',
            ignored: true
        });

        await expect(loadRunningActivityConfig()).resolves.toEqual({
            description: 'Focus',
            category: 'work/deep',
            startDateTime: '2026-04-09T10:00:00.000Z'
        });
    });

    test('returns null when no running activity config exists', async () => {
        await expect(loadRunningActivityConfig()).resolves.toBeNull();
    });

    test('saves running activity state under the dedicated config id', async () => {
        await saveRunningActivityConfig({
            description: 'Focus',
            category: null,
            startDateTime: '2026-04-09T10:00:00.000Z'
        });

        expect(putConfig).toHaveBeenCalledWith({
            id: 'config-running-activity',
            description: 'Focus',
            category: null,
            startDateTime: '2026-04-09T10:00:00.000Z'
        });
    });

    test('deletes running activity state by dedicated config id', async () => {
        await deleteRunningActivityConfig();

        expect(deleteConfig).toHaveBeenCalledWith('config-running-activity');
    });
});
