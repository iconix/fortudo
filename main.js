// Begin the main function as an async function to handle the possible animations or any tasks that are running synchronously
(async function () {
    /* The main app */
    const app = document.querySelector('#app');

    /* The task input field */
    const taskInput = document.querySelector('#task-input');

    /* The create task button */
    const createTaskButton = document.querySelector('#create-task');

    /* Start time input field */
    const startTimeInput = document.querySelector('#start-time-input');

    /* End time input field */
    const endTimeInput = document.querySelector('#end-time-input');

    /* An class to manage tasks */
    class TaskManager {
        constructor() {
            this.tasks = [
                // TEMP: hardcoded tasks for quick start on reload
                {
                    description: "journal",
                    startTime: "09:00",
                    endTime: "10:30",
                },
                {
                    description: "pray",
                    startTime: "11:00",
                    endTime: "12:00",
                },
            ];
            this.sortTasks();
        }

        // Method to add a new task
        addTask(description, startTime, endTime) {
            this.tasks.push({ description, startTime, endTime });
            this.sortTasks();
        }

        sortTasks() {
            // Sort this.tasks array by `startTime`
            this.tasks.sort((a, b) => {
                // Convert time strings to Date objects for comparison
                const aStart = new Date(`1970/01/01 ${a.startTime}`);
                const bStart = new Date(`1970/01/01 ${b.startTime}`);
                return aStart - bStart;
            });
        }
    }
    let tm = new TaskManager();

    function createSchedule() {
        const scheduleArea = document.querySelector("#schedule-area");
        let timeBlocks = document.createElement("div");
        timeBlocks.className = "time-blocks";
        scheduleArea.appendChild(timeBlocks);
    }

    /* Time validation function */
    function validateTime(start, end) {
        if(!start || !end) return false;
        const timeFormat = /^\d{2}:\d{2}$/; // Checks for "HH:MM" format
        if(!start.match(timeFormat) || !end.match(timeFormat)) return false;
        const startDate = new Date(`1970-01-01T${start}Z`);
        const endDate = new Date(`1970-01-01T${end}Z`);
        return startDate < endDate; // Checks if end time is after start time
    }

    /* A function to get the existing tasks */
    function loadTasks() {
        // clear app
        app.innerHTML = '';

        tm.tasks.forEach((t, i) => {
            let task = createTask(t.description, t.startTime, t.endTime, i);
            // append the new task to the app
            app.appendChild(task);
        });
    }

    function createTask(taskDescription, taskStartTime, taskEndTime, index) {
        // create a new task
        let task = document.createElement('div');
        task.classList.add('task');

        const taskTextContent = `${taskDescription} (${taskStartTime} - ${taskEndTime})`;

        // create a new checkbox and append it to task
        let checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.disabled = index != 0;
        checkbox.addEventListener('change', toggleCompleteEvent);
        task.appendChild(checkbox);

        // create a new task text node and append it to task
        let taskText = document.createTextNode(taskTextContent);
        task.appendChild(taskText);

        return task;
    }

    /* The function to create a new task */
    function createTaskEvent(e) {
        if (e.key === 'Enter' || e.type === 'click') {  // if key pressed is 'Enter' or button is clicked
            // if there is a task in the input field and valid time inputs
            if (taskInput.value && validateTime(startTimeInput.value, endTimeInput.value)) {
                const taskDescription = taskInput.value;
                const taskStartTime = startTimeInput.value;
                const taskEndTime = endTimeInput.value;

                let task = createTask(taskDescription, taskStartTime, taskEndTime);

                // reset the input field
                taskInput.value = "";

                // reset the additional input fields
                startTimeInput.value = "";
                endTimeInput.value = "";

                // save the task
                tm.addTask(taskDescription, taskStartTime, taskEndTime);

                // reload tasks
                loadTasks();
            } else {
                alert('Please enter a task and valid time values.');
            }
        }
    }

    /* Checkbox complete/uncomplete task handler*/
    function toggleCompleteEvent(e) {
        if (e.target.checked) {
            e.target.parentNode.classList.add('taskChecked');
        } else {
            e.target.parentNode.classList.remove('taskChecked');
        }
    }

    /* Add event listener to create task button */
    createTaskButton.addEventListener('click', createTaskEvent);

    /* Add event listener to task input field */
    taskInput.addEventListener('keydown', createTaskEvent);

    /* Add event listener to time input fields */
    startTimeInput.addEventListener('keydown', createTaskEvent);
    endTimeInput.addEventListener('keydown', createTaskEvent);

    /* Loads existing tasks and creates the schedule when the page loads */
    window.addEventListener('DOMContentLoaded', () => {
        loadTasks();
        // createSchedule();
    });

    /* logic for all your other functions like real-time tracking, prompts for reallocation based on completed tasks, and locking tasks goes here */
})();
