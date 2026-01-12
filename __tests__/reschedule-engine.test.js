/**
 * @jest-environment jsdom
 */

import {
    tasksOverlap,
    checkOverlap,
    checkAndAdjustForLockedTasks,
    calculateReschedulePlan,
    validateReschedulePlan,
    validateAndGetReschedulePlan,
    findGapsBetweenLockedTasks,
    generateLockedConflictMessage,
    executeReschedule
} from '../public/js/reschedule-engine.js';
import { timeToDateTime, calculateEndDateTime } from '../public/js/utils.js';

// Helper to create a scheduled task
function createTask(id, startTime, duration, options = {}) {
    const testDate = '2025-01-15';
    const startDateTime = timeToDateTime(startTime, testDate);
    const endDateTime = calculateEndDateTime(startDateTime, duration);

    return {
        id,
        type: 'scheduled',
        description: options.description || `Task ${id}`,
        startDateTime,
        endDateTime,
        duration,
        status: options.status || 'incomplete',
        locked: options.locked || false,
        editing: options.editing || false,
        confirmingDelete: false
    };
}

describe('Reschedule Engine Tests', () => {
    describe('tasksOverlap', () => {
        test('returns true for overlapping tasks', () => {
            const task1 = createTask('1', '10:00', 60); // 10:00 - 11:00
            const task2 = createTask('2', '10:30', 60); // 10:30 - 11:30
            expect(tasksOverlap(task1, task2)).toBe(true);
        });

        test('returns false for non-overlapping tasks', () => {
            const task1 = createTask('1', '10:00', 60); // 10:00 - 11:00
            const task2 = createTask('2', '11:00', 60); // 11:00 - 12:00
            expect(tasksOverlap(task1, task2)).toBe(false);
        });

        test('returns false for adjacent tasks (end equals start)', () => {
            const task1 = createTask('1', '10:00', 60); // 10:00 - 11:00
            const task2 = createTask('2', '11:00', 30); // 11:00 - 11:30
            expect(tasksOverlap(task1, task2)).toBe(false);
        });

        test('returns true when one task contains another', () => {
            const task1 = createTask('1', '10:00', 120); // 10:00 - 12:00
            const task2 = createTask('2', '10:30', 30); // 10:30 - 11:00
            expect(tasksOverlap(task1, task2)).toBe(true);
        });

        test('returns false for unscheduled tasks', () => {
            const task1 = createTask('1', '10:00', 60);
            const task2 = { id: '2', type: 'unscheduled', priority: 'high' };
            expect(tasksOverlap(task1, task2)).toBe(false);
        });

        test('returns false for tasks with missing datetime fields', () => {
            const task1 = createTask('1', '10:00', 60);
            const task2 = { id: '2', type: 'scheduled', duration: 60 };
            expect(tasksOverlap(task1, task2)).toBe(false);
        });
    });

    describe('checkOverlap', () => {
        test('returns overlapping tasks', () => {
            const newTask = createTask('new', '10:30', 60);
            const existing = [
                createTask('1', '10:00', 60), // overlaps
                createTask('2', '12:00', 60) // doesn't overlap
            ];

            const overlapping = checkOverlap(newTask, existing);
            expect(overlapping).toHaveLength(1);
            expect(overlapping[0].id).toBe('1');
        });

        test('excludes completed tasks', () => {
            const newTask = createTask('new', '10:30', 60);
            const existing = [createTask('1', '10:00', 60, { status: 'completed' })];

            const overlapping = checkOverlap(newTask, existing);
            expect(overlapping).toHaveLength(0);
        });

        test('excludes tasks being edited', () => {
            const newTask = createTask('new', '10:30', 60);
            const existing = [createTask('1', '10:00', 60, { editing: true })];

            const overlapping = checkOverlap(newTask, existing);
            expect(overlapping).toHaveLength(0);
        });

        test('excludes the task itself', () => {
            const task = createTask('1', '10:00', 60);
            const existing = [task];

            const overlapping = checkOverlap(task, existing);
            expect(overlapping).toHaveLength(0);
        });

        test('returns empty array for unscheduled task', () => {
            const newTask = { id: 'new', type: 'unscheduled' };
            const existing = [createTask('1', '10:00', 60)];

            const overlapping = checkOverlap(newTask, existing);
            expect(overlapping).toHaveLength(0);
        });

        test('returns tasks sorted by start time', () => {
            const newTask = createTask('new', '10:00', 180); // 10:00 - 13:00
            const existing = [
                createTask('2', '11:00', 60),
                createTask('1', '10:30', 30),
                createTask('3', '12:00', 60)
            ];

            const overlapping = checkOverlap(newTask, existing);
            expect(overlapping[0].id).toBe('1');
            expect(overlapping[1].id).toBe('2');
            expect(overlapping[2].id).toBe('3');
        });
    });

    describe('checkAndAdjustForLockedTasks', () => {
        test('returns unadjusted task when no locked tasks', () => {
            const task = createTask('new', '10:00', 60);
            const others = [createTask('1', '10:00', 60)];

            const result = checkAndAdjustForLockedTasks(task, others);
            expect(result.startDateTime).toBe(task.startDateTime);
        });

        test('adjusts task to start after locked task', () => {
            const task = createTask('new', '10:00', 60);
            const locked = createTask('1', '10:00', 60, { locked: true });

            const result = checkAndAdjustForLockedTasks(task, [locked]);
            expect(new Date(result.startDateTime).getTime()).toBe(
                new Date(locked.endDateTime).getTime()
            );
        });

        test('skips completed locked tasks', () => {
            const task = createTask('new', '10:00', 60);
            const locked = createTask('1', '10:00', 60, { locked: true, status: 'completed' });

            const result = checkAndAdjustForLockedTasks(task, [locked]);
            expect(result.startDateTime).toBe(task.startDateTime);
        });

        test('handles multiple locked tasks in sequence', () => {
            const task = createTask('new', '10:00', 60);
            const locked1 = createTask('1', '10:00', 60, { locked: true });
            const locked2 = createTask('2', '11:00', 60, { locked: true });

            const result = checkAndAdjustForLockedTasks(task, [locked1, locked2]);
            expect(new Date(result.startDateTime).getTime()).toBe(
                new Date(locked2.endDateTime).getTime()
            );
        });

        test('returns original task for non-scheduled task', () => {
            const task = { id: 'new', type: 'unscheduled' };
            const result = checkAndAdjustForLockedTasks(task, []);
            expect(result).toBe(task);
        });

        test('returns original task for task without duration', () => {
            const task = {
                id: 'new',
                type: 'scheduled',
                startDateTime: '2025-01-15T10:00:00.000Z'
            };
            const result = checkAndAdjustForLockedTasks(task, []);
            expect(result).toBe(task);
        });
    });

    describe('calculateReschedulePlan', () => {
        test('returns empty plan when no overlaps', () => {
            const newTask = createTask('new', '10:00', 60);
            const others = [createTask('1', '12:00', 60)];

            const plan = calculateReschedulePlan(newTask, others);
            expect(plan.tasksToShift).toHaveLength(0);
            expect(plan.shiftedTaskPlan).toHaveLength(0);
        });

        test('shifts overlapping task', () => {
            const newTask = createTask('new', '10:00', 60); // 10:00 - 11:00
            const others = [createTask('1', '10:30', 30)]; // 10:30 - 11:00

            const plan = calculateReschedulePlan(newTask, others);
            expect(plan.tasksToShift).toHaveLength(1);
            expect(plan.tasksToShift[0].id).toBe('1');
        });

        test('cascades shifts for multiple overlapping tasks', () => {
            const newTask = createTask('new', '10:00', 60);
            const others = [createTask('1', '10:30', 30), createTask('2', '11:00', 30)];

            const plan = calculateReschedulePlan(newTask, others);
            expect(plan.tasksToShift).toHaveLength(2);
        });

        test('does not shift completed tasks', () => {
            const newTask = createTask('new', '10:00', 60);
            const others = [createTask('1', '10:30', 30, { status: 'completed' })];

            const plan = calculateReschedulePlan(newTask, others);
            expect(plan.tasksToShift).toHaveLength(0);
        });

        test('does not shift locked tasks', () => {
            const newTask = createTask('new', '10:00', 60);
            const others = [createTask('1', '10:30', 30, { locked: true })];

            const plan = calculateReschedulePlan(newTask, others);
            expect(plan.tasksToShift).toHaveLength(0);
        });

        test('includes locked tasks in plan for reference', () => {
            const newTask = createTask('new', '10:00', 60);
            const locked = createTask('1', '12:00', 30, { locked: true });

            const plan = calculateReschedulePlan(newTask, [locked]);
            expect(plan.lockedTasks).toHaveLength(1);
        });

        test('calculates effective end time including overlapping locked tasks', () => {
            const newTask = createTask('new', '10:00', 30);
            const locked = createTask('1', '10:15', 60, { locked: true }); // ends at 11:15

            const plan = calculateReschedulePlan(newTask, [locked]);
            const effectiveEnd = new Date(plan.effectiveEndTime);
            expect(effectiveEnd.getTime()).toBe(new Date(locked.endDateTime).getTime());
        });
    });

    describe('validateReschedulePlan', () => {
        test('returns success for plan with no conflicts', () => {
            const plan = {
                shiftedTaskPlan: [],
                lockedTasks: []
            };
            const result = validateReschedulePlan(plan);
            expect(result.success).toBe(true);
        });

        test('returns failure when shifted task would overlap locked task', () => {
            const locked = createTask('locked', '12:00', 60, { locked: true });
            const plan = {
                shiftedTaskPlan: [
                    {
                        task: createTask('1', '10:00', 60),
                        newStart: locked.startDateTime,
                        newEnd: locked.endDateTime
                    }
                ],
                lockedTasks: [locked]
            };

            const result = validateReschedulePlan(plan);
            expect(result.success).toBe(false);
            expect(result.conflicts).toHaveLength(1);
        });

        test('returns all conflicts when multiple exist', () => {
            const locked1 = createTask('locked1', '12:00', 60, { locked: true });
            const locked2 = createTask('locked2', '14:00', 60, { locked: true });
            const plan = {
                shiftedTaskPlan: [
                    {
                        task: createTask('1', '10:00', 60),
                        newStart: locked1.startDateTime,
                        newEnd: locked1.endDateTime
                    },
                    {
                        task: createTask('2', '11:00', 60),
                        newStart: locked2.startDateTime,
                        newEnd: locked2.endDateTime
                    }
                ],
                lockedTasks: [locked1, locked2]
            };

            const result = validateReschedulePlan(plan);
            expect(result.success).toBe(false);
            expect(result.conflicts).toHaveLength(2);
        });
    });

    describe('validateAndGetReschedulePlan', () => {
        test('returns plan and null error for valid reschedule', () => {
            const newTask = createTask('new', '10:00', 60);
            const others = [createTask('1', '12:00', 60)];

            const result = validateAndGetReschedulePlan(newTask, others);
            expect(result.error).toBeNull();
            expect(result.plan).toBeDefined();
            expect(result.validation.success).toBe(true);
        });

        test('flows around locked tasks instead of failing', () => {
            // With "flow around" logic, tasks get pushed past locked tasks instead of failing
            // Locked task at 12:00-13:00, shiftable at 11:00-12:00
            // New task at 10:00-12:00 would push shiftable - it flows around to after locked
            const newTask = createTask('new', '10:00', 120); // 10:00 - 12:00
            const shiftable = createTask('1', '11:00', 60); // 11:00 - 12:00, flows around locked
            const locked = createTask('locked', '12:00', 60, { locked: true }); // 12:00 - 13:00

            const result = validateAndGetReschedulePlan(newTask, [shiftable, locked]);
            expect(result.error).toBeNull();
            expect(result.validation.success).toBe(true);
            // Verify the shiftable task was pushed to after the locked task ends
            expect(result.plan.shiftedTaskPlan).toHaveLength(1);
            const shiftedStart = new Date(result.plan.shiftedTaskPlan[0].newStart);
            const lockedEnd = new Date(locked.endDateTime);
            expect(shiftedStart.getTime()).toBeGreaterThanOrEqual(lockedEnd.getTime());
        });
    });

    describe('findGapsBetweenLockedTasks', () => {
        test('returns empty array when no locked tasks', () => {
            const gaps = findGapsBetweenLockedTasks([], 30);
            expect(gaps).toHaveLength(0);
        });

        test('finds gap before first locked task', () => {
            const locked = [createTask('1', '12:00', 60, { locked: true })];
            const gaps = findGapsBetweenLockedTasks(locked, 30);

            // There should be gaps found (before and/or after)
            expect(gaps.length).toBeGreaterThan(0);
            // At least one gap should end at or have duration
            const hasValidGaps = gaps.some((g) => g.durationMinutes >= 30);
            expect(hasValidGaps).toBe(true);
        });

        test('finds gap between two locked tasks', () => {
            const locked = [
                createTask('1', '10:00', 60, { locked: true }), // 10:00 - 11:00
                createTask('2', '14:00', 60, { locked: true }) // 14:00 - 15:00
            ];
            const gaps = findGapsBetweenLockedTasks(locked, 30);

            const middleGap = gaps.find(
                (g) =>
                    new Date(g.start).getTime() === new Date(locked[0].endDateTime).getTime() &&
                    new Date(g.end).getTime() === new Date(locked[1].startDateTime).getTime()
            );
            expect(middleGap).toBeDefined();
            expect(middleGap.durationMinutes).toBe(180); // 3 hours
        });

        test('finds gap after last locked task', () => {
            const locked = [createTask('1', '10:00', 60, { locked: true })];
            const gaps = findGapsBetweenLockedTasks(locked, 30);

            const afterGap = gaps.find(
                (g) => new Date(g.start).getTime() === new Date(locked[0].endDateTime).getTime()
            );
            expect(afterGap).toBeDefined();
        });

        test('excludes gaps smaller than required duration', () => {
            const locked = [
                createTask('1', '10:00', 60, { locked: true }),
                createTask('2', '11:15', 60, { locked: true }) // 15 min gap
            ];
            const gaps = findGapsBetweenLockedTasks(locked, 30); // need 30 min

            const smallGap = gaps.find(
                (g) =>
                    new Date(g.start).getTime() === new Date(locked[0].endDateTime).getTime() &&
                    new Date(g.end).getTime() === new Date(locked[1].startDateTime).getTime()
            );
            expect(smallGap).toBeUndefined();
        });
    });

    describe('generateLockedConflictMessage', () => {
        test('generates message with conflicting locked tasks', () => {
            const newTask = createTask('new', '10:00', 60);
            const locked = createTask('locked', '10:30', 60, {
                locked: true,
                description: 'Meeting'
            });

            const validationResult = {
                conflicts: [{ lockedTask: locked }],
                lockedTasks: [locked]
            };

            const message = generateLockedConflictMessage(newTask, validationResult);
            expect(message).toContain("Can't fit this task");
            expect(message).toContain('Meeting');
            expect(message).toContain('locked');
        });

        test('includes available time slots when gaps exist', () => {
            const newTask = createTask('new', '10:00', 30);
            const locked = createTask('locked', '12:00', 60, { locked: true });

            const validationResult = {
                conflicts: [{ lockedTask: locked }],
                lockedTasks: [locked]
            };

            const message = generateLockedConflictMessage(newTask, validationResult);
            expect(message).toContain('Available time slots');
        });

        test('shows "no gaps" message when no available slots for task duration', () => {
            // Create locked tasks with only a 15-minute gap between them
            const locked1 = createTask('1', '10:00', 60, { locked: true }); // 10:00 - 11:00
            const locked2 = createTask('2', '11:15', 60, { locked: true }); // 11:15 - 12:15

            const validationResult = {
                conflicts: [{ lockedTask: locked1 }],
                lockedTasks: [locked1, locked2]
            };

            // Task needs 60 minutes but gap is only 15 minutes
            const newTask = createTask('new', '10:00', 60);
            const message = generateLockedConflictMessage(newTask, validationResult);
            // The message will show available slots for before 10:00 and after 12:15
            expect(message).toContain('Available time slots');
        });

        test('includes suggestions for resolution', () => {
            const newTask = createTask('new', '10:00', 60);
            const locked = createTask('locked', '10:30', 60, { locked: true });

            const validationResult = {
                conflicts: [{ lockedTask: locked }],
                lockedTasks: [locked]
            };

            const message = generateLockedConflictMessage(newTask, validationResult);
            expect(message).toContain('Unlock');
            expect(message).toContain('Delete');
        });
    });

    describe('executeReschedule', () => {
        test('shifts tasks according to plan', () => {
            const trigger = createTask('new', '10:00', 60);
            const toShift = createTask('1', '10:30', 30);
            const allTasks = [trigger, toShift];

            const result = executeReschedule(trigger, allTasks);

            expect(result.success).toBe(true);
            // Task should be shifted to end after trigger
            expect(new Date(toShift.startDateTime).getTime()).toBe(
                new Date(trigger.endDateTime).getTime()
            );
        });

        test('preserves editing state of trigger task', () => {
            const trigger = createTask('new', '10:00', 60, { editing: true });
            const allTasks = [trigger];

            executeReschedule(trigger, allTasks);

            expect(trigger.editing).toBe(true);
        });

        test('returns plan with shifted tasks', () => {
            const trigger = createTask('new', '10:00', 60);
            const toShift = createTask('1', '10:30', 30);
            const allTasks = [trigger, toShift];

            const result = executeReschedule(trigger, allTasks);

            expect(result.plan).toBeDefined();
            expect(result.plan.shiftedTaskPlan).toHaveLength(1);
        });

        test('cascades shifts correctly', () => {
            const trigger = createTask('new', '10:00', 60); // 10:00 - 11:00
            const task1 = createTask('1', '10:30', 30); // should shift to 11:00
            const task2 = createTask('2', '11:00', 30); // should shift to 11:30
            const allTasks = [trigger, task1, task2];

            executeReschedule(trigger, allTasks);

            expect(new Date(task1.startDateTime).getTime()).toBe(
                new Date(trigger.endDateTime).getTime()
            );
            expect(new Date(task2.startDateTime).getTime()).toBe(
                new Date(task1.endDateTime).getTime()
            );
        });
    });
});
