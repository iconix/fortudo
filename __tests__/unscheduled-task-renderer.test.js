/**
 * @jest-environment jsdom
 */

import {
    getUnscheduledTaskListElement,
    getPriorityClasses,
    renderUnscheduledTasks
} from '../public/js/unscheduled-task-renderer.js';

describe('Unscheduled Task Renderer Tests', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="unscheduled-task-list"></div>
        `;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('getUnscheduledTaskListElement', () => {
        test('returns the unscheduled task list element when it exists', () => {
            const element = getUnscheduledTaskListElement();
            expect(element).toBeInstanceOf(HTMLElement);
            expect(element?.id).toBe('unscheduled-task-list');
        });

        test('returns null when element does not exist', () => {
            document.body.innerHTML = '';
            const element = getUnscheduledTaskListElement();
            expect(element).toBeNull();
        });
    });

    describe('getPriorityClasses', () => {
        test('returns high priority classes', () => {
            const classes = getPriorityClasses('high');
            expect(classes.border).toBe('border-rose-400');
            expect(classes.bg).toBe('bg-rose-400 bg-opacity-20');
            expect(classes.text).toBe('text-rose-300');
            expect(classes.icon).toBe('fa-arrow-up');
            expect(classes.focusRing).toBe('rose-400');
        });

        test('returns medium priority classes', () => {
            const classes = getPriorityClasses('medium');
            expect(classes.border).toBe('border-indigo-400');
            expect(classes.bg).toBe('bg-indigo-400 bg-opacity-20');
            expect(classes.text).toBe('text-indigo-300');
            expect(classes.icon).toBe('fa-equals');
            expect(classes.focusRing).toBe('indigo-300');
        });

        test('returns low priority classes', () => {
            const classes = getPriorityClasses('low');
            expect(classes.border).toBe('border-pink-400');
            expect(classes.bg).toBe('bg-pink-400 bg-opacity-20');
            expect(classes.text).toBe('text-pink-300');
            expect(classes.icon).toBe('fa-arrow-down');
            expect(classes.focusRing).toBe('pink-400');
        });

        test('defaults to medium for unknown priority', () => {
            const classes = getPriorityClasses('unknown');
            expect(classes.border).toBe('border-indigo-400');
        });

        test('includes checkbox class', () => {
            const classes = getPriorityClasses('high');
            expect(classes.checkbox).toBe('text-teal-700');
        });
    });

    describe('renderUnscheduledTasks', () => {
        let mockEventCallbacks;
        let mockSetGlobalCallbacks;

        beforeEach(() => {
            mockEventCallbacks = {
                onCompleteTask: jest.fn(),
                onEditTask: jest.fn(),
                onDeleteTask: jest.fn()
            };
            mockSetGlobalCallbacks = jest.fn();
        });

        test('renders empty state message when no tasks', () => {
            renderUnscheduledTasks([], mockEventCallbacks, mockSetGlobalCallbacks);

            const list = getUnscheduledTaskListElement();
            expect(list.innerHTML).toContain('No unscheduled tasks yet');
            expect(mockSetGlobalCallbacks).toHaveBeenCalledWith(mockEventCallbacks);
        });

        test('renders a single task correctly', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Test task',
                    priority: 'high',
                    estDuration: 90,
                    status: 'incomplete',
                    type: 'unscheduled'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const list = getUnscheduledTaskListElement();
            expect(list.children.length).toBe(1);

            const taskCard = list.querySelector('[data-task-id="task-1"]');
            expect(taskCard).not.toBeNull();
            expect(taskCard.textContent).toContain('Test task');
            expect(taskCard.textContent).toContain('High Priority');
            expect(taskCard.textContent).toContain('1h 30m');
        });

        test('renders multiple tasks', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Task 1',
                    priority: 'high',
                    estDuration: 60,
                    status: 'incomplete'
                },
                {
                    id: 'task-2',
                    description: 'Task 2',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'incomplete'
                },
                {
                    id: 'task-3',
                    description: 'Task 3',
                    priority: 'low',
                    estDuration: 15,
                    status: 'completed'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const list = getUnscheduledTaskListElement();
            expect(list.children.length).toBe(3);
        });

        test('renders completed task with strikethrough', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Completed task',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'completed'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const taskCard = document.querySelector('[data-task-id="task-1"]');
            expect(taskCard.innerHTML).toContain('line-through');
            expect(taskCard.innerHTML).toContain('fa-check-square');
        });

        test('renders incomplete task without strikethrough', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Incomplete task',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'incomplete'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const taskCard = document.querySelector('[data-task-id="task-1"]');
            expect(taskCard.innerHTML).toContain('fa-square');
            expect(taskCard.querySelector('.line-through')).toBeNull();
        });

        test('renders task with confirming delete state', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Task to delete',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'incomplete',
                    confirmingDelete: true
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const taskCard = document.querySelector('[data-task-id="task-1"]');
            expect(taskCard.innerHTML).toContain('fa-check-circle');
            expect(taskCard.innerHTML).toContain('text-rose-400');
        });

        test('includes schedule button for tasks', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Task to schedule',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'incomplete'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const scheduleBtn = document.querySelector('.btn-schedule-task');
            expect(scheduleBtn).not.toBeNull();
            expect(scheduleBtn.dataset.taskId).toBe('task-1');
        });

        test('disables schedule button for completed tasks', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Completed task',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'completed'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const scheduleBtn = document.querySelector('.btn-schedule-task');
            expect(scheduleBtn.hasAttribute('disabled')).toBe(true);
        });

        test('includes edit and delete buttons', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Task',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'incomplete'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const editBtn = document.querySelector('.btn-edit-unscheduled');
            const deleteBtn = document.querySelector('.btn-delete-unscheduled');

            expect(editBtn).not.toBeNull();
            expect(deleteBtn).not.toBeNull();
            expect(editBtn.dataset.taskId).toBe('task-1');
            expect(deleteBtn.dataset.taskId).toBe('task-1');
        });

        test('sets data attributes on task card', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Test task',
                    priority: 'high',
                    estDuration: 90,
                    status: 'incomplete'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const taskCard = document.querySelector('[data-task-id="task-1"]');
            expect(taskCard.dataset.taskName).toBe('Test task');
            expect(taskCard.dataset.taskEstDuration).toBe('1h 30m');
        });

        test('includes inline edit form (hidden by default)', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Task',
                    priority: 'medium',
                    estDuration: 60,
                    status: 'incomplete'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const editForm = document.querySelector('.inline-edit-unscheduled-form');
            expect(editForm).not.toBeNull();
            expect(editForm.classList.contains('hidden')).toBe(true);
        });

        test('shows inline edit form for task with isEditingInline', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Editing task',
                    priority: 'high',
                    estDuration: 60,
                    status: 'incomplete',
                    isEditingInline: true
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const viewPart = document.querySelector('.task-display-view');
            const editForm = document.querySelector('.inline-edit-unscheduled-form');

            expect(viewPart.classList.contains('hidden')).toBe(true);
            expect(editForm.classList.contains('hidden')).toBe(false);
        });

        test('does not throw when list element not found', () => {
            document.body.innerHTML = '';
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Task',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'incomplete'
                }
            ];

            expect(() => {
                renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);
            }).not.toThrow();
        });

        test('inline edit form has correct priority radio buttons', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Task',
                    priority: 'high',
                    estDuration: 60,
                    status: 'incomplete'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const highRadio = document.querySelector(
                'input[name="inline-edit-priority"][value="high"]'
            );
            const medRadio = document.querySelector(
                'input[name="inline-edit-priority"][value="medium"]'
            );
            const lowRadio = document.querySelector(
                'input[name="inline-edit-priority"][value="low"]'
            );

            expect(highRadio).not.toBeNull();
            expect(medRadio).not.toBeNull();
            expect(lowRadio).not.toBeNull();
            expect(highRadio.checked).toBe(true);
        });

        test('renders duration in hours and minutes format', () => {
            const tasks = [
                {
                    id: 'task-1',
                    description: 'Task 1',
                    priority: 'medium',
                    estDuration: 90,
                    status: 'incomplete'
                },
                {
                    id: 'task-2',
                    description: 'Task 2',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'incomplete'
                },
                {
                    id: 'task-3',
                    description: 'Task 3',
                    priority: 'medium',
                    estDuration: 120,
                    status: 'incomplete'
                }
            ];

            renderUnscheduledTasks(tasks, mockEventCallbacks, mockSetGlobalCallbacks);

            const task1 = document.querySelector('[data-task-id="task-1"]');
            const task2 = document.querySelector('[data-task-id="task-2"]');
            const task3 = document.querySelector('[data-task-id="task-3"]');

            expect(task1.textContent).toContain('1h 30m');
            expect(task2.textContent).toContain('30m');
            expect(task3.textContent).toContain('2h');
        });
    });
});
