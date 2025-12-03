import { RequestQueue } from './RequestQueue';

describe('RequestQueue', () => {
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
});
