export enum CircuitState {
    CLOSED,
    OPEN,
    HALF_OPEN,
}

interface CircuitBreakerOptions {
    failureThreshold: number;
    resetTimeout: number;
}

export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private nextAttempt: number = Date.now();
    private options: CircuitBreakerOptions;

    constructor(options: CircuitBreakerOptions = { failureThreshold: 5, resetTimeout: 30000 }) {
        this.options = options;
    }

    public async execute<T>(action: () => Promise<T>): Promise<T> {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() >= this.nextAttempt) {
                this.state = CircuitState.HALF_OPEN;
            } else {
                throw new Error('Circuit is OPEN. Request blocked.');
            }
        }

        try {
            const result = await action();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess() {
        this.failureCount = 0;
        this.state = CircuitState.CLOSED;
    }

    private onFailure() {
        this.failureCount++;
        if (this.failureCount >= this.options.failureThreshold) {
            this.state = CircuitState.OPEN;
            this.nextAttempt = Date.now() + this.options.resetTimeout;
        }
    }
}
