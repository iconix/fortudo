// initialize `fortudo` namespace immediately for testing purposes
// all functionality will be attached by the DOMContentLoaded event handler
// @ts-ignore - creating a custom namespace on window for testing
window.fortudo = {
    // tasks will be accessed via a getter for testing purposes
};

// import { saveTasks, loadTasks } from './js/storage.js'; // saveTasks is used by task-manager, loadTasks is direct here.
import { loadTasks } from './js/storage.js';
import {
    getTasks,
    setTasks,
    addTask,
    updateTask,
    completeTask,
    deleteTask,
    editTask,
    cancelEdit,
    deleteAllTasks,
    getSuggestedStartTime,
    isValidTaskData,
    resetAllConfirmingDeleteFlags,
    resetAllEditingFlags
} from './js/task-manager.js';
import {
    calculateMinutes,
    calculateHoursAndMinutes,
    convertTo12HourTime,
    convertTo24HourTime,
    calculateEndTime // calculateEndTime is needed for edit form logic within app.js for now
} from './js/utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const taskForm = /** @type {HTMLFormElement|null} */(document.getElementById('task-form'));
    /** @type {HTMLElement|null} */
    const taskList = document.getElementById('task-list');

    if (!taskForm || !taskList) {
        console.error('Required DOM elements (task form, task list) not found');
        return;
    }

    /**
     * @typedef {Object} Task
     * @property {string} description - task description
     * @property {string} startTime - start time in 24-hour format (HH:MM)
     * @property {string} endTime - end time in 24-hour format (HH:MM)
     * @property {number} duration - duration in minutes
     * @property {string} status - task status ("incomplete" or "completed")
     * @property {boolean} editing - whether task is being edited
     * @property {boolean} confirmingDelete - whether delete is being confirmed
     */

    /** @type {boolean} */
    let firstIncompleteTaskFound = false; // Used by renderTasks for UI logic

    // Initialize tasks from localStorage via taskManager
    const loadedTasks = loadTasks();
    setTasks(loadedTasks); // Initialize taskManager's state

    // @ts-ignore - Update fortudo global for testing
    Object.defineProperty(window.fortudo, 'tasks', {
        get: () => getTasks() // From task-manager
    });

    // Statically import DOM Handler functions
    const {
        renderDateTime,
        renderTasks,
        updateStartTimeField,
        initializePageEventListeners,
        getTaskFormElement,
        focusTaskDescriptionInput,
        showAlert,
        askConfirmation
    } = await import('./js/dom-handler.js'); // Still using await for top-level import

    // --- App Logic Callbacks for DOM Handler ---
    const appCallbacks = {
        onTaskFormSubmit: (formData) => {
            const description = /** @type {string} */(formData.get('description') || '');
            const startTime = /** @type {string} */(formData.get('start-time') || '');
            const durationHours = formData.get('duration-hours') || '0';
            const durationMinutes = formData.get('duration-minutes') || '0';
            const duration = calculateMinutes(`${durationHours}:${durationMinutes}`); // from utils.js

            const validationResult = isValidTaskData(description, duration); // from task-manager.js
            if (!validationResult.isValid && validationResult.reason) {
                showAlert(validationResult.reason); 
                return;
            }

            const addResult = addTask({ description, startTime, duration }); // from task-manager.js
            if (!addResult.success && addResult.reason) {
                showAlert(addResult.reason);
            }
            
            renderTasks(getTasks(), taskEventCallbacks); 
            const mainForm = getTaskFormElement(); 
            if (mainForm) mainForm.reset();
            updateStartTimeField(getSuggestedStartTime()); 
            focusTaskDescriptionInput(); 
        },
        onDeleteAllTasks: () => {
            if (getTasks().length === 0) {
                showAlert("There are no tasks to delete.");
                return;
            }
            let result = deleteAllTasks(false); // from task-manager.js
            if (result.requiresConfirmation) {
                if (askConfirmation("Are you sure you want to delete all tasks?")) { 
                    result = deleteAllTasks(true);
                }
            }
            if (result.success) {
                renderTasks(getTasks(), taskEventCallbacks);
                updateStartTimeField(getSuggestedStartTime());
            }
        },
        onGlobalClick: (event) => {
            const target = /** @type {HTMLElement} */(event.target);
            let parentButton = target.closest ? target.closest('button') : null;
            let needsRender = false;

            if (!parentButton || !parentButton.classList.contains('btn-delete')) {
                if (resetAllConfirmingDeleteFlags()) needsRender = true; // from task-manager.js
            }
            let parentForm = target.closest ? target.closest('form') : null;
            if ((!parentForm || !parentForm.id.includes('edit-task-')) &&
                (!parentButton || !parentButton.classList.contains('btn-edit'))) {
                if (resetAllEditingFlags()) needsRender = true; // from task-manager.js
            }
            if (needsRender) {
                renderTasks(getTasks(), taskEventCallbacks);
            }
        }
    };

    // --- Event Callbacks for Tasks (passed to domHandler.renderTasks) ---
    const taskEventCallbacks = {
        onCompleteTask: (index) => {
            const currentTimeDisplayElement = document.getElementById('current-time'); 
            let currentTime24;
            if (currentTimeDisplayElement && currentTimeDisplayElement.textContent) {
                currentTime24 = convertTo24HourTime(currentTimeDisplayElement.textContent); // from utils.js
            }
            const result = completeTask(index, currentTime24); // from task-manager.js
            if (result.requiresConfirmation && result.confirmationType === 'COMPLETE_LATE' && result.newEndTime) {
                if (askConfirmation(`Task completed! 🎉💪🏾 Do you want to update your schedule to show you finished at ${convertTo12HourTime(result.newEndTime)}? This helps keep your timeline accurate.`)) {
                    // Task manager already updated.
                } else {
                    // TODO: Handle user saying no.
                }
            }
            renderTasks(getTasks(), taskEventCallbacks);
        },
        onEditTask: (index) => {
            editTask(index); // from task-manager.js
            renderTasks(getTasks(), taskEventCallbacks);
        },
        onDeleteTask: (index) => {
            const tasks = getTasks();
            const taskToDelete = tasks[index];
            if (taskToDelete) {
                let result = deleteTask(index, taskToDelete.confirmingDelete); // from task-manager.js
                if (result.requiresConfirmation) {
                    // renderTasks will show confirmation state.
                } else if (!result.success && result.reason) {
                    showAlert(result.reason);
                }
            }
            renderTasks(getTasks(), taskEventCallbacks);
        },
        onSaveTaskEdit: (index, formData) => {
            const description = /** @type {string} */ (formData.get('description') || '');
            const startTime = /** @type {string} */ (formData.get('start-time') || '');
            const durationHours = formData.get('duration-hours') || '0';
            const durationMinutes = formData.get('duration-minutes') || '0';
            const duration = calculateMinutes(`${durationHours}:${durationMinutes}`); // from utils.js

            const validationResult = isValidTaskData(description, duration); // from task-manager.js
            if (!validationResult.isValid && validationResult.reason) {
                showAlert(validationResult.reason);
                return;
            }
            const updateResult = updateTask(index, { description, startTime, duration }); // from task-manager.js
            if (!updateResult.success && updateResult.reason) {
                showAlert(updateResult.reason);
            }
            renderTasks(getTasks(), taskEventCallbacks);
        },
        onCancelEdit: (index) => {
            cancelEdit(index); // from task-manager.js
            renderTasks(getTasks(), taskEventCallbacks);
        }
    };

    // Initialize Page
    initializePageEventListeners(appCallbacks); 
    renderTasks(getTasks(), taskEventCallbacks); 
    updateStartTimeField(getSuggestedStartTime()); 
    focusTaskDescriptionInput(); 

    setInterval(renderDateTime, 1000); 

    // =======================
    // EXPOSE FUNCTIONS FOR TESTING
    // =======================
    // @ts-ignore
    window.fortudo.tm = { 
        getTasks,
        setTasks,
        addTask,
        updateTask,
        completeTask,
        deleteTask,
        editTask,
        cancelEdit,
        deleteAllTasks,
        getSuggestedStartTime,
        isValidTaskData,
        resetAllConfirmingDeleteFlags,
        resetAllEditingFlags
    };
    // @ts-ignore
    window.fortudo.utils = { 
        calculateMinutes,
        calculateHoursAndMinutes,
        convertTo12HourTime,
        convertTo24HourTime,
        calculateEndTime
    };
    // @ts-ignore
    window.fortudo.dom = { // Expose actual DOM handler functions
        renderDateTime,
        renderTasks: (tasks) => renderTasks(tasks, taskEventCallbacks),
        updateStartTimeField,
        showAlert,
        askConfirmation,
        focusTaskDescriptionInput,
        getTaskFormElement
    };

});
