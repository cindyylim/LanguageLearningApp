interface QueueItem<T> {
    task: () => Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
}

interface RequestQueueOptions {
    concurrency: number;
    rateLimit: number; // requests per interval
    interval: number; // interval in ms
}

export class RequestQueue {
    private queue: QueueItem<any>[] = [];
    private activeCount: number = 0;
    private requestTimestamps: number[] = [];
    private options: RequestQueueOptions;

    constructor(options: RequestQueueOptions = { concurrency: 3, rateLimit: 10, interval: 60000 }) {
        this.options = options;
    }

    public add<T>(task: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.activeCount >= this.options.concurrency || this.queue.length === 0) {
            return;
        }

        if (!this.canMakeRequest()) {
            // Schedule next check
            setTimeout(() => this.processQueue(), 1000);
            return;
        }

        const item = this.queue.shift();
        if (!item) return;

        this.activeCount++;
        this.recordRequest();

        try {
            const result = await item.task();
            item.resolve(result);
        } catch (error) {
            item.reject(error);
        } finally {
            this.activeCount--;
            this.processQueue();
        }
    }

    private canMakeRequest(): boolean {
        const now = Date.now();
        // Remove timestamps older than the interval
        this.requestTimestamps = this.requestTimestamps.filter(t => now - t < this.options.interval);
        return this.requestTimestamps.length < this.options.rateLimit;
    }

    private recordRequest() {
        this.requestTimestamps.push(Date.now());
    }
}
