import { Logger } from 'winston';

declare global {
    namespace Express {
        interface Request {
            id: string;
            logger: Logger;
            user?: {
                id: string;
                email: string;
                name: string;
            };
        }
    }
}

export { };
