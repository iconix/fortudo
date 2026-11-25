import { renderEditTaskHTML, renderViewTaskHTML } from '../public/js/tasks/scheduled-renderer.js';
import { renderUnscheduledTasks } from '../public/js/tasks/unscheduled-renderer.js';

const task = {
    id: 'research "A&B"',
    description: 'Review the &copy; notation',
    priority: 'medium',
    duration: 30
};

test('scheduled view and edit controls keep the original task identity', () => {
    document.body.innerHTML = renderViewTaskHTML(task, 0, false) + renderEditTaskHTML(task, 0);
    expect(document.getElementById(`view-task-${task.id}`).dataset.taskId).toBe(task.id);
    expect(document.getElementById(`edit-task-${task.id}`).dataset.taskId).toBe(task.id);
});

test('a backlog task opens its own editor when its ID contains punctuation', () => {
    document.body.innerHTML = '<div id="unscheduled-task-list"></div>';
    renderUnscheduledTasks([{ ...task, isEditingInline: true }]);
    expect(document.querySelector('.btn-edit-unscheduled').dataset.taskId).toBe(task.id);
    expect(document.getElementById(`inline-edit-description-${task.id}`).value).toBe(
        task.description
    );
});
