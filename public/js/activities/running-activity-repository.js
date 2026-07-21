import { putConfig, loadConfig, deleteConfig } from '../storage.js';

export const RUNNING_ACTIVITY_CONFIG_ID = 'config-running-activity';

function normalizeRunningActivityConfig(config) {
    if (!config) {
        return null;
    }

    return {
        ...(config.activityId ? { id: config.activityId } : {}),
        description: config.description,
        category: config.category || null,
        ...(config.categoryId ? { categoryId: config.categoryId } : {}),
        ...(config.categoryIdentityVersion
            ? { categoryIdentityVersion: config.categoryIdentityVersion }
            : {}),
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
        ...(runningActivity.id ? { activityId: runningActivity.id } : {}),
        description: runningActivity.description,
        category: runningActivity.category || null,
        ...(runningActivity.categoryId ? { categoryId: runningActivity.categoryId } : {}),
        ...(runningActivity.categoryIdentityVersion
            ? { categoryIdentityVersion: runningActivity.categoryIdentityVersion }
            : {}),
        startDateTime: runningActivity.startDateTime,
        source: runningActivity.source || 'timer',
        sourceTaskId: runningActivity.sourceTaskId || null
    });
}

export async function deleteRunningActivityConfig() {
    await deleteConfig(RUNNING_ACTIVITY_CONFIG_ID);
}
