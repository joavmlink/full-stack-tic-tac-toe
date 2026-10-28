import type { Request, Response } from 'express';
import { AppError, matchNotFound } from '../errors.js';
import { parseInput } from '../middlewares/validate.js';
import type { MatchModel } from '../models/match.js';
import { MatchIdParamsSchema, MatchListQuerySchema, type FinishMatchBody } from '../schemas/matches.js';

// Thin controllers: bodies arrive already validated by the validateBody middleware, params and
// queries are parsed here with the same schemas, and the model is the only layer that knows SQL.
// Express 5 forwards rejected promises from async handlers to the error handler.
export function createMatchController(model: MatchModel) {
  return {
    async create(_req: Request, res: Response) {
      res.status(201).json(await model.create());
    },

    async list(req: Request, res: Response) {
      const { limit, before } = parseInput(MatchListQuerySchema, req.query);
      const page = await model.findPage({ limit, before });
      if (page.nextCursor !== null) {
        // Standard pagination header (RFC 8288); the body stays a plain array of matches.
        res.set('Link', `<${req.baseUrl}?limit=${limit}&before=${page.nextCursor}>; rel="next"`);
      }
      res.json(page.matches);
    },

    async stats(_req: Request, res: Response) {
      res.json(await model.stats());
    },

    async getById(req: Request, res: Response) {
      const { id } = parseInput(MatchIdParamsSchema, req.params);
      const match = await model.findById(id);
      if (!match) throw matchNotFound(id);
      res.json(match);
    },

    async finish(req: Request, res: Response) {
      const { id } = parseInput(MatchIdParamsSchema, req.params);
      const { winner } = req.body as FinishMatchBody;
      const result = await model.finish(id, winner);

      switch (result.status) {
        case 'ok':
          res.json(result.match);
          return;
        case 'not_found':
          throw matchNotFound(id);
        case 'already_finished':
          throw new AppError(409, 'MATCH_ALREADY_FINISHED', `Match ${id} is already finished`);
      }
    },
  };
}
