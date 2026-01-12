/**
 * @jest-environment jsdom
 */

// We need to set up DOM before importing modal-manager since it caches elements on load

describe('Modal Manager Tests', () => {
    let showAlert, askConfirmation, showCustomAlert, showCustomConfirm;
    let hideCustomAlert, hideCustomConfirm, hideScheduleModal, showScheduleModal;
    let initializeModalEventListeners;
    let alertSpy, confirmSpy;

    beforeEach(() => {
        // Set up modal DOM structure before importing
        document.body.innerHTML = `
            <!-- Custom Alert Modal -->
            <div id="custom-alert-modal" class="hidden">
                <h2 id="custom-alert-title"></h2>
                <p id="custom-alert-message"></p>
                <button id="close-custom-alert-modal">X</button>
                <button id="ok-custom-alert-modal">OK</button>
            </div>

            <!-- Custom Confirm Modal -->
            <div id="custom-confirm-modal" class="hidden">
                <h2 id="custom-confirm-title"></h2>
                <p id="custom-confirm-message"></p>
                <button id="ok-custom-confirm-modal">OK</button>
                <button id="cancel-custom-confirm-modal">Cancel</button>
                <button id="close-custom-confirm-modal">X</button>
            </div>

            <!-- Schedule Modal -->
            <div id="schedule-modal" class="hidden">
                <span id="schedule-modal-task-name"></span>
                <span id="schedule-modal-duration"></span>
                <button id="close-schedule-modal">X</button>
                <button id="cancel-schedule-modal">Cancel</button>
                <form id="schedule-modal-form">
                    <input type="time" name="modal-start-time" />
                    <input type="number" name="modal-duration-hours" />
                    <input type="number" name="modal-duration-minutes" />
                </form>
            </div>
        `;

        // Clear module cache and re-import to pick up new DOM
        jest.resetModules();

        alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
        document.body.innerHTML = '';
    });

    describe('without DOM elements (fallback behavior)', () => {
        beforeEach(async () => {
            // Clear DOM before importing
            document.body.innerHTML = '';
            jest.resetModules();

            const module = await import('../public/js/modal-manager.js');
            showAlert = module.showAlert;
            askConfirmation = module.askConfirmation;
            showCustomAlert = module.showCustomAlert;
            showCustomConfirm = module.showCustomConfirm;
            hideCustomAlert = module.hideCustomAlert;
            hideCustomConfirm = module.hideCustomConfirm;
            hideScheduleModal = module.hideScheduleModal;
            showScheduleModal = module.showScheduleModal;
        });

        test('showAlert falls back to window.alert when modal not found', () => {
            showAlert('Test message');
            expect(alertSpy).toHaveBeenCalledWith('Alert: Test message');
        });

        test('showCustomAlert falls back to window.alert when modal not found', () => {
            showCustomAlert('Title', 'Message');
            expect(alertSpy).toHaveBeenCalledWith('Title: Message');
        });

        test('askConfirmation falls back to window.confirm when modal not found', async () => {
            const result = await askConfirmation('Test confirmation');
            expect(confirmSpy).toHaveBeenCalledWith('Confirmation: Test confirmation');
            expect(result).toBe(true);
        });

        test('hideCustomAlert does not throw when modal not found', () => {
            expect(() => hideCustomAlert()).not.toThrow();
        });

        test('hideCustomConfirm does not throw when modal not found', () => {
            expect(() => hideCustomConfirm()).not.toThrow();
        });

        test('hideScheduleModal does not throw when modal not found', () => {
            expect(() => hideScheduleModal()).not.toThrow();
        });

        test('showScheduleModal returns early when form not found', () => {
            expect(() => showScheduleModal('Task', '1h', 'id-1', '10:00')).not.toThrow();
        });
    });

    describe('with DOM elements', () => {
        beforeEach(async () => {
            jest.resetModules();
            const module = await import('../public/js/modal-manager.js');
            showAlert = module.showAlert;
            askConfirmation = module.askConfirmation;
            showCustomAlert = module.showCustomAlert;
            showCustomConfirm = module.showCustomConfirm;
            hideCustomAlert = module.hideCustomAlert;
            hideCustomConfirm = module.hideCustomConfirm;
            hideScheduleModal = module.hideScheduleModal;
            showScheduleModal = module.showScheduleModal;
            initializeModalEventListeners = module.initializeModalEventListeners;
        });

        describe('Custom Alert Modal', () => {
            test('showCustomAlert shows modal with title and message', () => {
                showCustomAlert('Test Title', 'Test Message');

                const modal = document.getElementById('custom-alert-modal');
                const title = document.getElementById('custom-alert-title');
                const message = document.getElementById('custom-alert-message');

                expect(modal.classList.contains('hidden')).toBe(false);
                expect(title.textContent).toBe('Test Title');
                expect(message.textContent).toBe('Test Message');
            });

            test('hideCustomAlert hides the modal', () => {
                showCustomAlert('Title', 'Message');
                hideCustomAlert();

                const modal = document.getElementById('custom-alert-modal');
                expect(modal.classList.contains('hidden')).toBe(true);
            });

            test('showAlert uses "Alert" as default title', () => {
                showAlert('Test message');

                const title = document.getElementById('custom-alert-title');
                const message = document.getElementById('custom-alert-message');

                expect(title.textContent).toBe('Alert');
                expect(message.textContent).toBe('Test message');
            });

            test('clicking OK button closes alert', () => {
                showCustomAlert('Title', 'Message');

                const okBtn = document.getElementById('ok-custom-alert-modal');
                okBtn.click();

                const modal = document.getElementById('custom-alert-modal');
                expect(modal.classList.contains('hidden')).toBe(true);
            });

            test('clicking close button closes alert', () => {
                showCustomAlert('Title', 'Message');

                const closeBtn = document.getElementById('close-custom-alert-modal');
                closeBtn.click();

                const modal = document.getElementById('custom-alert-modal');
                expect(modal.classList.contains('hidden')).toBe(true);
            });

            test('showCustomAlert applies indigo theme by default', () => {
                showCustomAlert('Title', 'Message');

                const title = document.getElementById('custom-alert-title');
                expect(title.className).toContain('text-indigo-400');
            });

            test('showCustomAlert applies teal theme when specified', () => {
                showCustomAlert('Title', 'Message', 'teal');

                const title = document.getElementById('custom-alert-title');
                expect(title.className).toContain('text-teal-400');
            });
        });

        describe('Custom Confirm Modal', () => {
            test('showCustomConfirm shows modal and returns promise', async () => {
                const resultPromise = showCustomConfirm('Confirm Title', 'Confirm Message');

                const modal = document.getElementById('custom-confirm-modal');
                expect(modal.classList.contains('hidden')).toBe(false);

                // Click OK to resolve
                const okBtn = document.getElementById('ok-custom-confirm-modal');
                okBtn.click();

                const result = await resultPromise;
                expect(result).toBe(true);
            });

            test('showCustomConfirm resolves false when cancel clicked', async () => {
                const resultPromise = showCustomConfirm('Confirm', 'Message');

                const cancelBtn = document.getElementById('cancel-custom-confirm-modal');
                cancelBtn.click();

                const result = await resultPromise;
                expect(result).toBe(false);
            });

            test('showCustomConfirm resolves false when close clicked', async () => {
                const resultPromise = showCustomConfirm('Confirm', 'Message');

                const closeBtn = document.getElementById('close-custom-confirm-modal');
                closeBtn.click();

                const result = await resultPromise;
                expect(result).toBe(false);
            });

            test('showCustomConfirm uses custom button labels', async () => {
                showCustomConfirm('Title', 'Message', { ok: 'Yes', cancel: 'No' });

                const okBtn = document.getElementById('ok-custom-confirm-modal');
                const cancelBtn = document.getElementById('cancel-custom-confirm-modal');

                expect(okBtn.textContent).toBe('Yes');
                expect(cancelBtn.textContent).toBe('No');

                okBtn.click();
            });

            test('askConfirmation uses "Confirmation" as title', async () => {
                askConfirmation('Are you sure?');

                const title = document.getElementById('custom-confirm-title');
                expect(title.textContent).toBe('Confirmation');

                const okBtn = document.getElementById('ok-custom-confirm-modal');
                okBtn.click();
            });
        });

        describe('Schedule Modal', () => {
            test('showScheduleModal shows modal with task info', () => {
                // Mock getTaskState to return a task with estDuration
                jest.doMock('../public/js/task-manager.js', () => ({
                    getTaskState: () => [{ id: 'task-1', estDuration: 90 }]
                }));

                showScheduleModal('My Task', '1h 30m', 'task-1', '10:30');

                const modal = document.getElementById('schedule-modal');
                const taskName = document.getElementById('schedule-modal-task-name');
                const duration = document.getElementById('schedule-modal-duration');

                expect(modal.classList.contains('hidden')).toBe(false);
                expect(taskName.textContent).toBe('My Task');
                expect(duration.textContent).toBe('1h 30m');
            });

            test('showScheduleModal sets start time input', () => {
                showScheduleModal('Task', '30m', 'task-1', '14:00');

                const startTimeInput = document.querySelector('input[name="modal-start-time"]');
                expect(startTimeInput.value).toBe('14:00');
            });

            test('hideScheduleModal hides the modal', () => {
                showScheduleModal('Task', '30m', 'task-1', '10:00');
                hideScheduleModal();

                const modal = document.getElementById('schedule-modal');
                expect(modal.classList.contains('hidden')).toBe(true);
            });

            test('clicking close button hides schedule modal', () => {
                showScheduleModal('Task', '30m', 'task-1', '10:00');

                const closeBtn = document.getElementById('close-schedule-modal');
                closeBtn.click();

                const modal = document.getElementById('schedule-modal');
                expect(modal.classList.contains('hidden')).toBe(true);
            });

            test('clicking cancel button hides schedule modal', () => {
                showScheduleModal('Task', '30m', 'task-1', '10:00');

                const cancelBtn = document.getElementById('cancel-schedule-modal');
                cancelBtn.click();

                const modal = document.getElementById('schedule-modal');
                expect(modal.classList.contains('hidden')).toBe(true);
            });
        });

        describe('initializeModalEventListeners', () => {
            test('form submit calls callback with task data', () => {
                const mockCallbacks = {
                    onConfirmScheduleTask: jest.fn()
                };

                initializeModalEventListeners(mockCallbacks);
                showScheduleModal('Task', '30m', 'task-1', '10:00');

                const form = document.getElementById('schedule-modal-form');
                const startTimeInput = form.querySelector('input[name="modal-start-time"]');
                const hoursInput = form.querySelector('input[name="modal-duration-hours"]');
                const minutesInput = form.querySelector('input[name="modal-duration-minutes"]');

                startTimeInput.value = '11:00';
                hoursInput.value = '1';
                minutesInput.value = '30';

                form.dispatchEvent(new Event('submit'));

                expect(mockCallbacks.onConfirmScheduleTask).toHaveBeenCalledWith(
                    'task-1',
                    '11:00',
                    90
                );
            });

            test('form submit hides modal after callback', () => {
                const mockCallbacks = {
                    onConfirmScheduleTask: jest.fn()
                };

                initializeModalEventListeners(mockCallbacks);
                showScheduleModal('Task', '30m', 'task-1', '10:00');

                const form = document.getElementById('schedule-modal-form');
                const startTimeInput = form.querySelector('input[name="modal-start-time"]');
                const hoursInput = form.querySelector('input[name="modal-duration-hours"]');
                const minutesInput = form.querySelector('input[name="modal-duration-minutes"]');

                startTimeInput.value = '11:00';
                hoursInput.value = '0';
                minutesInput.value = '30';

                form.dispatchEvent(new Event('submit'));

                const modal = document.getElementById('schedule-modal');
                expect(modal.classList.contains('hidden')).toBe(true);
            });

            test('form submit shows alert for invalid duration', () => {
                const mockCallbacks = {
                    onConfirmScheduleTask: jest.fn()
                };

                initializeModalEventListeners(mockCallbacks);
                showScheduleModal('Task', '30m', 'task-1', '10:00');

                const form = document.getElementById('schedule-modal-form');
                const startTimeInput = form.querySelector('input[name="modal-start-time"]');
                const hoursInput = form.querySelector('input[name="modal-duration-hours"]');
                const minutesInput = form.querySelector('input[name="modal-duration-minutes"]');

                startTimeInput.value = '11:00';
                hoursInput.value = '0';
                minutesInput.value = '0'; // Zero duration is invalid

                form.dispatchEvent(new Event('submit'));

                expect(mockCallbacks.onConfirmScheduleTask).not.toHaveBeenCalled();
                // Alert should show but modal stays open
                const modal = document.getElementById('schedule-modal');
                expect(modal.classList.contains('hidden')).toBe(false);
            });
        });
    });
});
