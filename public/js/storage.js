import { logger } from './utils.js';

// Function to save tasks to localStorage
export function saveTasks(tasks) {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

// Function to load tasks from localStorage
export function loadTasks() {
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
