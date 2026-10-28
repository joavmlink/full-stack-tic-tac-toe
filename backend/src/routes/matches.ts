import { Router } from 'express';
import { createMatchController } from '../controllers/matches.js';
import { methodNotAllowed, requireJson, validateBody } from '../middlewares/validate.js';
import type { MatchModel } from '../models/match.js';
import { FinishMatchBodySchema } from '../schemas/matches.js';

export function createMatchesRouter(model: MatchModel): Router {
  const controller = createMatchController(model);
  const router = Router();

  router.route('/').get(controller.list).post(controller.create).all(methodNotAllowed('GET', 'POST'));

  // Declared before "/:id" so "stats" isn't parsed as an id.
  router.route('/stats').get(controller.stats).all(methodNotAllowed('GET'));

  router
    .route('/:id')
    .get(controller.getById)
    .patch(requireJson, validateBody(FinishMatchBodySchema), controller.finish)
    .all(methodNotAllowed('GET', 'PATCH'));

  return router;
}
