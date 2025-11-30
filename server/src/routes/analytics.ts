import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { AnalyticsService } from '../services/analytics.service';

const router = Router();

router.use(authMiddleware);

// Get learning progress
router.get('/progress', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const progress = await AnalyticsService.getProgress(userId);
  res.json(progress);
}));

// Get AI-powered recommendations
router.get('/recommendations', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const recommendations = await AnalyticsService.getRecommendations(userId);
  res.json(recommendations);
}));

export default router;