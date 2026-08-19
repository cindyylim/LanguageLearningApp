import { RequestQueue } from './RequestQueue';

describe('RequestQueue', () => {
    it('uses default concurrency of 3 when no options are provided', async () => {
        jest.useFakeTimers();
        const queue = new RequestQueue();
        let concurrent = 0;
        let maxConcurrent = 0;

        const task = async () => {
            concurrent++;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            await new Promise((resolve) => setTimeout(resolve, 100));
            concurrent--;
            return 'done';
        };

        const promises = Array.from({ length: 5 }, () => queue.add(task));

        await Promise.resolve();
        expect(maxConcurrent).toBe(3);

        await jest.advanceTimersByTimeAsync(500);
        await Promise.all(promises);
        jest.useRealTimers();
    });

    it('should process tasks', async () => {
        const queue = new RequestQueue({ concurrency: 2, rateLimit: 10, interval: 60000 });

        const task = jest.fn().mockResolvedValue('done');

        const result = await queue.add(task);

        expect(result).toBe('done');
        expect(task).toHaveBeenCalled();
    });

    it('should handle task failures', async () => {
        const queue = new RequestQueue({ concurrency: 2, rateLimit: 10, interval: 60000 });

        const failTask = jest.fn().mockRejectedValue(new Error('Task failed'));

        await expect(queue.add(failTask)).rejects.toThrow('Task failed');
        expect(failTask).toHaveBeenCalled();
    });

    it('ignores empty queue items after shift', async () => {
        const queue = new RequestQueue({ concurrency: 5, rateLimit: 10, interval: 60000 });
        const internalQueue = (queue as any).queue as Array<unknown>;

        internalQueue.push({
            task: async () => 'done',
            resolve: jest.fn(),
            reject: jest.fn(),
        });

        jest.spyOn(internalQueue, 'shift').mockReturnValue(undefined);

        await (queue as any).processQueue();

        expect(internalQueue.shift).toHaveBeenCalled();
    });
});

describe('RequestQueue rateLimit', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('starts all requests immediately when count stays under rateLimit within the interval', async () => {
        const queue = new RequestQueue({ concurrency: 5, rateLimit: 3, interval: 5000 });
        const executed: number[] = [];

        const promises = [1, 2, 3].map((n) =>
            queue.add(async () => {
                executed.push(n);
                return n;
            })
        );

        await Promise.resolve();
        expect(executed).toEqual([1, 2, 3]);

        const results = await Promise.all(promises);
        expect(results).toEqual([1, 2, 3]);
    });

    it('delays excess requests until a slot opens in the sliding window', async () => {
        const queue = new RequestQueue({ concurrency: 5, rateLimit: 2, interval: 2000 });
        const executed: number[] = [];

        const promises = [1, 2, 3].map((n) =>
            queue.add(async () => {
                executed.push(n);
                return n;
            })
        );

        await Promise.resolve();
        expect(executed).toEqual([1, 2]);

        // After 1000 ms the queue retries, but both timestamps are still inside the 2000 ms window.
        await jest.advanceTimersByTimeAsync(1000);
        expect(executed).toEqual([1, 2]);

        // After 2000 ms total, timestamps expire and the third request can start.
        await jest.advanceTimersByTimeAsync(1000);
        expect(executed).toEqual([1, 2, 3]);

        await Promise.all(promises);
    });

    it('retries every 1000 ms when rate limit is exceeded until a slot opens', async () => {
        const queue = new RequestQueue({ concurrency: 5, rateLimit: 1, interval: 3000 });
        const executed: number[] = [];

        const p1 = queue.add(async () => {
            executed.push(1);
            return 1;
        });
        const p2 = queue.add(async () => {
            executed.push(2);
            return 2;
        });

        await Promise.resolve();
        expect(executed).toEqual([1]);

        await jest.advanceTimersByTimeAsync(1000);
        expect(executed).toEqual([1]);

        await jest.advanceTimersByTimeAsync(1000);
        expect(executed).toEqual([1]);

        await jest.advanceTimersByTimeAsync(1000);
        expect(executed).toEqual([1, 2]);

        await Promise.all([p1, p2]);
    });

    it('allows new requests after the interval elapses so the sliding window resets', async () => {
        const queue = new RequestQueue({ concurrency: 5, rateLimit: 2, interval: 1000 });

        await Promise.all([
            queue.add(async () => 'a'),
            queue.add(async () => 'b'),
        ]);

        await jest.advanceTimersByTimeAsync(1000);

        const executed: number[] = [];
        const result = await queue.add(async () => {
            executed.push(1);
            return 'c';
        });

        expect(executed).toEqual([1]);
        expect(result).toBe('c');
    });
});

describe('RequestQueue concurrency with rateLimit', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('enforces concurrency limit separately from rateLimit', async () => {
        const queue = new RequestQueue({ concurrency: 1, rateLimit: 10, interval: 10000 });
        let concurrent = 0;
        let maxConcurrent = 0;

        const slowTask = async () => {
            concurrent++;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            await new Promise((resolve) => setTimeout(resolve, 100));
            concurrent--;
            return 'done';
        };

        const p1 = queue.add(slowTask);
        const p2 = queue.add(slowTask);

        await Promise.resolve();
        expect(maxConcurrent).toBe(1);

        // Each task waits 100 ms; advance enough for both to finish sequentially.
        await jest.advanceTimersByTimeAsync(200);
        await Promise.all([p1, p2]);
        expect(maxConcurrent).toBe(1);
    });

    it('rateLimit caps request starts per interval even when concurrency would allow more parallel tasks', async () => {
        const queue = new RequestQueue({ concurrency: 10, rateLimit: 2, interval: 5000 });
        let concurrent = 0;
        let maxConcurrent = 0;

        const task = async () => {
            concurrent++;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            await new Promise((resolve) => setTimeout(resolve, 500));
            concurrent--;
            return 'done';
        };

        const promises = [1, 2, 3].map(() => queue.add(task));

        await Promise.resolve();
        expect(maxConcurrent).toBe(2);

        await jest.advanceTimersByTimeAsync(5000);
        await jest.runAllTimersAsync();
        await Promise.all(promises);
    });
});
