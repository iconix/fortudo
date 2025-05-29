import { logger } from './utils.js';

/**
 * Saves the tasks array to localStorage.
 * See Task type definition in task-manager.js
 * @param {Object[]} tasks - Array of Task objects to save
 */
export function saveTasks(tasks) {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

/**
 * Loads and parses tasks array from localStorage.
 * See Task type definition in task-manager.js
 * @returns {Object[]} Array of Task objects, or empty array if no tasks found or error parsing
 */
export function loadTasksFromStorage() {
    const tasksString = localStorage.getItem('tasks');
    if (tasksString) {
        try {
            return JSON.parse(tasksString);
        } catch (error) {
            logger.error('Error parsing tasks from localStorage:', error);
            return [];
        }
    }
    return [];
}
