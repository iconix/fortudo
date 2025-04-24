// initialize `fortudo` namespace immediately for testing purposes
// all functionality will be attached by the DOMContentLoaded event handler
// @ts-ignore - creating a custom namespace on window for testing
window.fortudo = {
    // state - need to take care to maintain reference to this same array for tests
    tasks: []
};

document.addEventListener('DOMContentLoaded', () => {
    const taskForm = /** @type {HTMLFormElement|null} */(document.getElementById('task-form'));

    /** @type {HTMLElement|null} */
    const taskList = document.getElementById('task-list');

    // const availableHoursStartInput = document.getElementById('available-hours-start');
    // const availableHoursEndInput = document.getElementById('available-hours-end');
    // const freeTimeDisplay = document.getElementById('free-time');

    // exit early if required elements don't exist
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

    // Use the tasks array from the global fortudo object
    // This ensures it's the same array reference used by tests
    /** @type {Task[]} */
    // @ts-ignore - accessing our custom namespace
    const tasks = window.fortudo.tasks;

    // TEMP: initialize with any predefined tasks if needed
    /*
    if (tasks.length === 0) {
        tasks.push({
            description: "journal",
            startTime: "09:30",
            endTime: "10:00",
            duration: 30,
            status: "incomplete",
            editing: false,
            confirmingDelete: false
        },
        {
            description: "PRAY",
            startTime: "10:30",
            endTime: "10:45",
            duration: 15,
            status: "incomplete",
            editing: false,
            confirmingDelete: false
        });
    }
    */

    ///** @type {{start: string, end: string}} */
    // let availableHours = { start: '09:00', end: '17:00' };

    /** @type {boolean} */
    let firstIncompleteTaskFound = false;

    /**
     * Calculate total minutes from a 24-hour time string
     * @param {string} time24Hour - Time in 24-hour format (HH:MM)
     * @returns {number} - Total minutes
     */
    function calculateMinutes(time24Hour) {
        const [hours, minutes] = time24Hour.split(':').map(Number);
        return hours * 60 + minutes;
    }

    /**
     * Format minutes as hours and minutes string
     * @param {number} minutes - Total minutes
     * @returns {string} - Formatted time string
     */
    function calculateHoursAndMinutes(minutes) {
        let timeStr = '';

        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            timeStr += `${hours}h `;
        }

        const remMinutes = minutes % 60;
        if (remMinutes > 0) {
            timeStr += `${remMinutes}m`;
        } else if (timeStr === '') {
            timeStr = '0m'; // handle case where minutes is 0
        }

        return timeStr.trim();
    }

    /**
     * Convert minutes to 24-hour time format
     * @param {number} minutes - Total minutes
     * @returns {string} - Time in 24-hour format (HH:MM)
     */
    function calculate24HourTimeFromMinutes(minutes) {
        // mod handles cases where minutes is beyond a day
        const h = Math.floor(minutes / 60) % 24;
        const m = minutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    function convertTo24HourTime(time12Hour) {
        let hours = parseInt(time12Hour.split(':')[0]);
        let minutes = time12Hour.split(':')[1].split(' ')[0];
        let ampm = time12Hour.split(' ')[1];

        if (ampm.toUpperCase() === 'PM' && hours < 12) {
            hours += 12;
        }

        if (ampm.toUpperCase() === 'AM' && hours === 12) {
            hours = 0;
        }

        return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }

    function convertTo12HourTime(time24Hour) {
        let hours = parseInt(time24Hour.split(':')[0]);
        let minutes = time24Hour.split(':')[1];
        let ampm = 'AM';

        if (hours >= 12) {
            ampm = 'PM';
            hours -= 12;
        }

        if (hours === 0) {
            hours = 12;
        }

        return `${hours}:${minutes} ${ampm}`;
    }

    /**
     * Calculate the end time of a task
     * @param {string} startTime - Start time in 24-hour format (HH:MM)
     * @param {number} duration - Duration in minutes
     * @returns {string} - End time in 24-hour format (HH:MM)
     */
    function calculateEndTime(startTime, duration) {
        const endMinutes = calculateMinutes(startTime) + duration;
        return calculate24HourTimeFromMinutes(endMinutes);
    }

    /**
     * Auto-reschedule tasks to avoid overlap
     *
     * Handles task conflicts by moving overlapping tasks later in time.
     * When a new or updated task overlaps with existing tasks, this function:
     * 1. Identifies all overlapping tasks
     * 2. Moves each overlapping task to start after the new task ends
     * 3. Recursively checks if the moved task now overlaps with other tasks
     * 4. Optionally asks for user confirmation before rescheduling
     *
     * The function creates a cascading effect where each affected task
     * may trigger further rescheduling of subsequent tasks.
     *
     * Returns a boolean indicating whether the rescheduling was successful or canceled by the user.
     *
     * @param {Task} newTask - The new task to add or update
     * @param {string} trigger - The trigger for the reschedule (e.g., "Adding" or "Updating")
     * @param {boolean} askToConfirm - Whether to ask for confirmation
     * @returns {boolean} - Whether the reschedule was successful
     */
    function autoReschedule(newTask, trigger = 'Adding', askToConfirm = false) {
        // TODO: should probably allow for tasks that cannot be rescheduled (e.g., a meeting) and handle conflict resolution gracefully
        let rescheduleOK = true;

        // get overlapping tasks, excluding those being edited or completed
        const overlappingTasks = tasks.filter(task =>
            task !== newTask &&
            !task.editing &&
            task.status !== 'completed' &&
            tasksOverlap(newTask, task)
        );

        if (overlappingTasks.length > 0 && askToConfirm) {
            if (!window.confirm(`${trigger} this task will cause overlap in your schedule. Do you want to continue with auto-rescheduling?`)) {
                rescheduleOK = false;
                return rescheduleOK;
            }
        }

        // sort by start time to maintain their relative order
        overlappingTasks.sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));

        // schedule each overlapping task to start after the previous one
        let nextStartTime = newTask.endTime;
        for (const task of overlappingTasks) {
            task.startTime = nextStartTime;
            task.endTime = calculateEndTime(task.startTime, task.duration);
            nextStartTime = task.endTime;

            // recursively reschedule any tasks affected by this change
            task.editing = true;
            autoReschedule(task, trigger, false);
            task.editing = false;
        }

        return rescheduleOK;
    }

    /**
     * Check if a task form is valid
     * @param {HTMLFormElement} form - The form to validate
     * @param {number} duration - Task duration in minutes
     * @returns {boolean} - Whether form is valid
     */
    function isValidTaskForm(form, duration) {
        if (!form.checkValidity()) {
            return false;
        }

        // add an alert if attempt to create a task with zero duration
        if (duration <= 0) {
            alert("Please enter a valid duration for your task.");
            return false;
        }

        return true;
    }

    /**
     * Check if two tasks overlap in time
     * @param {Task} task1 - First task
     * @param {Task} task2 - Second task
     * @returns {boolean} - Whether tasks overlap
     */
    function tasksOverlap(task1, task2) {
        // Convert times to minutes past midnight
        const start1 = calculateMinutes(task1.startTime);
        const end1 = calculateMinutes(task1.endTime);
        const start2 = calculateMinutes(task2.startTime);
        const end2 = calculateMinutes(task2.endTime);

        // Check if tasks cross midnight
        const task1CrossesMidnight = end1 < start1;
        const task2CrossesMidnight = end2 < start2;

        // Handle midnight crossing by normalizing the time ranges

        if (task1CrossesMidnight && !task2CrossesMidnight) {
            // Task1 crosses midnight, task2 doesn't
            // Overlap occurs if either:
            // 1. Task2 starts before task1 ends on the next day (start2 < end1)
            // 2. Task2 starts after or at the same time task1 starts on the first day (start2 >= start1)
            return start2 < end1 || start2 >= start1;
        }

        if (!task1CrossesMidnight && task2CrossesMidnight) {
            // Task2 crosses midnight, task1 doesn't
            // Overlap occurs if either:
            // 1. Task1 starts before task2 ends on the next day (start1 < end2)
            // 2. Task1 starts after or at the same time task2 starts on the first day (start1 >= start2)
            return start1 < end2 || start1 >= start2;
        }

        if (task1CrossesMidnight && task2CrossesMidnight) {
            // Both tasks cross midnight
            // They must at least overlap at the midnight point (00:00)
            return true;
        }

        // Neither task crosses midnight - standard interval overlap check
        return start1 < end2 && start2 < end1;
    }

    /**
     * Get the suggested start time for a new task
     * Uses the end time of the latest task if any exist,
     * otherwise uses the current time
     * @returns {string} - Suggested start time in 24-hour format (HH:MM)
     */
    function getSuggestedStartTime() {
        if (tasks.length === 0) {
            // No tasks, use current time rounded up to closest 5 minutes
            const now = new Date();
            const minutes = Math.ceil(now.getMinutes() / 5) * 5;
            now.setMinutes(minutes, 0, 0);
            // Get current time in HH:MM format
            return now.toTimeString().substring(0, 5);
        }

        // Find task with latest end time
        // Sort by end time in descending order
        const sortedTasks = [...tasks].sort((a, b) => {
            const endA = calculateMinutes(a.endTime);
            const endB = calculateMinutes(b.endTime);
            return endB - endA; // descending order
        });

        // Return the end time of the latest task
        return sortedTasks[0].endTime;
    }

    /**
     * Update the start time input field with a suggested time
     */
    function updateStartTimeField() {
        if (!taskForm) return;

        const startTimeInput = /** @type {HTMLInputElement|null} */(taskForm.querySelector('input[name="start-time"]'));
        if (startTimeInput) {
            startTimeInput.value = getSuggestedStartTime();
        }
    }

    /**
     * Add a new task
     * @param {Task} task - The task to add
     */
    function addTask(task) {
        // check if task overlaps with any existing tasks and reschedule if it does
        const okToContinue = autoReschedule(task, 'Adding', true);
        if (!okToContinue) {
            return;
        }

        tasks.push(task);
        // sort tasks by start time to maintain correct order
        tasks.sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));

        renderTasks();
        // renderFreeTime();
        updateLocalStorage();
    }

    /**
     * Update an existing task
     * @param {number} index - Task index
     * @param {Task} task - Updated task data
     */
    function updateTask(index, task) {
        // check if task overlaps with any existing tasks and reschedule if it does
        const okToContinue = autoReschedule(task, 'Updating', true);
        if (!okToContinue) {
            return;
        }

        tasks[index] = { ...task, editing: false };
        // sort tasks by start time to maintain correct order
        tasks.sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));

        renderTasks();
        updateLocalStorage();
    }

    /**
     * Mark a task as completed
     * @param {number} index - Task index
     */
    function completeTask(index) {
        const task = tasks[index];
        task.status = "completed";

        /** @type {HTMLElement|null} */
        const currentTimeElement = document.getElementById('current-time');
        if (!currentTimeElement || !currentTimeElement.textContent) {
            console.error('Current time element or its text content is missing. Task completion time tracking will not work.');
            return;
        }

        const currentTime = convertTo24HourTime(currentTimeElement.textContent);
        if (task.endTime < currentTime && window.confirm(`Task completed! 🎉💪🏾 Do you want to update your schedule to show you finished at ${convertTo12HourTime(currentTime)}? This helps keep your timeline accurate.`)) {
            task.endTime = currentTime;
            task.duration = calculateMinutes(task.endTime) - calculateMinutes(task.startTime);

            task.editing = true;
            autoReschedule(task);
            task.editing = false;
        }

        renderTasks();
        updateLocalStorage();
    }

    function deleteTask(index, confirmed = false) {
        if (confirmed) {
            tasks.splice(index, 1);
            renderTasks();
            updateLocalStorage();
        }
        else {
            tasks[index].confirmingDelete = true;
            renderTasks();
        }
    }

    function editTask(index) {
        tasks[index].editing = true;
        renderTasks();
    }

    function cancelEdit(index) {
        tasks[index].editing = false;
        renderTasks();
    }

    function deleteAllTasks() {
        if (tasks.length > 0 && window.confirm("Are you sure you want to delete all tasks?")) {
            // @ts-ignore - accessing our custom namespace
            window.fortudo.tasks = [];
            renderTasks();
            updateLocalStorage();
        }
    }

    function updateLocalStorage() {
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    /**
     * Render current date and time
     */
    function renderDateTime() {
        const now = new Date();
        /** @type {HTMLElement|null} */
        const timeElement = document.getElementById('current-time');
        /** @type {HTMLElement|null} */
        const dateElement = document.getElementById('current-date');

        if (timeElement) {
            timeElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            console.error('Time element not found. Time rendering will not work.');
        }

        if (dateElement) {
            dateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        } else {
            console.error('Date element not found. Date rendering will not work.');
        }

        // Update the start time if it's based on current time (no tasks exist)
        if (tasks.length === 0 && taskForm) {
            updateStartTimeField();
        }
    }

    // function renderAvailableHours() {
    //     availableHoursStartInput.value = availableHours.start;
    //     availableHoursEndInput.value = availableHours.end;
    // }

    // function renderFreeTime() {
    //     const totalMinutes = tasks.reduce((acc, task) => acc + task.duration, 0);
    //     const availableMinutes = calculateMinutes(availableHours.end) - calculateMinutes(availableHours.start);
    //     const freeMinutes = availableMinutes - totalMinutes;
    //     freeTimeDisplay.textContent = `Free Time: ${Math.floor(freeMinutes / 60)} hours ${freeMinutes % 60} minutes`;
    // }

    /**
     * Generate HTML for task edit form
     * @param {Task} task - The task to edit
     * @param {number} index - Task index
     * @returns {string} - HTML for edit form
     */
    function renderEditTask(task, index) {
        return `<form id="edit-task-${index}" autocomplete="off" class="mb-4 p-4 rounded border border-gray-700 bg-gray-800 mx-2 text-left space-y-4">
            <div class="mb-4">
                <input type="text" name="description" value="${task.description}" class="bg-gray-700 p-2 rounded w-full" required>
            </div>
            <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-4">
                <label class="flex items-center w-full sm:w-auto">
                    <span class="text-gray-400">Start Time</span>
                    <input type="time" name="start-time" value="${task.startTime}" class="bg-gray-700 p-2 rounded w-full lg:w-[10rem]" required>
                </label>
                <label class="flex items-center w-full sm:w-auto">
                    <span class="mr-2 text-gray-400">Duration</span>
                    <div class="flex space-x-2 w-full sm:w-auto">
                        <input type="number" name="duration-hours" value="${Math.floor(task.duration / 60)}" min="0" class="bg-gray-700 p-2 rounded w-full lg:w-[4rem]">
                        <input type="number" name="duration-minutes" value="${task.duration % 60}" min="0" max="59" class="bg-gray-700 p-2 rounded w-full lg:w-[4rem]">
                    </div>
                </label>
                <div class="flex space-x-2">
                    <button type="submit" class="bg-green-500 hover:bg-green-400 px-4 py-2 rounded w-full sm:w-auto font-semibold">Edit</button>
                    <button type="button" class="bg-red-500 hover:bg-red-400 px-4 py-2 rounded w-full sm:w-auto font-semibold btn-edit-cancel" data-task-index="${index}">Cancel</button>
                </div>
            </div>
        </form>`;
    }

    function renderViewTask(task, index) {
        const isDisabled = firstIncompleteTaskFound || task.status === 'completed';
        if (!firstIncompleteTaskFound && task.status !== 'completed') firstIncompleteTaskFound = true;

        return `<div id="view-task-${index}" class="flex items-center justify-between space-x-2 p-2 border-b">
            <div class="flex items-center space-x-4">
                <label for="task-${index}" class="checkbox" ${isDisabled ? 'disabled' : firstIncompleteTaskFound = true }>
                    <i class="far ${task.status === 'completed' ? 'fa-check-square text-green-700' : 'fa-square text-gray-500'} cursor-pointer"></i>
                </label>
                <div class="${task.status === 'completed' ? 'line-through' : ''} ${isDisabled ? 'opacity-60' : '' }">
                    <div class="${isDisabled ? '' : 'text-green-500'}">${task.description}</div>
                    <div class="${isDisabled ? '' : 'text-green-500'}">${convertTo12HourTime(task.startTime)} &ndash; ${convertTo12HourTime(task.endTime)} (${calculateHoursAndMinutes(task.duration)})</div>
                </div>
            </div>
            <div>
                <button class="${task.status === 'completed' ? 'text-gray-500' : 'text-yellow-500'} btn-edit p-1" ${task.status === 'completed' ? 'disabled' : ''} data-task-index="${index}">
                    <i class="far fa-pen"></i>
                </button>
                <button class="${task.confirmingDelete ? 'text-red-500' : task.status === 'completed' ? 'text-gray-500' : 'text-red-500'} btn-delete p-1" ${task.status === 'completed' ? 'disabled' : ''} data-task-index="${index}">
                    <i class="far ${task.confirmingDelete ? 'fa-check-circle' : 'fa-trash-can'}"></i>
                </button>
            </div>
        </div>`;
    }

    /**
     * Render all tasks in the task list
     */
    function renderTasks() {
        firstIncompleteTaskFound = false;
        if (!taskList) {
            console.error('Task list element not found. Tasks will not be rendered on the page.');
            return;
        }
        taskList.innerHTML = tasks.map((task, index) => {
            if(task.editing) {
                return renderEditTask(task, index);
            } else {
                return renderViewTask(task, index);
            }
        }).join('');

        document.querySelectorAll('.checkbox').forEach((checkbox, index) => {
            if (checkbox.getAttribute('disabled') !== null) return;
            checkbox.addEventListener('click', () => {
                completeTask(index);
            });
        });

        document.querySelectorAll('.btn-edit').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                if (!event.target) {
                    console.error('Edit button click event has no target. Task editing functionality will not work.');
                    return;
                }

                const target = /** @type {HTMLElement} */(event.target);
                /** @type {HTMLButtonElement|null} */
                const parentButton = target.closest ? target.closest('button') : null;
                if (!parentButton || !parentButton.dataset || !parentButton.dataset.taskIndex) {
                    console.error('Edit button parent element or task index not found. Task editing functionality will not work.');
                    return;
                }

                const taskIndex = parseInt(parentButton.dataset.taskIndex);
                editTask(taskIndex);

                // add event listener to edit form submit
                const editTaskForm = /** @type {HTMLFormElement|null} */(document.getElementById(`edit-task-${taskIndex}`));
                if (!editTaskForm) {
                    console.error('Edit task form not found for task index ' + taskIndex + '. Task editing functionality will not work.');
                    return;
                }

                editTaskForm.addEventListener('submit', (event) => {
                    event.preventDefault();

                    if (!event.target) {
                        console.error('Edit task form submission event has no target. Task update functionality will not work.');
                        return;
                    }

                    const target = /** @type {HTMLElement} */(event.target);
                    /** @type {HTMLFormElement|null} */
                    const parentForm = target.closest ? target.closest('form') : null;
                    if (!parentForm) {
                        console.error('Edit task form parent element not found. Task update functionality will not work.');
                        return;
                    }

                    const formData = new FormData(parentForm);
                    const description = /** @type {string} */(formData.get('description') || '');
                    const startTime = /** @type {string} */(formData.get('start-time') || '');
                    const durationHours = formData.get('duration-hours') || '0';
                    const durationMinutes = formData.get('duration-minutes') || '0';
                    const duration = calculateMinutes(`${durationHours}:${durationMinutes}`);

                    const isValid = isValidTaskForm(parentForm, duration);
                    if(!isValid) {
                        return;
                    }

                    // extract the task index from the form ID to ensure we're updating the correct task
                    const formId = parentForm.id;
                    const index = parseInt(formId.replace('edit-task-', ''));

                    /** @type {Task} */
                    const task = {
                        description: description,
                        startTime: startTime,
                        endTime: calculateEndTime(startTime, duration),
                        duration: duration,
                        status: tasks[index].status,
                        editing: false,
                        confirmingDelete: false
                    };
                    updateTask(index, task);
                });
            });
        });

        document.querySelectorAll('.btn-edit-cancel').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                if (!event.target) {
                    console.error('Edit cancel button click event has no target. Cancel edit functionality will not work.');
                    return;
                }

                const target = /** @type {HTMLElement} */(event.target);
                if (!target.dataset || !target.dataset.taskIndex) {
                    console.error('Edit cancel button is missing task index data attribute. Cancel edit functionality will not work for this task.');
                    return;
                }

                const taskIndex = parseInt(target.dataset.taskIndex);
                cancelEdit(taskIndex);
            });
        });

        document.querySelectorAll('.btn-delete').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                if (!event.target) {
                    console.error('Delete button click event has no target. Delete task functionality will not work.');
                    return;
                }

                const target = /** @type {HTMLElement} */(event.target);
                /** @type {HTMLButtonElement|null} */
                const parentButton = target.closest ? target.closest('button') : null;
                if (!parentButton || !parentButton.dataset || !parentButton.dataset.taskIndex) {
                    console.error('Delete button is missing task index or parent button could not be found. Delete task functionality will not work for this task.');
                    return;
                }

                const taskIndex = parseInt(parentButton.dataset.taskIndex);
                const isConfirming = tasks[taskIndex].confirmingDelete;
                deleteTask(taskIndex, isConfirming);
            });
        });
    }

    // =======================
    // GLOBAL EVENT LISTENERS
    // =======================

    // add click event listener to the whole document
    // to handle (most?) out-clicks for delete confirmations
    document.addEventListener('click', (event) => {
        if (!event.target) {
            console.error('Click event has no target. Task delete confirmation reset and edit cancellation functionality will not work.');
            return;
        }

        const target = /** @type {HTMLElement} */(event.target);
        /** @type {HTMLButtonElement|null} */
        let parentButton = target.closest ? target.closest('button') : null;
        if (!parentButton || !parentButton.classList.contains('btn-delete')) {
            let deleteWasReset = false;
            tasks.forEach((task) => {
                if (task.confirmingDelete) {
                    deleteWasReset = true;
                }
                task.confirmingDelete = false;
            });
            if (deleteWasReset) {
                renderTasks();
            }
        }

        /** @type {HTMLFormElement|null} */
        let parentForm = target.closest ? target.closest('form') : null;
        if ((!parentForm || !parentForm.id.includes('edit-task-')) && (!parentButton || (!parentButton.classList.contains('btn-edit')))) {
            let editWasReset = false;
            tasks.forEach((task) => {
                if (task.editing) {
                    editWasReset = true;
                }
                task.editing = false;
            });
            if (editWasReset) {
                renderTasks();
            }
        }
    });

    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(taskForm);
        const description = /** @type {string} */(formData.get('description') || '');
        const startTime = /** @type {string} */(formData.get('start-time') || '');
        const durationHours = formData.get('duration-hours') || '0';
        const durationMinutes = formData.get('duration-minutes') || '0';
        const duration = calculateMinutes(`${durationHours}:${durationMinutes}`);

        const isValid = isValidTaskForm(taskForm, duration);
        if(!isValid) {
            return;
        }

        /** @type {Task} */
        const task = {
            description: description,
            startTime: startTime,
            endTime: calculateEndTime(startTime, duration),
            duration: duration,
            status: "incomplete",
            editing: false,
            confirmingDelete: false,
        };
        addTask(task);
        taskForm.reset();

        // After adding a task and resetting the form, update the start time field
        updateStartTimeField();

        // Focus on the description input field to start a new task entry
        const descriptionInput = /** @type {HTMLInputElement|null} */(taskForm.querySelector('input[name="description"]'));
        if (descriptionInput) {
            descriptionInput.focus();
        }
    });

    // Add focus event to the form to update start time when user clicks in the form
    taskForm.addEventListener('focusin', () => {
        // Only update if start time is empty
        const startTimeInput = /** @type {HTMLInputElement|null} */(taskForm.querySelector('input[name="start-time"]'));
        if (startTimeInput && !startTimeInput.value) {
            updateStartTimeField();
        }
    });

    const deleteAllButton = /** @type {HTMLButtonElement|null} */(document.getElementById('delete-all'));
    if (deleteAllButton) {
        deleteAllButton.addEventListener('click', deleteAllTasks);
    }

    // availableHoursStartInput.addEventListener('input', (event) => {
    //     availableHours.start = event.target.value;
    //     renderFreeTime();
    // });

    // availableHoursEndInput.addEventListener('input', (event) => {
    //     availableHours.end = event.target.value;
    //     renderFreeTime();
    // });

    // =======================
    // EXPOSE FUNCTIONS FOR TESTING
    // =======================

    // @ts-ignore - updating the custom testing namespace on window
    window.fortudo = {
        // state
        tasks: tasks,

        // utility functions
        calculateMinutes: calculateMinutes,
        calculateHoursAndMinutes: calculateHoursAndMinutes,
        calculate24HourTimeFromMinutes: calculate24HourTimeFromMinutes,
        convertTo24HourTime: convertTo24HourTime,
        convertTo12HourTime: convertTo12HourTime,
        calculateEndTime: calculateEndTime,
        getSuggestedStartTime: getSuggestedStartTime,
        updateStartTimeField: updateStartTimeField,

        // task management functions
        tasksOverlap: tasksOverlap,
        isValidTaskForm: isValidTaskForm,
        autoReschedule: autoReschedule,
        addTask: addTask,
        updateTask: updateTask,
        completeTask: completeTask,
        deleteTask: deleteTask,
        editTask: editTask,
        cancelEdit: cancelEdit,
        deleteAllTasks: deleteAllTasks,
        updateLocalStorage: updateLocalStorage,
        renderDateTime: renderDateTime,
        renderTasks: renderTasks,
    };

    // =======================
    // RUN APP
    // =======================

    renderDateTime();
    // renderAvailableHours();
    const tasksString = localStorage.getItem('tasks');
    /** @type {Task[]|null} */
    const storedTasks = tasksString ? JSON.parse(tasksString) : null;
    if (storedTasks && storedTasks.length > 0) {
        // @ts-ignore - accessing our custom namespace
        window.fortudo.tasks = storedTasks;
    }
    renderTasks();
    // renderFreeTime();

    // Initialize the start time field when the page loads
    updateStartTimeField();

    // Set focus on the description input field when the page loads
    const descriptionInput = /** @type {HTMLInputElement|null} */(taskForm.querySelector('input[name="description"]'));
    if (descriptionInput) {
        descriptionInput.focus();
    }

    setInterval(renderDateTime, 1000);
});
