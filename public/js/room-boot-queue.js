/** Create a serial queue whose tail cannot be orphaned by retries or room switches. */
export function createRoomBootQueue() {
    let tail = Promise.resolve();

    return {
        enqueue(work) {
            const next = tail.catch(() => {}).then(work);
            tail = next;
            return next;
        }
    };
}
