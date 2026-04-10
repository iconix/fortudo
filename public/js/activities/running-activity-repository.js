import { putConfig, loadConfig, deleteConfig } from '../storage.js';

export const RUNNING_ACTIVITY_CONFIG_ID = 'config-running-activity';

function normalizeRunningActivityConfig(config) {
    if (!config) {
        return null;
    }

    return {
        description: config.description,
        category: config.category || null,
        startDateTime: config.startDateTime
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
        startDateTime: runningActivity.startDateTime
    });
}

export async function deleteRunningActivityConfig() {
    await deleteConfig(RUNNING_ACTIVITY_CONFIG_ID);
}
