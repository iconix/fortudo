/**
 * @jest-environment jsdom
 */

import {
    populateUnscheduledTaskInlineEditForm,
    getUnscheduledTaskInlineFormData,
    toggleUnscheduledTaskInlineEdit,
    extractTaskFormData,
    getTaskFormElement,
    focusTaskDescriptionInput,
    computeEndTimePreview,
    setupEndTimeHint,
    computeOverlapPreview,
    setupOverlapWarning,
    formatOverlapWarning
} from '../public/js/form-utils.js';
import { showAlert } from '../public/js/modal-manager.js';
import { createTaskWithDateTime } from './test-utils.js';

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

        test('returns null and shows alert when unscheduled est duration is invalid', () => {
            const form = createUnscheduledTaskForm('Backlog task', 'medium', '-1', '0');
            const result = extractTaskFormData(form);

            expect(result).toBeNull();
            expect(showAlert).toHaveBeenCalledWith(
                expect.stringContaining('valid numbers'),
                'indigo'
            );
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

    describe('computeEndTimePreview', () => {
        test('returns formatted 12-hour end time for valid inputs', () => {
            const result = computeEndTimePreview('14:00', '1', '30');
            expect(result).toBe('3:30 PM');
        });

        test('returns correct time for morning hours', () => {
            const result = computeEndTimePreview('09:00', '2', '15');
            expect(result).toBe('11:15 AM');
        });

        test('returns correct time crossing noon', () => {
            const result = computeEndTimePreview('11:00', '2', '0');
            expect(result).toBe('1:00 PM');
        });

        test('returns correct time crossing midnight', () => {
            const result = computeEndTimePreview('23:00', '2', '0');
            expect(result).toBe('1:00 AM');
        });

        test('returns null when start time is empty', () => {
            expect(computeEndTimePreview('', '1', '30')).toBeNull();
        });

        test('returns null when hours and minutes are both empty', () => {
            expect(computeEndTimePreview('14:00', '', '')).toBeNull();
        });

        test('returns correct time when only hours provided', () => {
            const result = computeEndTimePreview('10:00', '2', '');
            expect(result).toBe('12:00 PM');
        });

        test('returns correct time when only minutes provided', () => {
            const result = computeEndTimePreview('10:00', '', '45');
            expect(result).toBe('10:45 AM');
        });

        test('returns null when duration is zero', () => {
            expect(computeEndTimePreview('10:00', '0', '0')).toBeNull();
        });

        test('returns null for invalid start time format', () => {
            expect(computeEndTimePreview('invalid', '1', '0')).toBeNull();
        });

        test('handles duration of exactly 12 hours', () => {
            const result = computeEndTimePreview('06:00', '12', '0');
            expect(result).toBe('6:00 PM');
        });
    });

    describe('setupEndTimeHint', () => {
        let startTimeInput, hoursInput, minutesInput, hintElement;

        beforeEach(() => {
            document.body.innerHTML = `
                <input type="time" id="start" value="" />
                <input type="number" id="hours" value="" />
                <input type="number" id="minutes" value="" />
                <span id="hint" class="opacity-0"></span>
            `;
            startTimeInput = document.getElementById('start');
            hoursInput = document.getElementById('hours');
            minutesInput = document.getElementById('minutes');
            hintElement = document.getElementById('hint');
        });

        test('updates hint text and opacity when all inputs are valid', () => {
            setupEndTimeHint(startTimeInput, hoursInput, minutesInput, hintElement);

            startTimeInput.value = '14:00';
            hoursInput.value = '1';
            minutesInput.value = '30';
            startTimeInput.dispatchEvent(new Event('input'));

            expect(hintElement.textContent).toContain('3:30 PM');
            expect(hintElement.classList.contains('opacity-0')).toBe(false);
        });

        test('clears hint and sets opacity-0 when inputs are invalid', () => {
            setupEndTimeHint(startTimeInput, hoursInput, minutesInput, hintElement);

            // First set valid values
            startTimeInput.value = '14:00';
            hoursInput.value = '1';
            minutesInput.value = '0';
            startTimeInput.dispatchEvent(new Event('input'));
            expect(hintElement.classList.contains('opacity-0')).toBe(false);

            // Then clear start time
            startTimeInput.value = '';
            startTimeInput.dispatchEvent(new Event('input'));
            expect(hintElement.textContent).toBe('');
            expect(hintElement.classList.contains('opacity-0')).toBe(true);
        });

        test('responds to hours input change', () => {
            setupEndTimeHint(startTimeInput, hoursInput, minutesInput, hintElement);

            startTimeInput.value = '10:00';
            hoursInput.value = '3';
            hoursInput.dispatchEvent(new Event('input'));

            expect(hintElement.textContent).toContain('1:00 PM');
        });

        test('responds to minutes input change', () => {
            setupEndTimeHint(startTimeInput, hoursInput, minutesInput, hintElement);

            startTimeInput.value = '10:00';
            minutesInput.value = '30';
            minutesInput.dispatchEvent(new Event('input'));

            expect(hintElement.textContent).toContain('10:30 AM');
        });

        test('includes arrow in hint text', () => {
            setupEndTimeHint(startTimeInput, hoursInput, minutesInput, hintElement);

            startTimeInput.value = '10:00';
            hoursInput.value = '1';
            startTimeInput.dispatchEvent(new Event('input'));

            expect(hintElement.textContent).toMatch(/▸/);
        });
    });

    describe('computeOverlapPreview', () => {
        const today = new Date().toISOString().split('T')[0];

        function makeTasks(...specs) {
            return specs.map(([desc, startTime, duration], i) =>
                createTaskWithDateTime({
                    description: desc,
                    startTime,
                    duration,
                    id: `task-${i + 1}`,
                    date: today
                })
            );
        }

        test('returns null when start time is empty', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            expect(computeOverlapPreview('', '1', '0', tasks)).toBeNull();
        });

        test('returns null when duration is zero', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            expect(computeOverlapPreview('10:00', '0', '0', tasks)).toBeNull();
        });

        test('returns null when hours and minutes are both empty strings', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            expect(computeOverlapPreview('10:00', '', '', tasks)).toBeNull();
        });

        test('returns null when start time is invalid format', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            expect(computeOverlapPreview('invalid', '1', '0', tasks)).toBeNull();
        });

        test('returns empty overlaps when no tasks overlap', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            const result = computeOverlapPreview('11:00', '1', '0', tasks);
            expect(result).toEqual({ overlaps: [] });
        });

        test('returns overlap info when task overlaps', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            const result = computeOverlapPreview('10:30', '1', '0', tasks);
            expect(result.overlaps).toHaveLength(1);
            expect(result.overlaps[0].description).toBe('Meeting');
            expect(result.overlaps[0].timeRange).toMatch(/10:00\s*AM.*11:00\s*AM/);
        });

        test('returns multiple overlaps', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60], ['Lunch', '11:00', 60]);
            const result = computeOverlapPreview('10:30', '1', '30', tasks);
            expect(result.overlaps).toHaveLength(2);
            expect(result.overlaps[0].description).toBe('Meeting');
            expect(result.overlaps[1].description).toBe('Lunch');
        });

        test('excludes task matching excludeTaskId', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60], ['Lunch', '10:30', 60]);
            const result = computeOverlapPreview('10:00', '2', '0', tasks, 'task-1');
            expect(result.overlaps).toHaveLength(1);
            expect(result.overlaps[0].description).toBe('Lunch');
        });

        test('handles empty task array', () => {
            const result = computeOverlapPreview('10:00', '1', '0', []);
            expect(result).toEqual({ overlaps: [] });
        });

        test('excludes completed tasks from overlaps', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            tasks[0].status = 'completed';
            const result = computeOverlapPreview('10:00', '1', '0', tasks);
            expect(result).toEqual({ overlaps: [] });
        });

        test('handles minutes-only duration', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            const result = computeOverlapPreview('10:30', '0', '30', tasks);
            expect(result.overlaps).toHaveLength(1);
        });

        test('returns null when hours is negative (invalid duration)', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            expect(computeOverlapPreview('10:00', '-1', '0', tasks)).toBeNull();
        });
    });

    describe('formatOverlapWarning', () => {
        test('formats single overlap', () => {
            const overlaps = [{ description: 'Meeting', timeRange: '10:00 AM \u2013 11:00 AM' }];
            const result = formatOverlapWarning(overlaps);
            expect(result).toContain('Meeting');
            expect(result).toContain('10:00 AM');
        });

        test('formats two overlaps', () => {
            const overlaps = [
                { description: 'Meeting', timeRange: '10:00 AM \u2013 11:00 AM' },
                { description: 'Lunch', timeRange: '11:00 AM \u2013 12:00 PM' }
            ];
            const result = formatOverlapWarning(overlaps);
            expect(result).toContain('Meeting');
            expect(result).toContain('1 other task');
        });

        test('formats three or more overlaps', () => {
            const overlaps = [
                { description: 'Meeting', timeRange: '10:00 AM \u2013 11:00 AM' },
                { description: 'Lunch', timeRange: '11:00 AM \u2013 12:00 PM' },
                { description: 'Review', timeRange: '12:00 PM \u2013 1:00 PM' }
            ];
            const result = formatOverlapWarning(overlaps);
            expect(result).toContain('Meeting');
            expect(result).toContain('2 other tasks');
        });

        test('returns empty string for no overlaps', () => {
            expect(formatOverlapWarning([])).toBe('');
        });
    });

    describe('setupOverlapWarning', () => {
        let startTimeInput, hoursInput, minutesInput, warningElement, buttonElement;

        const defaultButtonHTML = '<i class="fa-regular fa-plus mr-2"></i>Add Task';
        const defaultButtonClasses =
            'bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300';
        const overlapButtonHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i>Reschedule';
        const overlapButtonClasses =
            'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300';

        const today = new Date().toISOString().split('T')[0];

        function makeTasks(...specs) {
            return specs.map(([desc, startTime, duration], i) =>
                createTaskWithDateTime({
                    description: desc,
                    startTime,
                    duration,
                    id: `task-${i + 1}`,
                    date: today
                })
            );
        }

        beforeEach(() => {
            document.body.innerHTML = `
                <input type="time" id="start-time" />
                <input type="number" id="hours" value="1" />
                <input type="number" id="minutes" value="0" />
                <span id="overlap-warning"></span>
                <button id="submit-btn" class="${defaultButtonClasses}">${defaultButtonHTML}</button>
            `;
            startTimeInput = document.getElementById('start-time');
            hoursInput = document.getElementById('hours');
            minutesInput = document.getElementById('minutes');
            warningElement = document.getElementById('overlap-warning');
            buttonElement = document.getElementById('submit-btn');
        });

        test('shows warning text when overlap detected on input change', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            setupOverlapWarning(
                startTimeInput,
                hoursInput,
                minutesInput,
                warningElement,
                buttonElement,
                () => tasks,
                { defaultButtonHTML, defaultButtonClasses, overlapButtonHTML, overlapButtonClasses }
            );

            startTimeInput.value = '10:30';
            startTimeInput.dispatchEvent(new Event('input'));

            expect(warningElement.textContent).toContain('Meeting');
        });

        test('hides warning when overlap clears', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            setupOverlapWarning(
                startTimeInput,
                hoursInput,
                minutesInput,
                warningElement,
                buttonElement,
                () => tasks,
                { defaultButtonHTML, defaultButtonClasses, overlapButtonHTML, overlapButtonClasses }
            );

            startTimeInput.value = '10:30';
            startTimeInput.dispatchEvent(new Event('input'));
            expect(warningElement.textContent).toContain('Meeting');

            startTimeInput.value = '11:00';
            startTimeInput.dispatchEvent(new Event('input'));
            expect(warningElement.textContent).toBe('');
        });

        test('changes button classes when overlap detected', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            setupOverlapWarning(
                startTimeInput,
                hoursInput,
                minutesInput,
                warningElement,
                buttonElement,
                () => tasks,
                { defaultButtonHTML, defaultButtonClasses, overlapButtonHTML, overlapButtonClasses }
            );

            startTimeInput.value = '10:30';
            startTimeInput.dispatchEvent(new Event('input'));

            expect(buttonElement.textContent).toContain('Reschedule');
            expect(buttonElement.className).toContain('from-amber-500');
        });

        test('restores button when overlap clears', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60]);
            setupOverlapWarning(
                startTimeInput,
                hoursInput,
                minutesInput,
                warningElement,
                buttonElement,
                () => tasks,
                { defaultButtonHTML, defaultButtonClasses, overlapButtonHTML, overlapButtonClasses }
            );

            startTimeInput.value = '10:30';
            startTimeInput.dispatchEvent(new Event('input'));

            startTimeInput.value = '11:00';
            startTimeInput.dispatchEvent(new Event('input'));

            expect(buttonElement.innerHTML).toContain('Add Task');
            expect(buttonElement.className).toContain('from-teal-500');
        });

        test('responds to hours input change', () => {
            const tasks = makeTasks(['Meeting', '11:00', 60]);
            setupOverlapWarning(
                startTimeInput,
                hoursInput,
                minutesInput,
                warningElement,
                buttonElement,
                () => tasks,
                { defaultButtonHTML, defaultButtonClasses, overlapButtonHTML, overlapButtonClasses }
            );

            startTimeInput.value = '10:00';
            startTimeInput.dispatchEvent(new Event('input'));
            expect(warningElement.textContent).toBe('');

            hoursInput.value = '2';
            hoursInput.dispatchEvent(new Event('input'));
            expect(warningElement.textContent).toContain('Meeting');
        });

        test('responds to minutes input change', () => {
            const tasks = makeTasks(['Meeting', '10:30', 30]);
            setupOverlapWarning(
                startTimeInput,
                hoursInput,
                minutesInput,
                warningElement,
                buttonElement,
                () => tasks,
                { defaultButtonHTML, defaultButtonClasses, overlapButtonHTML, overlapButtonClasses }
            );

            startTimeInput.value = '10:00';
            hoursInput.value = '0';
            minutesInput.value = '15';
            minutesInput.dispatchEvent(new Event('input'));
            expect(warningElement.textContent).toBe('');

            minutesInput.value = '45';
            minutesInput.dispatchEvent(new Event('input'));
            expect(warningElement.textContent).toContain('Meeting');
        });

        test('works with excludeTaskId option', () => {
            const tasks = makeTasks(['Meeting', '10:00', 60], ['Lunch', '10:30', 30]);
            setupOverlapWarning(
                startTimeInput,
                hoursInput,
                minutesInput,
                warningElement,
                buttonElement,
                () => tasks,
                {
                    excludeTaskId: 'task-1',
                    defaultButtonHTML,
                    defaultButtonClasses,
                    overlapButtonHTML,
                    overlapButtonClasses
                }
            );

            startTimeInput.value = '10:00';
            startTimeInput.dispatchEvent(new Event('input'));

            expect(warningElement.textContent).toContain('Lunch');
            expect(warningElement.textContent).not.toContain('Meeting');
        });

        test('no warning when no overlap exists', () => {
            const tasks = makeTasks(['Meeting', '14:00', 60]);
            setupOverlapWarning(
                startTimeInput,
                hoursInput,
                minutesInput,
                warningElement,
                buttonElement,
                () => tasks,
                { defaultButtonHTML, defaultButtonClasses, overlapButtonHTML, overlapButtonClasses }
            );

            startTimeInput.value = '10:00';
            startTimeInput.dispatchEvent(new Event('input'));

            expect(warningElement.textContent).toBe('');
            expect(buttonElement.innerHTML).toContain('Add Task');
        });
    });
});
