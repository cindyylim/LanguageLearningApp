import { CircuitBreaker, CircuitState } from './CircuitBreaker';

describe('CircuitBreaker', () => {

    it('should execute action successfully in CLOSED state', async () => {
        const breaker = new CircuitBreaker();
        const action = jest.fn().mockResolvedValue('success');

        const result = await breaker.execute(action);

        expect(result).toBe('success');
        expect(action).toHaveBeenCalled();
    });

    it('should open circuit after failure threshold', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 5000 });
        const action = jest.fn().mockRejectedValue(new Error('fail'));

        // Fail 3 times to reach threshold
        for (let i = 0; i < 3; i++) {
            try {
                await breaker.execute(action);
            } catch (e) {
                // Expected
            }
        }

        // Circuit should now be OPEN
        await expect(breaker.execute(action)).rejects.toThrow('Circuit is OPEN');
    });

    it('should transition to HALF_OPEN after timeout', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 100 });
        const failAction = jest.fn().mockRejectedValue(new Error('fail'));
        const successAction = jest.fn().mockResolvedValue('success');

        // Open the circuit
        for (let i = 0; i < 2; i++) {
            try {
                await breaker.execute(failAction);
            } catch (e) {
                // Expected
            }
        }

        // Wait for reset timeout
        await new Promise(resolve => setTimeout(resolve, 150));

        // Should allow request in HALF_OPEN state
        const result = await breaker.execute(successAction);
        expect(result).toBe('success');
    });

    it('should reset failure count on success', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 5000 });
        const failAction = jest.fn().mockRejectedValue(new Error('fail'));
        const successAction = jest.fn().mockResolvedValue('success');

        // Fail twice
        for (let i = 0; i < 2; i++) {
            try {
                await breaker.execute(failAction);
            } catch (e) {
                // Expected
            }
        }

        // Then succeed
        await breaker.execute(successAction);

        // Circuit should still be CLOSED
        const result = await breaker.execute(successAction);
        expect(result).toBe('success');
    });
});
