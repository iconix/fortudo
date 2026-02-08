/**
 * @jest-environment jsdom
 */

import {
    populateUnscheduledTaskInlineEditForm,
    getUnscheduledTaskInlineFormData,
    toggleUnscheduledTaskInlineEdit,
    extractTaskFormData,
    getTaskFormElement,
    focusTaskDescriptionInput
} from '../public/js/form-utils.js';
import { showAlert } from '../public/js/modal-manager.js';

// Mock showAlert
jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn()
}));

describe('Form Utils Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('getTaskFormElement', () => {
        test('returns task form when it exists', () => {
            document.body.innerHTML = '<form id="task-form"></form>';
            const form = getTaskFormElement();
            expect(form).toBeInstanceOf(HTMLFormElement);
            expect(form?.id).toBe('task-form');
        });

        test('returns null when task form does not exist', () => {
            document.body.innerHTML = '<div>No form here</div>';
            const form = getTaskFormElement();
            expect(form).toBeNull();
        });
    });

    describe('focusTaskDescriptionInput', () => {
        test('focuses description input when form exists', () => {
            document.body.innerHTML = `
                <form id="task-form">
                    <input type="text" name="description" />
                </form>
            `;
            const input = document.querySelector('input[name="description"]');
            const focusSpy = jest.spyOn(input, 'focus');

            focusTaskDescriptionInput();

            expect(focusSpy).toHaveBeenCalled();
        });

        test('does not throw when form does not exist', () => {
            document.body.innerHTML = '<div>No form</div>';
            expect(() => focusTaskDescriptionInput()).not.toThrow();
        });

        test('does not throw when description input does not exist', () => {
            document.body.innerHTML = '<form id="task-form"></form>';
            expect(() => focusTaskDescriptionInput()).not.toThrow();
        });
    });

    describe('extractTaskFormData', () => {
        function createScheduledTaskForm(description, startTime, durationHours, durationMinutes) {
            document.body.innerHTML = `
                <form id="task-form">
                    <input type="text" name="description" value="${description}" />
                    <input type="radio" name="task-type" value="scheduled" checked />
                    <input type="radio" name="task-type" value="unscheduled" />
                    <input type="time" name="start-time" value="${startTime}" />
                    <input type="number" name="duration-hours" value="${durationHours}" />
                    <input type="number" name="duration-minutes" value="${durationMinutes}" />
                </form>
            `;
            return document.getElementById('task-form');
        }

        function createUnscheduledTaskForm(description, priority, estHours, estMinutes) {
            document.body.innerHTML = `
                <form id="task-form">
                    <input type="text" name="description" value="${description}" />
                    <input type="radio" name="task-type" value="scheduled" />
                    <input type="radio" name="task-type" value="unscheduled" checked />
                    <select name="priority">
                        <option value="high" ${priority === 'high' ? 'selected' : ''}>High</option>
                        <option value="medium" ${priority === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="low" ${priority === 'low' ? 'selected' : ''}>Low</option>
                    </select>
                    <input type="number" name="est-duration-hours" value="${estHours}" />
                    <input type="number" name="est-duration-minutes" value="${estMinutes}" />
                </form>
            `;
            return document.getElementById('task-form');
        }

        test('extracts scheduled task data correctly', () => {
            const form = createScheduledTaskForm('Test task', '10:30', '1', '30');
            const result = extractTaskFormData(form);

            expect(result).toEqual({
                description: 'Test task',
                taskType: 'scheduled',
                startTime: '10:30',
                duration: 90
            });
        });

        test('extracts unscheduled task data correctly', () => {
            const form = createUnscheduledTaskForm('Backlog task', 'high', '2', '15');
            const result = extractTaskFormData(form);

            expect(result).toEqual({
                description: 'Backlog task',
                taskType: 'unscheduled',
                priority: 'high',
                estDuration: 135
            });
        });

        test('returns null and shows alert when description is empty', () => {
            const form = createScheduledTaskForm('', '10:30', '1', '0');
            const result = extractTaskFormData(form);

            expect(result).toBeNull();
            expect(showAlert).toHaveBeenCalledWith('Task description cannot be empty.', 'teal');
        });

        test('returns null and shows alert when start time is missing for scheduled task', () => {
            const form = createScheduledTaskForm('Test task', '', '1', '0');
            const result = extractTaskFormData(form);

            expect(result).toBeNull();
            expect(showAlert).toHaveBeenCalledWith(
                'Start time is required for scheduled tasks.',
                'teal'
            );
        });

        test('returns null and shows alert when duration is zero for scheduled task', () => {
            const form = createScheduledTaskForm('Test task', '10:30', '0', '0');
            const result = extractTaskFormData(form);

            expect(result).toBeNull();
            expect(showAlert).toHaveBeenCalledWith('Duration must be greater than 0.', 'teal');
        });

        test('returns null and shows alert when duration has invalid values', () => {
            const form = createScheduledTaskForm('Test task', '10:30', '-1', '0');
            const result = extractTaskFormData(form);

            expect(result).toBeNull();
            expect(showAlert).toHaveBeenCalledWith(
                'Please enter valid numbers for duration (HH >= 0, 0 <= MM <= 59).',
                'teal'
            );
        });

        test('allows zero estimated duration for unscheduled tasks', () => {
            const form = createUnscheduledTaskForm('Backlog task', 'medium', '0', '0');
            const result = extractTaskFormData(form);

            expect(result).toEqual({
                description: 'Backlog task',
                taskType: 'unscheduled',
                priority: 'medium',
                estDuration: null
            });
        });

        test('handles invalid task type', () => {
            document.body.innerHTML = `
                <form id="task-form">
                    <input type="text" name="description" value="Test" />
                    <input type="radio" name="task-type" value="invalid" checked />
                </form>
            `;
            const form = document.getElementById('task-form');
            const result = extractTaskFormData(form);

            expect(result).toBeNull();
            expect(showAlert).toHaveBeenCalledWith('Invalid task type selected.', 'indigo');
        });

        test('trims description whitespace', () => {
            const form = createScheduledTaskForm('  Test task  ', '10:30', '1', '0');
            const result = extractTaskFormData(form);

            expect(result.description).toBe('Test task');
        });

        test('defaults priority to medium when not selected', () => {
            document.body.innerHTML = `
                <form id="task-form">
                    <input type="text" name="description" value="Test" />
                    <input type="radio" name="task-type" value="unscheduled" checked />
                    <input type="number" name="est-duration-hours" value="1" />
                    <input type="number" name="est-duration-minutes" value="0" />
                </form>
            `;
            const form = document.getElementById('task-form');
            const result = extractTaskFormData(form);

            expect(result.priority).toBe('medium');
        });
    });

    describe('Unscheduled Task Inline Edit Functions', () => {
        function createUnscheduledTaskCard(taskId, description, priority, _estDuration) {
            const checkedHigh = priority === 'high' ? 'checked' : '';
            const checkedMed = priority === 'medium' ? 'checked' : '';
            const checkedLow = priority === 'low' ? 'checked' : '';

            document.body.innerHTML = `
                <div class="task-card" data-task-id="${taskId}">
                    <div class="task-display-view">
                        <span>${description}</span>
                    </div>
                    <div class="inline-edit-unscheduled-form hidden">
                        <form>
                            <input type="text" name="inline-edit-description" value="" />
                            <input type="number" name="inline-edit-est-duration-hours" value="" />
                            <input type="number" name="inline-edit-est-duration-minutes" value="" />
                            <input type="radio" name="inline-edit-priority" value="high" ${checkedHigh} />
                            <input type="radio" name="inline-edit-priority" value="medium" ${checkedMed} />
                            <input type="radio" name="inline-edit-priority" value="low" ${checkedLow} />
                        </form>
                    </div>
                </div>
            `;
        }

        describe('populateUnscheduledTaskInlineEditForm', () => {
            test('populates form with task data', () => {
                createUnscheduledTaskCard('task-1', 'Original', 'medium', 60);

                populateUnscheduledTaskInlineEditForm('task-1', {
                    description: 'Updated task',
                    priority: 'high',
                    estDuration: 90
                });

                const card = document.querySelector('.task-card');
                const descInput = card.querySelector('input[name="inline-edit-description"]');
                const hoursInput = card.querySelector(
                    'input[name="inline-edit-est-duration-hours"]'
                );
                const minutesInput = card.querySelector(
                    'input[name="inline-edit-est-duration-minutes"]'
                );
                const highRadio = card.querySelector('input[value="high"]');

                expect(descInput.value).toBe('Updated task');
                expect(hoursInput.value).toBe('1');
                expect(minutesInput.value).toBe('30');
                expect(highRadio.checked).toBe(true);
            });

            test('handles zero hours correctly', () => {
                createUnscheduledTaskCard('task-1', 'Original', 'medium', 30);

                populateUnscheduledTaskInlineEditForm('task-1', {
                    description: 'Short task',
                    priority: 'low',
                    estDuration: 30
                });

                const hoursInput = document.querySelector(
                    'input[name="inline-edit-est-duration-hours"]'
                );
                const minutesInput = document.querySelector(
                    'input[name="inline-edit-est-duration-minutes"]'
                );

                expect(hoursInput.value).toBe('0');
                expect(minutesInput.value).toBe('30');
            });

            test('does not throw when task card not found', () => {
                createUnscheduledTaskCard('task-1', 'Original', 'medium', 60);
                expect(() => {
                    populateUnscheduledTaskInlineEditForm('nonexistent', { description: 'test' });
                }).not.toThrow();
            });

            test('does not throw when form not found in card', () => {
                document.body.innerHTML = '<div class="task-card" data-task-id="task-1"></div>';
                expect(() => {
                    populateUnscheduledTaskInlineEditForm('task-1', { description: 'test' });
                }).not.toThrow();
            });
        });

        describe('getUnscheduledTaskInlineFormData', () => {
            test('extracts valid form data', () => {
                createUnscheduledTaskCard('task-1', 'Original', 'medium', 60);

                const descInput = document.querySelector('input[name="inline-edit-description"]');
                const hoursInput = document.querySelector(
                    'input[name="inline-edit-est-duration-hours"]'
                );
                const minutesInput = document.querySelector(
                    'input[name="inline-edit-est-duration-minutes"]'
                );
                const highRadio = document.querySelector('input[value="high"]');

                descInput.value = 'Updated description';
                hoursInput.value = '2';
                minutesInput.value = '30';
                highRadio.checked = true;

                const result = getUnscheduledTaskInlineFormData('task-1');

                expect(result).toEqual({
                    description: 'Updated description',
                    priority: 'high',
                    estDuration: 150
                });
            });

            test('returns null and shows alert when description is empty', () => {
                createUnscheduledTaskCard('task-1', 'Original', 'medium', 60);

                const descInput = document.querySelector('input[name="inline-edit-description"]');
                descInput.value = '   ';

                const result = getUnscheduledTaskInlineFormData('task-1');

                expect(result).toBeNull();
                expect(showAlert).toHaveBeenCalledWith(
                    'Task description cannot be empty.',
                    'indigo'
                );
            });

            test('returns null and shows alert for invalid duration', () => {
                createUnscheduledTaskCard('task-1', 'Original', 'medium', 60);

                const descInput = document.querySelector('input[name="inline-edit-description"]');
                const minutesInput = document.querySelector(
                    'input[name="inline-edit-est-duration-minutes"]'
                );
                descInput.value = 'Test';
                minutesInput.value = '70'; // Invalid: > 59

                const result = getUnscheduledTaskInlineFormData('task-1');

                expect(result).toBeNull();
                expect(showAlert).toHaveBeenCalled();
            });

            test('allows zero duration', () => {
                createUnscheduledTaskCard('task-1', 'Original', 'medium', 0);

                const descInput = document.querySelector('input[name="inline-edit-description"]');
                const hoursInput = document.querySelector(
                    'input[name="inline-edit-est-duration-hours"]'
                );
                const minutesInput = document.querySelector(
                    'input[name="inline-edit-est-duration-minutes"]'
                );

                descInput.value = 'No estimate';
                hoursInput.value = '0';
                minutesInput.value = '0';

                const result = getUnscheduledTaskInlineFormData('task-1');

                expect(result).toEqual({
                    description: 'No estimate',
                    priority: 'medium',
                    estDuration: 0
                });
            });

            test('returns null when task card not found', () => {
                createUnscheduledTaskCard('task-1', 'Original', 'medium', 60);
                const result = getUnscheduledTaskInlineFormData('nonexistent');
                expect(result).toBeNull();
            });

            test('returns null when form not found', () => {
                document.body.innerHTML = '<div class="task-card" data-task-id="task-1"></div>';
                const result = getUnscheduledTaskInlineFormData('task-1');
                expect(result).toBeNull();
            });

            test('defaults priority to medium when none selected', () => {
                createUnscheduledTaskCard('task-1', 'Original', 'medium', 60);

                // Uncheck all priority radios
                const radios = document.querySelectorAll('input[name="inline-edit-priority"]');
                radios.forEach((r) => (r.checked = false));

                const descInput = document.querySelector('input[name="inline-edit-description"]');
                descInput.value = 'Test';

                const result = getUnscheduledTaskInlineFormData('task-1');

                expect(result.priority).toBe('medium');
            });
        });

        describe('toggleUnscheduledTaskInlineEdit', () => {
            test('shows edit form and hides display view when showEditForm is true', () => {
                createUnscheduledTaskCard('task-1', 'Test', 'medium', 60);

                toggleUnscheduledTaskInlineEdit('task-1', true);

                const viewPart = document.querySelector('.task-display-view');
                const editPart = document.querySelector('.inline-edit-unscheduled-form');

                expect(viewPart.classList.contains('hidden')).toBe(true);
                expect(editPart.classList.contains('hidden')).toBe(false);
            });

            test('hides edit form and shows display view when showEditForm is false', () => {
                createUnscheduledTaskCard('task-1', 'Test', 'medium', 60);

                // First show the form
                toggleUnscheduledTaskInlineEdit('task-1', true);
                // Then hide it
                toggleUnscheduledTaskInlineEdit('task-1', false);

                const viewPart = document.querySelector('.task-display-view');
                const editPart = document.querySelector('.inline-edit-unscheduled-form');

                expect(viewPart.classList.contains('hidden')).toBe(false);
                expect(editPart.classList.contains('hidden')).toBe(true);
            });

            test('populates form with taskData when provided', () => {
                createUnscheduledTaskCard('task-1', 'Original', 'medium', 60);

                toggleUnscheduledTaskInlineEdit('task-1', true, {
                    description: 'New description',
                    priority: 'high',
                    estDuration: 120
                });

                const descInput = document.querySelector('input[name="inline-edit-description"]');
                expect(descInput.value).toBe('New description');
            });

            test('focuses description input when showing edit form', () => {
                createUnscheduledTaskCard('task-1', 'Test', 'medium', 60);

                const descInput = document.querySelector('input[name="inline-edit-description"]');
                const focusSpy = jest.spyOn(descInput, 'focus');

                toggleUnscheduledTaskInlineEdit('task-1', true, {
                    description: 'Test',
                    priority: 'medium',
                    estDuration: 60
                });

                expect(focusSpy).toHaveBeenCalled();
            });

            test('does not throw when task card not found', () => {
                createUnscheduledTaskCard('task-1', 'Test', 'medium', 60);
                expect(() => {
                    toggleUnscheduledTaskInlineEdit('nonexistent', true);
                }).not.toThrow();
            });

            test('does not throw when view or edit parts not found', () => {
                document.body.innerHTML = '<div class="task-card" data-task-id="task-1"></div>';
                expect(() => {
                    toggleUnscheduledTaskInlineEdit('task-1', true);
                }).not.toThrow();
            });
        });
    });
});
