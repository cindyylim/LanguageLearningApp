import { NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { Request, Response } from "express";

export const isValidObjectId = (id: string | undefined): boolean => {
    if (!id) return false;
    return /^[a-fA-F0-9]{24}$/.test(id);
};

export const validateObjectId = (paramName: string = 'id') => {
    return (req: Request, res: Response, next: NextFunction) => {
        const id = req.params[paramName];
        if (!isValidObjectId(id)) {
            throw new AppError(`Invalid ${paramName} format`, 400);
        }
        next();
    };
};