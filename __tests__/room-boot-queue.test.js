import { createRoomBootQueue } from '../public/js/room-boot-queue.js';

test('keeps retries and later room boots behind the active queue tail', async () => {
    const queue = createRoomBootQueue();
    const events = [];
    let releaseActiveRoom;

    const activeRoom = queue.enqueue(
        () =>
            new Promise((resolve) => {
                events.push('room-b-start');
                releaseActiveRoom = () => {
                    events.push('room-b-end');
                    resolve();
                };
            })
    );
    const staleRetry = queue.enqueue(() => {
        events.push('stale-retry');
    });
    const nextRoom = queue.enqueue(() => {
        events.push('room-c');
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['room-b-start']);
    releaseActiveRoom();
    await Promise.all([activeRoom, staleRetry, nextRoom]);

    expect(events).toEqual(['room-b-start', 'room-b-end', 'stale-retry', 'room-c']);
});
