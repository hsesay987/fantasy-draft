import { Request, Response } from "express";
import { AuthedRequest } from "../middleware/auth";
export declare function listDrafts(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function createDraft(req: AuthedRequest, res: Response): Promise<void>;
export declare function getDraft(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function cancelDraft(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function saveDraft(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updatePick(req: AuthedRequest, res: Response): Promise<void>;
export declare function undoPick(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function scoreDraft(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function voteDraft(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getDraftSuggestions(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getMyDrafts(req: AuthedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=draft.controller.d.ts.map