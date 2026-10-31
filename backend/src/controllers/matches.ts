import type { Request, Response } from 'express';
import { AppError, matchNotFound, matchTokenInvalid } from '../errors.js';
import { createMatchToken } from '../lib/match-token.js';
import { parseInput } from '../middlewares/validate.js';
import type { MatchModel } from '../models/match.js';
import {
  MatchIdParamsSchema,
  MatchListQuerySchema,
  type CreatedMatch,
  type FinishMatchBody,
} from '../schemas/matches.js';

// Thin controllers: bodies arrive already validated by the validateBody middleware, params and
// queries are parsed here with the same schemas, and the model is the only layer that knows SQL.
// Express 5 forwards rejected promises from async handlers to the error handler.
export function createMatchController(model: MatchModel) {
  return {
    async create(_req: Request, res: Response) {
      const { token, hash } = createMatchToken();
      const created: CreatedMatch = { ...(await model.create(hash)), finishToken: token };
      res.status(201).json(created);
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
      const tokenHash = res.locals.matchTokenHash;
      if (!tokenHash) throw new Error('The requireMatchToken middleware must run before finishing a match');
      const result = await model.finish(id, winner, tokenHash);

      switch (result.status) {
        case 'ok':
          res.json(result.match);
          return;
        case 'not_found':
          throw matchNotFound(id);
        case 'invalid_token':
          throw matchTokenInvalid();
        case 'already_finished':
          throw new AppError(409, 'MATCH_ALREADY_FINISHED', `Match ${id} is already finished with another result`);
      }
    },
  };
}
