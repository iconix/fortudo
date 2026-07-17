jest.mock('../public/js/storage.js', () => ({
    loadConfigWithConflicts: jest.fn(),
    resolveConfigConflicts: jest.fn(),
    putConfig: jest.fn()
}));

import {
    loadUnscheduledSequenceDocument,
    persistUnscheduledSequenceDocument
} from '../public/js/tasks/unscheduled-sequence-repository.js';
import {
    loadConfigWithConflicts,
    resolveConfigConflicts,
    putConfig
} from '../public/js/storage.js';
import { UNSCHEDULED_SEQUENCE_CONFIG_ID } from '../public/js/tasks/unscheduled-sequence.js';

beforeEach(() => {
    jest.clearAllMocks();
});

test('loads the sequence config without cleanup when it has no losing revisions', async () => {
    const sequence = {
        id: UNSCHEDULED_SEQUENCE_CONFIG_ID,
        schemaVersion: 1,
        orderedTaskIds: ['alpha', 'beta']
    };
    loadConfigWithConflicts.mockResolvedValue({ config: sequence, conflictRevisions: [] });

    await expect(loadUnscheduledSequenceDocument()).resolves.toBe(sequence);
    expect(loadConfigWithConflicts).toHaveBeenCalledWith(UNSCHEDULED_SEQUENCE_CONFIG_ID);
    expect(resolveConfigConflicts).not.toHaveBeenCalled();
});

test('returns null when the sequence config does not exist', async () => {
    loadConfigWithConflicts.mockResolvedValue({ config: null, conflictRevisions: [] });

    await expect(loadUnscheduledSequenceDocument()).resolves.toBeNull();
});

test('resolves conflict leaves and returns the latest durable winner', async () => {
    const resolved = {
        id: UNSCHEDULED_SEQUENCE_CONFIG_ID,
        schemaVersion: 1,
        orderedTaskIds: ['beta', 'alpha']
    };
    loadConfigWithConflicts.mockResolvedValue({
        config: { ...resolved, orderedTaskIds: ['alpha', 'beta'] },
        conflictRevisions: ['2-loser']
    });
    resolveConfigConflicts.mockResolvedValue(resolved);

    await expect(loadUnscheduledSequenceDocument()).resolves.toBe(resolved);
    expect(resolveConfigConflicts).toHaveBeenCalledWith(UNSCHEDULED_SEQUENCE_CONFIG_ID);
});

test('persists exactly one sequence config document', async () => {
    const sequence = {
        id: UNSCHEDULED_SEQUENCE_CONFIG_ID,
        schemaVersion: 1,
        orderedTaskIds: ['gamma', 'alpha', 'beta']
    };
    putConfig.mockResolvedValue();

    await expect(persistUnscheduledSequenceDocument(sequence)).resolves.toBeUndefined();
    expect(putConfig).toHaveBeenCalledTimes(1);
    expect(putConfig).toHaveBeenCalledWith(sequence);
});
