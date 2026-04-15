import { putConfig, loadConfig, deleteConfig } from '../storage.js';

export const RUNNING_ACTIVITY_CONFIG_ID = 'config-running-activity';

function normalizeRunningActivityConfig(config) {
    if (!config) {
        return null;
    }

    return {
        description: config.description,
        category: config.category || null,
        startDateTime: config.startDateTime,
        source: config.source || 'timer',
        sourceTaskId: config.sourceTaskId || null
    };
}

export async function loadRunningActivityConfig() {
    const config = await loadConfig(RUNNING_ACTIVITY_CONFIG_ID);
    return normalizeRunningActivityConfig(config);
}

export async function saveRunningActivityConfig(runningActivity) {
    await putConfig({
        id: RUNNING_ACTIVITY_CONFIG_ID,
        description: runningActivity.description,
        category: runningActivity.category || null,
        startDateTime: runningActivity.startDateTime,
        source: runningActivity.source || 'timer',
        sourceTaskId: runningActivity.sourceTaskId || null
    });
}

export async function deleteRunningActivityConfig() {
    await deleteConfig(RUNNING_ACTIVITY_CONFIG_ID);
}
